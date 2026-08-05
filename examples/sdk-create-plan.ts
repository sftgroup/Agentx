// ---------------------------------------------------------------------------
// @agentxv2/sdk — Chain-Data Write Example: Create a Subscription Plan (v0.8.2)
// ---------------------------------------------------------------------------
// 演示 SDK 写操作：createPlan → getPlan 读回（OxaChain L1 生产地址）。
// v0.8.2 起写操作支持本地私钥签名（walletClient.account 完整对象 →
// eth_sendRawTransaction），不再受 eth_sendTransaction "unknown account" 限制。
//
// 前置条件：
//   1) npm i viem @agentxv2/sdk
//   2) 设置 PRIVATE_KEY（有 OXA 余额付 gas 的钱包私钥）：
//        PRIVATE_KEY=0x... node sdk-create-plan.ts
// 注意：本样例会在链上真实创建套餐（0.001 OXA / month），请确认 agentId 归属。
// ---------------------------------------------------------------------------

import { createPublicClient, createWalletClient, http, defineChain, parseEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { SubscriptionManager } from '@agentxv2/sdk'

// ── 生产环境（OxaChain L1）真实参数 ────────────────────────────────────────
const RPC = 'https://rpc-oxa.0xainet.top'
const SUBSCRIPTION_ADDRESS = '0x019AC9d945467478Dd371CDbD70cb2f325800E6B' // SubscriptionManager
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

const oxaChain = defineChain({
  id: 19505,
  name: 'OxaChain L1',
  nativeCurrency: { name: 'OXA', symbol: 'OXA', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
})

const pk = process.env.PRIVATE_KEY
if (!pk) {
  console.error('Missing PRIVATE_KEY env var — set it to a wallet with OXA for gas: PRIVATE_KEY=0x... node sdk-create-plan.ts')
  process.exit(1)
}

const account = privateKeyToAccount(pk)
const publicClient = createPublicClient({ chain: oxaChain, transport: http() })
const walletClient = createWalletClient({ chain: oxaChain, transport: http(), account })

const subscription = new SubscriptionManager({
  contractAddress: SUBSCRIPTION_ADDRESS,
  publicClient,
  walletClient,
})

console.log('signer:', account.address)

// ── 写：createPlan（period 必须为 day|week|month|year，v0.8.2 本地签名可用） ──
const { planId, txHash } = await subscription.createPlan({
  agentId: 1,
  price: parseEther('0.001'), // 0.001 OXA / 期
  period: 'month',
  payToken: ZERO_ADDRESS,     // 原生代币
  trialDays: 0,
})
console.log('created plan:', { planId, txHash })

// ── 读回：确认链上字段 ──────────────────────────────────────────────────────
const plan = await subscription.getPlan(planId)
console.log('read back:', {
  planId: plan.planId,
  agentId: plan.agentId,
  creator: plan.creator,
  price: plan.price.toString(),
  period: plan.period,
  active: plan.active,
  payToken: plan.payToken,
  trialDays: plan.trialDays,
})
