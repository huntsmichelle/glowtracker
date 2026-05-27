-- ============================================================
-- 017_performance_indexes.sql
-- Additional composite indexes for query patterns identified
-- during the pre-launch performance audit.
-- Safe to re-run — uses IF NOT EXISTS.
-- ============================================================

-- instances(task_id, due_date_start) — non-partial version
-- Used by the routine detail page timeline query:
--   .in('task_id', taskIds).gte('due_date_start', today).lte('due_date_start', +90d)
-- The existing partial index (WHERE is_projected = true) doesn't cover non-projected rows.
CREATE INDEX IF NOT EXISTS instances_task_date_idx
  ON instances (task_id, due_date_start);

-- routine_conflicts(routine_id, status)
-- Used by dashboard and routines page conflict count queries:
--   .in('routine_id', ids).eq('status', 'pending')
CREATE INDEX IF NOT EXISTS routine_conflicts_routine_status_idx
  ON routine_conflicts (routine_id, status);

-- tasks(routine_id, is_active)
-- Used by routines page task count query:
--   .in('routine_id', ids).eq('is_active', true)
-- Extends the existing partial index by adding is_active for filtered counting.
CREATE INDEX IF NOT EXISTS tasks_routine_active_idx
  ON tasks (routine_id, is_active)
  WHERE routine_id IS NOT NULL;
