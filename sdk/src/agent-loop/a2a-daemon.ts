// ---------------------------------------------------------------------------
// @agentx/sdk — A2A Task Daemon
// ---------------------------------------------------------------------------
// Runs alongside AgentLoop to automatically process incoming A2A tasks.
//
// How it works:
//   1. Poll Gateway API for LLM-processed task results assigned to this agent
//   2. (or) directly check contract for pending tasks via getAgentTasks()
//   3. Call completeTask() on-chain with the agent owner's wallet
//
// This enables TRUE multi-agent interop:
//   Agent A → createTask(Agent B) on-chain
//   Gateway Worker → detects task → LLM processes → stores result in DB
//   Agent B's A2A Daemon → polls Gateway → gets result → completeTask() on-chain
//
// Usage:
//   const daemon = new A2ADaemon({
//     agentId: 53,
//     a2a: a2aProtocol,
//     gatewayUrl: 'http://43.159.60.46:3090',
//     pollIntervalMs: 15000,
//   })
//   daemon.start()
//   daemon.on('taskCompleted', (task) => console.log('Done:', task.taskId))
// ---------------------------------------------------------------------------

import type { A2AProtocol } from '../a2a/a2a'
import type { A2ATask } from '../core/types'
import { EventEmitter } from 'events'

// ── Config ──────────────────────────────────────────────────────────────────

export interface A2ADaemonConfig {
  /** Your agent's numeric ID */
  agentId: number
  /** Initialized A2AProtocol instance */
  a2a: A2AProtocol
  /** Gateway URL for fetching pre-computed LLM results */
  gatewayUrl?: string
  /** Poll interval in milliseconds (default: 15000) */
  pollIntervalMs?: number
  /** If true, daemon will auto-complete tasks (call completeTask on-chain) */
  autoComplete?: boolean
  /** Max tasks to process per poll (default: 3) */
  maxPerPoll?: number
}

export interface A2ATaskResult {
  task: A2ATask
  /** LLM-generated output from Gateway (if available) */
  gatewayOutput?: string
  /** If task was auto-completed on-chain */
  completed: boolean
  /** Transaction hash if completed */
  txHash?: string
  /** Error message if failed */
  error?: string
}

// ── Daemon ──────────────────────────────────────────────────────────────────

export class A2ADaemon extends EventEmitter {
  private config: Required<Omit<A2ADaemonConfig, 'gatewayUrl'>> & { gatewayUrl?: string }
  private timer: ReturnType<typeof setInterval> | null = null
  private isRunning = false
  private processedTasks = new Set<number>()

  constructor(config: A2ADaemonConfig) {
    super()
    this.config = {
      agentId: config.agentId,
      a2a: config.a2a,
      gatewayUrl: config.gatewayUrl,
      pollIntervalMs: config.pollIntervalMs ?? 15_000,
      autoComplete: config.autoComplete ?? true,
      maxPerPoll: config.maxPerPoll ?? 3,
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  start(): void {
    if (this.timer) return
    console.log(`[A2A Daemon] Starting for agent #${this.config.agentId}, poll: ${this.config.pollIntervalMs}ms`)
    this.timer = setInterval(() => this.poll(), this.config.pollIntervalMs)
    this.poll()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
      console.log(`[A2A Daemon] Stopped for agent #${this.config.agentId}`)
    }
  }

  get status(): { running: boolean; agentId: number; processedCount: number } {
    return {
      running: this.timer !== null,
      agentId: this.config.agentId,
      processedCount: this.processedTasks.size,
    }
  }

  // ── Core Logic ───────────────────────────────────────────────────────────

  private async poll(): Promise<void> {
    if (this.isRunning) return
    this.isRunning = true

    try {
      const pendingTasks = await this.getPendingTasks()
      if (pendingTasks.length === 0) {
        this.isRunning = false
        return
      }

      console.log(`[A2A Daemon] Found ${pendingTasks.length} pending task(s) for agent #${this.config.agentId}`)

      let processed = 0
      for (const task of pendingTasks) {
        if (processed >= this.config.maxPerPoll) break

        try {
          const result = await this.processPendingTask(task)
          processed++

          if (result.completed) {
            this.processedTasks.add(task.taskId)
            this.emit('taskCompleted', result)
            console.log(`[A2A Daemon] Task #${task.taskId} completed, tx: ${result.txHash?.slice(0, 10)}...`)
          } else if (result.error) {
            this.emit('taskFailed', result)
            console.warn(`[A2A Daemon] Task #${task.taskId} failed: ${result.error}`)
          }
        } catch (err: any) {
          console.error(`[A2A Daemon] Error processing task #${task.taskId}:`, err.message)
        }
      }
    } catch (err: any) {
      console.error('[A2A Daemon] Poll error:', err.message)
    } finally {
      this.isRunning = false
    }
  }

  /**
   * Get pending tasks assigned to this agent using getAgentTasks() from the contract.
   */
  private async getPendingTasks(): Promise<A2ATask[]> {
    try {
      const allTasks = await this.config.a2a.getAgentTasks(this.config.agentId)
      return allTasks.filter(
        t => (t.status === 'created' || t.status === 'accepted') &&
             !this.processedTasks.has(t.taskId)
      )
    } catch (err: any) {
      console.warn('[A2A Daemon] Failed to fetch pending tasks:', err.message)
      return []
    }
  }

  /**
   * Process a pending A2A task:
   *   1. Try Gateway API for pre-computed LLM result
   *   2. Call completeTask() on-chain with the owner's wallet
   */
  private async processPendingTask(task: A2ATask): Promise<A2ATaskResult> {
    let gatewayOutput: string | undefined

    // 1. Try Gateway API for pre-computed result
    if (this.config.gatewayUrl) {
      try {
        const res = await fetch(
          `${this.config.gatewayUrl}/api/v1/a2a/task-result/${task.taskId}`
        )
        if (res.ok) {
          const data = await res.json() as any
          if (data.status === 2 && data.output_data) {
            gatewayOutput = data.output_data
            console.log(`[A2A Daemon] Got result for task #${task.taskId} from Gateway`)
          }
        }
      } catch (err: any) {
        console.warn(`[A2A Daemon] Gateway unavailable for task #${task.taskId}:`, err.message)
      }
    }

    // 2. Determine output content
    const outputContent = gatewayOutput ||
      `Task processed. Type: ${task.taskType}. Input: ${task.input}`

    // 3. Auto-complete on-chain using owner's wallet
    if (this.config.autoComplete) {
      try {
        // completeTask(taskId, output, status)
        // status: 3=completed, 4=failed
        const txHash = await this.config.a2a.completeTask(
          task.taskId,
          outputContent,
          3  // completed
        )

        return { task, gatewayOutput, completed: true, txHash }
      } catch (err: any) {
        return { task, gatewayOutput, completed: false, error: err.message }
      }
    }

    return { task, gatewayOutput, completed: false }
  }
}
