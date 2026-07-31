-- AgentX Conversation Service — Migration 001: Memories
-- Session memory storage with pgvector for semantic recall

CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'memories') THEN
    CREATE TABLE memories (
      id BIGSERIAL PRIMARY KEY,
      subscriber VARCHAR(42) NOT NULL,
      agent_id INTEGER NOT NULL,
      fact TEXT NOT NULL,
      embedding vector(1536),
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Tenant isolation: fast lookup by (subscriber, agent_id)
    CREATE INDEX idx_memories_subscriber_agent ON memories (subscriber, agent_id);

    -- Unique constraint to prevent duplicate facts per subscriber×agent
    CREATE UNIQUE INDEX idx_memories_unique_fact ON memories (subscriber, agent_id, fact);
  END IF;
END $$;
