// AgentX Gateway — Task Billing Idempotency
// A task may be metered through two independent channels:
//   1. SSE — a client subscribed to /tasks/:taskId/events and the done event
//      carried platform-mode usage (see pipeSSEWithUsage).
//   2. Callback — the Conversation Service reports task completion usage to
//      POST /api/v1/internal/task-billing (covers tasks nobody ever streamed).
// Both channels share this idempotent claim table so a task is counted exactly
// once, regardless of which channel fires first.
//
// Entries are bounded: each claim carries a timestamp and is swept after
// BILLED_TTL_MS (both lazily on every access and on a periodic timer), so the
// table can never grow unbounded.

const BILLED_TTL_MS = 30 * 60 * 1000 // 30 minutes — well beyond any task's meter window

/** taskId → claimedAt (epoch ms) */
const billedTaskIds = new Map<string, number>()

function sweepBilled(): void {
  const now = Date.now()
  for (const [id, ts] of billedTaskIds) {
    if (now - ts > BILLED_TTL_MS) billedTaskIds.delete(id)
  }
}

export function isTaskBilled(taskId: string): boolean {
  sweepBilled()
  return billedTaskIds.has(taskId)
}

/** Mark a task as billed. Returns true if it was NOT billed before (idempotent). */
export function markTaskBilled(taskId: string): boolean {
  sweepBilled()
  if (billedTaskIds.has(taskId)) return false
  billedTaskIds.set(taskId, Date.now())
  return true
}

// Periodic sweep so memory stays bounded even when no billing traffic arrives.
const sweepTimer = setInterval(sweepBilled, BILLED_TTL_MS / 2)
sweepTimer.unref?.()
