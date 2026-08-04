#!/usr/bin/env node
/**
 * 真实用户场景验证 agentx_identity_list_all
 *
 * 模拟标准 MCP 客户端调用流程（initialize 握手 → tools/call），
 * 对返回数据做严格预期校验：字段完整/类型、ID 连续性、去重、
 * 与 totalAgents 交叉验证、activeOnly / capabilities / 范围筛选正确性、边界与耗时。
 *
 * 用法:
 *   node scripts/mcp-list-all-test.mjs [MCP_URL] [--chain oxachain] [--verbose]
 *   默认 MCP_URL = http://43.159.60.46:3090/mcp
 *
 * 退出码: 0 = 全部用例通过, 1 = 有失败
 */

const MCP_URL = process.argv[2] || 'http://43.159.60.46:3090/mcp'
const CHAIN = process.argv.find((a) => a.startsWith('--chain='))?.split('=')[1] || 'oxachain'
const VERBOSE = process.argv.includes('--verbose')
const TIMEOUT_MS = 120_000

let pass = 0
let fail = 0
const failedCases = []

function check(caseName, name, ok, detail = '') {
  if (ok) {
    pass++
    if (VERBOSE) console.log(`    ✅ ${name} ${detail}`)
  } else {
    fail++
    failedCases.push(`${caseName} / ${name}`)
    console.log(`    ❌ ${name} ${detail}`)
  }
}

async function rpc(method, params) {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (json.error) throw new Error(`RPC error: ${JSON.stringify(json.error)}`)
  return json.result
}

// 标准 MCP 客户端：tools/call 返回 result.content[0].text(JSON)
async function callTool(name, args) {
  const result = await rpc('tools/call', { name, arguments: args })
  const text = result?.content?.[0]?.text
  return text ? JSON.parse(text) : result
}

// ── 基础校验器 ──
const VALID_AGENT_FIELDS = ['agentId', 'owner', 'tokenURI', 'metadata', 'createdAt']
const VALID_META_FIELDS = ['name', 'description', 'capabilities', 'skills', 'isActive']

function validateAgentShape(a) {
  return (
    VALID_AGENT_FIELDS.every((f) => f in a) &&
    typeof a.agentId === 'number' &&
    typeof a.owner === 'string' &&
    /^0x[a-fA-F0-9]{40}$/.test(a.owner) &&
    typeof a.tokenURI === 'string' &&
    typeof a.createdAt === 'number' &&
    VALID_META_FIELDS.every((f) => f in a.metadata) &&
    typeof a.metadata.name === 'string' &&
    typeof a.metadata.isActive === 'boolean' &&
    Array.isArray(a.metadata.capabilities) &&
    Array.isArray(a.metadata.skills)
  )
}

function validateAgents(agents, fromId, toId) {
  const ids = agents.map((a) => a.agentId)
  const idSet = new Set(ids)
  const inRange = ids.every((id) => id >= fromId && id <= toId)
  const unique = idSet.size === ids.length
  const shapeOk = agents.every(validateAgentShape)
  const sorted = ids.every((id, i) => i === 0 || ids[i - 1] < id)
  return { ids, idSet, inRange, unique, shapeOk, sorted }
}

console.log(`MCP 端点: ${MCP_URL} | chain: ${CHAIN}\n`)

// ── 0. MCP 握手（真实客户端行为） ──
console.log('[0] initialize 握手')
const handshake = await rpc('initialize', {
  protocolVersion: '2024-11-05',
  capabilities: {},
  clientInfo: { name: 'agentx-list-all-test', version: '1.0.0' },
})
check('握手', '返回 serverInfo', handshake?.serverInfo?.name === 'agentx-gateway', `(${handshake?.serverInfo?.name} ${handshake?.serverInfo?.version})`)
const tools = (await rpc('tools/list')).tools
const tool = tools.find((t) => t.name === 'agentx_identity_list_all')
check('工具', 'agentx_identity_list_all 已注册', !!tool)
if (!tool) { console.log('\n⚠ 工具未注册，请先部署新 Gateway'); process.exit(1) }

