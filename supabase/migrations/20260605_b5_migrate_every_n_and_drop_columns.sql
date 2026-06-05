-- B5: migrate existing every-N config out of routine_task_pairs into the new
-- cadence_couplings store, then drop the two columns. Apply AFTER
-- 20260605_cadence_couplings.sql.

-- Migrate: anchor = primary_task_id; dependent = the OTHER of task_a_id/task_b_id;
-- interval_n = occurrence_interval; count_mode = 'all'.
INSERT INTO cadence_couplings (user_id, anchor_task_id, dependent_task_id, interval_n, count_mode)
SELECT
  p.user_id,
  p.primary_task_id AS anchor_task_id,
  CASE WHEN p.primary_task_id = p.task_a_id THEN p.task_b_id ELSE p.task_a_id END AS dependent_task_id,
  COALESCE(p.occurrence_interval, 2) AS interval_n,
  'all' AS count_mode
FROM routine_task_pairs p
WHERE p.link_type = 'every_n_occurrences'
  AND p.primary_task_id IS NOT NULL
  AND p.occurrence_interval IS NOT NULL
ON CONFLICT (dependent_task_id) DO NOTHING;

-- Drop the now-migrated columns. link_type STAYS (load-bearing for
-- conflictDetection always_together skip).
ALTER TABLE routine_task_pairs
  DROP COLUMN IF EXISTS occurrence_interval,
  DROP COLUMN IF EXISTS primary_task_id;

NOTIFY pgrst, 'reload schema';
