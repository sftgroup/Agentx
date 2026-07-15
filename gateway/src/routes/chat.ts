// ---------------------------------------------------------------------------
// AgentX Gateway — Chat Completions Proxy
// ---------------------------------------------------------------------------
// POST /api/v1/chat/completions
// Resolves tenant API key, proxies to LLM, streams back, records usage.
// ---------------------------------------------------------------------------

import { Router, Request, Response } from 'express'
import { getPool } from '../lib/db'
import { decryptApiKey } from '../lib/crypto'
import { config } from '../config'
import { updateQuota } from '../middleware/rate-limiter'

const router = Router()

router.post('/chat/completions', async (req: Request, res: Response) => {
  const tenant = req.tenant
  if (!tenant) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const {
    model,
    messages,
    tools,
    stream,
    key_source,
    tenant_key_id,
    temperature,
    max_tokens,
  } = req.body

  let apiKey: string
  let endpoint: string
  let keySource: string
  let platformKeyId: string | null = null
  let tenantKeyId: string | null = null
  let resolvedModel = model || 'gpt-4o'

  const pool = getPool()

  try {
    if (key_source === 'tenant_owned' && tenant_key_id) {
      // ── BYOK Mode ──
      const keyRow = await pool.query(
        `SELECT * FROM tenant_api_keys WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
        [tenant_key_id, tenant.id]
      )
      if (keyRow.rows.length === 0) {
        res.status(400).json({ error: 'Tenant API key not found or inactive' })
        return
      }
      const tk = keyRow.rows[0]
      apiKey = decryptApiKey(tk.api_key, config.masterEncryptionKey)
      endpoint = tk.endpoint
      resolvedModel = model || tk.model
      keySource = 'tenant_owned'
      tenantKeyId = tk.id
    } else if (tenant.quotaDaily > 0) {
      // ── Platform Mode ──
      if (tenant.quotaUsed >= tenant.quotaDaily) {
        res.status(429).json({
          error: 'Platform quota exhausted',
          hint: 'Switch to BYOK mode or upgrade your plan',
        })
        return
      }

      const planRow = await pool.query(
        `SELECT platform_models FROM plans WHERE id = $1`,
        [tenant.planId]
      )
      const planModels = planRow.rows[0]?.platform_models || []

      let matchedModel: { provider: string; model: string } | null = null
      if (resolvedModel) {
        matchedModel = planModels.find(
          (m: { model: string }) => m.model === resolvedModel
        ) || planModels[0]
      } else {
        matchedModel = planModels[0]
      }

      if (!matchedModel) {
        res.status(400).json({
          error: 'No platform models available on current plan',
          available_models: planModels.map((m: { model: string }) => m.model),
        })
        return
      }

      const keyRow = await pool.query(
        `SELECT * FROM platform_api_keys
         WHERE provider = $1 AND $2 = ANY(plan_ids) AND is_active = true
         ORDER BY random() LIMIT 1`,
        [matchedModel.provider, tenant.planId]
      )
      if (keyRow.rows.length === 0) {
        res.status(500).json({ error: 'No platform API key available' })
        return
      }

      const pk = keyRow.rows[0]
      apiKey = decryptApiKey(pk.api_key, config.masterEncryptionKey)
      endpoint = pk.endpoint
      resolvedModel = matchedModel.model
      keySource = 'platform'
      platformKeyId = pk.id
    } else {
      res.status(400).json({
        error: 'No LLM access configured',
        hint: 'Add a BYOK API key in tenant settings or upgrade to a paid plan',
      })
      return
    }

    // ── Proxy to LLM ──
    const llmBody: Record<string, unknown> = {
      model: resolvedModel,
      messages,
      stream: true,
    }
    if (tools) llmBody.tools = tools
    if (temperature !== undefined) llmBody.temperature = temperature
    if (max_tokens) llmBody.max_tokens = max_tokens

    const llmResponse = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(llmBody),
    })

    if (!llmResponse.ok) {
      const errText = await llmResponse.text()
      res.status(llmResponse.status).json({ error: `LLM error: ${errText}` })
      return
    }

    // ── SSE Stream Pipe ──
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const reader = llmResponse.body?.getReader()
    if (!reader) {
      res.status(500).json({ error: 'No response from LLM' })
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let totalPrompt = 0
    let totalCompletion = 0
    let totalTokens = 0

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          res.write(line + '\n')

          if (line.startsWith('data: ') && !line.includes('[DONE]')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.usage) {
                totalPrompt = data.usage.prompt_tokens || 0
                totalCompletion = data.usage.completion_tokens || 0
                totalTokens = data.usage.total_tokens || 0
              }
            } catch { /* skip parse errors */ }
          }
        }
      }

      if (buffer) {
        res.write(buffer + '\n')
      }
    } finally {
      reader.releaseLock()
    }

    try {
      await pool.query(
        `INSERT INTO usage_logs (tenant_id, key_source, platform_key_id, tenant_key_id, provider, model, tokens_prompt, tokens_completion, tokens_total, tool_calls, agent_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          tenant.id, keySource, platformKeyId, tenantKeyId,
          keySource === 'platform' ? 'openai' : 'unknown',
          resolvedModel,
          totalPrompt, totalCompletion, totalTokens,
          Array.isArray(tools) ? tools.length : 0,
          null,
        ]
      )
    } catch { /* usage logging is non-critical */ }

    if (keySource === 'platform' && totalTokens > 0) {
      updateQuota(tenant.id, totalTokens).catch(() => {})
    }

    res.end()
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal proxy error' })
    }
  }
})

export default router
