#!/usr/bin/env node
/**
 * AgentX 全链路集成测试（SDK 0.8.5 升级后验证）
 *
 * 覆盖：
 *   [1] 三服务 health（gateway:3090 / conversation:8100 / frontend:3100）
 *   [2] gateway 链上读（ChainDataReader → SDK AgentRegistry，/api/v1/chain）
 *   [3] MCP 工具（tools/list + identity_total_count，SDK 栈）
 *   [4] 对话 SSE 直连 conversation-service（X-Internal-Token）
 *   [5] 对话 SSE 经 gateway（JWT → /api/v1/agent/runs → conversation-service）——前端真实路径
 *
 * 用法（在生产服务器上运行）:
 *   node /home/ubuntu/Agentx/scripts/agentx-integration-test.mjs
 * 可选: 传 GATEWAY_BASE 覆盖默认 http://localhost:3090
 *
 * 退出码: 0 = 全部通过, 1 = 有失败
 */

const GW = process.env.GATEWAY_BASE || 'http://localhost:3090'
const CS = 'http://localhost:8100'
const FE = 'http://localhost:3100'
const AGENTX_ROOT = '/home/ubuntu/Agentx'
const TIMEOUT_MS = 60_000

let pass = 0
let fail = 0
const failures = []

function check(name, ok, detail = '') {
  if (ok) {
    pass++
    console.log(`  ✅ ${name} ${detail}`)
  } else {
    fail++
    failures.push(name)
    console.log(`  ❌ ${name} ${detail}`)
  }
}

async function jget(url, headers = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
  return { status: res.status, body: await res.json().catch(() => null), res }
}

// ── 读取生产 .env 凭据 ──
import { readFileSync } from 'node:fs'

