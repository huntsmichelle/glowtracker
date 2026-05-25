-- ============================================================
-- 006_v1_5_updates.sql
-- v1.5: Projected instances — 6-month forward scheduling
-- ============================================================
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Add 'projected' to instance_status enum
-- ────────────────────────────────────────────────────────────
-- PostgreSQL enums cannot remove values, only add them.
-- 'projected' = a forecast instance generated from the midpoint
-- interval; not yet actionable. Converted to 'upcoming' when
-- it becomes the next instance to act on.
ALTER TYPE instance_status ADD VALUE IF NOT EXISTS 'projected';

-- ────────────────────────────────────────────────────────────
-- 2. instances — is_projected column
-- ────────────────────────────────────────────────────────────
-- Boolean companion to status = 'projected'.
-- Kept as a separate column so queries can filter projected
-- instances with a simple equality check without touching the
-- enum (useful for the calendar query and bulk deletes).
ALTER TABLE instances
  ADD COLUMN IF NOT EXISTS is_projected boolean NOT NULL DEFAULT false;

-- ────────────────────────────────────────────────────────────
-- 3. Indexes for efficient projection queries
-- ────────────────────────────────────────────────────────────
-- The calendar view queries projected instances by date range
-- (typically a one-month window) and the completion handler
-- bulk-deletes all projections for a given task.

-- Partial index: only projected rows — keeps it small.
CREATE INDEX IF NOT EXISTS instances_projected_task_date_idx
  ON instances (task_id, due_date_start)
  WHERE is_projected = true;

-- Composite for the calendar range query (user + date + not skipped).
CREATE INDEX IF NOT EXISTS instances_user_date_status_idx
  ON instances (user_id, due_date_start, status);
