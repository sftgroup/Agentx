// ---------------------------------------------------------------------------
// AgentX Gateway — 智能账户链上操作（ERC-4337 Kernel v3）
// ---------------------------------------------------------------------------
// 账户维度的低层能力，供会话生命周期（aa-session）与续订 cron（aa-renewal）复用：
//   - ensureAccountDeployed   平台代付部署智能账户（digest 依赖已部署账户 nonce）
//   - getAccountFunding       三类资金视图（native / EP deposit / escrow）
//   - hasOnChainSession       L12：链上 session 残留检测（isModuleInstalled）
//   - resolveExistingSessionId L12：解析残留 sessionId（登记表 → relay store 兜底）
// 不承载任何用户操作/业务状态。
// ---------------------------------------------------------------------------

import { createWalletClient, http, parseAbi, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { getPool } from '../lib/db'
import { config } from '../config'
import { log } from './chain-data-reader'
import {
  AA_RELAY_PRODUCT,
  aaPublicClient,
  getAaChainConfig,
  loadAaSdk,
  relayRequest,
} from '../lib/aa-relay'
import { type AccountFunding } from '../lib/aa-funding'

/**
 * 部署 Kernel 智能账户（平台代付 gas，一次性；digest 依赖已部署账户 currentNonce）。
 * 用与 aa-relay 相同输入（owner、salt=0、kernel cfg.kernelVersion）复算 factoryData 并
 * 校验预测地址与 relay 返回一致，防止部署错账户。
 */
export async function ensureAccountDeployed(accountAddress: Address, ownerAddress: Address): Promise<boolean> {
  const aa = await loadAaSdk()
  const cfg = getAaChainConfig()
  if (await aa.isAccountDeployed(cfg, accountAddress)) return true
  if (!config.aaDeployerPrivateKey) {
    throw new Error('AA_DEPLOYER_PRIVATE_KEY not configured — cannot deploy smart account')
  }
  const { factory, factoryData } = aa.encodeKernelFactoryData(cfg, ownerAddress, 0n, cfg.kernelVersion)
  const predicted = await aa.predictWithFactoryGetAddress(cfg, factoryData)
  if (!predicted || predicted.toLowerCase() !== accountAddress.toLowerCase()) {
    throw new Error(`account address mismatch (relay=${accountAddress}, predicted=${predicted ?? 'n/a'})`)
  }
  const chainObj = {
    id: config.chainIdOxaChain,
    name: 'OxaChain',
    nativeCurrency: { name: 'OXA', symbol: 'OXA', decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrlOxaChain] } },
  }
  const deployer = privateKeyToAccount(config.aaDeployerPrivateKey as Hex)
  const walletClient = createWalletClient({ chain: chainObj as any, transport: http(config.rpcUrlOxaChain) })
  const tx = await walletClient.sendTransaction({
    chain: chainObj as any,
    account: deployer,
    to: factory,
    data: factoryData,
    value: 0n,
  })
  await aaPublicClient().waitForTransactionReceipt({ hash: tx })
  const deployed = await aa.isAccountDeployed(cfg, accountAddress)
  if (!deployed) throw new Error(`account deployment failed (tx=${tx})`)
  log.info(`[aa-account] smart account deployed: ${accountAddress} (tx=${tx})`)
  return true
}

/** 智能账户资金视图（gas 自付预检：native / EntryPoint deposit / InfraXEscrow 三类）。
 *  实证见 docs/infrax-bundler-restore-handoff.md §5：native 付订阅费、EP deposit 付
 *  gas、escrow 付 relay A-10 服务费，三者 per-account 独立记账。 */
export async function getAccountFunding(accountAddress: string): Promise<AccountFunding> {
  const client = aaPublicClient()
  const cfg = getAaChainConfig()
  const [nativeWei, epDepositWei, escrowWei] = await Promise.all([
    client.getBalance({ address: accountAddress as Address }).catch(() => 0n),
    client
      .readContract({
        address: cfg.entryPoint,
        abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
        functionName: 'balanceOf',
        args: [accountAddress as Address],
      })
      .catch(() => 0n),
    client
      .readContract({
        address: config.aaEscrowAddress as Address,
        abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
        functionName: 'balanceOf',
        args: [accountAddress as Address],
      })
      .catch(() => 0n),
  ])
  return { nativeWei, epDepositWei, escrowWei }
}

/**
 * 探测账户链上是否已绑定 session validator（Kernel v3 单 session 结构）。
 * 用 Kernel v3.0-beta 的 ERC-7579 视图 isModuleInstalled(type=1 VALIDATOR, sessionModule)
 * 判定 —— eth_getStorageAt 探测 slot 0x7bcaa2… 是误报（那是常驻 ECDSA root
 * validator 的绑定，永远非零；2026-08-19 实证卸载 session 后该 slot 不变）。
 * eth_call 失败按无残留处理（不阻塞 enable；真残留会在 confirm 阶段被 bundler 拦截）。 */
export async function hasOnChainSession(accountAddress: string): Promise<boolean> {
  try {
    const client = aaPublicClient()
    return await client.readContract({
      address: accountAddress as Address,
      abi: parseAbi([
        'function isModuleInstalled(uint256 moduleType, address module, bytes additionalContext) view returns (bool)',
      ]),
      functionName: 'isModuleInstalled',
      args: [1n, config.aaSessionModuleOxaChain as Address, '0x' as Hex],
    })
  } catch {
    // 读不到按无残留处理（不阻塞 enable；真残留会在 confirm 阶段被 bundler 拦截）
    return false
  }
}

/** 解析链上残留 session 的 sessionId：① 历史登记行（最近一次 enable 最可能残留）；
 *  ② relay session store（网关表被清时兜底，product 维度隔离）。导出供单测。 */
export async function resolveExistingSessionId(
  subscriber: string,
  agentId: number,
  planId: number,
  accountAddress: string,
): Promise<string | null> {
  const { rows } = await getPool().query(
    `SELECT session_id FROM aa_auto_renew
     WHERE subscriber = $1 AND agent_id = $2 AND plan_id = $3 AND session_id IS NOT NULL
     ORDER BY updated_at DESC LIMIT 1`,
    [subscriber.toLowerCase(), agentId, planId],
  )
  if (rows[0]?.session_id) return String(rows[0].session_id)
  try {
    const list = await relayRequest(
      `/v1/session?chain=${encodeURIComponent(config.aaRelayChain)}&product=${AA_RELAY_PRODUCT}&account=${accountAddress}`,
    )
    const policies = Array.isArray(list) ? list : []
    // 取最后一条（store 按插入序，最后 = 最近一次 enable 的 session，最可能是链上残留）
    if (policies.length > 0) return String(policies[policies.length - 1].sessionId)
  } catch {
    // 查询失败按不可解析处理
  }
  return null
}
