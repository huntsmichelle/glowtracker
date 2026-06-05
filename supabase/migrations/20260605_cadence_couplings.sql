-- every-N-occurrences (cadence coupling) — new relationship store + instance tether.
-- A dependent ritual occurs once every N occurrences of an anchor ritual.
-- This is task-to-task and independent of routine membership — NOT routine_task_pairs.

CREATE TABLE IF NOT EXISTS cadence_couplings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  anchor_task_id    uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  dependent_task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  interval_n        int  NOT NULL CHECK (interval_n >= 1),
  count_mode        text NOT NULL DEFAULT 'all' CHECK (count_mode IN ('all', 'kept')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  -- A dependent has at most one anchor.
  UNIQUE (dependent_task_id)
);

CREATE INDEX IF NOT EXISTS cadence_couplings_anchor_idx    ON cadence_couplings(anchor_task_id);
CREATE INDEX IF NOT EXISTS cadence_couplings_dependent_idx ON cadence_couplings(dependent_task_id);
CREATE INDEX IF NOT EXISTS cadence_couplings_user_idx      ON cadence_couplings(user_id);

ALTER TABLE cadence_couplings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own cadence_couplings"
  ON cadence_couplings FOR ALL
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Instance tether: a dependent instance points at the SPECIFIC anchor occurrence
-- it follows. NULLABLE, TETHER-ONLY (date-follow pointer — NO instance generation
-- ever reads it to spawn/regenerate). ON DELETE SET NULL implements
-- "delete anchor occurrence -> dependent keeps its date, link nulled" for free.
ALTER TABLE instances
  ADD COLUMN IF NOT EXISTS linked_anchor_instance_id uuid
    REFERENCES instances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS instances_linked_anchor_idx
  ON instances(linked_anchor_instance_id);

NOTIFY pgrst, 'reload schema';
