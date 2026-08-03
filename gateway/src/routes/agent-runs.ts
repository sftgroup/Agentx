// AgentX Gateway — Agent Runs Route
// SSE proxy: forwards conversation requests to Conversation Service

import { Router, Request, Response } from 'express'
import { getConversationProxy } from '../services/conversation-proxy'

const router = Router()

// POST /api/v1/agent/runs — SSE streaming agent conversation
router.post('/runs', async (req: Request, res: Response) => {
  const { agentId, message, enableMemory, contextBudget, history, prompt, skills } = req.body
  const tenantAddress = (req as any).user?.address || (req as any).user?.tenantId || 'unknown'
  const endUserId = req.headers['x-end-user-id'] as string || undefined
  const headerApiKey = req.headers['x-llm-api-key'] as string || undefined
  const llmEndpoint = req.headers['x-llm-endpoint'] as string || undefined
  const llmModel = req.headers['x-llm-model'] as string || undefined

  if (!message) {
    return res.status(400).json({ error: 'message is required' })
  }
  const hasAgentId = agentId !== undefined && agentId !== null && agentId !== ''
  const hasInline = typeof prompt === 'string' || (Array.isArray(skills) && skills.length > 0)
  if (!hasAgentId && !hasInline) {
    return res.status(400).json({ error: 'agentId or inline prompt/skills is required' })
  }

  try {
    const proxy = getConversationProxy()
    const upstream = await proxy.streamRun({
      agentId: hasAgentId ? Number(agentId) : undefined,
      message: String(message),
      tenantAddress,
      enableMemory: Boolean(enableMemory),
      contextBudget: contextBudget ? Number(contextBudget) : undefined,
      history,
      endUserId,
      headerApiKey,
      headerEndpoint: llmEndpoint,
      headerModel: llmModel,
      prompt: typeof prompt === 'string' ? prompt : undefined,
      skills,
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
