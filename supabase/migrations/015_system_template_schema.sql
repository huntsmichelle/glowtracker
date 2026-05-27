-- ============================================================
-- 015_system_template_schema.sql
-- Ensures system template columns exist and policies are correct.
-- Safe to re-run — uses IF NOT EXISTS and DROP IF EXISTS.
-- Does NOT insert any data.
-- ============================================================

-- Ensure system template columns exist on routines
ALTER TABLE routines
  ADD COLUMN IF NOT EXISTS is_system_template BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS template_category TEXT,
  ADD COLUMN IF NOT EXISTS template_description TEXT;

-- Allow all authenticated users to read system templates (no user_id required)
DROP POLICY IF EXISTS "Users read system templates" ON routines;
CREATE POLICY "Users read system templates"
  ON routines
  FOR SELECT
  TO authenticated
  USING (is_system_template = TRUE OR user_id = auth.uid());

-- Allow tasks belonging to system template routines to be read by all
DROP POLICY IF EXISTS "Users read system template tasks" ON tasks;
CREATE POLICY "Users read system template tasks"
  ON tasks
  FOR SELECT
  TO authenticated
  USING (
    routine_id IN (SELECT id FROM routines WHERE is_system_template = TRUE)
    OR user_id = auth.uid()
  );

-- Print column list for manual data entry reference
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'routines'
ORDER BY ordinal_position;
