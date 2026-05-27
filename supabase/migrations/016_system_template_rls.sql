-- ============================================================
-- 016_system_template_rls.sql
-- Ensures system templates are readable by all authenticated users.
-- Safe to re-run.
-- ============================================================

-- Routines: allow all authenticated users to read system templates
DROP POLICY IF EXISTS "Users read system templates" ON routines;
CREATE POLICY "Users read system templates"
  ON routines FOR SELECT TO authenticated
  USING (is_system_template = TRUE OR user_id = auth.uid());

-- Tasks: allow reading tasks that belong to system template routines
DROP POLICY IF EXISTS "Users read system template tasks" ON tasks;
CREATE POLICY "Users read system template tasks"
  ON tasks FOR SELECT TO authenticated
  USING (
    routine_id IN (SELECT id FROM routines WHERE is_system_template = TRUE)
    OR user_id = auth.uid()
  );
