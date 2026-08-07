-- On-chain subscriptions synced from SubscriptionManager (event-driven).
-- The v2 contract has no "list subscriptions by agent" view, so the per-agent
-- stats endpoint cannot enumerate chain subscriptions directly. We maintain
-- this table from Subscribed / SubscriptionCancelled / SubscriptionExpired
-- events (same event-driven pattern as subscription_plans).
-- amount_wei stored as decimal string to avoid JS bigint/number precision loss.
CREATE TABLE IF NOT EXISTS chain_subscriptions (
  subscription_id INTEGER PRIMARY KEY,
  agent_id        INTEGER NOT NULL,
  subscriber      TEXT NOT NULL,
  status          INTEGER NOT NULL DEFAULT 1,   -- 0=Inactive 1=Active 2=Expired 3=Cancelled
  started_at      BIGINT,
  expires_at      BIGINT,
  period          TEXT,
  pay_token       TEXT,
  amount_wei      TEXT,
  funds_released  BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chain_subscriptions_agent_id ON chain_subscriptions(agent_id);
CREATE INDEX IF NOT EXISTS idx_chain_subscriptions_status ON chain_subscriptions(status);
