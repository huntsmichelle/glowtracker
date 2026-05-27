-- ============================================================
-- 008_v2_conflict_updates.sql
-- Phase 2 v2: Add missing columns for extended conflict resolution
-- types (auto_adjust direction/snap-back, skip_one target) and
-- the instance snap-back audit field.
--
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- ============================================================


-- ── routine_task_pairs: new resolution option columns ────────
-- These columns support the auto_adjust and skip_one rule types
-- added in the v2 conflict resolution rewrite.
ALTER TABLE routine_task_pairs
  ADD COLUMN IF NOT EXISTS adjust_direction  text    DEFAULT 'forward',  -- 'forward' | 'back'
  ADD COLUMN IF NOT EXISTS adjust_snap_back  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS skip_target       text    DEFAULT 'b';         -- 'a' | 'b'


-- ── routine_conflicts: audit columns for v2 resolution types ──
ALTER TABLE routine_conflicts
  ADD COLUMN IF NOT EXISTS adjust_direction  text,    -- direction applied when auto_adjust resolved
  ADD COLUMN IF NOT EXISTS adjust_snap_back  boolean, -- snap-back applied when auto_adjust resolved
  ADD COLUMN IF NOT EXISTS skip_target       text;    -- which task was skipped in skip_one resolution


-- ── instances: snap-back audit ────────────────────────────────
-- Stores the original scheduled start before a one-time
-- auto_adjust nudge. completeInstance() uses it to reanchor
-- projections to the original rhythm (not the adjusted date).
ALTER TABLE instances
  ADD COLUMN IF NOT EXISTS original_scheduled_date date;


-- ── routine_task_pairs: rebuild RLS with explicit WITH CHECK ──
-- The original policy (007) used USING only, which some versions
-- of PostgREST treat ambiguously for upsert. Drop and recreate
-- with an explicit WITH CHECK so upserts always pass correctly.
DROP POLICY IF EXISTS "Users manage own routine_task_pairs" ON routine_task_pairs;

CREATE POLICY "Users manage own routine task pairs"
  ON routine_task_pairs
  FOR ALL
  TO authenticated
  USING (
    routine_id IN (SELECT id FROM routines WHERE user_id = auth.uid())
  )
  WITH CHECK (
    routine_id IN (SELECT id FROM routines WHERE user_id = auth.uid())
  );
