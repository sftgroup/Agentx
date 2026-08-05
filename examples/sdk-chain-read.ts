// ---------------------------------------------------------------------------
// @agentxv2/sdk — Chain-Data Read/Write Example (v0.8.6)
// ---------------------------------------------------------------------------
// 完整展示 SDK 直连区块链能力：
//   读  ：totalAgents / getAllAgents（批量 + 筛选）/ getAgentMetadata / getPlan
//   事件：subscribeToEvents（实时增量）
//   写  ：createPlan / subscribe（需要真实钱包，签名链上交易；v0.8.2 起支持本地私钥签名）
// 特性：v0.8.1 起 tokenURI 解析支持畸形数据容错（base64 尾部垃圾清理、
//       unterminated JSON 修复、regex 兜底），与 Gateway indexer 行为一致。
// 运行：node sdk-chain-read.ts（需 npm i viem @agentxv2/sdk）
// ---------------------------------------------------------------------------

import { createPublicClient, createWalletClient, http } from 'viem'
import { AgentRegistry, SubscriptionManager, subscribeToEvents } from '@agentxv2/sdk'

// ── 生产环境（OxaChain L1）真实参数 ────────────────────────────────────────
const RPC = 'https://rpc-oxa.0xainet.top'
const REGISTRY_ADDRESS = '0xbf5F9db266c8c97E3334466C88597Eb758AfE212' // IdentityRegistry
const SUBSCRIPTION_ADDRESS = '0x019AC9d945467478Dd371CDbD70cb2f325800E6B' // SubscriptionManager

const publicClient = createPublicClient({ transport: http(RPC) })
// 只读场景无需真实钱包；以下地址仅占位（写操作时替换为你的账户）
const walletClient = createWalletClient({
  transport: http(RPC),
  account: '0x0000000000000000000000000000000000000001',
})

const registry = new AgentRegistry({ contractAddress: REGISTRY_ADDRESS, publicClient, walletClient })
const subscription = new SubscriptionManager({ contractAddress: SUBSCRIPTION_ADDRESS, publicClient, walletClient })

// ── 读：批量 + 筛选（v0.8.1 自动容错畸形 tokenURI） ───────────────────────
const total = await registry.totalAgents()
console.log('total agents:', total)

const agents = await registry.getAllAgents({
  fromId: 1,
  // toId: total,            // 默认 totalAgents()
  activeOnly: true,          // 只看 metadata.isActive === true
  // capabilities: ['chat'], // AND 筛选
  batchSize: 10,             // RPC batching
})
console.log(
  'agents:',
  agents.map((a) => `#${a.agentId}:${a.metadata.name}`).join(' | ')
)
// v0.8.1 容错：即便某些 tokenURI 因合约 bug 损坏（未闭合 JSON / base64 尾部垃圾），
// 也能尽量解析出 name/description/capabilities；实在无法解析时 name 回退为 `Agent {id}`。
const fallback = agents.filter((a) => a.metadata.name.startsWith('Agent '))
console.log('name-fallback (malformed tokenURI):', fallback.map((a) => a.agentId))

// ── 读：单个 Agent 完整元数据 ──────────────────────────────────────────────
const meta = await registry.getAgentMetadata(1)
console.log('metadata#1:', meta.name, '| isActive:', meta.isActive, '| skills:', meta.skills)

// ── 读：订阅套餐 ───────────────────────────────────────────────────────────
const plan = await subscription.getPlan(1) // planId=1
console.log('plan#1:', { agentId: plan.agentId, price: plan.price.toString(), period: plan.period, active: plan.active })

// ── 事件：实时增量同步（替代轮询，<15s 响应） ─────────────────────────────
const unwatch = await subscribeToEvents(publicClient, {
  identityRegistryAddress: REGISTRY_ADDRESS,
  subscriptionManagerAddress: SUBSCRIPTION_ADDRESS,
  events: ['Transfer', 'AgentRegistered', 'PlanCreated', 'Subscribed'],
  onEvent: ({ type, args, txHash }) => {
    console.log('event:', type, args, txHash)
    // if (type === 'AgentRegistered') syncAgent(Number(args.agentId))
  },
})
// 观察 30s 后停止
setTimeout(() => {
  unwatch()
  console.log('stopped listening')
  process.exit(0)
}, 30_000)

// ── 写：真实交易（需要真实 WalletClient 账户 + 链上余额） ─────────────────
// const { planId, txHash } = await subscription.createPlan({
//   agentId: 1,
//   price: 10000000000000000n, // wei
//   period: 'month',           // ⚠ 仅 'day' | 'week' | 'month' | 'year'
//   trialDays: 0,
// })
// const { subscriptionId, expiresAt } = await subscription.subscribe(planId)
// console.log({ planId, subscriptionId, expiresAt })
