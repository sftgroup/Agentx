// ---------------------------------------------------------------------------
// AgentX Gateway — A2A Task Worker
// ---------------------------------------------------------------------------
// Background service that:
//   1. Polls OxaChain A2A contract for pending tasks (status=Created/Accepted)
//   2. Calls LLM to process each task (using agent context from DB)
//   3. Stores results in a2a_task_results table
//
// This enables true multi-agent interop:
//   Agent A creates task for Agent B → Worker detects → LLM processes → 
//   Agent B's SDK daemon picks up result → calls completeTask() on-chain
// ---------------------------------------------------------------------------

import { ethers } from 'ethers'
import { getPool } from '../lib/db'
import { config } from '../config'
import { decryptApiKey } from '../lib/crypto'

// ── A2A Contract ABI ──────────────────────────────────────────────────────

const A2A_ABI = [
  'function getAgentTasks(uint256 agentId) view returns (tuple(uint256,uint256,string,string,string,uint256,address,uint256,uint256,bytes32)[])',
  'function getTask(uint256 taskId) view returns (uint256,uint256,string,string,string,uint256,address,uint256,uint256)',
  'event TaskCreated(uint256 indexed taskId, uint256 indexed agentId, address indexed client, string taskType, uint256 status)',
]

// ── Types ──────────────────────────────────────────────────────────────────

interface A2ATaskOnChain {
  taskId: number
  agentId: number
  taskType: string
  inputData: string
  outputData: string
  status: number
  clientAddress: string
  createdAt: number
}

// ── Worker State ───────────────────────────────────────────────────────────

let pollingTimer: ReturnType<typeof setInterval> | null = null
let isRunning = false
const POLL_INTERVAL_MS = 30_000  // Poll every 30 seconds
const MAX_BATCH_SIZE = 5         // Max tasks to process per poll

// Track which task IDs have been processed to avoid duplicates
const processingSet = new Set<number>()

// ── Public API ─────────────────────────────────────────────────────────────

export function startA2AWorker(): void {
  if (pollingTimer) return
  console.log('[A2A Worker] Starting, poll interval:', POLL_INTERVAL_MS / 1000, 's')
  pollingTimer = setInterval(pollAndProcess, POLL_INTERVAL_MS)
  // Run first poll after 5 seconds (give server time to start)
  setTimeout(pollAndProcess, 5_000)
}

export function stopA2AWorker(): void {
  if (pollingTimer) {
    clearInterval(pollingTimer)
    pollingTimer = null
    console.log('[A2A Worker] Stopped')
  }
}

export function getWorkerStatus(): { running: boolean; processingSetSize: number } {
  return { running: pollingTimer !== null, processingSetSize: processingSet.size }
}

// ── Core Logic ─────────────────────────────────────────────────────────────

async function pollAndProcess(): Promise<void> {
  if (isRunning) {
    console.log('[A2A Worker] Previous poll still running, skipping')
    return
  }
  isRunning = true

  try {
    const provider = new ethers.JsonRpcProvider(config.rpcUrlOxaChain)
    const a2aContract = new ethers.Contract(config.a2aProtocolOxaChain, A2A_ABI, provider)
    const pool = getPool()

    // 1. Get all known agents from DB
    const { rows: agents } = await pool.query(`SELECT id, name, owner FROM agents ORDER BY id`)
    if (agents.length === 0) {
      isRunning = false
      return
    }

    let processedCount = 0

    // 2. For each agent, check for pending tasks
    for (const agent of agents) {
      if (processedCount >= MAX_BATCH_SIZE) break

      const agentId = agent.id as number
      const agentName = agent.name as string
      const agentOwner = (agent.owner as string || '').toLowerCase()

      // Resolve agent owner's tenant ID for cost tracking
      let tenantId: string | null = null
      if (agentOwner) {
        const { rows: tenants } = await pool.query(
          `SELECT id FROM tenants WHERE LOWER(wallet_address) = $1`,
          [agentOwner]
        )
        tenantId = tenants[0]?.id || null
      }

      // Check if we already have results for this task (already processed)
      const { rows: existingResults } = await pool.query(
        `SELECT task_id FROM a2a_task_results WHERE agent_id = $1 AND status = 2`,
        [agentId]
      )
      const completedTaskIds = new Set(existingResults.map((r: any) => r.task_id))

      try {
        // Get all tasks for this agent from the contract
        const tasks: any[] = await a2aContract.getAgentTasks(agentId)

        for (const task of tasks) {
          if (processedCount >= MAX_BATCH_SIZE) break

          const taskId = Number(task[0])
          const status = Number(task[5])

          // Skip non-pending tasks (0=Created, 1=Accepted)
          if (status > 1) continue
          // Skip already completed
          if (completedTaskIds.has(taskId)) continue
          // Skip currently being processed
          if (processingSet.has(taskId)) continue

          const onChainTask: A2ATaskOnChain = {
            taskId,
            agentId: Number(task[1]),
            taskType: String(task[2] || ''),
            inputData: String(task[3] || ''),
            outputData: String(task[4] || ''),
            status,
            clientAddress: String(task[6] || ''),
            createdAt: Number(task[7] || 0),
          }

          // Process this task
          processingSet.add(taskId)
          processedCount++
          console.log(`[A2A Worker] Processing task #${taskId} for agent #${agentId} (${agentName}), tenant: ${tenantId || 'none'}`)

          // Process asynchronously (don't block the loop)
          processTask(pool, onChainTask, agentName, tenantId).catch(err => {
            console.error(`[A2A Worker] Failed to process task #${taskId}:`, err.message)
          }).finally(() => {
            processingSet.delete(taskId)
          })
        }
      } catch (err: any) {
        // Agent might not have any tasks or contract call failed
        if (!err.message?.includes('TaskNotFound') && !err.message?.includes('revert')) {
          console.warn(`[A2A Worker] Error fetching tasks for agent #${agentId}:`, err.message?.slice(0, 100))
        }
      }
    }

    if (processedCount > 0) {
      console.log(`[A2A Worker] Queued ${processedCount} tasks for processing`)
    }
  } catch (err: any) {
    console.error('[A2A Worker] Poll error:', err.message)
  } finally {
    isRunning = false
  }
}