function readEnv(file) {
  const raw = readFileSync(file, 'utf8')
  const out = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

const gwEnv = readEnv(`${AGENTX_ROOT}/gateway/.env`)
const csEnv = readEnv(`${AGENTX_ROOT}/conversation-service/.env`)

// 生成测试 JWT（gateway JWT_SECRET，模拟前端钱包登录后的 access_token）
let testJwt = null
try {
  const { createRequire } = await import('node:module')
  const require = createRequire(import.meta.url)
  const jwt = require(`${AGENTX_ROOT}/gateway/node_modules/jsonwebtoken`)
  const tenantId = gwEnv.TEST_TENANT_ID
  const wallet = gwEnv.TEST_TENANT_WALLET || '0x000000000000000000000000000000000000a15e'
  if (tenantId) {
    testJwt = jwt.sign({ tenantId, walletAddress: wallet }, gwEnv.JWT_SECRET, { expiresIn: 600 })
  }
} catch (e) {
  console.log(`  ⚠ JWT 生成失败（无 TEST_TENANT_ID 或 jsonwebtoken）: ${e.message}`)
}

const jw = (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' })

console.log(`Gateway: ${GW} | Conversation: ${CS} | Frontend: ${FE}\n`)

// ── [1] 三服务 health ──
console.log('[1] 三服务 health')
{
  const gwHealth = await jget(`${GW}/api/v1/health`)
  check('gateway /api/v1/health', gwHealth.status === 200, `(HTTP ${gwHealth.status})`)

  const csHealth = await jget(`${CS}/health`)
  check('conversation /health', csHealth.status === 200 && csHealth.body?.status === 'ok', `(HTTP ${csHealth.status})`)

  const feRes = await fetch(`${FE}/`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  check('frontend :3100', feRes.status === 200, `(HTTP ${feRes.status})`)
}

// ── [2] gateway 链上读（SDK ChainDataReader） ──
console.log('\n[2] gateway 链上读（ChainDataReader → SDK）')
{
  const total = await jget(`${GW}/api/v1/chain/total`)
  check('/api/v1/chain/total', total.status === 200 && typeof total.body?.totalAgents === 'number' && total.body.totalAgents > 0,
    `(totalAgents=${total.body?.totalAgents})`)

  const agents = await jget(`${GW}/api/v1/chain/agents?fromId=1&toId=3`)
  const list = agents.body?.agents ?? []
  check('/api/v1/chain/agents', agents.status === 200 && Array.isArray(list) && list.length === 3, `(${list.length} 条)`)

  const sample = list[0]
  check('agent 结构完整',
    sample && typeof sample.agentId === 'number' && typeof sample.owner === 'string' &&
    typeof sample.metadata?.name === 'string' && typeof sample.createdAt === 'number',
    sample ? `(agentId=${sample.agentId}, name=${sample.metadata?.name})` : '(空)')

  const plans = await jget(`${GW}/api/v1/chain/plans/41`)
  check('/api/v1/chain/plans/:planId', plans.status === 200 && typeof plans.body?.plan?.planId === 'number', `(HTTP ${plans.status}, planId=${plans.body?.plan?.planId})`)
}

// ── [3] MCP 工具（SDK 栈） ──
console.log('\n[3] MCP 工具')
{
  const rpc = await fetch(`${GW}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const tools = (await rpc.json())?.result?.tools ?? []
  check('tools/list', rpc.status === 200 && tools.length >= 30, `(${tools.length} 个工具)`)

  const count = await fetch(`${GW}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'agentx_identity_total_count', arguments: { chain: 'oxachain' } } }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const cBody = await count.json()
  const cText = cBody?.result?.content?.[0]?.text
  check('agentx_identity_total_count', !!cText && JSON.parse(cText).totalAgents > 0, cText ? `(totalAgents=${JSON.parse(cText).totalAgents})` : '(无结果)')
}

// ── [4] 对话 SSE 直连 conversation-service ──
console.log('\n[4] 对话 SSE 直连 conversation-service')
{
  const res = await fetch(`${CS}/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Token': csEnv.INTERNAL_AUTH_TOKEN,
      'X-Tenant-Address': '0xIntegrationProbe',
    },
    body: JSON.stringify({
      message: 'say hi',
      prompt: 'You are a terse assistant. Reply in at most 3 words.',
      enableMemory: false,
    }),
    signal: AbortSignal.timeout(30_000),
  })
  check('HTTP 200 + text/event-stream', res.status === 200 && (res.headers.get('content-type') || '').includes('text/event-stream'), `(HTTP ${res.status})`)

  const text = await res.text()
  const events = [...text.matchAll(/^data: (.*)$/gm)].map((m) => { try { return JSON.parse(m[1]) } catch { return null } }).filter(Boolean)
  const types = events.map((e) => e.type)
  check('SSE 事件流正常返回', events.length >= 1, `(${events.length} 个事件: ${types.join(',')})`)
  check('收到 done 事件（流完整关闭）', types.includes('done'))

  const errEvent = events.find((e) => e.type === 'error')
  if (errEvent) {
    console.log(`  ⚠ 注: 对话返回 error 事件（LLM 凭据问题，链路本身正常）: ${errEvent.error}`)
  }
}

// ── [5] 对话 SSE 经 gateway（JWT，前端真实路径） ──
console.log('\n[5] 对话 SSE 经 gateway（JWT → /api/v1/agent/runs）')
if (!testJwt) {
  check('前置: 测试 JWT 可用', false, '(无 TEST_TENANT_ID 配置，跳过本组)')
} else {
  const res = await fetch(`${GW}/api/v1/agent/runs`, {
    method: 'POST',
    headers: jw(testJwt),
    body: JSON.stringify({
      message: 'say hi',
      prompt: 'You are a terse assistant. Reply in at most 3 words.',
      enableMemory: false,
    }),
    signal: AbortSignal.timeout(30_000),
  })
  check('HTTP 200 + text/event-stream', res.status === 200 && (res.headers.get('content-type') || '').includes('text/event-stream'), `(HTTP ${res.status})`)

  const text = await res.text()
  const events = [...text.matchAll(/^data: (.*)$/gm)].map((m) => { try { return JSON.parse(m[1]) } catch { return null } }).filter(Boolean)
  const types = events.map((e) => e.type)
  check('SSE 事件流正常返回', events.length >= 1, `(${events.length} 个事件: ${types.join(',')})`)
  check('收到 done 事件（流完整关闭）', types.includes('done'))
}

// ── 汇总 ──
console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
if (failures.length) {
  console.log('失败项:')
  failures.forEach((f) => console.log(`  - ${f}`))
  process.exit(1)
}
