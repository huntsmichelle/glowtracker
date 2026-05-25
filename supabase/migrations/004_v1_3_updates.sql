-- ============================================================
-- 004_v1_3_updates.sql
-- v1.3: Event overrides, cost tracking
-- ============================================================
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Safe to run multiple times — all statements use IF NOT EXISTS / IF EXISTS.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. instances — event override columns
-- ────────────────────────────────────────────────────────────
-- is_event_override: marks a one-time schedule adjustment for an event
-- event_name:        user-entered label (e.g. "Vacation to Italy")
-- event_date:        the date of the event itself
-- days_before_event: how many days before the event to do the task
-- override_next_date: when resume_normal_cadence=false, the anchor date for
--                     the instance that follows this override
ALTER TABLE instances
  ADD COLUMN IF NOT EXISTS is_event_override  boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS event_name         text,
  ADD COLUMN IF NOT EXISTS event_date         date,
  ADD COLUMN IF NOT EXISTS days_before_event  integer,
  ADD COLUMN IF NOT EXISTS override_next_date date;

-- ────────────────────────────────────────────────────────────
-- 2. instances — cost column
-- ────────────────────────────────────────────────────────────
-- Actual cost recorded when the instance is completed.
-- Can differ from the task's default_cost (e.g. tip, upsell).
ALTER TABLE instances
  ADD COLUMN IF NOT EXISTS cost decimal(10,2);

-- ────────────────────────────────────────────────────────────
-- 3. tasks — default_cost column
-- ────────────────────────────────────────────────────────────
-- Typical cost per session. Pre-fills the cost field on completion.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS default_cost decimal(10,2);

-- ────────────────────────────────────────────────────────────
-- 4. RLS — no new policies needed
-- ────────────────────────────────────────────────────────────
-- Existing "instances: user_id = auth.uid()" and
-- "tasks: user_id = auth.uid()" policies cover all new columns.

-- ────────────────────────────────────────────────────────────
-- 5. Cascade delete safety check (documentation only)
-- ────────────────────────────────────────────────────────────
-- The application's deleteTask() function explicitly deletes instances
-- before deleting the task, so cascade behaviour is not relied upon
-- for correctness.  If you want DB-level enforcement, verify:
--   SELECT confdeltype FROM pg_constraint
--   WHERE conname = 'instances_task_id_fkey';
-- A result of 'c' means CASCADE is already in place.
