-- ============================================================
-- 020_linked_tasks_v2.sql
-- Adds:
--   • products.reorder_url
--   • linked_tasks: link_type, occurrence_interval,
--     primary_task_id, occurrence_count
--   • routine_task_pairs: same link_type columns (for LinkRulesPanel)
--   • instances.generated_by_link_id
-- ============================================================

-- Products: reorder link
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS reorder_url TEXT;

-- linked_tasks: new relationship types
ALTER TABLE linked_tasks
  ADD COLUMN IF NOT EXISTS link_type           TEXT    NOT NULL DEFAULT 'conflict',
  ADD COLUMN IF NOT EXISTS occurrence_interval INTEGER          DEFAULT 2,
  ADD COLUMN IF NOT EXISTS primary_task_id     UUID    REFERENCES tasks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS occurrence_count    INTEGER          DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_linked_tasks_link_type
  ON linked_tasks(link_type);

CREATE INDEX IF NOT EXISTS idx_linked_tasks_primary_task
  ON linked_tasks(primary_task_id);

-- routine_task_pairs: store link_type so LinkRulesPanel can use it
ALTER TABLE routine_task_pairs
  ADD COLUMN IF NOT EXISTS link_type           TEXT    NOT NULL DEFAULT 'conflict',
  ADD COLUMN IF NOT EXISTS occurrence_interval INTEGER          DEFAULT 2,
  ADD COLUMN IF NOT EXISTS primary_task_id     UUID    REFERENCES tasks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS occurrence_count    INTEGER          DEFAULT 0;

-- instances: track which link generated this instance
ALTER TABLE instances
  ADD COLUMN IF NOT EXISTS generated_by_link_id UUID
    REFERENCES linked_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_instances_generated_by_link
  ON instances(generated_by_link_id);
