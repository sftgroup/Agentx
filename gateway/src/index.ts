// ---------------------------------------------------------------------------
// AgentX Gateway — Entry Point
// ---------------------------------------------------------------------------

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { config } from './config'
import { getChallenge, verifyChallenge, authMiddleware } from './middleware/auth'
import { tenantRateLimiter } from './middleware/rate-limiter'
import chatRouter from './routes/chat'
import tenantRouter from './routes/tenant'
import historyRouter from './routes/history'
import mcpRouter from './routes/mcp'

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

// ── Health check ──────────────────────────────────────────────────────────

app.get('/api/v1/health', async (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

// ── MCP endpoint (public JSON-RPC 2.0) ────────────────────────────────────

app.use('/mcp', mcpRouter)

// ── Auth routes (public) ──────────────────────────────────────────────────

app.get('/api/v1/auth/challenge', getChallenge)
app.post('/api/v1/auth/verify', verifyChallenge)

// ── Agents API (public, no auth needed) ────────────────────────────────────

app.use('/api/v1/agents', agentsRouter)

// Agent sync (public, for cron)
app.post('/api/v1/agents-sync', async (_req, res) => {
  try {
    const { syncAgents } = await import('./services/agent-indexer')
    const result = await syncAgents()
    res.json({ success: true, ...result })
  } catch (err: any) {
    res.status(500).json({ error: 'Sync failed', detail: err.message })
  }
})

// ── Protected routes ──────────────────────────────────────────────────────

const api = express.Router()
api.use(authMiddleware)
api.use(tenantRateLimiter)

api.use(chatRouter)
api.use('/tenant', tenantRouter)
api.use('/chat', historyRouter)

app.use('/api/v1', api)

// ── Error handler ─────────────────────────────────────────────────────────

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Gateway Error]', err)
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Start ─────────────────────────────────────────────────────────────────

app.listen(config.port, () => {
  console.log(`[AgentX Gateway] Running on port ${config.port}`)
  console.log(`[AgentX Gateway] Mode: ${config.nodeEnv}`)
})
