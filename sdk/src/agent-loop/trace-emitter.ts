// ---------------------------------------------------------------------------
// @agentx/sdk — Loop Trace Emitter
// ---------------------------------------------------------------------------
// Fire-and-forget structured observability for AgentLoop.
// Extracted from AgentLoop for decoupling.
// ---------------------------------------------------------------------------

import type { TraceEvent, TraceConfig } from '../traces/types'

export class LoopTraceEmitter {
  private readonly config: TraceConfig | undefined

  constructor(config?: TraceConfig) {
    this.config = config
  }

  emit(event: Omit<TraceEvent, 'timestamp'>): void {
    if (!this.config?.enabled) return
    try {
      this.config.emitter.emit({ ...event, timestamp: Date.now() })
    } catch {
      // Trace emit should never throw — silently ignore
    }
  }
}
