-- ============================================================
-- 009_v2_3_features.sql
-- Phase 2 v3: Time of day, twice-daily frequency, no-conflict order
-- ============================================================
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- ============================================================


-- ── tasks: time of day (item 3) ──────────────────────────────
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS scheduled_time    TIME,        -- default time for all instances
  ADD COLUMN IF NOT EXISTS time_of_day_label TEXT;        -- e.g. "Morning", "Evening", "After shower"


-- ── tasks: frequency type (item 4) ───────────────────────────
-- frequency_type: 'interval' = existing behavior (uses interval_min/max_days)
--                'daily'     = once per day (interval = 1 day, UI convenience)
--                'twice_daily' = two slots per day (slot A + slot B)
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS frequency_type TEXT NOT NULL DEFAULT 'interval',
  ADD COLUMN IF NOT EXISTS slot_a_label   TEXT DEFAULT 'Morning',
  ADD COLUMN IF NOT EXISTS slot_a_time    TIME,
  ADD COLUMN IF NOT EXISTS slot_b_label   TEXT DEFAULT 'Evening',
  ADD COLUMN IF NOT EXISTS slot_b_time    TIME;


-- ── instances: time of day + slot ────────────────────────────
ALTER TABLE instances
  ADD COLUMN IF NOT EXISTS scheduled_time    TIME,
  ADD COLUMN IF NOT EXISTS time_of_day_label TEXT,
  ADD COLUMN IF NOT EXISTS slot              TEXT CHECK (slot IN ('a', 'b'));


-- ── routine_task_pairs: no-conflict order (item 5) ───────────
-- When two tasks are on the same day with No Conflict resolution,
-- the user can optionally specify which task should happen first.
ALTER TABLE routine_task_pairs
  ADD COLUMN IF NOT EXISTS no_conflict_order  TEXT DEFAULT 'a_first',   -- 'a_first' | 'b_first'
  ADD COLUMN IF NOT EXISTS no_conflict_time_a TIME,                      -- suggested time for task A
  ADD COLUMN IF NOT EXISTS no_conflict_time_b TIME;                      -- suggested time for task B


-- ── routine_conflicts: applied order audit (item 5) ──────────
ALTER TABLE routine_conflicts
  ADD COLUMN IF NOT EXISTS applied_order  TEXT,
  ADD COLUMN IF NOT EXISTS applied_time_a TIME,
  ADD COLUMN IF NOT EXISTS applied_time_b TIME;
