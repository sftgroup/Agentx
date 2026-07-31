// AgentX Gateway — Agent Runs Route
// SSE proxy: forwards conversation requests to Conversation Service

import { Router, Request, Response } from 'express'
import { getConversationProxy } from '../services/conversation-proxy'

const router = Router()

// POST /api/v1/agent/runs — SSE streaming agent conversation
router.post('/runs', async (req: Request, res: Response) => {
  const { agentId, message, enableMemory, contextBudget, history } = req.body
  const tenantAddress = (req as any).user?.address || (req as any).user?.tenantId || 'unknown'

  if (!agentId || !message) {
    return res.status(400).json({ error: 'agentId and message are required' })
  }

  try {
    const proxy = getConversationProxy()
    const upstream = await proxy.streamRun({
      agentId: Number(agentId),
      message: String(message),
      tenantAddress,
      enableMemory: Boolean(enableMemory),
      contextBudget: contextBudget ? Number(contextBudget) : undefined,
      history,
    })

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: 'Conversation service error' })
    }

    // Pipe SSE stream from Conversation Service to client
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    const reader = upstream.body?.getReader()
    if (!reader) {
      return res.end()
    }

    const decoder = new TextDecoder()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(decoder.decode(value, { stream: true }))
      }
    } finally {
      reader.releaseLock()
      res.end()
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.write(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`)
    res.end()
  }
})

// GET /api/v1/agent/runs/:runId — session detail (placeholder)
router.get('/runs/:runId', (_req, res) => {
  res.json({ runId: _req.params.runId, status: 'ok', note: 'Phase 2: Observability' })
})

export default router
