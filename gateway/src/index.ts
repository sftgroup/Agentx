// ---------------------------------------------------------------------------
// AgentX Gateway — Entry Point
// ---------------------------------------------------------------------------

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { ethers } from 'ethers'
import { config } from './config'
import { getPool } from './lib/db'
import { getChallenge, verifyChallenge, authMiddleware, getApiKey, apiKeyAuth } from './middleware/auth'
import { tenantRateLimiter } from './middleware/rate-limiter'
import { globalErrorHandler } from './middleware/error-handler'
import chatRouter from './routes/chat'
import tenantRouter from './routes/tenant'
// historyRouter deprecated — conversation management moved to conversation-service microservice
import mcpRouter from './routes/mcp'
import agentsRouter from './routes/agents'
import chainRouter from './routes/chain'
import a2aRouter from './routes/a2a'
import adminRouter from './routes/admin'
import agentRunsRouter from './routes/agent-runs'
import tracesRouter from './routes/traces'
import skillsRouter from './routes/skills'
import agentMcpRouter from './routes/agent-mcp'

const app = express()

// ── Security ──────────────────────────────────────────────────────────────

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}))
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}))

// ── Global rate limit ─────────────────────────────────────────────────────

app.use(rateLimit({
  windowMs: 60_000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
}))

// ── Body parsing ──────────────────────────────────────────────────────────

app.use(express.json({ limit: '1mb' }))

// Handle malformed JSON (return 400 instead of 500)
app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' })
  }
  next(err)
})

// ── Health check ──────────────────────────────────────────────────────────

app.get('/api/v1/health', async (_req, res) => {
  const services: Record<string, string | number | null> = {
    chain: 'disconnected',
    database: 'disconnected',
    lastSyncAt: null,
    syncedAgentCount: 0,
  }

  const [block, poolResult] = await Promise.allSettled([
    new ethers.JsonRpcProvider(config.rpcUrlOxaChain).getBlockNumber(),
    getPool().query('SELECT COUNT(*) AS total, MAX(synced_at) AS last_sync FROM agents'),
  ])

  if (block.status === 'fulfilled') services.chain = 'connected'
  if (poolResult.status === 'fulfilled') {
    services.database = 'connected'
    const row = poolResult.value.rows[0] ?? {}
    services.syncedAgentCount = Number(row.total ?? 0)
    services.lastSyncAt = (row.last_sync as Date | null)?.toISOString?.() ?? null
  }

  const degraded = services.chain === 'disconnected' || services.database === 'disconnected'
  res.status(degraded ? 503 : 200).json({ status: degraded ? 'degraded' : 'ok', services, time: new Date().toISOString() })
})

// ── MCP endpoint (public JSON-RPC 2.0) ────────────────────────────────────

app.use('/mcp/agent', agentMcpRouter)  // Agent-specific MCP (must be before /mcp)
app.use('/mcp', mcpRouter)

// ── Admin API (protected by admin key, not wallet auth) ──────────────────

app.use('/api/v1/admin', adminRouter)

// ── Auth routes (public) ──────────────────────────────────────────────────

app.get('/api/v1/auth/challenge', getChallenge)
app.post('/api/v1/auth/verify', verifyChallenge)

// ── Agents API (public, no auth needed) ────────────────────────────────────

app.use('/api/v1/agents', agentsRouter)

// ── Real-time Chain Data API (public, SDK-based live on-chain reads) ───────

app.use('/api/v1/chain', chainRouter)

// ── Skills Marketplace (mixed: GET public, POST/PUT/DELETE protected) ──────

app.use('/api/v1/skills', skillsRouter)

// ── A2A Task Results API (public, SDK daemon queries this) ────────────────

app.use('/api/v1/a2a', a2aRouter)

// Agent sync (public, for cron)
app.post('/api/v1/agents-sync', async (_req, res, next) => {
  try {
    const { syncAgents } = await import('./services/agent-indexer')
    const result = await syncAgents()
    res.json({ success: true, ...result })
  } catch (err: any) {
    next(err)
  }
})

// ── Protected routes (auth + rate-limit only on known paths) ─────────────

// Known protected API path prefixes (anything else under /api/v1 returns 404)
const PROTECTED_PREFIXES = ['/chat/completions', '/tenant/', '/agent/', '/traces/', '/auth/api-key']

app.use('/api/v1', (req, _res, next) => {
  if (PROTECTED_PREFIXES.some(p => req.path.startsWith(p))) {
    next()
  } else {
    // Path is not a known API route → 404, skip auth middleware
    _res.status(404).json({ error: 'Not found' })
  }
})

const api = express.Router()
api.use(apiKeyAuth)          // X-Api-Key alternative auth (passes through if no header)
api.use(authMiddleware)
api.use(tenantRateLimiter)

api.get('/auth/api-key', getApiKey)

api.use(chatRouter)
api.use('/tenant', tenantRouter)
// /chat/history deprecated — use conversation-service instead
api.use('/agent', agentRunsRouter)
api.use('/traces', tracesRouter)

app.use('/api/v1', api)

// ── 404 handler ───────────────────────────────────────────────────────────

app.use((_req, res) => {
  if (!res.headersSent) {
    res.status(404).json({ error: 'Not found' })
  }
})

// ── Error handler ─────────────────────────────────────────────────────────

app.use(globalErrorHandler)

// ── Start ─────────────────────────────────────────────────────────────────

app.listen(config.port, () => {
  console.log(`[AgentX Gateway] Running on port ${config.port}`)
  console.log(`[AgentX Gateway] Mode: ${config.nodeEnv}`)

  // Start A2A background worker for multi-agent task processing
  import('./services/a2a-worker').then(({ startA2AWorker }) => {
    startA2AWorker()
    console.log('[AgentX Gateway] A2A Worker started')
  }).catch(err => {
    console.error('[AgentX Gateway] Failed to start A2A Worker:', err.message)
  })

  // Start agent sync event watcher (incremental on-chain updates)
  import('./services/agent-indexer').then(({ startAgentSyncWatcher, startPlanSyncWatcher, syncPlanHistory, syncAgents }) => {
    startAgentSyncWatcher()
    startPlanSyncWatcher()

    // Backfill plans table from PlanCreated history (non-blocking)
    syncPlanHistory().catch(err =>
      console.error('[AgentX Gateway] Plan history sync failed:', err.message)
    )

    // Full-sync fallback timer (keeps agents table consistent if events are missed)
    if (config.agentsSyncIntervalSec > 0) {
      setInterval(() => {
        syncAgents().then(({ synced, total }) => {
          if (synced > 0) console.log(`[agent-indexer] Fallback full sync: ${synced}/${total}`)
        }).catch(err =>
          console.error('[agent-indexer] Fallback full sync failed:', err.message)
        )
      }, config.agentsSyncIntervalSec * 1000)
      console.log(`[AgentX Gateway] Agent full-sync fallback every ${config.agentsSyncIntervalSec}s`)
    }
  }).catch(err => {
    console.error('[AgentX Gateway] Failed to start agent sync watcher:', err.message)
  })
})
