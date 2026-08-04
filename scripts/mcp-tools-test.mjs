#!/usr/bin/env node
/**
 * MCP 新增工具验证脚本
 * 验证 agentx_identity_list_all（批量+筛选）与 agentx_subscription_create_plan（WRITE）
 *
 * 用法:
 *   node scripts/mcp-tools-test.mjs [MCP_URL]
 *   默认 MCP_URL = http://43.159.60.46:3090/mcp
 *
 * 退出码: 0 = 全部通过, 1 = 有失败
 */
const MCP_URL = process.argv[2] || 'http://43.159.60.46:3090/mcp'
const FETCH_TIMEOUT_MS = 60_000

let pass = 0
let fail = 0

function check(name, ok, detail) {
  if (ok) {
    pass++
    console.log(`  ✅ ${name} ${detail ?? ''}`)
  } else {
    fail++
    console.log(`  ❌ ${name} ${detail ?? ''}`)
  }
}

async function rpc(method, params) {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (json.error) throw new Error(`RPC error: ${JSON.stringify(json.error)}`)
  return json.result
}

// 包装 tools/call：解析标准 MCP 响应 result.content[0].text(JSON)，
// 工具未注册/调用失败时不崩溃，返回 { ok, result, error }
async function callTool(name, args) {
  try {
    const result = await rpc('tools/call', { name, arguments: args })
    const text = result?.content?.[0]?.text
    const data = text ? JSON.parse(text) : result
    return { ok: true, result: data }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

console.log(`MCP 端点: ${MCP_URL}\n`)

// ── 1. tools/list：确认新工具已注册 ──
console.log('[1] tools/list — 工具注册检查')
const tools = (await rpc('tools/list')).tools
const names = tools.map((t) => t.name)
check('工具总数 >= 32', tools.length >= 32, `(实际 ${tools.length})`)
check('agentx_identity_list_all 已注册', names.includes('agentx_identity_list_all'))
check('agentx_subscription_create_plan 已注册', names.includes('agentx_subscription_create_plan'))

// ── 2. agentx_identity_list_all：批量读取 + 筛选 ──
console.log('\n[2] agentx_identity_list_all — 批量读取')
const { ok: okList, result: listAll, error: errList } = await callTool('agentx_identity_list_all', {
  chain: 'oxachain',
  activeOnly: true,
})
check('调用成功', okList, errList ?? '')
if (!okList) { fail += 4; console.log('  ⏭ 跳过结构校验（工具不可用）'); } else {
  const agents = listAll.agents ?? []
  const sample = agents[0]
  check('返回 agents 数组', Array.isArray(agents))
  check('结构字段完整 (agentId/owner/tokenURI/metadata/createdAt)',
    sample &&
      typeof sample.agentId === 'number' &&
      typeof sample.owner === 'string' &&
      typeof sample.tokenURI === 'string' &&
      typeof sample.metadata?.name === 'string' &&
      typeof sample.metadata?.isActive === 'boolean' &&
      typeof sample.createdAt === 'number',
    sample ? `(样本 agentId=${sample.agentId}, name=${sample.metadata.name})` : '(空结果)')
  check('activeOnly 过滤生效（无 isActive=false）',
    agents.every((a) => a.metadata.isActive === true), `(active=${agents.length})`)
}

// ── 3. agentx_identity_list_all：capabilities 过滤 ──
console.log('\n[3] agentx_identity_list_all — capabilities 过滤')
const { ok: okTrading, result: listTrading, error: errTrading } = await callTool('agentx_identity_list_all', {
  chain: 'oxachain',
  activeOnly: true,
  capabilities: 'trading',
})
check('capabilities 过滤调用成功', okTrading, errTrading ?? '')
if (!okTrading) { fail += 2; console.log('  ⏭ 跳过过滤校验（工具不可用）'); } else {
  const tradingAgents = listTrading.agents ?? []
  check('capabilities 过滤不报错', Array.isArray(tradingAgents))
  check('结果全部包含 trading 能力',
    tradingAgents.every((a) => a.metadata.capabilities.includes('trading')),
    `(命中 ${tradingAgents.length} 个)`)
}

// ── 4. agentx_subscription_create_plan：WRITE payload ──
console.log('\n[4] agentx_subscription_create_plan — WRITE payload')
const { ok: okPlan, result: plan, error: errPlan } = await callTool('agentx_subscription_create_plan', {
  chain: 'oxachain',
  agentId: 1,
  price: '10000000000000000',
  period: 'month',
  trialDays: 0,
})
check('调用成功', okPlan, errPlan ?? '')
if (!okPlan) { fail += 2; console.log('  ⏭ 跳过 payload 校验（工具不可用）'); } else {
  check('返回 _writeOp=true', plan._writeOp === true)
  check('args 完整 (agentId/price/period/payToken/trialDays)',
    plan.args &&
      plan.args.agentId === 1 &&
      plan.args.price === '10000000000000000' &&
      plan.args.period === 'month' &&
      typeof plan.args.payToken === 'string' &&
      plan.args.trialDays === 0)
}

// ── 汇总 ──
console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
if (fail > 0) process.exit(1)
