-- Fiat subscriptions (A1) — SaaS-style card subscriptions tracked by the
-- Gateway access-control layer. On-chain subscription stays the primary rail;
-- this table only mirrors fiat billing state for access checks and payouts.

CREATE TABLE IF NOT EXISTS fiat_subscriptions (
  id                SERIAL PRIMARY KEY,
  subscriber        TEXT NOT NULL,              -- wallet address of the buyer
  agent_id          INTEGER NOT NULL,
  plan_id           INTEGER,
  provider          TEXT NOT NULL DEFAULT 'stripe',
  provider_sub_id   TEXT,                        -- Stripe subscription id
  status            TEXT NOT NULL DEFAULT 'active',  -- active | cancelled | past_due
  currency          TEXT NOT NULL DEFAULT 'usd',
  amount_cents      INTEGER NOT NULL DEFAULT 0,  -- per billing period
  period            TEXT,                         -- month | year
  starts_at         TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_sub_id)
);
CREATE INDEX IF NOT EXISTS idx_fiat_subs_active ON fiat_subscriptions(subscriber, agent_id) WHERE status = 'active';

-- Per-billing-period revenue record for creator/platform reconciliation.
CREATE TABLE IF NOT EXISTS fiat_payouts (
  id                  SERIAL PRIMARY KEY,
  subscription_id     INTEGER NOT NULL REFERENCES fiat_subscriptions(id),
  creator             TEXT,                       -- agent creator wallet
  agent_id            INTEGER NOT NULL,
  amount_cents        INTEGER NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'usd',
  platform_cut_cents  INTEGER NOT NULL DEFAULT 0, -- platform fee giveback reference
  status              TEXT NOT NULL DEFAULT 'pending', -- pending | paid
  invoice_id          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fiat_payouts_status ON fiat_payouts(status);
