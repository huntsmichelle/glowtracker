-- ============================================================
-- 005_v1_4_updates.sql
-- v1.4: Reminder notes on tasks
-- ============================================================
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. tasks — reminder_notes column
-- ────────────────────────────────────────────────────────────
-- Text shown alongside reminder notifications.
-- Useful for pre-task instructions (e.g. "don't shave beforehand").
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS reminder_notes text;
