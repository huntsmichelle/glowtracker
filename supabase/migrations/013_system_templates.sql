-- ============================================================
-- 013_system_templates.sql
-- Adds system-template columns to routines and updates RLS
-- to allow all authenticated users to read system templates.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. New columns on routines
-- ────────────────────────────────────────────────────────────

ALTER TABLE routines
  ADD COLUMN IF NOT EXISTS is_system_template  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS template_category   TEXT,
  ADD COLUMN IF NOT EXISTS template_description TEXT,
  ADD COLUMN IF NOT EXISTS template_task_count  INTEGER;

CREATE INDEX IF NOT EXISTS routines_system_template_idx
  ON routines(is_system_template)
  WHERE is_system_template = TRUE;

-- ────────────────────────────────────────────────────────────
-- 2. conflict_intent column (may not exist in older envs)
-- ────────────────────────────────────────────────────────────

ALTER TABLE routines
  ADD COLUMN IF NOT EXISTS conflict_intent TEXT NOT NULL DEFAULT 'unset';

-- ────────────────────────────────────────────────────────────
-- 3. Update RLS on routines
--    USING  → users can read their own rows AND system templates
--    WITH CHECK → users can only write their own rows
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users manage own routines" ON routines;

CREATE POLICY "Users manage own routines"
  ON routines
  FOR ALL
  TO authenticated
  USING  (user_id = auth.uid() OR is_system_template = TRUE)
  WITH CHECK (user_id = auth.uid());
