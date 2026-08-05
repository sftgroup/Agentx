-- Channel admin: settlement ledger + attribution settlement markers.
-- Extends 007_channel_attributions.sql with a settlement record per payout batch.

-- Track when an attribution was settled and by which settlement batch.
ALTER TABLE channel_attributions ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;
ALTER TABLE channel_attributions ADD COLUMN IF NOT EXISTS settlement_id TEXT;

-- Settlement ledger: one row per payout batch issued to a channel.
CREATE TABLE IF NOT EXISTS channel_settlements (
  id          SERIAL PRIMARY KEY,
  channel_id  VARCHAR(64) NOT NULL REFERENCES channels(id),
  amount_wei  TEXT NOT NULL,          -- total channel share settled in this batch (wei string)
  tx_hash     TEXT NOT NULL,          -- on-chain payout transaction hash (auditable)
  note        TEXT,                   -- optional operator note
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channel_settlements_channel ON channel_settlements(channel_id);
