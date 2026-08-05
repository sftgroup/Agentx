/**
 * AgentX DApp 双通道示例 — SDK（直连链）+ MCP（经 Gateway）同时使用
 *
 * 场景：Agent 市场 DApp
 * ┌──────────────────────────────────────────────────────────────┐
 * │  DApp（浏览器）                                                │
 * │  ├─ SDK（直连区块链）→ 市场列表渲染、订阅/创建套餐（真实交易）、事件驱动刷新 │
 * │  ├─ MCP（经 Gateway）→ AI 助手只读查询（价格/订阅状态/平台健康）       │
 * │  └─ 共享同一份链配置（RPC / 合约地址 / Gateway URL）              │
 * └──────────────────────────────────────────────────────────────┘
 *
 * 分工依据：docs/sdk-vs-mcp.md
 *  - SDK：链上读写 / 真实交易 / 事件监听 / 加密 / IPFS / 对话 SSE → 深度集成
 *  - MCP：AI Agent 工具化调用 / 快速接入 / 只读为主 / 零依赖、免链配置
 *
 * 依赖：@agentxv2/sdk@^0.8.6 · @agentxv2/mcp@^0.1.0 · viem@^2
 * 运行：浏览器 DApp（window.ethereum 钱包）或任何带 fetch 的 Node 18+
 */

import { createPublicClient, createWalletClient, custom, http, type Address } from 'viem'
import { AgentRegistry, SubscriptionManager, subscribeToEvents } from '@agentxv2/sdk'
import { McpClient } from '@agentxv2/mcp'

// ── 0. 配置（生产值；生产环境应从 env 注入，勿硬编码在源码）────────────
const RPC_URL = 'https://rpc-oxa.0xainet.top'          // OxaChain L1 RPC
const GATEWAY_URL = 'http://43.159.60.46:3090'         // AgentX Gateway（MCP 入口）
const IDENTITY_REGISTRY = '0xbf5F9db266c8c97E3334466C88597Eb758AfE212'
const SUBSCRIPTION_MANAGER = '0x019AC9d945467478Dd371CDbD70cb2f325800E6B'

// OxaChain 的 viem chain 对象（此处简化；生产用 `import { oxachain } from '@agentxv2/sdk/...'` 或自建）
const oxaChain = { id: 19505, name: 'OxaChain L1', nativeCurrency: { name: 'OXA', symbol: 'OXA', decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } } as const

// ═══════════════════════════════════════════════════════════════════════
// 1. SDK — 直连区块链（读 + 真实交易 + 事件）
// ═══════════════════════════════════════════════════════════════════════
const publicClient = createPublicClient({ chain: oxaChain, transport: http(RPC_URL) })
const walletClient = createWalletClient({ chain: oxaChain, transport: custom(window.ethereum) }) // 浏览器钱包

const registry = new AgentRegistry({
  contractAddress: IDENTITY_REGISTRY,
  publicClient,
  walletClient,
})
const subscription = new SubscriptionManager({
  contractAddress: SUBSCRIPTION_MANAGER,
  publicClient,
  walletClient,
})

// ── 1a. 读：市场列表（实时链上，批量 + 筛选，等价 MCP listAgents）───────
async function loadMarketplace(): Promise<void> {
  const agents = await registry.getAllAgents({ activeOnly: true, capabilities: ['chat'], batchSize: 20 })
  renderMarket(agents) // 伪代码：渲染到 DApp 页面
}

// ── 1b. 写：用户点击"订阅" → SDK 签名并提交真实交易 ─────────────────────
// 注意：MCP 的 createPlan/subscribe 只返回 WRITE 描述（_writeOp），不托管密钥；
// 真实交易必须走 SDK（或钱包直连合约）。这是两者最大的分工差异。
async function buySubscription(planId: number): Promise<void> {
  const { subscriptionId, txHash, expiresAt } = await subscription.subscribe(planId)
  // → subscriptionId 由 Subscribed 事件解析得出，expiresAt 为 Unix 秒
  console.log(`订阅成功 #${subscriptionId} tx=${txHash} 到期=${expiresAt}`)
  await toast(`订阅成功，到期 ${new Date(expiresAt * 1000).toLocaleString()}`)
}

