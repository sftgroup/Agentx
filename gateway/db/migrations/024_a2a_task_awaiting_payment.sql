-- 024_a2a_task_awaiting_payment.sql
-- P1b: A2A 委派待付款（awaiting_payment）支持。
-- 主 agent 委派未订阅目标 agent 且余额不足时，任务不再直接失败，而是挂起为
-- awaiting_payment，等待调用方充值后 resume（POST /api/v1/a2a/tasks/:id/resume）。
--
-- a2a_task_results.status 值域扩展：
--   0=pending  1=processing  2=completed  3=failed  4=awaiting_payment
ALTER TABLE a2a_task_results ADD COLUMN IF NOT EXISTS payment_payer TEXT;
ALTER TABLE a2a_task_results ADD COLUMN IF NOT EXISTS payment_amount_wei TEXT;
ALTER TABLE a2a_task_results ADD COLUMN IF NOT EXISTS payment_pay_to TEXT;
ALTER TABLE a2a_task_results ADD COLUMN IF NOT EXISTS payment_target_agent_id INTEGER;
ALTER TABLE a2a_task_results ADD COLUMN IF NOT EXISTS payment_ref TEXT;
ALTER TABLE a2a_task_results ADD COLUMN IF NOT EXISTS payment_pending_since TIMESTAMPTZ;

-- 索引：worker 轮询跳过 awaiting_payment 的任务；resume/过期扫描快速定位。
CREATE INDEX IF NOT EXISTS idx_a2a_results_awaiting_payment
  ON a2a_task_results(status) WHERE status = 4;
