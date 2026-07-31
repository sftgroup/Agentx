interface TraceEvent {
    tenantId: string;
    agentId: number;
    sessionId: string;
    type: 'tool_call' | 'tool_result' | 'text_delta' | 'session_complete';
    timestamp: number;
    data: Record<string, unknown>;
}
interface TraceEmitter {
    emit(event: TraceEvent): void;
}
/** No-op emitter — zero overhead when tracing is not configured */
declare class NoopTraceEmitter implements TraceEmitter {
    emit(_event: TraceEvent): void;
}
/** Batched HTTP trace emitter — sends events to a remote collector */
declare class HttpTraceEmitter implements TraceEmitter {
    private readonly endpoint;
    private readonly authToken?;
    private readonly flushIntervalMs;
    private readonly maxBufferSize;
    private buffer;
    private timer;
    constructor(endpoint: string, authToken?: string | undefined, flushIntervalMs?: number, maxBufferSize?: number);
    emit(event: TraceEvent): void;
    private flush;
}
interface TraceConfig {
    emitter: TraceEmitter;
    enabled: boolean;
}

export { HttpTraceEmitter, NoopTraceEmitter, type TraceConfig, type TraceEmitter, type TraceEvent };
