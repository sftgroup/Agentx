// AgentX Conversation Service — Tenant LLM Config Routes
// POST   /tenants/:address/llm-key  → save/update tenant's own LLM API key
// DELETE /tenants/:address/llm-key  → delete tenant key → revert to AgentX official key
//
// Authentication: X-Internal-Token (same as /runs)

import { Router, Request, Response, NextFunction } from 'express'
import type { TenantLLMResolver } from '../services/tenant-llm-resolver'
import { config } from '../config'

export function createTenantsRouter(resolver: TenantLLMResolver): Router {
  const router = Router()

  // Internal token guard (same as /runs)
  router.use((req: Request, res: Response, next: NextFunction) => {
    const token = req.headers['x-internal-token'] as string
    if (!token || token !== config.internalAuthToken) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    next()
  })

  // POST /tenants/:address/llm-key
  // Body: { apiKey: string, provider?: "openai"|"deepseek"|"custom", model?: string, endpointUrl?: string }
  router.post('/:address/llm-key', async (req: Request, res: Response) => {
    try {
      const { address } = req.params
      const { apiKey, provider, model, endpointUrl } = req.body

      if (!apiKey || typeof apiKey !== 'string') {
        return res.status(400).json({ error: 'apiKey is required' })
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({ error: 'Invalid Ethereum address' })
      }

      await resolver.saveTenantKey(address, apiKey, provider || 'openai', model, endpointUrl)

      res.json({
        success: true,
        tenantAddress: address,
        provider: provider || 'openai',
        model: model || null,
        message: 'LLM key saved (encrypted at rest). This key will be used for all agent conversations.',
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[Tenants] Save LLM key error:', message)
      res.status(500).json({ error: 'Failed to save LLM key' })
    }
  })

  // DELETE /tenants/:address/llm-key
  router.delete('/:address/llm-key', async (req: Request, res: Response) => {
    try {
      const { address } = req.params

      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({ error: 'Invalid Ethereum address' })
      }

      await resolver.deleteTenantKey(address)

      res.json({
        success: true,
        tenantAddress: address,
        message: 'LLM key deleted. Agent conversations will now use AgentX official key.',
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[Tenants] Delete LLM key error:', message)
      res.status(500).json({ error: 'Failed to delete LLM key' })
    }
  })

  return router
}
