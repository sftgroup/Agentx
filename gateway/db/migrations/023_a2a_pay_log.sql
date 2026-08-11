-- 023_a2a_pay_log.sql
-- R19.7 (T5): A2A 委派按次付费审计表。
-- 主 agent 未订阅目标 agent 时，经 x402 余额按次扣费放行委派；每笔扣费在此落审计。
-- 幂等：唯一约束 (payer, agent_id, ref_id) 防同一 ref 重复记录。
CREATE TABLE IF NOT EXISTS a2a_pay_log (
  id            BIGSERIAL PRIMARY KEY,
  payer         TEXT NOT NULL,
  agent_id      INTEGER NOT NULL,
  amount_wei    TEXT NOT NULL,
  ref_id        TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (payer, agent_id, ref_id)
);

CREATE INDEX IF NOT EXISTS idx_a2a_pay_log_payer ON a2a_pay_log(payer, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_a2a_pay_log_agent ON a2a_pay_log(agent_id, created_at DESC);