async function processTask(
  pool: ReturnType<typeof getPool>,
  task: A2ATaskOnChain,
  agentName: string,
  tenantId: string | null
): Promise<void> {
  const taskId = task.taskId

  // 1. Mark as processing in DB
  await pool.query(
    `INSERT INTO a2a_task_results (task_id, agent_id, task_type, input_data, tenant_id, status, created_at)
     VALUES ($1, $2, $3, $4, $5, 1, NOW())
     ON CONFLICT (task_id) DO UPDATE SET status = 1`,
    [taskId, task.agentId, task.taskType, task.inputData, tenantId]
  )

  try {
    // 2. Resolve LLM API key (prefer agent owner's tenant key, fallback to platform)
    const llmConfig = await resolveLLMConfig(pool, tenantId)
    if (!llmConfig) {
      throw new Error('No LLM API key available')
    }

    // 3. Build prompt for the LLM
    const systemPrompt = buildA2ASystemPrompt(agentName, task)
    const userPrompt = buildA2AUserPrompt(task)

    // 4. Call LLM
    console.log(`[A2A Worker] Calling LLM for task #${taskId} (${task.taskType})`)
    const llmResponse = await callLLM(llmConfig, systemPrompt, userPrompt)

    // 5. Store successful result
    await pool.query(
      `UPDATE a2a_task_results 
       SET status = 2, output_data = $2, llm_model = $3, tokens_used = $4, processed_at = NOW()
       WHERE task_id = $1`,
      [taskId, llmResponse.content, llmConfig.model, llmResponse.tokens]
    )

    console.log(`[A2A Worker] Task #${taskId} completed, tokens: ${llmResponse.tokens}`)
  } catch (err: any) {
    // Store failure
    await pool.query(
      `UPDATE a2a_task_results 
       SET status = 3, error_message = $2, processed_at = NOW()
       WHERE task_id = $1`,
      [taskId, err.message.slice(0, 500)]
    )
    console.error(`[A2A Worker] Task #${taskId} failed:`, err.message.slice(0, 100))
  }
}

// ── LLM Helpers ────────────────────────────────────────────────────────────

interface LLMConfig {
  endpoint: string
  apiKey: string
  model: string
}

async function resolveLLMConfig(pool: ReturnType<typeof getPool>, tenantId: string | null): Promise<LLMConfig | null> {
  // 1. Prefer agent owner's tenant BYOK key (tenant isolation)
  if (tenantId) {
    const { rows: tenantKeys } = await pool.query(
      `SELECT * FROM tenant_api_keys WHERE tenant_id = $1 AND is_active = true ORDER BY random() LIMIT 1`,
      [tenantId]
    )
    if (tenantKeys.length > 0) {
      const tk = tenantKeys[0]
      return {
        endpoint: tk.endpoint,
        apiKey: decryptApiKey(tk.api_key, config.masterEncryptionKey),
        model: tk.model || 'deepseek-chat',
      }
    }
  }

  // 2. Fallback to platform keys (shared pool)
  const { rows: platformKeys } = await pool.query(
    `SELECT * FROM platform_api_keys WHERE is_active = true ORDER BY random() LIMIT 1`
  )
  if (platformKeys.length > 0) {
    const pk = platformKeys[0]
    return {
      endpoint: pk.endpoint,
      apiKey: decryptApiKey(pk.api_key, config.masterEncryptionKey),
      model: pk.models?.[0] || 'deepseek-chat',
    }
  }

  return null
}

function buildA2ASystemPrompt(agentName: string, task: A2ATaskOnChain): string {
  return `You are "${agentName}", an AI agent on the AgentX platform.

A user has delegated a task to you. Process it professionally and return only the result.

Task Type: ${task.taskType}
Client: ${task.clientAddress}

Respond with the completed task output only. Do not include explanations, prefixes, or meta-commentary.`
}

function buildA2AUserPrompt(task: A2ATaskOnChain): string {
  return task.inputData || 'Please process this task.'
}

interface LLMResponse {
  content: string
  tokens: number
}

async function callLLM(cfg: LLMConfig, systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
  const body = {
    model: cfg.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 2048,
    temperature: 0.3,
  }

  const res = await fetch(`${cfg.endpoint}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown error')
    throw new Error(`LLM call failed (HTTP ${res.status}): ${errText.slice(0, 200)}`)
  }

  const data = await res.json() as any
  const content = data.choices?.[0]?.message?.content || ''
  const tokens = data.usage?.total_tokens || 0

  return { content, tokens }
}
