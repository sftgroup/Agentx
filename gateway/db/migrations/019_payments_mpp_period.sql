-- @agentxv2/payments module-owned tables for P2 (MPP) + P4 (period auths).
-- The generic engine's PgMPPSessionStore / PgAuthorizationStore read/write
-- exactly these columns (see payments/db/migrations/005_payment_authorizations.sql
-- for the canonical module schema). Every statement is idempotent.

-- MPP payment channels: open → vouchers* → close (with topup).
CREATE TABLE IF NOT EXISTS payment_sessions (
  channel_id          TEXT PRIMARY KEY,
  payer               TEXT NOT NULL,
  payee               TEXT NOT NULL,
  chain               TEXT NOT NULL,
  asset               TEXT NOT NULL DEFAULT '0x0000000000000000000000000000000000000000',
  deposit_wei         TEXT NOT NULL,
  current_cum         TEXT NOT NULL DEFAULT '0',
  spent_wei           TEXT NOT NULL DEFAULT '0',
  last_signature      TEXT,
  status              TEXT NOT NULL DEFAULT 'open',
  salt                TEXT,
  auto_settle         BOOLEAN NOT NULL DEFAULT TRUE,
  settle_interval_sec INTEGER NOT NULL DEFAULT 86400,
  last_settle_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_payment_sessions_payer ON payment_sessions(payer, status);

-- Voucher audit trail (one row per signature).
CREATE TABLE IF NOT EXISTS payment_vouchers (
  channel_id         TEXT NOT NULL,
  cumulative_amount  TEXT NOT NULL,
  signature          TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_vouchers_channel ON payment_vouchers(channel_id);

-- Period authorizations: owner-approved funds consumed over time (P4).
CREATE TABLE IF NOT EXISTS payment_authorizations (
  id                TEXT PRIMARY KEY,
  owner             TEXT NOT NULL,
  asset             TEXT NOT NULL DEFAULT '0x0000000000000000000000000000000000000000',
  chain             TEXT NOT NULL,
  amount_wei        TEXT NOT NULL,
  remaining_wei     TEXT NOT NULL,
  period_price_wei  TEXT NOT NULL,
  periods           INTEGER NOT NULL,
  nonce             TEXT NOT NULL,
  reference         TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL DEFAULT 'active',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_authorizations_owner ON payment_authorizations(owner, status);
