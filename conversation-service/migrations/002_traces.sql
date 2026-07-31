-- AgentX Conversation Service — Migration 002: Traces
-- Structured trace events for observability

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'traces') THEN
    CREATE TABLE traces (
      id BIGSERIAL PRIMARY KEY,
      tenant_id VARCHAR(42) NOT NULL,
      agent_id INTEGER NOT NULL,
      session_id VARCHAR(64) NOT NULL,
      type VARCHAR(30) NOT NULL,
      data JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Fast lookup by tenant + agent + session
    CREATE INDEX idx_traces_tenant_agent_session ON traces (tenant_id, agent_id, session_id);

    -- Date-based queries for analytics
    CREATE INDEX idx_traces_created_at ON traces (created_at);
  END IF;
END $$;
