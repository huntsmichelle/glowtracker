-- Part A cleanup (apply AFTER web is deployed AND twice-daily instance
-- generation is verified — the generator now reads scheduled_time (AM) /
-- scheduled_time_pm (PM) instead of slot_a_time / slot_b_time).
--
-- A1: twice-daily slot times consolidated onto scheduled_time / scheduled_time_pm;
--     slot labels are hardcoded "Morning"/"Evening" in app code.
ALTER TABLE tasks
  DROP COLUMN IF EXISTS slot_a_time,
  DROP COLUMN IF EXISTS slot_b_time,
  DROP COLUMN IF EXISTS slot_a_label,
  DROP COLUMN IF EXISTS slot_b_label;

-- A2: dead column — type-only, zero reads/writes in either repo.
ALTER TABLE routine_task_pairs
  DROP COLUMN IF EXISTS occurrence_count;

-- NOT dropped here (feature storage that migrates in spec B5):
--   routine_task_pairs.occurrence_interval, routine_task_pairs.primary_task_id
-- KEEP: routine_task_pairs.link_type (load-bearing in conflictDetection).

NOTIFY pgrst, 'reload schema';
