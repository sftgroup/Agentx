-- On-chain subscription plans synced from SubscriptionManager (event-driven).
-- Named subscription_plans to avoid clashing with the platform pricing `plans` table.
-- Price stored as decimal string to avoid JS bigint/number precision loss.
CREATE TABLE IF NOT EXISTS subscription_plans (
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

CREATE INDEX IF NOT EXISTS idx_subscription_plans_agent_id ON subscription_plans(agent_id);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(active);
