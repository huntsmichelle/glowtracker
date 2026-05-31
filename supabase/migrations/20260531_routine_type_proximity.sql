-- Add routine_type to routines
ALTER TABLE routines
  ADD COLUMN IF NOT EXISTS routine_type TEXT
  CHECK (routine_type IN ('maintenance', 'event_prep', 'goal_based'));

-- Add proximity before/after columns to routine_task_pairs
ALTER TABLE routine_task_pairs
  ADD COLUMN IF NOT EXISTS proximity_days_before INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS proximity_days_after  INTEGER DEFAULT NULL;

-- Back-fill from existing proximity_days
UPDATE routine_task_pairs
SET
  proximity_days_before = proximity_days,
  proximity_days_after  = proximity_days
WHERE proximity_days IS NOT NULL
  AND proximity_days_before IS NULL;

NOTIFY pgrst, 'reload schema';
