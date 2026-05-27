-- ============================================================
-- 018_phase4_product_tracking.sql
-- Phase 4: Product categories, depletion tracking, usage logs,
-- product alerts, service types.
-- ============================================================

-- ── 1. product_categories ────────────────────────────────────
-- 3-level tree: top-level → subcategory → leaf type.
-- Read-only for all authenticated users (system reference data).

CREATE TABLE IF NOT EXISTS product_categories (
  id          uuid        PRIMARY KEY,
  parent_id   uuid        REFERENCES product_categories(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  slug        text        NOT NULL UNIQUE,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_categories_parent_id_idx
  ON product_categories(parent_id);

ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read product categories"
  ON product_categories FOR SELECT
  TO authenticated
  USING (true);

-- ── 2. products: add Phase 4 columns ─────────────────────────
-- brand, product_category_id, size/unit/remaining/depletion columns.
-- notes already existed from 001 (uses_per_supply_unit → kept for compat).

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS brand                   TEXT,
  ADD COLUMN IF NOT EXISTS product_category_id     UUID   REFERENCES product_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS container_size          NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS container_unit          TEXT,
  ADD COLUMN IF NOT EXISTS remaining_amount        NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS is_depleted             BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS alert_threshold_uses    INTEGER,
  ADD COLUMN IF NOT EXISTS last_restocked_at       TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS products_product_category_id_idx
  ON products(product_category_id);

-- ── 3. task_products: add use_amount_override ─────────────────
-- Allows per-task override of how much product is consumed per use.

ALTER TABLE task_products
  ADD COLUMN IF NOT EXISTS use_amount_override NUMERIC(10,4);

-- ── 4. product_alerts ─────────────────────────────────────────
-- One row per alert event. Dismissed once actioned or restocked.

CREATE TABLE IF NOT EXISTS product_alerts (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id  uuid        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  task_id     uuid        REFERENCES tasks(id) ON DELETE SET NULL,
  instance_id uuid        REFERENCES instances(id) ON DELETE SET NULL,
  alert_type  text        NOT NULL CHECK (alert_type IN ('last_use', 'depleted')),
  status      text        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'dismissed', 'actioned')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_alerts_user_id_status_idx
  ON product_alerts(user_id, status);
CREATE INDEX IF NOT EXISTS product_alerts_product_id_idx
  ON product_alerts(product_id);

ALTER TABLE product_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own product_alerts"
  ON product_alerts FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER product_alerts_updated_at
  BEFORE UPDATE ON product_alerts
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- ── 5. product_usage_log ──────────────────────────────────────
-- Immutable append-only log of every product use event.

CREATE TABLE IF NOT EXISTS product_usage_log (
  id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id      uuid        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  task_id         uuid        REFERENCES tasks(id) ON DELETE SET NULL,
  instance_id     uuid        REFERENCES instances(id) ON DELETE SET NULL,
  amount_used     NUMERIC(10,4),
  unit            TEXT,
  remaining_after NUMERIC(10,2),
  logged_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_usage_log_user_id_idx
  ON product_usage_log(user_id);
CREATE INDEX IF NOT EXISTS product_usage_log_product_id_idx
  ON product_usage_log(product_id);

ALTER TABLE product_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own product_usage_log"
  ON product_usage_log FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 6. service_types ──────────────────────────────────────────
-- Reference list of service types (e.g., "Colorist", "Waxing Salon").
-- Linked to product_categories for contextual suggestions.

CREATE TABLE IF NOT EXISTS service_types (
  id                  uuid        PRIMARY KEY,
  name                TEXT        NOT NULL,
  product_category_id uuid        REFERENCES product_categories(id) ON DELETE SET NULL,
  sort_order          integer     NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE service_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read service types"
  ON service_types FOR SELECT
  TO authenticated
  USING (true);

-- ── 7. service_providers: add service_type_id ─────────────────

ALTER TABLE service_providers
  ADD COLUMN IF NOT EXISTS service_type_id UUID
    REFERENCES service_types(id) ON DELETE SET NULL;
