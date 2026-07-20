-- AgentX Gateway — Agents Index Table
-- Stores agent metadata indexed from the IdentityRegistry contract

CREATE TABLE IF NOT EXISTS agents (
    id              INTEGER PRIMARY KEY,
    owner           VARCHAR(42) NOT NULL DEFAULT '',
    name            VARCHAR(200) NOT NULL DEFAULT '',
    description     TEXT NOT NULL DEFAULT '',
    tags            TEXT[] DEFAULT '{}',
    capabilities    TEXT[] DEFAULT '{}',
    token_uri       TEXT NOT NULL DEFAULT '',
    metadata_json   JSONB DEFAULT '{}'::jsonb,
    synced_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_owner ON agents(owner);
CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name);
CREATE INDEX IF NOT EXISTS idx_agents_tags ON agents USING GIN(tags);
