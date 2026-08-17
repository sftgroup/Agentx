// ---------------------------------------------------------------------------
// AgentX Gateway — A2A Task Worker (v2 — ReAct AgentLoop + Multi-Agent Orchestration)
// ---------------------------------------------------------------------------
// Background service that:
//   1. Polls OxaChain A2A contract for pending tasks (status=Created/Accepted)
//   2. Runs ReAct-style AgentLoop with A2A tools for each task
//   3. LLM can autonomously delegate sub-tasks to other agents
//   4. Sub-tasks are processed inline and results fed back to the parent LLM
//
// Layering (2026-08-08): the worker NEVER writes to the chain. Top-level
// on-chain tasks are created by the USER's own wallet (they pay the gas and
// become the on-chain client). Sub-delegations inside the ReAct loop follow
// the layering default — off-chain, processed inline with a local pseudo
// taskId — so the platform pays no gas and the user is not asked to sign
// autonomously-decided sub-tasks.
//
// Multi-Agent Orchestration Flow:
//   Agent A's task → LLM(Agent A) analyzes
//     → LLM decides: "I need Agent B for auditing"
//     → calls agentx_a2a_create_task(Agent B, "audit", ...)
//     → Worker processes Agent B's task inline (off-chain)
//     → Agent B's result fed back to Agent A's LLM
//     → LLM(Agent A) continues: "Now I need Agent C to summarize"
//     → calls agentx_a2a_create_task(Agent C, "summarize", ...)
//     → Worker processes Agent C's task inline (off-chain)
//     → Agent A's LLM aggregates all results → final output
// ---------------------------------------------------------------------------

import { createPublicClient, createWalletClient, http } from 'viem'
import type { Address } from 'viem'
import { A2AProtocol } from '@agentxv2/sdk'
import type { A2ATaskStatus } from '@agentxv2/sdk'
import { getPool } from '../lib/db'
import { config } from '../config'
import { decryptApiKey } from '../lib/crypto'
import { canAccessAgent, filterAccessibleAgents } from './agent-access'
import { canAccessAgentOrPay } from './agent-access-pay'
import { tryAutoPayForDelegation } from './agent-payer'
import { emitA2ATaskEvent } from './a2a-events'

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

interface AgentInfo {
  id: number
  name: string
  owner: string
  description: string
}

/** 委派需要付款且余额不足：任务挂起为 awaiting_payment，等待充值后 resume。 */
export class AwaitingPaymentError extends Error {
  rootTaskId: number
  payer: string
  targetAgentId: number
  payTo: string
  priceWei: string
  refId: string

  constructor(opts: { rootTaskId: number; payer: string; targetAgentId: number; payTo: string; priceWei: string; refId: string }) {
    super(`A2A delegation to Agent #${opts.targetAgentId} requires payment (${opts.priceWei} wei to ${opts.payTo})`)
    this.name = 'AwaitingPaymentError'
    this.rootTaskId = opts.rootTaskId
    this.payer = opts.payer
    this.targetAgentId = opts.targetAgentId
    this.payTo = opts.payTo
    this.priceWei = opts.priceWei
    this.refId = opts.refId
  }
}

// ── Worker State ───────────────────────────────────────────────────────────

let pollingTimer: ReturnType<typeof setInterval> | null = null
let isRunning = false
const POLL_INTERVAL_MS = 30_000
const MAX_BATCH_SIZE = 3            // Reduced since each task may spawn sub-tasks
const MAX_DEPTH = 3                 // Max delegation depth
const MAX_REACT_ITERATIONS = 5      // Max LLM tool-call rounds per task
const processingSet = new Set<number>()
let totalOrchestrated = 0           // Counter for multi-agent orchestrations
let localTaskCounter = 0            // Negative pseudo ids for off-chain sub-tasks

// ── Public API ─────────────────────────────────────────────────────────────

export function startA2AWorker(): void {
  if (pollingTimer) return
  console.log('[A2A Worker v2] Starting ReAct AgentLoop mode, poll:', POLL_INTERVAL_MS / 1000, 's')
  pollingTimer = setInterval(pollAndProcess, POLL_INTERVAL_MS)
  setTimeout(pollAndProcess, 5_000)
}

export function stopA2AWorker(): void {
  if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null; console.log('[A2A Worker] Stopped') }
}

