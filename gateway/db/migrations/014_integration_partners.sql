-- 014_integration_partners.sql
-- R11: Multi-caller (integrator) access configuration management.
--   One row per external system that calls AgentX (e.g. aitrader, aiservicer, aihunter-saas).
--   Each partner owns a tenant (auto-created on POST /admin/integrations) whose
--   tenants.api_key is surfaced to the caller as AGENTX_CONVERSATION_API_KEY.
CREATE TABLE IF NOT EXISTS integration_partners (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  gateway_url  TEXT NOT NULL,
  tenant_id    UUID REFERENCES tenants(id) ON DELETE SET NULL,
  active       BOOLEAN NOT NULL DEFAULT true,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_partners_tenant ON integration_partners(tenant_id);
CREATE INDEX IF NOT EXISTS idx_integration_partners_active ON integration_partners(active);
