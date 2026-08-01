-- ============================================================
-- AgentX Gateway — Tenant Platform API Key
-- ============================================================
-- Each tenant gets an AgentX platform API key for programmatic
-- access as an alternative to wallet-signature JWT auth.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS api_key TEXT UNIQUE;

-- Generate keys for existing tenants that don't have one yet
UPDATE tenants
SET api_key = 'agentx_' || encode(gen_random_bytes(16), 'hex')
WHERE api_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_api_key ON tenants(api_key)
  WHERE api_key IS NOT NULL;
