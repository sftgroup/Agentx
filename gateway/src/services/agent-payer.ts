// ---------------------------------------------------------------------------
// AgentX Gateway — Agent Payer Orchestration (t8, P2)
// ---------------------------------------------------------------------------
// 配置了自主钱包的 Agent（InfraX MPC 钱包，Email 2-of-2 TSS，@0xinfrax/mpc-sdk）
// 在 A2A 委派需要按次付费时，可用自己的钱包自动付款，无需用户钱包弹窗/预充值。
//
// 依赖 infraX 发版/部署：
//   - @0xinfrax/mpc-sdk ≥0.3.0（npm 已发布）
//   - MPC 服务（projects/mpc server.ts）需部署并配置 MPC_SERVER_URL / MPC_API_KEY
//   未配置时 isAgentPayerEnabled() 返回 false，A2A worker 走人工付款（awaiting_payment）。
//
// 流程：
//   1. agent 绑定 MPC 钱包（agent_payer_wallets 表，email + walletAddress）
//   2. 运维解锁会话（email + 验证码 → session token，AES 加密存储）
//   3. worker 委派余额不足时 tryAutoPayForDelegation：MPC 钱包向 payTo/escrow
//      转账 → verifyAndCredit 入账 → 重试 canAccessAgentOrPay 扣费放行
// ---------------------------------------------------------------------------

import { createPublicClient, http } from 'viem'
import type { Address } from 'viem'
import { getPool } from '../lib/db'
import { config } from '../config'
import { encryptApiKey, decryptApiKey } from '../lib/crypto'
import { verifyAndCredit } from './x402'
import { escrowDepositFunctionAbi } from '../lib/escrow-abi'
import { log } from './chain-data-reader'

// @0xinfrax/mpc-sdk 为可选依赖：未安装/未配置时全部能力优雅降级。
// eslint-disable-next-line @typescript-eslint/no-var-requires
function loadMpcClient(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@0xinfrax/mpc-sdk')
    return new mod.MpcClient({ baseUrl: config.mpcServerUrl, apiKey: config.mpcApiKey })
  } catch {
    return null
  }
}

export interface AgentPayerWallet {
  agentId: number
  email: string
  walletAddress: string
  chain: string
  sessionUnlocked: boolean
}

export function isAgentPayerEnabled(): boolean {
  return Boolean(config.mpcServerUrl && config.mpcApiKey && config.x402PayTo)
}

export async function resolveAgentPayer(agentId: number): Promise<AgentPayerWallet | null> {
  const { rows } = await getPool().query(
    `SELECT agent_id, email, wallet_address, chain,
            (session_token_enc IS NOT NULL AND session_expires_at > NOW()) AS session_unlocked
     FROM agent_payer_wallets WHERE agent_id = $1`,
    [agentId]
  )
  if (rows.length === 0) return null
  return {
    agentId: Number(rows[0].agent_id),
    email: rows[0].email,
    walletAddress: rows[0].wallet_address,
    chain: rows[0].chain || 'oxachain',
    sessionUnlocked: Boolean(rows[0].session_unlocked),
  }
}

/** 按钱包地址反查 agent（worker 用 payer=clientAddress 判断是否 agent 自主钱包）。 */
export async function resolveAgentPayerByAddress(walletAddress: string): Promise<AgentPayerWallet | null> {
  const { rows } = await getPool().query(
    `SELECT agent_id, email, wallet_address, chain,
            (session_token_enc IS NOT NULL AND session_expires_at > NOW()) AS session_unlocked
     FROM agent_payer_wallets WHERE LOWER(wallet_address) = $1`,
    [walletAddress.toLowerCase()]
  )
  if (rows.length === 0) return null
  return {
    agentId: Number(rows[0].agent_id),
    email: rows[0].email,
    walletAddress: rows[0].wallet_address,
    chain: rows[0].chain || 'oxachain',
    sessionUnlocked: Boolean(rows[0].session_unlocked),
  }
}

/** 绑定 agent 与 MPC 钱包（运维/管理操作）。 */
export async function bindAgentPayerWallet(params: { agentId: number; email: string; walletAddress: string; chain?: string }): Promise<void> {
  await getPool().query(
    `INSERT INTO agent_payer_wallets (agent_id, email, wallet_address, chain)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (agent_id) DO UPDATE SET email = EXCLUDED.email, wallet_address = EXCLUDED.wallet_address,
       chain = EXCLUDED.chain, updated_at = NOW()`,
    [params.agentId, params.email, params.walletAddress.toLowerCase(), params.chain || 'oxachain']
  )
}

