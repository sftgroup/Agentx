-- AgentX Gateway — A2A Task Results Table
-- Stores LLM-processed results for A2A tasks, ready for agent SDK to pick up

CREATE TABLE IF NOT EXISTS a2a_task_results (
    task_id         INTEGER PRIMARY KEY,
    agent_id        INTEGER NOT NULL,
    task_type       TEXT NOT NULL DEFAULT '',
    input_data      TEXT NOT NULL DEFAULT '',
    output_data     TEXT NOT NULL DEFAULT '',
    status          INTEGER NOT NULL DEFAULT 0,  -- 0=pending, 1=processing, 2=completed, 3=failed
    tenant_id       UUID REFERENCES tenants(id),
    error_message   TEXT,
    llm_model       TEXT,
    tokens_used     INTEGER NOT NULL DEFAULT 0,
    processed_at    TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE a2a_task_results ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

CREATE INDEX IF NOT EXISTS idx_a2a_results_agent ON a2a_task_results(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_a2a_results_status ON a2a_task_results(status);
CREATE INDEX IF NOT EXISTS idx_a2a_results_created ON a2a_task_results(created_at DESC);
