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

async function jpost(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  return { status: res.status, body: await res.json().catch(() => null), res }
}

async function jdel(url, headers = {}) {
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  return { status: res.status, body: await res.json().catch(() => null), res }
}

// ── 读取生产 .env 凭据 ──
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

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

// ── [6] Task 并行链路（sessions + tasks，R2） ──
console.log('\n[6] Task 并行链路（sessions + tasks）')
if (!testJwt) {
  check('前置: 测试 JWT 可用', false, '(无 TEST_TENANT_ID 配置，跳过本组)')
} else {
  const auth = jw(testJwt)
  const startTs = new Date().toISOString()
  const sessionIds = [] // created sessions (cleanup)
  const taskIds = []    // created tasks (cleanup)

  const { Pool } = require(`${AGENTX_ROOT}/gateway/node_modules/pg`)
  const gwPool = new Pool({ connectionString: gwEnv.DATABASE_URL, max: 2 })
  const csPool = new Pool({ connectionString: csEnv.DATABASE_URL, max: 2 })

  const waitTerminal = async (taskId, maxSec = 90) => {
    const deadline = Date.now() + maxSec * 1000
    while (Date.now() < deadline) {
      const r = await jget(`${GW}/api/v1/tasks/${taskId}`, auth)
      const st = r.body?.status
      if (st && !['queued', 'running'].includes(st)) return r.body
      await new Promise((s) => setTimeout(s, 3000))
    }
    return { status: 'timeout' }
  }

  try {
    // 6.1 Session 幂等创建 + 列表
    {
      const s1 = await jpost(`${GW}/api/v1/sessions`, { agentId: 1 }, auth)
      const sid1 = s1.body?.id
      check('POST /sessions 返回 sessionId', (s1.status === 200 || s1.status === 201) && !!sid1, `(HTTP ${s1.status}, id=${sid1})`)
      if (sid1) sessionIds.push(sid1)

      const sidFixed = `smoke-r2-${Date.now()}`
      const s2 = await jpost(`${GW}/api/v1/sessions`, { sessionId: sidFixed, agentId: 1 }, auth)
      const s3 = await jpost(`${GW}/api/v1/sessions`, { sessionId: sidFixed, agentId: 1 }, auth)
      check('POST /sessions 幂等（同 sessionId 返回同一会话）',
        (s2.status === 200 || s2.status === 201) && (s3.status === 200 || s3.status === 201) && s2.body?.id === s3.body?.id && s2.body?.id === sidFixed,
        `(HTTP ${s2.status}/${s3.status}, id=${s2.body?.id})`)
      sessionIds.push(sidFixed)

      const list = await jget(`${GW}/api/v1/sessions/${sid1}/tasks`, auth)
      check('GET /sessions/:id/tasks 新会话为空列表',
        list.status === 200 && Array.isArray(list.body?.tasks) && list.body.tasks.length === 0,
        `(HTTP ${list.status}, ${list.body?.tasks?.length ?? '?'} 条)`)
    }

    // 6.2 并发多任务全部终态（真实 LLM 输出）
    {
      const sid = sessionIds[0]
      const msgs = ['只回答数字：7+8等于几？', '只回答数字：9*9等于几？', '只回答数字：100-37等于几？']
      const created = await Promise.all(msgs.map((m) => jpost(`${GW}/api/v1/sessions/${sid}/tasks`, { agentId: 1, message: m }, auth)))
      const okStatuses = created.map((r) => r.status)
      const tids = created.map((r) => r.body?.id)
      check('并发创建 3 任务立即返回不同 taskId',
        okStatuses.every((s) => s === 200 || s === 201) && tids.every(Boolean) && new Set(tids).size === 3,
        `(HTTP ${okStatuses.join(',')}, ids=${tids.join(',')})`)
      taskIds.push(...tids)

      const finals = await Promise.all(tids.map((t) => waitTerminal(t)))
      const doneN = finals.filter((f) => f.status === 'done').length
      check('并发任务全部到达终态', finals.every((f) => ['done', 'error', 'cancelled'].includes(f.status)),
        `(status=${finals.map((f) => f.status).join(',')})`)
      check('≥2 个任务 done（并行真实执行）', doneN >= 2, `(${doneN}/3 done)`)
      check('done 任务含真实 LLM 输出（result + usage）',
        finals.filter((f) => f.status === 'done').every((f) => f.result && f.usage && f.usage.totalTokens > 0),
        `(tokens=${finals.filter((f) => f.status === 'done').map((f) => f.usage?.totalTokens).join(',')})`)
    }

    // 6.3 SSE 事件重放
    {
      const doneTask = taskIds[0]
      try {
        const res = await fetch(`${GW}/api/v1/tasks/${doneTask}/events`, { headers: auth, signal: AbortSignal.timeout(10_000) })
        const ct = res.headers.get('content-type') || ''
        const text = await res.text()
        const events = [...text.matchAll(/^data: (.*)$/gm)].map((m) => { try { return JSON.parse(m[1]) } catch { return null } }).filter(Boolean)
        const types = events.map((e) => e.type)
        check('SSE content-type = text/event-stream', ct.includes('text/event-stream'), `(HTTP ${res.status})`)
        check('事件重放包含 done 且无 error', types.includes('done') && !types.includes('error'),
          `(${events.length} 事件: ${types.slice(0, 6).join('→')}…→${types[types.length - 1]})`)
      } catch (e) {
        check('SSE 事件重放读取', false, `(${e.message})`)
      }
    }

    // 6.4 取消契约（运行中 + 终态幂等）
    {
      const sid = sessionIds[0]
      const t = await jpost(`${GW}/api/v1/sessions/${sid}/tasks`,
        { agentId: 1, message: '请详细写一篇 800 字关于人工智能未来发展的文章，分三段。' }, auth)
      const tid = t.body?.id
      if (tid) taskIds.push(tid)
      await new Promise((s) => setTimeout(s, 1200))
      const del = await jdel(`${GW}/api/v1/tasks/${tid}`, auth)
      const after = await jget(`${GW}/api/v1/tasks/${tid}`, auth)
      check('运行中任务取消 → cancelled', del.status === 200 && after.body?.status === 'cancelled',
        `(DELETE HTTP ${del.status}, status=${after.body?.status})`)

      const doneTask = taskIds[0]
      const del2 = await jdel(`${GW}/api/v1/tasks/${doneTask}`, auth)
      const after2 = await jget(`${GW}/api/v1/tasks/${doneTask}`, auth)
      check('终态任务重复取消幂等', del2.status < 400 && ['done', 'error', 'cancelled'].includes(after2.body?.status),
        `(HTTP ${del2.status}, status=${after2.body?.status})`)
    }

    // 6.5 P9 gate：禁用租户 403 + 恢复回归
    {
      const orig = (await gwPool.query('SELECT allow_parallel_tasks FROM tenants WHERE id=$1', [gwEnv.TEST_TENANT_ID])).rows[0]?.allow_parallel_tasks ?? null
      try {
        await gwPool.query('UPDATE tenants SET allow_parallel_tasks = false WHERE id=$1', [gwEnv.TEST_TENANT_ID])
        const sid = sessionIds[0]
        const blocked = await jpost(`${GW}/api/v1/sessions/${sid}/tasks`, { agentId: 1, message: 'hi' }, auth)
        check('禁用租户创建 task → 403 PARALLEL_TASKS_DISABLED',
          blocked.status === 403 && blocked.body?.code === 'PARALLEL_TASKS_DISABLED',
          `(HTTP ${blocked.status}, code=${blocked.body?.code})`)
      } finally {
        await gwPool.query('UPDATE tenants SET allow_parallel_tasks = $1 WHERE id=$2', [orig, gwEnv.TEST_TENANT_ID])
      }

      const sid = sessionIds[0]
      const reg = await jpost(`${GW}/api/v1/sessions/${sid}/tasks`, { agentId: 1, message: '只回答数字：2+2等于几？' }, auth)
      const regTid = reg.body?.id
      if (regTid) taskIds.push(regTid)
      const regFinal = await waitTerminal(regTid)
      check('恢复后任务可正常创建并 done', (reg.status === 200 || reg.status === 201) && regFinal.status === 'done',
        `(HTTP ${reg.status}, final=${regFinal.status})`)
    }
  } finally {
    // 6.6 清理：取消运行中任务 + DB 删除本次数据
    try {
      const statuses = await Promise.all(taskIds.map(async (t) => {
        const r = await jget(`${GW}/api/v1/tasks/${t}`, auth)
        return ['queued', 'running'].includes(r.body?.status) ? t : null
      }))
      await Promise.all(statuses.filter(Boolean).map((t) => jdel(`${GW}/api/v1/tasks/${t}`, auth).catch(() => null)))
    } catch { /* best effort */ }
    try {
      if (sessionIds.length) await csPool.query('DELETE FROM chat_sessions WHERE id = ANY($1)', [sessionIds])
      await gwPool.query('DELETE FROM usage_logs WHERE tenant_id = $1 AND created_at >= $2', [gwEnv.TEST_TENANT_ID, startTs])
      console.log('  🧹 已清理: 本次 session/task/events + usage_logs')
    } catch (e) {
      console.log(`  ⚠ 清理异常: ${e.message}`)
    }
    await gwPool.end().catch(() => null)
    await csPool.end().catch(() => null)
  }
}

// ── 汇总 ──
console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
if (failures.length) {
  console.log('失败项:')
  failures.forEach((f) => console.log(`  - ${f}`))
  process.exit(1)
}
