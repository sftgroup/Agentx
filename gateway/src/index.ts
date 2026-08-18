// ---------------------------------------------------------------------------
// AgentX Gateway — Entry Point
// ---------------------------------------------------------------------------

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { ethers } from 'ethers'
import { config } from './config'
import { getPool, closePool } from './lib/db'
import { getChallenge, verifyChallenge, authMiddleware, getApiKey, apiKeyAuth } from './middleware/auth'
import { tenantRateLimiter } from './middleware/rate-limiter'
import { globalErrorHandler } from './middleware/error-handler'
import chatRouter from './routes/chat'
import tenantRouter from './routes/tenant'
// historyRouter deprecated — conversation management moved to conversation-service microservice
import mcpRouter from './routes/mcp'
import agentsRouter from './routes/agents'
import chainRouter from './routes/chain'
import channelRouter from './routes/channel'
import developerRouter from './routes/developer'
import fiatRouter from './routes/fiat'
import x402Router from './routes/x402'
import internalOrchestrateRouter from './routes/internal-orchestrate'
import internalTaskBillingRouter from './routes/internal-task-billing'
import paymentsRouter from './routes/payments'
import a2aRouter from './routes/a2a'
import adminRouter from './routes/admin'
import agentRunsRouter from './routes/agent-runs'
import chatTasksRouter from './routes/chat-tasks'
import tracesRouter from './routes/traces'
import skillsRouter from './routes/skills'
import agentMcpRouter from './routes/agent-mcp'
import schedulesRouter from './routes/schedules'
import billingRouter from './routes/billing'
import autoRenewRouter from './routes/auto-renew'

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

app.use(express.json({ limit: '1mb', verify: (req: any, _res, buf) => { req.rawBody = buf } }))

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

// ── Channel attribution & revenue share (public) ───────────────────────────

app.use('/api/v1/channel', channelRouter)
app.use('/api/v1/developer', developerRouter)

// ── Fiat subscriptions (A1; inert without Stripe keys) ─────────────────────

app.use('/api/v1/fiat', fiatRouter)

// ── x402 pay-per-request (A2; inert unless enabled) ────────────────────────

app.use('/api/v1/x402', x402Router)

// ── Unified payments endpoint (P5): one transport for every rail ───────────
// Auth is public by default (payment security rests on on-chain credentials).

app.use('/api/v1/payments', paymentsRouter)

// ── Internal orchestration (off-chain multi-agent delegation) ──────────────
// Protected by X-Orchestrate-Token — only the Conversation Service calls this.

app.use('/api/v1/internal/orchestrate', internalOrchestrateRouter)

// ── Internal task billing (Conversation Service reports completed tasks) ────
// Protected by X-Orchestrate-Token — same trust boundary as orchestration.

app.use('/api/v1/internal/task-billing', internalTaskBillingRouter)

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
const PROTECTED_PREFIXES = ['/chat/completions', '/tenant/', '/agent/', '/traces/', '/auth/api-key', '/sessions', '/tasks', '/schedules', '/billing/']

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
// Chat sessions + parallel tasks (proxied to conversation-service).
// Router declares full paths (/sessions..., /tasks...) so mount at root.
api.use('/', chatTasksRouter)
// User scheduled tasks (R10) — triggers chat tasks automatically.
api.use('/schedules', schedulesRouter)
// B-end billing (R19.7 companion): balance query for tenant / end-user wallets.
api.use('/billing', billingRouter)
// ERC-4337 auto-renew (t9): enable/confirm/disable/status for on-chain subscriptions.
api.use('/billing', autoRenewRouter)

app.use('/api/v1', api)

// ── 404 handler ───────────────────────────────────────────────────────────

app.use((_req, res) => {
  if (!res.headersSent) {
    res.status(404).json({ error: 'Not found' })
  }
})

// ── Error handler ─────────────────────────────────────────────────────────

app.use(globalErrorHandler)

// ── Graceful shutdown ──────────────────────────────────────────────────────
// pm2 sends SIGINT (stop/restart) and SIGTERM (kill). Stop the background
// workers and release the Postgres pool so restarts are clean.
function shutdown(signal: string): void {
  console.log(`[AgentX Gateway] ${signal} received — shutting down`)
  Promise.allSettled([
    import('./services/a2a-worker').then(({ stopA2AWorker }) => stopA2AWorker()),
    import('./services/schedule-daemon').then(({ stopScheduleDaemon }) => stopScheduleDaemon()),
    import('./services/reconcile-x402').then(({ stopX402Reconciler }) => stopX402Reconciler()),
    import('./services/aa-autorenew').then(({ stopAutoRenewDaemon }) => stopAutoRenewDaemon()),
    closePool(),
  ]).finally(() => process.exit(0))
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

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

  // Start schedule daemon (R10): poll due user schedules → create chat tasks
  import('./services/schedule-daemon').then(({ startScheduleDaemon }) => {
    startScheduleDaemon()
  }).catch(err => {
    console.error('[AgentX Gateway] Failed to start schedule daemon:', err.message)
  })

  // Start x402 ledger ↔ on-chain reconciliation job (t3)
  import('./services/reconcile-x402').then(({ startX402Reconciler }) => {
    startX402Reconciler()
  }).catch(err => {
    console.error('[AgentX Gateway] Failed to start x402 reconciler:', err.message)
  })

  // Start ERC-4337 auto-renew daemon (t9): due-subscription scan → session-key UserOps
  import('./services/aa-autorenew').then(({ startAutoRenewDaemon }) => {
    startAutoRenewDaemon()
  }).catch(err => {
    console.error('[AgentX Gateway] Failed to start auto-renew daemon:', err.message)
  })

  // Start agent sync event watcher (incremental on-chain updates)
  import('./services/agent-indexer').then(({ startAgentSyncWatcher, startPlanSyncWatcher, startSubscriptionSyncWatcher, syncPlanHistory, syncSubscriptionHistory, syncAgents }) => {
    startAgentSyncWatcher()
    startPlanSyncWatcher()
    startSubscriptionSyncWatcher()

    // Backfill plans table from PlanCreated history (non-blocking)
    syncPlanHistory().catch(err =>
      console.error('[AgentX Gateway] Plan history sync failed:', err.message)
    )

    // Backfill chain_subscriptions from Subscribed history (non-blocking)
    syncSubscriptionHistory().catch(err =>
      console.error('[AgentX Gateway] Subscription history sync failed:', err.message)
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