// ── 1. 全量拉取（无筛选） ──
console.log('\n[1] 全量拉取 — 无筛选')
const totalCount = (await callTool('agentx_identity_total_count', { chain: CHAIN })).totalAgents
const t1 = Date.now()
const all = await callTool('agentx_identity_list_all', { chain: CHAIN })
const ms1 = Date.now() - t1
const agents = all.agents ?? []
const v1 = validateAgents(agents, 1, totalCount)
check('全量', `返回数量 == totalAgents(${totalCount})`, agents.length === totalCount, `(实际 ${agents.length})`)
check('全量', 'agentId 在 [1, total] 范围内', v1.inRange)
check('全量', 'agentId 无重复', v1.unique, `(${agents.length} 条)`)
check('全量', 'agentId 升序排列', v1.sorted)
check('全量', '字段/类型完整合法', v1.shapeOk)
check('全量', `耗时`, ms1 < TIMEOUT_MS, `(${ms1}ms)`)

// ── 2. ID 范围 (fromId/toId) ──
console.log('\n[2] ID 范围筛选')
const t2 = Date.now()
const ranged = await callTool('agentx_identity_list_all', { chain: CHAIN, fromId: 1, toId: 5 })
const ms2 = Date.now() - t2
const v2 = validateAgents(ranged.agents ?? [], 1, 5)
check('范围', '返回 5 条', (ranged.agents ?? []).length === 5, `(实际 ${ranged.agents?.length})`)
check('范围', 'agentId 全部在 [1,5]', v2.inRange)
check('范围', 'agentId 唯一且升序', v2.unique && v2.sorted)
check('范围', `耗时`, ms2 < TIMEOUT_MS, `(${ms2}ms)`)

// 单点
const single = await callTool('agentx_identity_list_all', { chain: CHAIN, fromId: 3, toId: 3 })
check('单点', 'fromId=toId=3 返回恰好 1 条且 id=3', (single.agents ?? []).length === 1 && single.agents[0].agentId === 3)

// 越界
const over = await callTool('agentx_identity_list_all', { chain: CHAIN, fromId: 999_999, toId: 999_999 })
check('越界', '超出范围返回空数组而非报错', Array.isArray(over.agents) && over.agents.length === 0)

// ── 3. activeOnly 筛选 ──
console.log('\n[3] activeOnly 筛选')
const active = await callTool('agentx_identity_list_all', { chain: CHAIN, activeOnly: true })
const v3 = validateAgents(active.agents ?? [], 1, totalCount)
check('activeOnly', '字段完整', v3.shapeOk)
check('activeOnly', '无 isActive=false', (active.agents ?? []).every((a) => a.metadata.isActive === true), `(active=${active.agents?.length})`)

// ── 4. capabilities 筛选（动态选取真实能力） ──
console.log('\n[4] capabilities 筛选')
const allCaps = [...new Set((agents).flatMap((a) => a.metadata.capabilities ?? []))]
if (allCaps.length === 0) {
  console.log('  ⏭ 链上无任何 capabilities，验证空筛选返回全量')
  const emptyCap = await callTool('agentx_identity_list_all', { chain: CHAIN, capabilities: 'does-not-exist' })
  check('capabilities', '不存在的能力返回空数组', (emptyCap.agents ?? []).length === 0)
} else {
  const probe = allCaps[0]
  const cap = await callTool('agentx_identity_list_all', { chain: CHAIN, capabilities: probe })
  const capAgents = cap.agents ?? []
  check('capabilities', `"${probe}" 命中数 > 0`, capAgents.length > 0, `(命中 ${capAgents.length})`)
  check('capabilities', '每条结果都包含该能力', capAgents.every((a) => a.metadata.capabilities.includes(probe)))
}

// ── 5. 交叉验证：全量 ∩ 筛选集合一致 ──
console.log('\n[5] 交叉验证')
const activeIds = new Set((active.agents ?? []).map((a) => a.agentId))
const expectedActive = (agents).filter((a) => a.metadata.isActive === true).map((a) => a.agentId)
check('交叉', 'activeOnly 结果 == 全量中 isActive 子集', activeIds.size === expectedActive.length && expectedActive.every((id) => activeIds.has(id)))

// ── 汇总 ──
console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
if (failedCases.length) {
  console.log('失败项:')
  failedCases.forEach((c) => console.log(`  - ${c}`))
  process.exit(1)
}