/** 运维解锁：email + 验证码 → 换取 MPC 会话令牌并加密存储。 */
export async function unlockAgentPayerSession(agentId: number, code: string): Promise<{ address: string; expiresAt: string }> {
  if (!isAgentPayerEnabled()) throw new Error('Agent payer (MPC) not configured')
  const wallet = await resolveAgentPayer(agentId)
  if (!wallet) throw new Error(`No MPC wallet bound to agent #${agentId}`)
  const mpc = loadMpcClient()
  if (!mpc) throw new Error('@0xinfrax/mpc-sdk not installed — cannot unlock MPC session')
  const unlock = await mpc.session.unlock({ email: wallet.email, code })
  const token = String(unlock?.data?.token ?? '')
  if (!token) throw new Error('MPC unlock failed: empty session token')
  const encrypted = encryptApiKey(token, config.masterEncryptionKey)
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000) // 会话令牌默认 7 天
  await getPool().query(
    `UPDATE agent_payer_wallets SET session_token_enc = $2, session_expires_at = $3, updated_at = NOW()
     WHERE agent_id = $1`,
    [agentId, encrypted, expiresAt]
  )
  log.info(`[agent-payer] agent #${agentId} MPC session unlocked (expires ${expiresAt.toISOString()})`)
  return { address: unlock?.data?.address ?? wallet.walletAddress, expiresAt: expiresAt.toISOString() }
}

async function getSessionToken(wallet: AgentPayerWallet): Promise<string | null> {
  const { rows } = await getPool().query(
    `SELECT session_token_enc FROM agent_payer_wallets
     WHERE agent_id = $1 AND session_expires_at > NOW()`,
    [wallet.agentId]
  )
  if (rows.length === 0 || !rows[0].session_token_enc) return null
  try {
    return decryptApiKey(rows[0].session_token_enc, config.masterEncryptionKey)
  } catch {
    return null
  }
}

function weiToToken(wei: bigint): string {
  const n = Number(wei) / 1e18
  return n >= 1000 ? n.toFixed(2) : n.toFixed(6)
}

/**
 * 委派自动代付：agent 自主钱包向 payTo（EOA 收款 或 escrow 金库）转账 →
 * verifyAndCredit 幂等入账 ledger（credit sender = MPC 钱包地址）。
 * 成功返回 MPC 钱包地址（调用方用它作为 payer 重试 canAccessAgentOrPay 扣费放行）；
 * 失败（未配置/未绑定/未解锁/链上失败）返回 null，worker 走 awaiting_payment 人工付款。
 */
export async function tryAutoPayForDelegation(params: { agentId: number; payTo: string; priceWei: string }): Promise<string | null> {
  if (!isAgentPayerEnabled()) return null
  try {
    const wallet = await resolveAgentPayer(params.agentId)
    if (!wallet) return null
    if (!wallet.sessionUnlocked) {
      log.warn(`[agent-payer] agent #${params.agentId} MPC session not unlocked — manual payment required`)
      return null
    }
    const token = await getSessionToken(wallet)
    if (!token) return null

    const mpc = loadMpcClient()
    if (!mpc) return null

    const amount = weiToToken(BigInt(params.priceWei))
    // 支付路径：escrow 金库已配置 → 调 escrow.deposit()（emit Deposited 事件，
    // verify 走金库判定入账）；未配置 → 原生币直转 payTo（EOA，verifyNativeTx）。
    // 注意：仅向 escrow 地址转账（无 calldata）不会 emit Deposited，无法入账。
    const escrow = config.x402EscrowAddress
    let txHash: string
    if (escrow) {
      const write = await mpc.chain.contractWrite({
        token,
        contractAddress: escrow,
        abi: escrowDepositFunctionAbi,
        method: 'deposit',
        value: amount,
        chain: wallet.chain,
      })
      txHash = String(write?.data?.txHash ?? '')
    } else {
      const send = await mpc.chain.sendTransaction({
        token,
        to: params.payTo,
        amount,
        chain: wallet.chain,
      })
      txHash = String(send?.data?.txHash ?? '')
    }
    if (!txHash) throw new Error('MPC payment tx returned no txHash')

    // 入账 ledger（幂等）：verifyAndCredit 校验 tx 后 credit sender（= agent 钱包）。
    const credited = await verifyAndCredit(txHash, wallet.chain as any)
    if (credited === null) throw new Error('MPC payment tx not credited by verify')

    log.info(`[agent-payer] agent #${params.agentId} auto-paid ${amount} → ${params.payTo} (tx=${txHash}, credited=${credited})`)
    return wallet.walletAddress
  } catch (err: any) {
    log.warn(`[agent-payer] auto-pay failed: ${err.message}`)
    return null
  }
}

/** 对账辅助：MPC 钱包链上余额（运维监控用）。 */
export async function agentPayerChainBalance(walletAddress: string): Promise<string | null> {
  try {
    const publicClient = createPublicClient({ transport: http(config.rpcUrlOxaChain) })
    const bal = await publicClient.getBalance({ address: walletAddress as Address })
    return bal.toString()
  } catch {
    return null
  }
}