export function getWorkerStatus(): { running: boolean; processingSetSize: number; totalOrchestrated: number } {
  return { running: pollingTimer !== null, processingSetSize: processingSet.size, totalOrchestrated }
}

// ── Core Logic ─────────────────────────────────────────────────────────────

async function pollAndProcess(): Promise<void> {
  if (isRunning) { console.log('[A2A Worker] Previous poll still running, skipping'); return }
  isRunning = true
  try {
    const a2a = getA2AReadonly()
    const pool = getPool()
    const { rows: agents } = await pool.query(`SELECT id, name, owner, description FROM agents ORDER BY id`)
    if (agents.length === 0) { isRunning = false; return }

    let processedCount = 0
    for (const agent of agents) {
      if (processedCount >= MAX_BATCH_SIZE) break
      const agentId = agent.id as number
      const agentName = agent.name as string
      const agentOwner = (agent.owner as string || '').toLowerCase()
      let tenantId: string | null = null
      if (agentOwner) {
        const { rows: tenants } = await pool.query(`SELECT id FROM tenants WHERE LOWER(wallet_address) = $1`, [agentOwner])
        tenantId = tenants[0]?.id || null
      }

      const { rows: existingResults } = await pool.query(
        `SELECT task_id FROM a2a_task_results WHERE agent_id = $1 AND status IN (2, 4)`, [agentId]
      )
      const completedOrAwaitingIds = new Set(existingResults.map((r: any) => r.task_id))

      try {
        const tasks = await a2a.getAgentTasks(agentId)
        for (const task of tasks) {
          if (processedCount >= MAX_BATCH_SIZE) break
          const taskId = task.taskId
          if (task.status === 'in_progress' || task.status === 'completed' || task.status === 'failed'
            || completedOrAwaitingIds.has(taskId) || processingSet.has(taskId)) continue

          const onChainTask: A2ATaskOnChain = {
            taskId,
            agentId: task.targetAgentId,
            taskType: task.taskType,
            inputData: task.input,
            outputData: task.result ?? '',
            status: A2A_STATUS_INDEX[task.status] ?? 0,
            clientAddress: task.creator,
            createdAt: task.createdAt,
          }

          processingSet.add(taskId); processedCount++
          console.log(`[A2A Worker] Task #${taskId} → Agent #${agentId} (${agentName})`)

          processTask(pool, onChainTask, { id: agentId, name: agentName, owner: agentOwner, description: agent.description as string }, tenantId, agents as AgentInfo[], 0)
            .catch(err => console.error(`[A2A Worker] Task #${taskId} failed:`, err.message))
            .finally(() => processingSet.delete(taskId))
        }
      } catch (err: any) {
        if (!err.message?.includes('TaskNotFound') && !err.message?.includes('revert')) {
          console.warn(`[A2A Worker] Error for agent #${agentId}:`, err.message?.slice(0, 100))
        }
      }
    }
    if (processedCount > 0) console.log(`[A2A Worker] Queued ${processedCount} task(s)`)

    await expireAwaitingPaymentTasks(pool)
  } catch (err: any) { console.error('[A2A Worker] Poll error:', err.message) }
  finally { isRunning = false }
}

// ── Expire awaiting_payment tasks after 24h ────────────────────────────────
// 用户 24 小时内未充值 resume，任务过期失败（status=3）。resume 时 payment_pending_since
// 会被清空，因此仅挂起超时的任务会被命中，不会误伤已恢复的任务。
const PAYMENT_EXPIRY_HOURS = 24

