-- Look-ahead screens (Today / Horizon / Library) all filter by
-- user_id + is_projected and sort by due_date_start. Add the composite
-- index matching that exact shape.
CREATE INDEX IF NOT EXISTS instances_user_projected_due_idx
  ON instances (user_id, is_projected, due_date_start);
