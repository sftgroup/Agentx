-- Channel revenue share (referral/affiliate) — attribute on-chain subscriptions
-- to a recommending platform and make each share traceable to a chain event.
-- Style aligned with 006_plans.sql (TEXT for addresses/wei to avoid precision loss).

-- Channel config: split ratio per channel (platform-fee giveback).
CREATE TABLE IF NOT EXISTS channels (
  id         VARCHAR(64) PRIMARY KEY,      -- e.g. platform A identifier
  name       TEXT NOT NULL,
  share_bps  INTEGER NOT NULL DEFAULT 0,   -- platform-fee giveback (relative to amount, 125 = 1.25%)
  wallet     TEXT,                          -- on-chain payout address
  active     BOOLEAN NOT NULL DEFAULT true
);

-- Subscription → channel attribution (traceable: each row binds a chain event).
CREATE TABLE IF NOT EXISTS channel_attributions (
  id            SERIAL PRIMARY KEY,
  subscriber    TEXT NOT NULL,             -- subscribing wallet address
  agent_id      INTEGER NOT NULL,
  plan_id       INTEGER,
  channel_id    VARCHAR(64) NOT NULL REFERENCES channels(id),
  source        TEXT,                       -- link / QR / api entry point
  amount_paid   TEXT,                       -- wei string (aligned with subscription_plans)
  tx_hash       TEXT,                       -- Subscribed event txHash (on-chain traceability)
  block_number  INTEGER,
  expires_at    BIGINT,
  settled       BOOLEAN NOT NULL DEFAULT false,  -- paid out to the channel?
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subscriber, agent_id, channel_id)      -- prevent double attribution
);

CREATE INDEX IF NOT EXISTS idx_channel_attributions_channel ON channel_attributions(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_attributions_subscriber ON channel_attributions(subscriber);