async function expireAwaitingPaymentTasks(pool: ReturnType<typeof getPool>): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT task_id FROM a2a_task_results
       WHERE status = 4 AND payment_pending_since < NOW() - ($1 || ' hours')::interval`,
      [String(PAYMENT_EXPIRY_HOURS)]
    )
    if (rows.length === 0) return
    for (const row of rows) {
      await pool.query(
        `UPDATE a2a_task_results SET status = 3,
           error_message = 'expired: awaiting payment for more than ' || $2 || 'h'
         WHERE task_id = $1`,
        [row.task_id, String(PAYMENT_EXPIRY_HOURS)]
      )
    }
    console.log(`[A2A Worker] Expired ${rows.length} awaiting_payment task(s) (${PAYMENT_EXPIRY_HOURS}h timeout)`)
  } catch (err: any) {
    console.error('[A2A Worker] Expire scan error:', err.message)
  }
}

// ── ReAct AgentLoop Task Processing ────────────────────────────────────────

const A2A_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'agentx_a2a_create_task',
      description: 'DELEGATE work to another AgentX agent. Sub-tasks are processed off-chain inline (the user pays gas only for the top-level on-chain task). Use this when you need another agent\'s expertise. The sub-task result is returned to you once processed.',
      parameters: {
        type: 'object',
        properties: {
          targetAgentId: { type: 'integer', description: 'The agent ID to delegate to' },
          taskType: { type: 'string', description: 'Type of task (e.g., "audit", "analyze", "summarize", "translate")' },
          inputData: { type: 'string', description: 'Full task description. Include ALL context the sub-agent needs.' },
        },
        required: ['targetAgentId', 'taskType', 'inputData'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'agentx_a2a_get_task',
      description: 'Check the status and result of an A2A task by ID. Use to check if a delegated sub-task has completed.',
      parameters: {
        type: 'object',
        properties: { taskId: { type: 'integer', description: 'The task ID to query' } },
        required: ['taskId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'agentx_list_agents',
      description: 'List agents the task client can delegate to (agents they own or have an active subscription to), with their IDs, names, and descriptions. Use this to discover which agents can help with sub-tasks.',
      parameters: { type: 'object', properties: {} },
    },
  },
]

async function processTask(
  pool: ReturnType<typeof getPool>,
  task: A2ATaskOnChain,
  agent: AgentInfo,
  tenantId: string | null,
  allAgents: AgentInfo[],
  depth: number,
  rootTaskId?: number,
): Promise<string> {
  const indent = '  '.repeat(depth)
  const taskId = task.taskId

  if (depth >= MAX_DEPTH) {
    console.log(`${indent}[A2A] Max depth reached for task #${taskId}, processing directly`)
  }

  await pool.query(
    `INSERT INTO a2a_task_results (task_id, agent_id, task_type, input_data, tenant_id, status, created_at)
     VALUES ($1, $2, $3, $4, $5, 1, NOW())
     ON CONFLICT (task_id) DO UPDATE SET status = 1`,
    [taskId, task.agentId, task.taskType, task.inputData, tenantId]
  )

  try {
    const llmConfig = await resolveLLMConfig(pool, tenantId)
    if (!llmConfig) throw new Error('No LLM API key available')

    console.log(`${indent}[A2A] ReAct loop for task #${taskId} (Agent: ${agent.name}, depth: ${depth})`)

    // ── ReAct AgentLoop ─────────────────────────────────────────────────
    const messages: { role: string; content: string | null; tool_calls?: any[]; tool_call_id?: string }[] = [
      {
        role: 'system',
        content: buildOrchestrationSystemPrompt(agent, allAgents),
      },
      {
        role: 'user',
        content: buildOrchestrationUserPrompt(task),
      },
    ]

    let finalContent = ''
    let totalTokens = 0
    let subTaskResults: { taskId: number; agentName: string; output: string }[] = []

    for (let iter = 0; iter < MAX_REACT_ITERATIONS; iter++) {
      const response = await callLLMWithTools(llmConfig, messages, A2A_TOOLS)
      totalTokens += response.tokens
      const choice = response.choices[0]
      const msg = choice.message

      // If no tool calls, we have the final answer
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        finalContent = msg.content || ''
        messages.push({ role: 'assistant', content: finalContent })
        break
      }

      // Process tool calls
      messages.push({ role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls })

      for (const tc of msg.tool_calls) {
        const toolName = tc.function.name
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(tc.function.arguments) } catch { /* raw string */ }

        console.log(`${indent}[A2A] LLM calls ${toolName}(${JSON.stringify(args).slice(0, 80)})`)

        let toolResult: string

        switch (toolName) {
          case 'agentx_list_agents': {
            // Orchestration boundary: only agents the task client owns or is
            // subscribed to are listed (fiat/x402 subscriptions included).
            const accessible = await filterAccessibleAgents(task.clientAddress, allAgents)
            if (accessible.length === 0) {
              toolResult = 'No accessible agents. Agents you own or have an active subscription to will appear here.'
              break
            }
            const list = accessible.map(a => `#${a.id} "${a.name}" — ${a.description || '(no description)'}`).join('\n')
            toolResult = `Accessible agents (yours or subscribed):\n${list}`
            break
          }

          case 'agentx_a2a_create_task': {
            const targetId = Number(args.targetAgentId)
            const subTaskType = String(args.taskType || 'analyze')
            const subInput = String(args.inputData || '')

            if (!targetId || isNaN(targetId)) {
              toolResult = 'Error: targetAgentId is required'
              break
            }

            const targetAgent = allAgents.find(a => a.id === targetId)
            const targetName = targetAgent?.name || `Agent #${targetId}`
            const refId = `task:${rootTaskId ?? task.taskId}`

            // Access boundary (R19.7): the task client may delegate to agents
            // they own or have an active subscription to; otherwise a
            // pay-per-call via the x402 ledger balance (service-side deduct)
            // grants access for this single delegation. No subscription AND no
            // balance → agent self-pay (t8, MPC wallet) is attempted first, then
            // the delegation is suspended as awaiting_payment for manual top-up.
            let payer = task.clientAddress
            let access = await canAccessAgentOrPay(payer, targetId, { refId })
            if (!access.allowed) {
              // 余额不足 → 若当前处理任务的 agent 配置了自主钱包（MPC），
              // 自动代付入账其钱包 ledger 后，用钱包地址重试扣费放行。
              if (access.insufficient && access.payment) {
                const agentWallet = await tryAutoPayForDelegation({
                  agentId: agent.id,
                  payTo: access.payment.payTo,
                  priceWei: access.payment.priceWei,
                })
                if (agentWallet) {
                  payer = agentWallet
                  console.log(`${indent}[A2A] Agent #${agent.id} wallet auto-paid ${access.payment.priceWei} wei → retry access (${refId})`)
                  access = await canAccessAgentOrPay(payer, targetId, { refId })
                }
              }
            }
            if (!access.allowed) {
              // 自动代付未生效/不足 → 任务挂起为 awaiting_payment（不失败），等待充值后 resume。
              if (access.insufficient && access.payment) {
                throw new AwaitingPaymentError({
                  rootTaskId: rootTaskId ?? task.taskId,
                  payer: task.clientAddress,
                  targetAgentId: targetId,
                  payTo: access.payment.payTo,
                  priceWei: access.payment.priceWei,
                  refId,
                })
              }
              toolResult = `Error: no access to Agent #${targetId} "${targetName}". ${access.reason ?? 'Only agents you own or have an active subscription to can be delegated to.'}`
              break
            }

            // Sub-tasks follow the layering default (off-chain): the user only
            // signed the top-level on-chain task, so sub-delegations run inline
            // through the conversation channel — no on-chain write, no platform
            // gas. A local negative pseudo taskId keeps the DB result record
            // stable without colliding with real on-chain task ids.
            localTaskCounter -= 1
            const subTaskId = localTaskCounter

            console.log(`${indent}[A2A] → Delegated to ${targetName} (#${targetId}), sub-task: #${subTaskId}`)
            totalOrchestrated++

            // Process sub-task recursively inline
            const subOutput = await processTask(
              pool,
              {
                taskId: subTaskId, agentId: targetId, taskType: subTaskType,
                inputData: subInput, outputData: '', status: 0,
                clientAddress: task.clientAddress, createdAt: Math.floor(Date.now() / 1000),
              },
              targetAgent || { id: targetId, name: targetName, owner: '', description: '' },
              tenantId,
              allAgents,
              depth + 1,
              rootTaskId ?? task.taskId,
            )

            subTaskResults.push({ taskId: subTaskId, agentName: targetName, output: subOutput })
            toolResult = `Sub-task #${subTaskId} completed by ${targetName}.\nResult: ${subOutput.slice(0, 2000)}`
            break
          }

          case 'agentx_a2a_get_task': {
            const queryId = Number(args.taskId)
            if (!queryId || isNaN(queryId)) { toolResult = 'Error: taskId required'; break }
            try {
              const { rows } = await pool.query(
                `SELECT task_id, agent_id, task_type, input_data, output_data, status, error_message
                 FROM a2a_task_results WHERE task_id = $1`, [queryId]
              )
              if (rows.length === 0) { toolResult = `Task #${queryId} not found`; break }
              const r = rows[0]
              toolResult = JSON.stringify({
                taskId: r.task_id, agentId: r.agent_id, taskType: r.task_type,
                status: r.status === 2 ? 'completed' : r.status === 3 ? 'failed' : r.status === 1 ? 'processing' : 'pending',
                outputData: r.output_data ?? '', errorMessage: r.error_message ?? '',
              })
            } catch { toolResult = `Task #${queryId} not found` }
            break
          }

          default:
            toolResult = `Unknown tool: ${toolName}`
        }

        messages.push({ role: 'tool', content: toolResult, tool_call_id: tc.id })
      }
    }

    if (!finalContent && messages.length > 2) {
      // LLM used tools but didn't produce final text — get a summary
      messages.push({ role: 'user', content: 'Based on all the sub-task results above, provide your final combined output. Return ONLY the final result.' })
      const finalResp = await callLLMWithTools(llmConfig, messages, [])
      finalContent = finalResp.choices[0]?.message?.content || 'Task processed via multi-agent orchestration.'
      totalTokens += finalResp.tokens
    }

    if (!finalContent) finalContent = 'Task processed.'

    // Store result
    await pool.query(
      `UPDATE a2a_task_results SET status = 2, output_data = $2, llm_model = $3, tokens_used = $4, processed_at = NOW()
       WHERE task_id = $1`,
      [taskId, finalContent, llmConfig.model, totalTokens]
    )

    emitA2ATaskEvent({ type: 'status', taskId, status: 2, outputData: finalContent, ts: Date.now() })

    const orchestrationNote = subTaskResults.length > 0
      ? ` (orchestrated ${subTaskResults.length} sub-task(s): ${subTaskResults.map(s => `#${s.taskId}→${s.agentName}`).join(', ')})`
      : ''
    console.log(`${indent}[A2A] Task #${taskId} done, tokens: ${totalTokens}${orchestrationNote}`)

    return finalContent
  } catch (err: any) {
    // 委派需付款且余额不足 → 顶层任务挂起 awaiting_payment（不失败）。
    // 每层递归都会命中（幂等 UPDATE 顶层记录），子任务负记录标记失败清理。
    if (err instanceof AwaitingPaymentError) {
      await pool.query(
        `UPDATE a2a_task_results SET status = 4, error_message = $2,
           payment_payer = $3, payment_amount_wei = $4, payment_pay_to = $5,
           payment_target_agent_id = $6, payment_ref = $7, payment_pending_since = NOW(),
           processed_at = NULL
         WHERE task_id = $1`,
        [err.rootTaskId, `Awaiting payment: ${err.priceWei} wei to ${err.payTo} for Agent #${err.targetAgentId}`, err.payer, err.priceWei, err.payTo, err.targetAgentId, err.refId]
      )
      if (taskId < 0) {
        await pool.query(
          `UPDATE a2a_task_results SET status = 3, error_message = $2 WHERE task_id = $1`,
          [taskId, 'Interrupted: awaiting payment on root task']
        )
      }
      emitA2ATaskEvent({
        type: 'status', taskId: err.rootTaskId, status: 4,
        errorMessage: `Awaiting payment: ${err.priceWei} wei to ${err.payTo} for Agent #${err.targetAgentId}`,
        payment: { payer: err.payer, payTo: err.payTo, priceWei: err.priceWei, targetAgentId: err.targetAgentId, ref: err.refId },
        ts: Date.now(),
      })
      console.log(`${'  '.repeat(depth)}[A2A] Task #${err.rootTaskId} awaiting payment (${err.priceWei} wei to ${err.payTo})`)
      throw err
    }
    await pool.query(
      `UPDATE a2a_task_results SET status = 3, error_message = $2, processed_at = NOW() WHERE task_id = $1`,
      [taskId, err.message.slice(0, 500)]
    )
    emitA2ATaskEvent({ type: 'status', taskId, status: 3, errorMessage: err.message.slice(0, 500), ts: Date.now() })
    console.error(`${'  '.repeat(depth)}[A2A] Task #${taskId} failed:`, err.message.slice(0, 100))
    throw err
  }
}

