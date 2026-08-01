-- AgentX Conversation Service — Migration 004: End-User Isolation
-- Adds end_user_id to memories for per-user scoping within a tenant.

-- 1. Add column with default so existing data doesn't break
ALTER TABLE memories ADD COLUMN IF NOT EXISTS end_user_id VARCHAR(64) NOT NULL DEFAULT 'default';

-- 2. Update the regular lookup index to include end_user_id
DROP INDEX IF EXISTS idx_memories_subscriber_agent;
CREATE INDEX idx_memories_subscriber_agent_user ON memories (subscriber, agent_id, end_user_id);

-- 3. Recreate unique constraint to include end_user_id
DROP INDEX IF EXISTS idx_memories_unique_fact;
CREATE UNIQUE INDEX idx_memories_unique_fact ON memories (subscriber, agent_id, end_user_id, fact);
