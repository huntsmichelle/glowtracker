-- ============================================================
-- 012_suggestions.sql
-- Tracks which suggestions the user has dismissed so they
-- are not shown again.
-- ============================================================

CREATE TABLE IF NOT EXISTS user_suggestion_dismissals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  suggestion_type  TEXT NOT NULL,   -- 'conflict' | 'sync'
  task_a_id        UUID REFERENCES tasks(id) ON DELETE CASCADE,
  task_b_id        UUID REFERENCES tasks(id) ON DELETE CASCADE,
  dismissed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, task_a_id, task_b_id)
);

ALTER TABLE user_suggestion_dismissals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own dismissals"
  ON user_suggestion_dismissals
  FOR ALL
  TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
