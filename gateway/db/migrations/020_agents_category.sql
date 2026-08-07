-- AgentX Gateway — Agent category column
-- Application category / use case (SDK AGENT_CATEGORIES: operations,
-- customer-service, sales, personal-assistant, coding, server-monitoring,
-- airdrop, quant-trading, data-analysis, content, security, finance, other).
-- Drives marketplace & application-launcher filtering. Agents without a
-- category fall back to 'other' for display purposes.

ALTER TABLE agents ADD COLUMN IF NOT EXISTS category VARCHAR(50) NOT NULL DEFAULT 'other';

CREATE INDEX IF NOT EXISTS idx_agents_category ON agents(category);
