// AgentX Gateway — SSE usage-observation pipe unit tests.
// Verifies done-event usage extraction (incl. chunk-split events), llmSource
// routing, and that the client stream is forwarded byte-for-byte unchanged.
import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { pipeSSEWithUsage } from '../src/services/sse-usage'

function stubUpstream(chunks: (string | Uint8Array)[]): globalThis.Response {
  // Build a Response whose body reads exactly the given chunks.
  const encoder = new TextEncoder()
  const queue = chunks.map((c) => (typeof c === 'string' ? encoder.encode(c) : c))
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      queue.forEach((c) => controller.enqueue(c))
      controller.close()
    },
  }), { status: 200 })
}

describe('pipeSSEWithUsage', () => {
  it('extracts totalTokens from done events and forwards the stream unchanged', async () => {
    const onUsage = vi.fn()
    const app = express()
    app.get('/sse', (_req, res) => {
      const upstream = stubUpstream([
        'data: {"type":"text","content":"hi"}\n\n',
        'data: {"type":"done","usage":{"promptTokens":100,"completionTokens":50,"totalTokens":150},"llmSource":"platform"}\n\n',
      ])
      return pipeSSEWithUsage(upstream, res, onUsage)
    })

    const res = await request(app).get('/sse')
    expect(res.status).toBe(200)
    expect(res.text).toContain('data: {"type":"text","content":"hi"}')
    expect(res.text).toContain('"totalTokens":150')
    expect(onUsage).toHaveBeenCalledWith({ totalTokens: 150, promptTokens: 100, completionTokens: 50, llmSource: 'platform' })
  })

  it('handles a done event split across multiple chunks', async () => {
    const onUsage = vi.fn()
    const app = express()
    app.get('/sse', (_req, res) => {
      const upstream = stubUpstream([
        'data: {"type":"done","usage":{',
        '"promptTokens":20,"completionTokens":5,"totalTokens":25}',
        ',"llmSource":"byok"}\n\n',
      ])
      return pipeSSEWithUsage(upstream, res, onUsage)
    })

    const res = await request(app).get('/sse')
    expect(res.status).toBe(200)
    expect(onUsage).toHaveBeenCalledWith({ totalTokens: 25, promptTokens: 20, completionTokens: 5, llmSource: 'byok' })
    // Bytes must still arrive intact at the client.
    expect(res.text).toContain('"totalTokens":25')
  })

  it('reports zero tokens when done has no usage and passes llmSource through', async () => {
    const onUsage = vi.fn()
    const app = express()
    app.get('/sse', (_req, res) => {
      const upstream = stubUpstream(['data: {"type":"done","llmSource":"platform"}\n\n'])
      return pipeSSEWithUsage(upstream, res, onUsage)
    })

    await request(app).get('/sse')
    expect(onUsage).toHaveBeenCalledWith({ totalTokens: 0, promptTokens: 0, completionTokens: 0, llmSource: 'platform' })
  })

  it('extracts usage from the wrapped task format { seq, type, payload }', async () => {
    const onUsage = vi.fn()
    const app = express()
    app.get('/sse', (_req, res) => {
      const upstream = stubUpstream([
        'data: {"seq":1,"type":"text","payload":{"type":"text","content":"working"}}\n\n',
        'data: {"seq":2,"type":"done","payload":{"type":"done","usage":{"promptTokens":80,"completionTokens":20,"totalTokens":100},"iterations":3,"llmSource":"platform"}}\n\n',
      ])
      return pipeSSEWithUsage(upstream, res, onUsage)
    })

    const res = await request(app).get('/sse')
    expect(res.status).toBe(200)
    expect(onUsage).toHaveBeenCalledWith({ totalTokens: 100, promptTokens: 80, completionTokens: 20, llmSource: 'platform' })
    // Bytes forwarded unchanged
    expect(res.text).toContain('"totalTokens":100')
  })

  it('ignores malformed SSE lines without breaking the stream', async () => {
    const onUsage = vi.fn()
    const app = express()
    app.get('/sse', (_req, res) => {
      const upstream = stubUpstream([
        'not-an-event\n\n',
        'data: {broken json\n\n',
        'data: {"type":"done","usage":{"totalTokens":9},"llmSource":"platform"}\n\n',
      ])
      return pipeSSEWithUsage(upstream, res, onUsage)
    })

    const res = await request(app).get('/sse')
    expect(res.status).toBe(200)
    expect(onUsage).toHaveBeenCalledTimes(1)
    expect(onUsage).toHaveBeenCalledWith({ totalTokens: 9, promptTokens: 0, completionTokens: 0, llmSource: 'platform' })
    expect(res.text).toContain('data: {"type":"done"')
  })
})
