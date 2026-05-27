-- ============================================================
-- 019_product_expiration.sql
-- Add optional expiration date to products.
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS expires_at DATE;

CREATE INDEX IF NOT EXISTS idx_products_expires
  ON products(user_id, expires_at)
  WHERE expires_at IS NOT NULL;
