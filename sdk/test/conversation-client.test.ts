// ConversationClient — sessions & parallel tasks (P8/P9) unit tests.
// Covers the new parallel-task API surface added in SDK 0.8.7:
//   createSession / createTask / getTask / listTasks / cancelTask / getCapabilities
//   + the P9 capability gate contract (ConversationTaskError, HTTP 403 PARALLEL_TASKS_DISABLED).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ConversationClient, ConversationTaskError } from '../src/conversation/client'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('ConversationClient — parallel tasks (P8/P9)', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const makeClient = (extra: Record<string, unknown> = {}) =>
    new ConversationClient({ gatewayUrl: 'https://gw.example.com', apiKey: 'agentx_test', ...extra })

  /** Assert helper: pull method + headers + parsed body out of the first fetch call. */
  const firstCall = (call: unknown[]) => {
    const [url, init] = call as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    const body = init.body ? JSON.parse(init.body as string) : undefined
    return { url, method: init.method, headers, body }
  }

  describe('auth headers', () => {
    it('apiKey mode sends X-Api-Key (no Authorization)', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ id: 's1', tenant: 't' }, 201))
      const client = new ConversationClient({ gatewayUrl: 'https://gw.example.com', apiKey: 'agentx_123' })
      await client.createSession({ title: 'x' })
      const { headers } = firstCall(fetchMock.mock.calls[0]!)
      expect(headers['X-Api-Key']).toBe('agentx_123')
      expect(headers['Authorization']).toBeUndefined()
    })

    it('accessToken mode sends Authorization: Bearer', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ id: 's1', tenant: 't' }, 201))
      const client = new ConversationClient({ gatewayUrl: 'https://gw.example.com', accessToken: 'jwt-abc' })
      await client.createSession({})
      const { headers } = firstCall(fetchMock.mock.calls[0]!)
      expect(headers['Authorization']).toBe('Bearer jwt-abc')
      expect(headers['X-Api-Key']).toBeUndefined()
    })

    it('requires either apiKey or accessToken', async () => {
      const client = new ConversationClient({ gatewayUrl: 'https://gw.example.com' })
      await expect(client.createSession({})).rejects.toThrow('requires either apiKey or accessToken')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('sends end-user isolation + BYOK headers', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ id: 's1', tenant: 't' }, 201))
      const client = new ConversationClient({
        gatewayUrl: 'https://gw.example.com',
        apiKey: 'agentx_1',
        endUserId: 'u-1',
        llmApiKey: 'sk-llm',
        llmEndpoint: 'https://api.deepseek.com/v1',
        llmModel: 'deepseek-chat',
      })
      await client.createSession({})
      const { headers } = firstCall(fetchMock.mock.calls[0]!)
      expect(headers['X-End-User-Id']).toBe('u-1')
      expect(headers['X-Llm-Api-Key']).toBe('sk-llm')
      expect(headers['X-Llm-Endpoint']).toBe('https://api.deepseek.com/v1')
      expect(headers['X-Llm-Model']).toBe('deepseek-chat')
    })
  })

  describe('createSession', () => {
    it('POSTs /api/v1/sessions with the params and returns the session', async () => {
      const session = { id: 's1', tenant: '0xabc', title: 'Audit' }
      fetchMock.mockResolvedValue(jsonResponse(session, 201))
      const res = await makeClient().createSession({ title: 'Audit', agentId: 42 })
      expect(res).toMatchObject({ id: 's1', tenant: '0xabc' })
      const { url, method, body } = firstCall(fetchMock.mock.calls[0]!)
      expect(url).toBe('https://gw.example.com/api/v1/sessions')
      expect(method).toBe('POST')
      expect(body).toMatchObject({ title: 'Audit', agentId: 42 })
    })

    it('throws ConversationTaskError on non-2xx', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: 'nope' }, 400))
      await expect(makeClient().createSession({})).rejects.toBeInstanceOf(ConversationTaskError)
    })
  })

  describe('createTask', () => {
    it('POSTs to /api/v1/sessions/:id/tasks and returns the task row (queued)', async () => {
      const task = { id: 't1', sessionId: 's1', status: 'queued', message: 'hi' }
      fetchMock.mockResolvedValue(jsonResponse(task, 201))
      const res = await makeClient().createTask({ sessionId: 's1', agentId: 1, message: 'hi' })
      expect(res.status).toBe('queued')
      const { url, method, body } = firstCall(fetchMock.mock.calls[0]!)
      expect(url).toBe('https://gw.example.com/api/v1/sessions/s1/tasks')
      expect(method).toBe('POST')
      expect(body).toMatchObject({ sessionId: 's1', agentId: 1, message: 'hi' })
    })

    it('surfaces P9 gate 403 as ConversationTaskError with code PARALLEL_TASKS_DISABLED', async () => {
      fetchMock.mockResolvedValue(jsonResponse(
        { error: 'Parallel tasks are disabled for this tenant', code: 'PARALLEL_TASKS_DISABLED' },
        403,
      ))
      const err = await makeClient().createTask({ sessionId: 's1', message: 'hi' }).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(ConversationTaskError)
      const taskErr = err as ConversationTaskError
      expect(taskErr.status).toBe(403)
      expect(taskErr.code).toBe('PARALLEL_TASKS_DISABLED')
      expect(taskErr.message).toContain('Parallel tasks are disabled for this tenant')
    })

    it('propagates other error codes (e.g. rate limit)', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: 'rate limited', code: 'RATE_LIMITED' }, 429))
      const err = await makeClient().createTask({ sessionId: 's1', message: 'hi' }).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(ConversationTaskError)
      const taskErr = err as ConversationTaskError
      expect(taskErr.status).toBe(429)
      expect(taskErr.code).toBe('RATE_LIMITED')
    })
  })

  describe('getTask', () => {
    it('GETs /api/v1/tasks/:id and returns the task', async () => {
      const task = { id: 't1', status: 'done', result: 'ok' }
      fetchMock.mockResolvedValue(jsonResponse(task))
      const res = await makeClient().getTask('t1')
      expect(res).toMatchObject({ id: 't1', status: 'done' })
      const { url } = firstCall(fetchMock.mock.calls[0]!)
      expect(url).toBe('https://gw.example.com/api/v1/tasks/t1')
    })

    it('throws ConversationTaskError on 404', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: 'not found' }, 404))
      await expect(makeClient().getTask('missing')).rejects.toBeInstanceOf(ConversationTaskError)
    })
  })

  describe('listTasks', () => {
    it('returns the tasks array from /api/v1/sessions/:id/tasks', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ tasks: [{ id: 't1' }, { id: 't2' }] }))
      const res = await makeClient().listTasks('s1')
      expect(res).toHaveLength(2)
      const { url } = firstCall(fetchMock.mock.calls[0]!)
      expect(url).toBe('https://gw.example.com/api/v1/sessions/s1/tasks')
    })

    it('defaults to an empty array when the body has no tasks', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}))
      await expect(makeClient().listTasks('s1')).resolves.toEqual([])
    })
  })

  describe('cancelTask', () => {
    it('DELETEs /api/v1/tasks/:id and returns the current status', async () => {
      const task = { id: 't1', status: 'cancelled' }
      fetchMock.mockResolvedValue(jsonResponse(task))
      const res = await makeClient().cancelTask('t1')
      expect(res.status).toBe('cancelled')
      const { url, method } = firstCall(fetchMock.mock.calls[0]!)
      expect(url).toBe('https://gw.example.com/api/v1/tasks/t1')
      expect(method).toBe('DELETE')
    })
  })

  describe('getCapabilities (P9)', () => {
    it('maps parallel_tasks + parallel_tasks_override from /api/v1/tenant/me', async () => {
      fetchMock.mockResolvedValue(jsonResponse({
        capabilities: { parallel_tasks: false, parallel_tasks_override: false },
      }))
      const caps = await makeClient().getCapabilities()
      expect(caps.parallelTasks).toBe(false)
      expect(caps.parallelTasksOverride).toBe(false)
    })

    it('defaults to enabled (true) when the capability is absent', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ capabilities: {} }))
      const caps = await makeClient().getCapabilities()
      expect(caps.parallelTasks).toBe(true)
      expect(caps.parallelTasksOverride).toBeNull()
    })

    it('throws ConversationTaskError on non-2xx', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: 'unauthorized' }, 401))
      await expect(makeClient().getCapabilities()).rejects.toBeInstanceOf(ConversationTaskError)
    })
  })
})
