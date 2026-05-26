-- ============================================================
-- 007_phase2.sql
-- Phase 2: Routines (task groups), conflict detection,
-- calendar sync fields, template system.
-- ============================================================
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. Calendar sync fields on instances
-- ────────────────────────────────────────────────────────────
-- Stores what will be sent to Google Calendar in Phase 6.
-- Populated on instance completion so the event reflects
-- when the task *actually* happened, not when it was scheduled.
ALTER TABLE instances
  ADD COLUMN IF NOT EXISTS calendar_event_date date,
  ADD COLUMN IF NOT EXISTS calendar_event_cost  decimal(10,2);


-- ────────────────────────────────────────────────────────────
-- 2. routines table
-- ────────────────────────────────────────────────────────────
-- A Routine is a named collection of related Tasks.
-- is_template = true → the record is a sanitised routine
--   template (no anchor dates, no costs, no provider data).
-- is_public = true  → visible in the community template browser
--   (Phase 4 social layer; indexing it here is free).
CREATE TABLE IF NOT EXISTS routines (
  id                 uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name               text        NOT NULL,
  description        text,
  category           text,       -- optional freeform label for visual grouping
  color              text        NOT NULL DEFAULT '#EC4899',
  is_template        boolean     NOT NULL DEFAULT false,
  is_public          boolean     NOT NULL DEFAULT false,
  template_source_id uuid        REFERENCES routines(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS routines_user_id_idx
  ON routines(user_id);
CREATE INDEX IF NOT EXISTS routines_user_template_idx
  ON routines(user_id, is_template);

ALTER TABLE routines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own routines" ON routines;
CREATE POLICY "Users manage own routines"
   ON routines
   FOR ALL 
   TO authenticated
   USING (user_id = auth.uid())
   WITH CHECK (user_id = auth.uid());

CREATE TRIGGER routines_updated_at
  BEFORE UPDATE ON routines
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();


-- ────────────────────────────────────────────────────────────
-- 3. tasks — add routine_id
-- ────────────────────────────────────────────────────────────
-- A task belongs to at most one routine. Deleting a routine
-- makes its tasks standalone (SET NULL) — they are not deleted.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS routine_id uuid
    REFERENCES routines(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tasks_routine_id_idx
  ON tasks(routine_id)
  WHERE routine_id IS NOT NULL;


-- ────────────────────────────────────────────────────────────
-- 4. routine_task_pairs
-- ────────────────────────────────────────────────────────────
-- Records the relationship between every ordered pair of tasks
-- in a routine. Used to store the default conflict resolution
-- for that pair so the engine can auto-apply or prompt.
-- user_id is denormalised here for simpler RLS / querying.
CREATE TABLE IF NOT EXISTS routine_task_pairs (
  id                 uuid    PRIMARY KEY DEFAULT uuid_generate_v4(),
  routine_id         uuid    NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  user_id            uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_a_id          uuid    NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  task_b_id          uuid    NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  -- 'ask' = surface a pending conflict; the others apply automatically.
  default_resolution text    NOT NULL DEFAULT 'ask',
  default_delay_days integer,
  delay_target       text    DEFAULT 'b',  -- which task to push: 'a' or 'b'
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE(routine_id, task_a_id, task_b_id)
);

CREATE INDEX IF NOT EXISTS routine_task_pairs_routine_id_idx
  ON routine_task_pairs(routine_id);
CREATE INDEX IF NOT EXISTS routine_task_pairs_user_id_idx
  ON routine_task_pairs(user_id);

ALTER TABLE routine_task_pairs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own routine_task_pairs" ON routine_task_pairs;
CREATE POLICY "Users manage own routine_task_pairs"
   ON routine_task_pairs
   FOR ALL 
   TO authenticated
   USING (user_id = auth.uid())
   WITH CHECK (user_id = auth.uid());


-- ────────────────────────────────────────────────────────────
-- 5. routine_conflicts
-- ────────────────────────────────────────────────────────────
-- Each row represents one detected window overlap between two
-- instances belonging to a task pair in the same routine.
-- status='pending' → needs user resolution.
-- status='resolved' → auto-resolved or user confirmed.
CREATE TABLE IF NOT EXISTS routine_conflicts (
  id                     uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  routine_id             uuid        NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  user_id                uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pair_id                uuid        NOT NULL REFERENCES routine_task_pairs(id) ON DELETE CASCADE,
  instance_a_id          uuid        NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  instance_b_id          uuid        NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  conflict_date          date        NOT NULL,
  status                 text        NOT NULL DEFAULT 'pending',
  resolution             text,       -- 'do_both' | 'reset' | 'delay'
  resolved_at            timestamptz,
  resolved_by_delay_days integer,
  resolved_delay_target  text,       -- 'a' or 'b'
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS routine_conflicts_user_status_idx
  ON routine_conflicts(user_id, status);
CREATE INDEX IF NOT EXISTS routine_conflicts_routine_id_idx
  ON routine_conflicts(routine_id);
CREATE INDEX IF NOT EXISTS routine_conflicts_pair_id_idx
  ON routine_conflicts(pair_id);

ALTER TABLE routine_conflicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own routine_conflicts" ON routine_conflicts;
CREATE POLICY "Users manage own routine_conflicts"
   ON routine_conflicts
   FOR ALL 
   TO authenticated
   USING (user_id = auth.uid())
   WITH CHECK (user_id = auth.uid());
