-- Plans table — subscription plans synced from SubscriptionManager (event-driven).
-- Price stored as decimal string to avoid JS bigint/number precision loss.
CREATE TABLE IF NOT EXISTS plans (
  plan_id    INTEGER PRIMARY KEY,
  agent_id   INTEGER NOT NULL,
  creator    TEXT,
  price      TEXT NOT NULL,
  period     TEXT,
  pay_token  TEXT,
  trial_days INTEGER NOT NULL DEFAULT 0,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plans_agent_id ON plans(agent_id);
CREATE INDEX IF NOT EXISTS idx_plans_active ON plans(active);
