// AgentX Conversation Service — Conversation Routes
// POST /runs — SSE streaming agent conversation

import { Router, Request, Response } from 'express'
import { AgentRunnerService } from '../services/agent-runner'
import { config } from '../config'

export function createRunsRouter(runner: AgentRunnerService): Router {
  const router = Router()

  // Internal auth middleware — X-Internal-Token
  router.use((req, res, next) => {
    const token = req.headers['x-internal-token'] as string
    if (!token || token !== config.internalAuthToken) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    next()
  })

  // POST /runs — SSE streaming conversation
  router.post('/', async (req: Request, res: Response) => {
    const { agentId, message, enableMemory, contextBudget, history, prompt, skills } = req.body
    const tenantAddress = req.headers['x-tenant-address'] as string || 'unknown'
    const headerApiKey = req.headers['x-llm-api-key'] as string || undefined
    const llmEndpoint = req.headers['x-llm-endpoint'] as string || undefined
    const endUserId = req.headers['x-end-user-id'] as string || undefined

    if (!message) {
      return res.status(400).json({ error: 'message is required' })
    }

    // Either an AgentX agentId or inline prompt/skills must be provided
    const hasAgentId = agentId !== undefined && agentId !== null && agentId !== ''
    const hasInline = typeof prompt === 'string' || (Array.isArray(skills) && skills.length > 0)
    if (!hasAgentId && !hasInline) {
      return res.status(400).json({ error: 'agentId or inline prompt/skills is required' })
    }

    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    try {
      const stream = runner.streamRun({
        agentId: hasAgentId ? Number(agentId) : undefined,
        message: String(message),
        tenantAddress,
        enableMemory: Boolean(enableMemory),
        contextBudget: contextBudget ? Number(contextBudget) : undefined,
        history: history || [],
        headerApiKey,
        llmEndpoint,
        endUserId,
        prompt: typeof prompt === 'string' ? prompt : undefined,
        skills,
      })

      for await (const event of stream) {
        res.write(`data: ${JSON.stringify(event)}\n\n`)
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      res.write(`data: ${JSON.stringify({ type: 'error', error })}\n\n`)
    } finally {
      res.end()
    }
  })

  return router
}
