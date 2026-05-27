-- ============================================================
-- 002_phase1_5_updates.sql
-- Phase 1.5: Rename core concepts, add countdown mode,
-- flexible intervals, and product URL field.
--
-- HOW TO RUN:
--   Copy this entire file into the Supabase SQL Editor
--   (Database > SQL Editor > New query) and click Run.
--   Safe to run on a fresh database or one with existing data.
-- ============================================================


-- ============================================================
-- SECTION 1: Rename tables
--   series          → routines
--   occurrences     → tasks
--   series_products → routine_products
--   linked_series   → linked_routines
-- ============================================================

ALTER TABLE series           RENAME TO routines;
ALTER TABLE occurrences      RENAME TO tasks;
ALTER TABLE series_products  RENAME TO routine_products;
ALTER TABLE linked_series    RENAME TO linked_routines;


-- ============================================================
-- SECTION 2: Rename foreign key columns
--   Every table that had a series_id column gets routine_id.
--   linked_series column names are updated to match.
-- ============================================================

-- tasks (was occurrences)
ALTER TABLE tasks RENAME COLUMN series_id TO routine_id;

-- routine_products (was series_products)
ALTER TABLE routine_products RENAME COLUMN series_id TO routine_id;

-- prep_steps
ALTER TABLE prep_steps RENAME COLUMN series_id TO routine_id;

-- linked_routines (was linked_series)
ALTER TABLE linked_routines RENAME COLUMN series_a_id TO routine_a_id;
ALTER TABLE linked_routines RENAME COLUMN series_b_id TO routine_b_id;

-- link_resolution_rules
ALTER TABLE link_resolution_rules RENAME COLUMN linked_series_id  TO linked_routine_id;
ALTER TABLE link_resolution_rules RENAME COLUMN which_series_delays TO which_routine_delays;


-- ============================================================
-- SECTION 3: New columns on routines — countdown mode
--
--   mode                'standard' (default) or 'countdown'
--   target_date         The event date the user is preparing for
--   target_label        A friendly name for the event (e.g. "Wedding")
--   days_before_target  How many days before target the last task lands
--   continue_after_target
--                       If true, switches to standard mode after target passes
--   initial_anchor_date Used at creation when user says "I last did this on X"
--                       Anchors the first task window instead of using today
-- ============================================================

ALTER TABLE routines
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'standard'
    CHECK (mode IN ('standard', 'countdown'));

ALTER TABLE routines
  ADD COLUMN IF NOT EXISTS target_date date;

ALTER TABLE routines
  ADD COLUMN IF NOT EXISTS target_label text;

ALTER TABLE routines
  ADD COLUMN IF NOT EXISTS days_before_target int DEFAULT 7;

ALTER TABLE routines
  ADD COLUMN IF NOT EXISTS continue_after_target boolean NOT NULL DEFAULT true;

ALTER TABLE routines
  ADD COLUMN IF NOT EXISTS initial_anchor_date date;


-- ============================================================
-- SECTION 4: Add product_url to products
--   Nullable — not every product will have a link.
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_url text;


-- ============================================================
-- SECTION 5: Rename and recreate triggers
--   The table rename keeps existing triggers firing, but we
--   drop the old names and create descriptive new ones.
-- ============================================================

DROP TRIGGER IF EXISTS series_updated_at     ON routines;
DROP TRIGGER IF EXISTS occurrences_updated_at ON tasks;

CREATE TRIGGER routines_updated_at
  BEFORE UPDATE ON routines
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();


-- ============================================================
-- SECTION 6: Update Row Level Security policies
--   Drop the old policy names (attached to the renamed tables)
--   and recreate them with names that match the new terminology.
-- ============================================================

-- routines (was series)
DROP POLICY IF EXISTS "Users manage own series"    ON routines;
CREATE POLICY "Users manage own routines"
  ON routines FOR ALL USING (user_id = auth.uid());

-- tasks (was occurrences)
DROP POLICY IF EXISTS "Users manage own occurrences" ON tasks;
CREATE POLICY "Users manage own tasks"
  ON tasks FOR ALL USING (user_id = auth.uid());

-- routine_products (was series_products)
DROP POLICY IF EXISTS "Users manage own series_products" ON routine_products;
CREATE POLICY "Users manage own routine_products"
  ON routine_products FOR ALL USING (user_id = auth.uid());

-- linked_routines (was linked_series)
DROP POLICY IF EXISTS "Users manage own linked_series" ON linked_routines;
CREATE POLICY "Users manage own linked_routines"
  ON linked_routines FOR ALL USING (user_id = auth.uid());


-- ============================================================
-- SECTION 7: Rename indexes for clarity
--   These are cosmetic — indexes still work after a table rename.
-- ============================================================

ALTER INDEX IF EXISTS series_user_id_idx         RENAME TO routines_user_id_idx;
ALTER INDEX IF EXISTS series_category_id_idx     RENAME TO routines_category_id_idx;
ALTER INDEX IF EXISTS occurrences_series_id_idx  RENAME TO tasks_routine_id_idx;
ALTER INDEX IF EXISTS occurrences_user_id_idx    RENAME TO tasks_user_id_idx;
ALTER INDEX IF EXISTS occurrences_status_idx     RENAME TO tasks_status_idx;
ALTER INDEX IF EXISTS occurrences_due_date_start_idx RENAME TO tasks_due_date_start_idx;
ALTER INDEX IF EXISTS series_products_series_id_idx  RENAME TO routine_products_routine_id_idx;
ALTER INDEX IF EXISTS series_products_product_id_idx RENAME TO routine_products_product_id_idx;


-- ============================================================
-- SECTION 8: Data migration notes
--
--   interval_min_days / interval_max_days were already stored
--   in DAYS in the original schema, so no numeric conversion
--   is needed here.
--
--   Existing rows get mode = 'standard' via the column default,
--   which correctly represents their behavior.
--
--   The occurrence_status enum is reused as-is; the type name
--   in the database does not need to match the TypeScript alias.
-- ============================================================

-- Nothing further to migrate. Schema update complete.
