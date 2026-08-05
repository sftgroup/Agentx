// AgentX Gateway — chat sessions & tasks route unit tests.
// Covers the P8/P9 parallel-task surface exposed to integrators:
//   P9 capability gate (effective = tenant.allow_parallel_tasks ?? plan.features.parallel_tasks ?? true)
//   input validation, proxy passthrough (createSession/createTask/listTasks/getTask/cancelTask), SSE piping.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'
import chatTasksRouter from '../src/routes/chat-tasks'

const proxyMock = vi.hoisted(() => ({
  createSession: vi.fn(),
  createTask: vi.fn(),
  listTasks: vi.fn(),
  getTask: vi.fn(),
  cancelTask: vi.fn(),
  streamTaskEvents: vi.fn(),
}))

vi.mock('../src/services/conversation-proxy', () => ({
  getConversationProxy: () => proxyMock,
}))

interface TenantCtx {
  id: string
  walletAddress: string
  allowParallelTasks?: boolean | null
  planFeatures?: Record<string, unknown> | null
}

let currentTenant: TenantCtx | undefined

const app = express()
app.use(express.json())
app.use((req: Request, _res: Response, next: NextFunction) => {
  ;(req as Request & { tenant?: TenantCtx }).tenant = currentTenant
  next()
})
app.use('/api/v1', chatTasksRouter)

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  currentTenant = { id: 't1', walletAddress: '0xTenant', allowParallelTasks: undefined, planFeatures: {} }
  for (const fn of Object.values(proxyMock)) fn.mockReset()
})

// ── P9 capability gate ────────────────────────────────────────────────────

describe('P9 capability gate — POST /sessions/:sessionId/tasks', () => {
  it('allows task creation by default (no flags set)', async () => {
    proxyMock.createTask.mockResolvedValue(ok({ id: 't1', status: 'queued' }, 201))
    const res = await request(app)
      .post('/api/v1/sessions/s1/tasks')
      .send({ agentId: 1, message: 'hi' })
    expect(res.status).toBe(201)
    expect(proxyMock.createTask).toHaveBeenCalledTimes(1)
  })

  it('blocks task creation when the plan disables parallel_tasks → 403 PARALLEL_TASKS_DISABLED', async () => {
    currentTenant!.planFeatures = { parallel_tasks: false }
    const res = await request(app)
      .post('/api/v1/sessions/s1/tasks')
      .send({ agentId: 1, message: 'hi' })
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('PARALLEL_TASKS_DISABLED')
    expect(res.body.error).toContain('Parallel tasks are disabled')
    expect(proxyMock.createTask).not.toHaveBeenCalled()
  })

  it('blocks task creation when the tenant override is false (even if plan allows)', async () => {
    currentTenant!.planFeatures = { parallel_tasks: true }
    currentTenant!.allowParallelTasks = false
    const res = await request(app)
      .post('/api/v1/sessions/s1/tasks')
      .send({ agentId: 1, message: 'hi' })
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('PARALLEL_TASKS_DISABLED')
  })

  it('allows task creation when the tenant override is true (even if plan disables)', async () => {
    currentTenant!.planFeatures = { parallel_tasks: false }
    currentTenant!.allowParallelTasks = true
    proxyMock.createTask.mockResolvedValue(ok({ id: 't1', status: 'queued' }, 201))
    const res = await request(app)
      .post('/api/v1/sessions/s1/tasks')
      .send({ agentId: 1, message: 'hi' })
    expect(res.status).toBe(201)
  })

  it('allows task creation when tenant is missing (defaults to enabled)', async () => {
    currentTenant = undefined
    proxyMock.createTask.mockResolvedValue(ok({ id: 't1', status: 'queued' }, 201))
    const res = await request(app)
      .post('/api/v1/sessions/s1/tasks')
      .send({ agentId: 1, message: 'hi' })
    expect(res.status).toBe(201)
  })
})

// ── Input validation ──────────────────────────────────────────────────────

