-- ============================================================
-- 003_v1_2_updates.sql
-- v1.2: Rename routines→tasks, tasks→instances; add custom
-- categories, service providers, and expanded product fields.
--
-- Terminology after this migration:
--   "task"     = the recurring series (was "routine")
--   "instance" = a single scheduled occurrence (was "task")
--
-- HOW TO RUN:
--   Copy this entire file into the Supabase SQL Editor
--   (Database > SQL Editor > New query) and click Run.
--   Requires 001 and 002 migrations to have been run first.
-- ============================================================


-- ============================================================
-- SECTION 1: Rename enum type
--   occurrence_status → instance_status
--   (Postgres 14+ supports direct enum rename)
-- ============================================================

ALTER TYPE occurrence_status RENAME TO instance_status;


-- ============================================================
-- SECTION 2: Rename tables
--   IMPORTANT: rename the current 'tasks' table FIRST to free
--   up the name before renaming 'routines' → 'tasks'.
-- ============================================================

-- 2a. Free the name: current task occurrences become instances
ALTER TABLE tasks RENAME TO instances;

-- 2b. Rename the recurring series table
ALTER TABLE routines RENAME TO tasks;

-- 2c. Junction and phase-4 tables
ALTER TABLE routine_products RENAME TO task_products;
ALTER TABLE linked_routines  RENAME TO linked_tasks;


-- ============================================================
-- SECTION 3: Rename foreign key columns
--   Every routine_id reference becomes task_id.
-- ============================================================

-- instances (was tasks): routine_id → task_id
ALTER TABLE instances RENAME COLUMN routine_id TO task_id;

-- task_products (was routine_products): routine_id → task_id
ALTER TABLE task_products RENAME COLUMN routine_id TO task_id;

-- prep_steps
ALTER TABLE prep_steps RENAME COLUMN routine_id TO task_id;

-- linked_tasks (was linked_routines)
ALTER TABLE linked_tasks RENAME COLUMN routine_a_id TO task_a_id;
ALTER TABLE linked_tasks RENAME COLUMN routine_b_id TO task_b_id;

-- link_resolution_rules
ALTER TABLE link_resolution_rules
  RENAME COLUMN linked_routine_id TO linked_task_id;
ALTER TABLE link_resolution_rules
  RENAME COLUMN which_routine_delays TO which_task_delays;


-- ============================================================
-- SECTION 4: New columns — task_products
--   track_usage: whether supply consumption is tracked for
--   this product on this task. Disabled in the UI for now but
--   the column is live so Phase 2 can wire it up.
-- ============================================================

ALTER TABLE task_products
  ADD COLUMN IF NOT EXISTS track_usage boolean NOT NULL DEFAULT false;


-- ============================================================
-- SECTION 5: New columns — products
--   product_url was added in 002; no-op if already present.
--   uses_per_supply_unit already existed from 001.
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS product_url text;


-- ============================================================
-- SECTION 6: Create service_providers table
--   Stores the salons, clinics, or professionals associated
--   with a task. Linked to tasks via service_provider_id.
--   category_id allows auto-suggesting providers when a user
--   starts a new task in the same category.
-- ============================================================

CREATE TABLE service_providers (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  phone        text,
  website_url  text,
  address      text,
  category_id  uuid references categories(id) on delete set null,
  created_at   timestamptz default now() not null,
  updated_at   timestamptz default now() not null
);

CREATE INDEX service_providers_user_id_idx      ON service_providers(user_id);
CREATE INDEX service_providers_category_id_idx  ON service_providers(category_id);

ALTER TABLE service_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own service_providers"
  ON service_providers FOR ALL USING (user_id = auth.uid());

CREATE TRIGGER service_providers_updated_at
  BEFORE UPDATE ON service_providers
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();


-- ============================================================
-- SECTION 7: Add service_provider_id to tasks
--   Nullable — a task doesn't have to have a provider.
--   ON DELETE SET NULL so deleting a provider doesn't delete
--   the task.
-- ============================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS service_provider_id uuid
    REFERENCES service_providers(id) ON DELETE SET NULL;


