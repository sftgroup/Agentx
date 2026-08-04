-- AgentX Gateway — Structured agent metadata columns
-- Marketplace-visible fields parsed from tokenURI metadata by the indexer.

ALTER TABLE agents ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS skills TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS agent_created_at BIGINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_agents_is_active ON agents(is_active);
CREATE INDEX IF NOT EXISTS idx_agents_skills ON agents USING GIN(skills);
