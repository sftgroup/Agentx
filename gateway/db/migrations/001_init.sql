-- ============================================================
-- AgentX Gateway — Multi-Tenant SaaS Initial Schema
-- ============================================================

-- 1. Plans (platform subscription tiers)
CREATE TABLE IF NOT EXISTS plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  price_monthly   NUMERIC NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'USD',
  quota_daily     BIGINT NOT NULL DEFAULT 0,
  quota_monthly   BIGINT NOT NULL DEFAULT 0,
  platform_models JSONB NOT NULL DEFAULT '[]',
  byok_enabled    BOOLEAN NOT NULL DEFAULT false,
  rate_limit_rpm  INT NOT NULL DEFAULT 10,
  max_concurrent  INT NOT NULL DEFAULT 1,
  features        JSONB NOT NULL DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT true
);

-- Seed default plans
INSERT INTO plans (name, slug, price_monthly, quota_daily, quota_monthly, byok_enabled, rate_limit_rpm, max_concurrent, platform_models, features)
VALUES
  ('Free', 'free', 0, 0, 0, true, 5, 1, '[]', '{}'),
  ('Pro', 'pro', 29, 500000, 15000000, true, 30, 3,
   '[{"provider":"openai","model":"gpt-4o-mini"},{"provider":"deepseek","model":"deepseek-chat"}]',
   '{"chat_history_cloud":true}'),
  ('Enterprise', 'enterprise', 299, 5000000, 150000000, true, 100, 10,
   '[{"provider":"openai","model":"gpt-4o"},{"provider":"openai","model":"gpt-4o-mini"},{"provider":"deepseek","model":"deepseek-chat"},{"provider":"anthropic","model":"claude-3-5-sonnet-20240620"}]',
   '{"chat_history_cloud":true,"custom_models":true}')
ON CONFLICT (slug) DO NOTHING;

-- 2. Tenants
CREATE TABLE IF NOT EXISTS tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address  TEXT NOT NULL UNIQUE,
  name            TEXT,
  plan_id         UUID REFERENCES plans(id),
  quota_daily     BIGINT NOT NULL DEFAULT 0,
  quota_used      BIGINT NOT NULL DEFAULT 0,
  quota_reset_at  TIMESTAMPTZ,
  rate_limit_rpm  INT NOT NULL DEFAULT 5,
  max_concurrent  INT NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_wallet ON tenants(wallet_address);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

-- 3. Platform API Keys (admin-managed, load-balanced pool)
CREATE TABLE IF NOT EXISTS platform_api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        TEXT NOT NULL,
  endpoint        TEXT NOT NULL,
  api_key         TEXT NOT NULL,
  label           TEXT,
  plan_ids        UUID[] NOT NULL,
  models          TEXT[] NOT NULL,
  weight          INT NOT NULL DEFAULT 1,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Tenant-owned API Keys (BYOK)
CREATE TABLE IF NOT EXISTS tenant_api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,
  endpoint        TEXT NOT NULL,
  api_key         TEXT NOT NULL,
  model           TEXT NOT NULL,
  label           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_validated  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_keys_tenant ON tenant_api_keys(tenant_id);

-- 5. Usage Logs
CREATE TABLE IF NOT EXISTS usage_logs (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  key_source      TEXT NOT NULL,
  platform_key_id UUID REFERENCES platform_api_keys(id),
  tenant_key_id   UUID REFERENCES tenant_api_keys(id),
  provider        TEXT NOT NULL,
  model           TEXT NOT NULL,
  tokens_prompt   INT NOT NULL DEFAULT 0,
  tokens_completion INT NOT NULL DEFAULT 0,
  tokens_total    INT NOT NULL DEFAULT 0,
  tool_calls      INT NOT NULL DEFAULT 0,
  agent_id        INT,
  cost_estimated  NUMERIC,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_tenant_date ON usage_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_logs(created_at DESC);

-- 6. Chat Messages (optional cloud persistence)
CREATE TABLE IF NOT EXISTS chat_messages (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id    INT NOT NULL,
  role        TEXT NOT NULL,
  content     TEXT NOT NULL,
  tool_name   TEXT,
  tool_input  JSONB,
  tool_output JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_tenant_agent ON chat_messages(tenant_id, agent_id, created_at);
