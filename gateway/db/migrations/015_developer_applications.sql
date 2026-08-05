-- 015_developer_applications.sql
-- R13: External project teams can self-service apply for API-key integration.
-- Reuses partner_applications (P7-5) with a `type` discriminator:
--   'channel'   — B-end channel partnership (existing flow, approve → channels)
--   'developer' — API integration caller (approve → auto tenant + agentx_ key + integration_partners)
ALTER TABLE partner_applications ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'channel';

CREATE INDEX IF NOT EXISTS idx_partner_applications_type ON partner_applications(type, status);