// ── On-Chain A2A Client (SDK) ─────────────────────────────────────────────
// Single source of truth for the A2A protocol ABI: the @agentxv2/sdk
// `A2AProtocol` wrapper. The worker only needs the read-only paths
// (`getAgentTasks`) — it never signs: top-level on-chain tasks are created by
// the user's own wallet, and sub-tasks run off-chain inline. Client cached
// per process.

const A2A_STATUS_INDEX: Record<A2ATaskStatus, number> = {
  created: 0, accepted: 1, in_progress: 2, completed: 3, failed: 4,
}

let a2aReadonly: A2AProtocol | null = null

function getA2AReadonly(): A2AProtocol {
  if (!a2aReadonly) {
    const publicClient = createPublicClient({ transport: http(config.rpcUrlOxaChain) })
    // No account — never signs; only readContract paths are exercised.
    const walletClient = createWalletClient({ transport: http(config.rpcUrlOxaChain) })
    a2aReadonly = new A2AProtocol({
      contractAddress: config.a2aProtocolOxaChain as Address,
      publicClient,
      walletClient,
    })
  }
  return a2aReadonly
}

// ── LLM Helpers ────────────────────────────────────────────────────────────

interface LLMConfig {
  endpoint: string
  apiKey: string
  model: string
}

async function resolveLLMConfig(pool: ReturnType<typeof getPool>, tenantId: string | null): Promise<LLMConfig | null> {
  if (tenantId) {
    const { rows } = await pool.query(
      `SELECT * FROM tenant_api_keys WHERE tenant_id = $1 AND is_active = true ORDER BY random() LIMIT 1`, [tenantId]
    )
    if (rows.length > 0) return { endpoint: rows[0].endpoint, apiKey: decryptApiKey(rows[0].api_key, config.masterEncryptionKey), model: rows[0].model || 'deepseek-chat' }
  }
  const { rows: pks } = await pool.query(`SELECT * FROM platform_api_keys WHERE is_active = true ORDER BY random() LIMIT 1`)
  if (pks.length > 0) return { endpoint: pks[0].endpoint, apiKey: decryptApiKey(pks[0].api_key, config.masterEncryptionKey), model: pks[0].models?.[0] || 'deepseek-chat' }
  return null
}

