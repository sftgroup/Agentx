// AgentX Gateway — MCP conversation & task tools unit tests.
// Covers the R-extension of the MCP surface (P8/P9):
//   agentx_gateway_chat / create_session / create_task / get_task / list_tasks / cancel_task
// Each tool requires `api_key` (X-Api-Key) or `access_token` (JWT) and proxies to
// the local gateway REST endpoints. Outbound fetch is mocked.
import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import mcpRouter from '../src/routes/mcp'

const app = express()
app.use(express.json())
app.use('/mcp', mcpRouter)

const callTool = async (name: string, args: Record<string, unknown>) => {
  const res = await request(app).post('/mcp').send({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: args },
  })
  return res.body
}

const textOf = (body: any): string => body?.result?.content?.[0]?.text ?? ''

// ── tools/list ────────────────────────────────────────────────────────────

describe('MCP tools/list — conversation & task tools', () => {
  it('registers all 6 gateway conversation/task tools', async () => {
    const res = await request(app).post('/mcp').send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
    const names: string[] = res.body.result.tools.map((t: any) => t.name)
    for (const n of [
      'agentx_gateway_chat',
      'agentx_gateway_create_session',
      'agentx_gateway_create_task',
      'agentx_gateway_get_task',
      'agentx_gateway_list_tasks',
      'agentx_gateway_cancel_task',
    ]) {
      expect(names).toContain(n)
    }
  })
})

// ── agentx_gateway_chat ───────────────────────────────────────────────────

describe('agentx_gateway_chat', () => {
  it('rejects missing message', async () => {
    const body = await callTool('agentx_gateway_chat', { api_key: 'agentx_test' })
    expect(JSON.parse(textOf(body)).error).toBe('message is required')
  })

  it('rejects missing auth (neither api_key nor access_token)', async () => {
    const body = await callTool('agentx_gateway_chat', { message: 'hi' })
    expect(JSON.parse(textOf(body)).error).toContain('api_key or access_token is required')
  })

  it('collects SSE events into a reply and uses X-Api-Key auth', async () => {
    const fetchMock = vi.fn(async (url: any, init: any) => {
      expect(String(url)).toContain('/api/v1/agent/runs')
      expect(init.headers['X-Api-Key']).toBe('agentx_test')
      const sse = [
        `data: ${JSON.stringify({ type: 'text', content: 'Hel' })}`,
        '',
        `data: ${JSON.stringify({ type: 'text', content: 'lo' })}`,
        '',
        `data: ${JSON.stringify({ type: 'tool_call', toolName: 't', toolArgs: { a: 1 } })}`,
        '',
        `data: ${JSON.stringify({ type: 'done' })}`,
        '',
      ].join('\n')
      return new Response(sse, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const body = await callTool('agentx_gateway_chat', { message: 'hi', agent_id: 1, api_key: 'agentx_test' })
    const result = JSON.parse(textOf(body))
    expect(result.reply).toBe('Hello')
    expect(result.tool_calls).toEqual([{ name: 't', arguments: { a: 1 } }])
  })

  it('surfaces an SSE error event as {error}', async () => {
    const fetchMock = vi.fn(async () => {
      const sse = `data: ${JSON.stringify({ type: 'error', error: 'boom' })}\n\n`
      return new Response(sse, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const body = await callTool('agentx_gateway_chat', { message: 'hi', api_key: 'agentx_test' })
    expect(JSON.parse(textOf(body)).error).toBe('boom')
  })
})

// ── agentx_gateway_create_task ────────────────────────────────────────────

describe('agentx_gateway_create_task', () => {
  it('rejects missing session_id or message', async () => {
    const body = await callTool('agentx_gateway_create_task', { api_key: 'agentx_test', session_id: 's1' })
    expect(JSON.parse(textOf(body)).error).toContain('session_id and message are required')
  })

  it('forwards task creation with Bearer JWT auth and camelCase body', async () => {
    const fetchMock = vi.fn(async (url: any, init: any) => {
      expect(String(url)).toContain('/api/v1/sessions/s1/tasks')
      expect(init.headers.Authorization).toBe('Bearer jwt')
      expect(init.method).toBe('POST')
      expect(init.body).toContain('"agentId":7')
      expect(init.body).toContain('"message":"do it"')
      return new Response(JSON.stringify({ id: 't1', status: 'queued' }), { status: 201 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const body = await callTool('agentx_gateway_create_task', {
      session_id: 's1',
      message: 'do it',
      agent_id: 7,
      access_token: 'jwt',
    })
    const result = JSON.parse(textOf(body))
    expect(result.id).toBe('t1')
    expect(result.status).toBe('queued')
  })
})

// ── agentx_gateway_create_session / get_task / list_tasks / cancel_task ───

describe('agentx_gateway session & task management tools', () => {
  it('create_session POSTs to /sessions with agent_id', async () => {
    const fetchMock = vi.fn(async (url: any, init: any) => {
      expect(String(url)).toContain('/api/v1/sessions')
      expect(init.body).toContain('"agentId":3')
      return new Response(JSON.stringify({ id: 'sx', tenant: 'partner-x' }), { status: 201 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const body = await callTool('agentx_gateway_create_session', { agent_id: 3, api_key: 'agentx_test' })
    const result = JSON.parse(textOf(body))
    expect(result.id).toBe('sx')
  })

  it('get_task GETs /tasks/:id', async () => {
    const fetchMock = vi.fn(async (url: any) => {
      expect(String(url)).toContain('/api/v1/tasks/t9')
      return new Response(JSON.stringify({ id: 't9', status: 'done' }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const body = await callTool('agentx_gateway_get_task', { task_id: 't9', api_key: 'agentx_test' })
    expect(JSON.parse(textOf(body)).status).toBe('done')
  })

  it('list_tasks GETs /sessions/:id/tasks', async () => {
    const fetchMock = vi.fn(async (url: any) => {
      expect(String(url)).toContain('/api/v1/sessions/s1/tasks')
      return new Response(JSON.stringify({ tasks: [{ id: 't1', status: 'running' }] }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const body = await callTool('agentx_gateway_list_tasks', { session_id: 's1', api_key: 'agentx_test' })
    expect(JSON.parse(textOf(body)).tasks).toHaveLength(1)
  })

  it('cancel_task DELETEs /tasks/:id', async () => {
    const fetchMock = vi.fn(async (_url: any, init: any) => {
      expect(init.method).toBe('DELETE')
      return new Response(JSON.stringify({ id: 't9', status: 'cancelled' }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const body = await callTool('agentx_gateway_cancel_task', { task_id: 't9', api_key: 'agentx_test' })
    expect(JSON.parse(textOf(body)).status).toBe('cancelled')
  })
})
