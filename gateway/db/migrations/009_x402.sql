-- x402 pay-per-request (A2) — verified on-chain micropayments credited to a
-- per-address balance that the Gateway access layer can deduct per request.

CREATE TABLE IF NOT EXISTS x402_payments (
  tx_hash       TEXT PRIMARY KEY,          -- on-chain payment tx (idempotency key)
  from_address  TEXT NOT NULL,
  amount_wei    TEXT NOT NULL,
  chain_id      INTEGER NOT NULL,
  verified_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS x402_balances (
  address     TEXT PRIMARY KEY,
  balance_wei TEXT NOT NULL DEFAULT '0',   -- wei string (aligned with repo style)
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