function buildOrchestrationSystemPrompt(agent: AgentInfo, _allAgents: AgentInfo[]): string {
  return `You are "${agent.name}", an AI agent on the AgentX decentralized platform.

## Your Role
${agent.description || 'Process delegated tasks professionally and return results.'}

## Multi-Agent Orchestration
You have access to A2A (Agent-to-Agent) tools that let you DELEGATE work to other agents.
When a task is complex or requires specialized skills, break it down and delegate sub-tasks.

### Access Boundary
You can only delegate to agents the task client owns or has an active subscription to.
Call agentx_list_agents to see the currently accessible agents — do NOT invent agent IDs.

### How to Orchestrate
1. Analyze the task — what parts need specialized agents?
2. Call agentx_list_agents to see which agents are accessible (yours or subscribed)
3. Call agentx_a2a_create_task to delegate sub-tasks (each runs autonomously)
4. Call agentx_a2a_get_task to check sub-task results
5. Aggregate ALL sub-task results into your final output

### Rules
- Delegate only to agents returned by agentx_list_agents (the client's own or subscribed agents)
- Include ALL context in inputData so the sub-agent can work independently
- After getting sub-task results, synthesize them into a coherent final answer
- If the task is simple and you can handle it alone, just answer directly
- Always provide a final answer (don't leave the user hanging)`
}

function buildOrchestrationUserPrompt(task: A2ATaskOnChain): string {
  return `Task Type: ${task.taskType}
Client: ${task.clientAddress}

Task Input:
${task.inputData || 'Please process this task.'}

Process this task. If it requires multiple specialized skills, use the available A2A tools to delegate sub-tasks to appropriate agents. Return your final combined output.`
}

// ── LLM Call with Tools (ReAct) ──────────────────────────────────────────

interface LLMToolCallResponse {
  choices: { message: { role: string; content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[]
  tokens: number
}

async function callLLMWithTools(
  cfg: LLMConfig,
  messages: { role: string; content: string | null; tool_calls?: any[]; tool_call_id?: string }[],
  tools: typeof A2A_TOOLS,
): Promise<LLMToolCallResponse> {
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    max_tokens: 2048,
    temperature: 0.3,
  }
  if (tools.length > 0) {
    body.tools = tools
    body.tool_choice = 'auto'
  }

  const res = await fetch(`${cfg.endpoint}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown error')
    throw new Error(`LLM call failed (HTTP ${res.status}): ${errText.slice(0, 200)}`)
  }

  const data = await res.json()
  return {
    choices: data.choices || [],
    tokens: data.usage?.total_tokens || 0,
  }
}
