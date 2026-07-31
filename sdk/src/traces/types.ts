// @agentx/sdk — Traces Module
// Structured trace events for agent observability

export interface TraceEvent {
  tenantId: string
  agentId: number
  sessionId: string
  type: 'tool_call' | 'tool_result' | 'text_delta' | 'session_complete'
  timestamp: number
  data: Record<string, unknown>
}

export interface TraceEmitter {
  emit(event: TraceEvent): void
}

/** No-op emitter — zero overhead when tracing is not configured */
export class NoopTraceEmitter implements TraceEmitter {
  emit(_event: TraceEvent): void {}
}

/** Batched HTTP trace emitter — sends events to a remote collector */
export class HttpTraceEmitter implements TraceEmitter {
  private buffer: TraceEvent[] = []
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly endpoint: string,
    private readonly authToken?: string,
    private readonly flushIntervalMs = 5000,
    private readonly maxBufferSize = 100,
  ) {}

  emit(event: TraceEvent): void {
    this.buffer.push(event)
    if (this.buffer.length >= this.maxBufferSize) {
      this.flush()
      return
    }
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.flushIntervalMs)
    }
  }

  private flush(): void {
    if (this.buffer.length === 0) return
    const batch = this.buffer.splice(0)
    if (this.timer) { clearTimeout(this.timer); this.timer = null }

    // Fire-and-forget — don't block AgentLoop
    fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.authToken ? { 'Authorization': `Bearer ${this.authToken}` } : {}),
      },
      body: JSON.stringify({ events: batch }),
    }).catch(() => {})
  }
}

export interface TraceConfig {
  emitter: TraceEmitter
  enabled: boolean
}
