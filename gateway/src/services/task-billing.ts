// AgentX Gateway — Task Billing Idempotency
// A task may be metered through two independent channels:
//   1. SSE — a client subscribed to /tasks/:taskId/events and the done event
//      carried platform-mode usage (see pipeSSEWithUsage).
//   2. Callback — the Conversation Service reports task completion usage to
//      POST /api/v1/internal/task-billing (covers tasks nobody ever streamed).
// Both channels share this in-memory set so a task is counted exactly once,
// regardless of which channel fires first.

const billedTaskIds = new Set<string>()

export function isTaskBilled(taskId: string): boolean {
  return billedTaskIds.has(taskId)
}

/** Mark a task as billed. Returns true if it was NOT billed before (idempotent). */
export function markTaskBilled(taskId: string): boolean {
  if (billedTaskIds.has(taskId)) return false
  billedTaskIds.add(taskId)
  return true
}
