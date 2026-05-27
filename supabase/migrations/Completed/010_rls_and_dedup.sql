-- ============================================================
-- 010_rls_and_dedup.sql
-- Authoritative RLS policies for routine_task_pairs and
-- routine_conflicts; cleanup of duplicate/orphaned conflicts.
-- ============================================================

-- ── routine_task_pairs RLS ────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own routine task pairs"    ON routine_task_pairs;
DROP POLICY IF EXISTS "Users manage own routine_task_pairs"   ON routine_task_pairs;

CREATE POLICY "Users manage own routine task pairs"
  ON routine_task_pairs
  FOR ALL
  TO authenticated
  USING (
    routine_id IN (SELECT id FROM routines WHERE user_id = auth.uid())
  )
  WITH CHECK (
    routine_id IN (SELECT id FROM routines WHERE user_id = auth.uid())
  );


-- ── routine_conflicts RLS ─────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own routine conflicts"    ON routine_conflicts;

CREATE POLICY "Users manage own routine conflicts"
  ON routine_conflicts
  FOR ALL
  TO authenticated
  USING (
    routine_id IN (SELECT id FROM routines WHERE user_id = auth.uid())
  )
  WITH CHECK (
    routine_id IN (SELECT id FROM routines WHERE user_id = auth.uid())
  );


-- ── Conflict deduplication cleanup ───────────────────────────
-- Keep only the most-recent row per (pair_id, conflict_date)
DELETE FROM routine_conflicts a
USING routine_conflicts b
WHERE a.id < b.id
  AND a.pair_id    = b.pair_id
  AND a.conflict_date = b.conflict_date;

-- Remove conflicts whose instances were deleted
DELETE FROM routine_conflicts
WHERE instance_a_id NOT IN (SELECT id FROM instances)
   OR instance_b_id NOT IN (SELECT id FROM instances);

-- Remove conflicts whose pair was deleted
DELETE FROM routine_conflicts
WHERE pair_id NOT IN (SELECT id FROM routine_task_pairs);