// 另一种：创建套餐 + 立即订阅（发布者侧"上架"流程）
async function publishAndSubscribe(agentId: number, priceWei: bigint): Promise<void> {
  const { planId, txHash } = await subscription.createPlan({ agentId, price: priceWei, period: 'month' })
  await buySubscription(planId)
  void txHash
}

// ── 1c. 事件：链上变化 → 增量刷新 UI（MCP 无事件流，此为 SDK 独有能力）──
let unwatch: (() => void) | undefined

async function startLiveUpdates(): Promise<void> {
  unwatch = await subscribeToEvents(publicClient, {
    identityRegistryAddress: IDENTITY_REGISTRY,     // 监听新 Agent 上架 / 转移
    subscriptionManagerAddress: SUBSCRIPTION_MANAGER, // 监听新套餐 / 订阅
    events: ['Transfer', 'AgentRegistered', 'PlanCreated', 'Subscribed'],
    onEvent: (event) => {
      console.log(`[event] ${event.type} tx=${event.txHash}`, event.args)
      if (event.type === 'AgentRegistered') loadMarketplace()   // 新 Agent 上架 → 刷新列表
      if (event.type === 'Subscribed')      refreshMySubs()     // 我的订阅变化 → 刷新
    },
    pollingInterval: 4000, // 默认轮询间隔（浏览器无 ws 时可调）
  })
}

// ═══════════════════════════════════════════════════════════════════════
// 2. MCP — 经 Gateway（AI 助手 / 快速只读，零依赖免链配置）
// ═══════════════════════════════════════════════════════════════════════
const mcp = new McpClient({ gatewayUrl: GATEWAY_URL, defaultChain: 'oxachain' })

// ── 2a. AI 助手：用 MCP 工具回答用户问题（LLM 通过 tools/list 动态发现）──
// 例如用户问："这套餐多少钱？还能订阅吗？"
// 助手调用 MCP 工具（对应 agentx_subscription_plans / agentx_subscription_check），
// 全部只读、实时链上，不要求助手持有 RPC/合约配置。
async function assistantQuery(planId: number, userAddress: Address): Promise<string> {
  const plan = await mcp.getPlan(planId)
  // plan = { planId, agentId, creator, price: "10000000000000000", period, active, payToken, trialDays }
  const active = await mcp.checkSubscription(userAddress, plan.agentId)
  return `该套餐 ${parseFloat(plan.price) / 1e18} OXA/${plan.period}，`
    + (active.active ? '你当前已订阅 ✅' : '你尚未订阅，点击按钮即可购买 →')
}

// ── 2b. 平台状态卡片（只读，MCP 独有：平台健康 / 租户信息）──────────────
async function renderPlatformStatus(): Promise<void> {
  const [health, count] = await Promise.all([mcp.gatewayHealth(), mcp.totalAgents()])
  console.log(`Gateway: ${health.status} · 链上 Agent 总数: ${count.total}`)
}

// ═══════════════════════════════════════════════════════════════════════
// 3. 整合 — 一次完整用户旅程（SDK × MCP 协作）
// ═══════════════════════════════════════════════════════════════════════
export async function initDApp(): Promise<void> {
  await loadMarketplace()          // SDK：渲染市场
  await renderPlatformStatus()     // MCP：平台状态卡片
  await startLiveUpdates()         // SDK：事件驱动增量刷新

  // 用户打开某个 Agent 详情页 → AI 助手用 MCP 回答价格/订阅状态
  const answer = await assistantQuery(1, '0x你的钱包地址')
  showAssistant(answer)

  // 用户点击"订阅" → SDK 发真实交易（钱包签名）
  document.getElementById('subscribe-btn')!.onclick = () => buySubscription(1)

  // 页面卸载时清理事件监听
  window.addEventListener('beforeunload', () => unwatch?.())
}

// 伪代码 UI 桩（实际 DApp 中由 React/Vue 实现）
declare function renderMarket(agents: unknown[]): void
declare function refreshMySubs(): void
declare function toast(msg: string): void
declare function showAssistant(text: string): void
