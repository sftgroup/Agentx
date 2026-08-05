-- 005_chat_tasks.sql
-- Chat tasks (runs). A session owns many tasks; each task = one async agent run.
-- Mirrors DeerFlow's Run model: task id returned immediately, execution happens in
-- the background, state/result/events are persisted and can be subscribed via SSE.

CREATE TABLE IF NOT EXISTS chat_tasks (
    id              VARCHAR(64) PRIMARY KEY,   -- task id (uuid)
    session_id      VARCHAR(64) NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    tenant          VARCHAR(42) NOT NULL,
    agent_id        INTEGER,
    end_user_id     VARCHAR(64) NOT NULL DEFAULT 'default',
    message         TEXT NOT NULL,
    status          VARCHAR(16) NOT NULL DEFAULT 'queued',  -- queued|running|done|error|cancelled
    enable_memory   BOOLEAN NOT NULL DEFAULT FALSE,
    history         JSONB NOT NULL DEFAULT '[]',
    prompt          TEXT,                      -- inline mode system prompt
    skills          JSONB,                     -- inline mode tools
    llm_api_key_enc TEXT,                      -- stateless BYOK key, AES-encrypted at rest
    llm_endpoint    TEXT,                      -- BYOK endpoint (e.g. DeepSeek)
    llm_model       TEXT,                      -- BYOK model (e.g. deepseek-chat)
    result          TEXT,                      -- final assistant text
    error           TEXT,
    usage           JSONB,
    iterations      INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ
);

CREATE INDEX idx_chat_tasks_session ON chat_tasks (session_id, created_at DESC);
CREATE INDEX idx_chat_tasks_status   ON chat_tasks (status);

-- Task event log — every SSE event is persisted so clients can replay a task's
-- event stream after disconnect (DeerFlow run_events equivalent).
CREATE TABLE IF NOT EXISTS chat_task_events (
    id         BIGSERIAL PRIMARY KEY,
    task_id    VARCHAR(64) NOT NULL REFERENCES chat_tasks(id) ON DELETE CASCADE,
    seq        INTEGER NOT NULL,
    type       VARCHAR(32) NOT NULL,          -- text|tool_call|tool_result|thinking|done|error|clarification
    payload    JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_task_events_task ON chat_task_events (task_id, seq);
