// AgentX Conversation Service — Entry Point

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { config } from './config'
import { getPool } from './lib/db'
import { MemoryEngine } from './services/memory-engine'
import { ContextEngine } from './services/context-engine'
import { AgentRunnerService } from './services/agent-runner'
import { TenantLLMResolver } from './services/tenant-llm-resolver'
import { createRunsRouter } from './routes/runs'
import { createTenantsRouter } from './routes/tenants'

const app = express()

// Security
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}))
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}))

// Body parsing
app.use(express.json({ limit: '1mb' }))

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'agentx-conversation', time: new Date().toISOString() })
})

// Initialize services
const db = getPool()
const memoryEngine = new MemoryEngine(db)
const contextEngine = new ContextEngine()
const llmResolver = new TenantLLMResolver(db)
const runner = new AgentRunnerService(memoryEngine, contextEngine, llmResolver)

// Routes
app.use('/runs', createRunsRouter(runner))
app.use('/tenants', createTenantsRouter(llmResolver))

// 404 handler
app.use((_req, res) => {
  if (!res.headersSent) {
    res.status(404).json({ error: 'Not found' })
  }
})

// Start
app.listen(config.port, () => {
  console.log(`[Conversation Service] Running on port ${config.port}`)
  console.log(`[Conversation Service] Environment: ${config.nodeEnv}`)
  console.log(`[Conversation Service] LLM mode: Hybrid (Tenant Key → AgentX Key)`)
})
