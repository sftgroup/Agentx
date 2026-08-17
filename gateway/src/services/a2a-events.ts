// ---------------------------------------------------------------------------
// AgentX Gateway — A2A Task Event Hub
// ---------------------------------------------------------------------------
// In-process pub/sub for A2A task status transitions (awaiting_payment /
// completed / failed / resumed). The a2a-worker emits events; the SSE route
// (GET /api/v1/a2a/tasks/:id/events) subscribes and forwards them to the
// client. `latest` keeps the most recent event per task so a late subscriber
// can replay the current state immediately.
// ---------------------------------------------------------------------------

import { EventEmitter } from 'events'

export interface A2ATaskPaymentInfo {
  payer: string
  payTo: string
  priceWei: string
  targetAgentId: number
  ref: string
}

export interface A2ATaskEvent {
  type: 'status'
  taskId: number
  status: number
  outputData?: string
  errorMessage?: string
  payment?: A2ATaskPaymentInfo
  ts: number
}

const emitter = new EventEmitter()
emitter.setMaxListeners(0) // one listener per SSE subscriber; unbounded by design

const latest = new Map<number, A2ATaskEvent>()

export function emitA2ATaskEvent(ev: A2ATaskEvent): void {
  latest.set(ev.taskId, ev)
  emitter.emit('a2a-task', ev)
}

export function getA2ATaskEvent(taskId: number): A2ATaskEvent | undefined {
  return latest.get(taskId)
}

export function subscribeA2ATaskEvents(listener: (ev: A2ATaskEvent) => void): () => void {
  emitter.on('a2a-task', listener)
  return () => { emitter.off('a2a-task', listener) }
}
