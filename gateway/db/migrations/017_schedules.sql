-- 017_schedules.sql
-- User scheduled tasks (R10): one-time / periodic triggers that create a chat task
-- automatically at the due time (no manual invocation). Owned by a tenant.

CREATE TABLE IF NOT EXISTS schedules (
  id                SERIAL PRIMARY KEY,
  tenant            VARCHAR(42) NOT NULL,      -- tenant wallet address (isolation dimension)
  agent_id          INTEGER,                   -- bound agent (nullable for inline prompt mode)
  title             TEXT,
  message           TEXT NOT NULL,             -- task prompt/message executed at trigger time
  schedule_type     TEXT NOT NULL,             -- one_time | interval
  run_at            TIMESTAMPTZ,               -- one_time: exact execution time
  interval_seconds  INTEGER,                   -- interval: repeat period (min 60)
  timezone          TEXT NOT NULL DEFAULT 'UTC',
  enabled           BOOLEAN NOT NULL DEFAULT true,
  next_run_at       TIMESTAMPTZ,               -- next scheduled execution (single-flight guard)
  deleted_at        TIMESTAMPTZ,               -- soft delete: keeps schedule_runs history
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_schedules_type CHECK (schedule_type IN ('one_time', 'interval'))
);

CREATE INDEX idx_schedules_due ON schedules (enabled, next_run_at);
CREATE INDEX idx_schedules_tenant ON schedules (tenant);

-- Execution ledger: one row per trigger attempt (success → task_id, failure → error).
CREATE TABLE IF NOT EXISTS schedule_runs (
  id            SERIAL PRIMARY KEY,
  schedule_id   INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  task_id       TEXT,                          -- created chat task id (status='triggered')
  status        TEXT NOT NULL,                 -- triggered | failed
  error         TEXT,                          -- failure reason (e.g. P9 gate 403)
  triggered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_schedule_runs_schedule ON schedule_runs (schedule_id, triggered_at DESC);