-- ============================================================
-- SECTION 8: Rename indexes
--   Do the old-instance indexes FIRST to avoid name collisions
--   when renaming the old-routines indexes to tasks_*.
-- ============================================================

-- Old instance indexes (were tasks_*)
ALTER INDEX IF EXISTS tasks_routine_id_idx    RENAME TO instances_task_id_idx;
ALTER INDEX IF EXISTS tasks_user_id_idx       RENAME TO instances_user_id_idx;
ALTER INDEX IF EXISTS tasks_status_idx        RENAME TO instances_status_idx;
ALTER INDEX IF EXISTS tasks_due_date_start_idx RENAME TO instances_due_date_start_idx;

-- Old routine indexes (were routines_*)
ALTER INDEX IF EXISTS routines_user_id_idx     RENAME TO tasks_user_id_idx;
ALTER INDEX IF EXISTS routines_category_id_idx RENAME TO tasks_category_id_idx;

-- Old junction indexes (were routine_products_*)
ALTER INDEX IF EXISTS routine_products_routine_id_idx RENAME TO task_products_task_id_idx;
ALTER INDEX IF EXISTS routine_products_product_id_idx RENAME TO task_products_product_id_idx;


-- ============================================================
-- SECTION 9: Recreate triggers with correct names
--   PostgreSQL can't rename triggers; drop and recreate.
-- ============================================================

-- instances (formerly had trigger named 'tasks_updated_at')
DROP TRIGGER IF EXISTS tasks_updated_at ON instances;
CREATE TRIGGER instances_updated_at
  BEFORE UPDATE ON instances
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- tasks (formerly had trigger named 'routines_updated_at')
DROP TRIGGER IF EXISTS routines_updated_at ON tasks;
CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();


-- ============================================================
-- SECTION 10: Update RLS policies
--   Drop old names (attached to the renamed tables) and
--   recreate with names matching the new terminology.
-- ============================================================

-- tasks table (was routines)
DROP POLICY IF EXISTS "Users manage own routines" ON tasks;
CREATE POLICY "Users manage own tasks"
  ON tasks FOR ALL USING (user_id = auth.uid());

-- instances table (was tasks)
DROP POLICY IF EXISTS "Users manage own tasks" ON instances;
CREATE POLICY "Users manage own instances"
  ON instances FOR ALL USING (user_id = auth.uid());

-- task_products (was routine_products)
DROP POLICY IF EXISTS "Users manage own routine_products" ON task_products;
CREATE POLICY "Users manage own task_products"
  ON task_products FOR ALL USING (user_id = auth.uid());

-- linked_tasks (was linked_routines)
DROP POLICY IF EXISTS "Users manage own linked_routines" ON linked_tasks;
CREATE POLICY "Users manage own linked_tasks"
  ON linked_tasks FOR ALL USING (user_id = auth.uid());

-- categories: re-state policies explicitly for clarity
-- (columns user_id and is_default already existed from 001;
--  the existing seeded rows already have is_default = true)
DROP POLICY IF EXISTS "Users see own + default categories" ON categories;
CREATE POLICY "Users see default and own categories"
  ON categories FOR SELECT
  USING (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS "Users manage own categories" ON categories;
CREATE POLICY "Users manage own categories"
  ON categories FOR ALL
  USING (user_id = auth.uid());


-- ============================================================
-- SECTION 11: Phase 2 — Routines (linked task groups)
--   The word "Routine" is RESERVED for Phase 2, where it will
--   mean a named collection of related tasks (e.g., a "Hair
--   Color Routine" that groups Coloring, Touch-up, and Mask).
--
--   When Phase 2 is built, add:
--     CREATE TABLE routines (
--       id uuid primary key default uuid_generate_v4(),
--       user_id uuid not null references auth.users(id),
--       name text not null,
--       description text,
--       created_at timestamptz default now() not null,
--       updated_at timestamptz default now() not null
--     );
--     ALTER TABLE tasks ADD COLUMN routine_id uuid
--       REFERENCES routines(id) ON DELETE SET NULL;
--
--   This is intentionally NOT done in v1.2 — nothing in the
--   current schema conflicts with adding it later.
-- ============================================================

-- Nothing to create here — Phase 2 placeholder only.
