-- 012_parallel_tasks_control.sql
-- P9: Integrators can disable multi-task / sub-agent capability.
--   plans.features.parallel_tasks (JSONB, default true)  — plan-level capability
--   tenants.allow_parallel_tasks (BOOLEAN, NULL = inherit plan) — tenant-level override
-- Effective value = tenant.allow_parallel_tasks ?? plan.features.parallel_tasks ?? true
-- When false, creating a task (POST /sessions/:id/tasks) is rejected with 403.
-- The same bit will gate future sub-agent spawning.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS allow_parallel_tasks BOOLEAN;

-- Backfill existing plans with the capability bit so the flag is visible everywhere.
UPDATE plans
SET features = COALESCE(features, '{}'::jsonb) || '{"parallel_tasks": true}'::jsonb
WHERE features IS NULL OR NOT features ? 'parallel_tasks';