describe('input validation — POST /sessions/:sessionId/tasks', () => {
  it('rejects when message is missing → 400', async () => {
    const res = await request(app)
      .post('/api/v1/sessions/s1/tasks')
      .send({ agentId: 1 })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('message is required')
  })

  it('rejects when neither agentId nor inline prompt/skills is given → 400', async () => {
    const res = await request(app)
      .post('/api/v1/sessions/s1/tasks')
      .send({ message: 'hi' })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('agentId or inline prompt/skills')
  })

  it('accepts inline prompt mode (no agentId)', async () => {
    proxyMock.createTask.mockResolvedValue(ok({ id: 't1', status: 'queued' }, 201))
    const res = await request(app)
      .post('/api/v1/sessions/s1/tasks')
      .send({ message: 'hi', prompt: 'You are a concise assistant.' })
    expect(res.status).toBe(201)
    expect(proxyMock.createTask.mock.calls[0][0].agentId).toBeUndefined()
    expect(proxyMock.createTask.mock.calls[0][0].prompt).toBe('You are a concise assistant.')
  })

  it('accepts agentId=0 (valid falsy id)', async () => {
    proxyMock.createTask.mockResolvedValue(ok({ id: 't1', status: 'queued' }, 201))
    const res = await request(app)
      .post('/api/v1/sessions/s1/tasks')
      .send({ agentId: 0, message: 'hi' })
    expect(res.status).toBe(201)
  })
})

// ── Proxy passthrough ─────────────────────────────────────────────────────

describe('proxy passthrough', () => {
  it('createTask forwards normalized params + BYOK headers', async () => {
    proxyMock.createTask.mockResolvedValue(ok({ id: 't1', status: 'queued' }, 201))
    const res = await request(app)
      .post('/api/v1/sessions/s1/tasks')
      .set('X-End-User-Id', 'u-1')
      .set('X-Llm-Api-Key', 'sk-test')
      .send({
        agentId: '42',
        message: 'analyze',
        enableMemory: true,
        prompt: 'sys',
        history: [{ role: 'user', content: 'x' }],
      })
    expect(res.status).toBe(201)
    const params = proxyMock.createTask.mock.calls[0][0]
    expect(params).toMatchObject({
      sessionId: 's1',
      tenantAddress: '0xTenant',
      agentId: 42,               // string → number
      message: 'analyze',
      enableMemory: true,
      prompt: 'sys',
      history: [{ role: 'user', content: 'x' }],
      endUserId: 'u-1',
      headerApiKey: 'sk-test',
    })
  })

  it('createSession POSTs and passes through status/body', async () => {
    proxyMock.createSession.mockResolvedValue(ok({ id: 's1', tenant: '0xTenant', title: 'Audit' }, 201))
    const res = await request(app)
      .post('/api/v1/sessions')
      .send({ sessionId: 's-custom', agentId: 3, title: 'Audit' })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ id: 's1', title: 'Audit' })
    const params = proxyMock.createSession.mock.calls[0][0]
    expect(params).toMatchObject({ sessionId: 's-custom', agentId: 3, title: 'Audit', tenantAddress: '0xTenant' })
  })

  it('listTasks GETs and passes through body', async () => {
    proxyMock.listTasks.mockResolvedValue(ok({ tasks: [{ id: 't1', status: 'done' }] }))
    const res = await request(app).get('/api/v1/sessions/s1/tasks')
    expect(res.status).toBe(200)
    expect(res.body.tasks).toHaveLength(1)
    expect(proxyMock.listTasks).toHaveBeenCalledWith('s1')
  })

  it('getTask GETs and passes through body', async () => {
    proxyMock.getTask.mockResolvedValue(ok({ id: 't1', status: 'running' }))
    const res = await request(app).get('/api/v1/tasks/t1')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('running')
    expect(proxyMock.getTask).toHaveBeenCalledWith('t1')
  })

  it('cancelTask DELETEs and passes through body', async () => {
    proxyMock.cancelTask.mockResolvedValue(ok({ id: 't1', status: 'cancelled' }))
    const res = await request(app).delete('/api/v1/tasks/t1')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('cancelled')
    expect(proxyMock.cancelTask).toHaveBeenCalledWith('t1')
  })
})

// ── SSE events ────────────────────────────────────────────────────────────

describe('GET /tasks/:taskId/events (SSE)', () => {
  it('pipes the upstream event stream to the client', async () => {
    proxyMock.streamTaskEvents.mockResolvedValue(
      new Response('data: {"type":"text","content":"hi"}\n\ndata: {"type":"done"}\n\n', {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    )
    const res = await request(app).get('/api/v1/tasks/t1/events')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/event-stream')
    expect(res.text).toContain('data: {"type":"text"')
    expect(proxyMock.streamTaskEvents).toHaveBeenCalledWith('t1')
  })

  it('returns a JSON error when the upstream is not ok', async () => {
    proxyMock.streamTaskEvents.mockResolvedValue(ok({ error: 'boom' }, 503))
    const res = await request(app).get('/api/v1/tasks/t1/events')
    expect(res.status).toBe(503)
    expect(res.body.error).toBe('Conversation service error')
  })
})
