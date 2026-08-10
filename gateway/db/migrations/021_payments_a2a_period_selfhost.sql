-- AgentX Gateway — 021: self-hosted a2a-pay + period-authorization rails (R17.5)
-- @0xinfrax/payments@0.1.2 剥离了 a2a rail 与 period 授权 rail（行为变更，见
-- PROGRESS R17.5 / issue #1）。AgentX 定制层在自有表上重新实现这两个能力，
-- 保持 HTTP 契约与 SDK 客户端签名不变（B 端零改动）。
-- 表结构与原通用模块一致；所有语句幂等，可安全重复应用。

-- ── a2a rail: unified payment intents + payee (receiving wallet) ─────────────
CREATE TABLE IF NOT EXISTS payment_intents (
  id         BIGSERIAL PRIMARY KEY,
  intent_id  TEXT NOT NULL UNIQUE,          -- public id (paymentId)
  method     TEXT NOT NULL,                 -- chain | fiat | x402 | mpp | a2a
  subscriber TEXT,                          -- payer wallet
  asset      TEXT NOT NULL DEFAULT '0x0000000000000000000000000000000000000000',
  amount_wei TEXT,                          -- atomic units (decimal string)
  currency   TEXT,                          -- fiat currency when applicable
  chain      TEXT,                          -- chain slot
  status     TEXT NOT NULL DEFAULT 'created', -- created | paid | failed | closed
  metadata   JSONB,                         -- opaque business context
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_intents_subscriber ON payment_intents(subscriber, status);
CREATE INDEX IF NOT EXISTS idx_payment_intents_method ON payment_intents(method);
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS payee TEXT;

-- ── period rail: authorizations (owner-approved funds consumed over time) ─────
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
