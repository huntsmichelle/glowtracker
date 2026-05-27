-- ============================================================
-- 014_task_form_restructure.sql
-- Provider cost model, autocomplete, stub instances,
-- product cost tracking, structured reminder fields.
-- ============================================================

-- ── tasks: new columns ───────────────────────────────────────

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS provider_cost        NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS provider_phone       TEXT,
  ADD COLUMN IF NOT EXISTS autocomplete_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS prep_notes           TEXT,
  ADD COLUMN IF NOT EXISTS reminder_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reminder_value       INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS reminder_unit        TEXT    NOT NULL DEFAULT 'days';

-- ── task_products: product cost tracking ─────────────────────

ALTER TABLE task_products
  ADD COLUMN IF NOT EXISTS purchase_price     NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS uses_per_container INTEGER;

-- GENERATED ALWAYS AS columns have no IF NOT EXISTS syntax — use DO block.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_products' AND column_name = 'cost_per_use'
  ) THEN
    EXECUTE $dyn$
      ALTER TABLE task_products
        ADD COLUMN cost_per_use NUMERIC(10,4)
          GENERATED ALWAYS AS (
            CASE
              WHEN uses_per_container IS NOT NULL AND uses_per_container > 0
              THEN purchase_price / uses_per_container
              ELSE NULL
            END
          ) STORED
    $dyn$;
  END IF;
END $$;

-- ── instances: stub period + autocomplete tracking ────────────

ALTER TABLE instances
  ADD COLUMN IF NOT EXISTS is_stub_instance BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stub_date        DATE,
  ADD COLUMN IF NOT EXISTS auto_completed   BOOLEAN NOT NULL DEFAULT FALSE;

-- ── routines: system template columns (idempotent with 013) ──

ALTER TABLE routines
  ADD COLUMN IF NOT EXISTS is_system_template   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS template_category    TEXT,
  ADD COLUMN IF NOT EXISTS template_description TEXT;

-- ── RLS: allow reads of tasks belonging to system templates ──

DROP POLICY IF EXISTS "Users read system template tasks" ON tasks;
CREATE POLICY "Users read system template tasks"
  ON tasks
  FOR SELECT
  TO authenticated
  USING (
    routine_id IN (SELECT id FROM routines WHERE is_system_template = TRUE)
    OR user_id = auth.uid()
  );
