-- 004_chat_sessions.sql
-- Chat sessions (threads). A session = a dialog container that owns multiple tasks.
-- Mirrors DeerFlow's Thread model: one dialog box manages many parallel tasks.

CREATE TABLE IF NOT EXISTS chat_sessions (
    id           VARCHAR(64) PRIMARY KEY,   -- client-supplied or server-generated session id
    tenant       VARCHAR(42) NOT NULL,      -- tenant wallet address (isolation dimension)
    agent_id     INTEGER,                   -- bound agent (nullable for inline prompt/skills mode)
    end_user_id  VARCHAR(64) NOT NULL DEFAULT 'default',
    title        TEXT,                      -- optional display title
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_sessions_tenant ON chat_sessions (tenant, end_user_id);
