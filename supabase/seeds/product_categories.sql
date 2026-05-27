-- ============================================================
-- product_categories seed
-- 3-level tree: top-level → subcategory → leaf type
-- All UUIDs are deterministic (pc000001-... pattern).
-- System user: db24c2d7-e677-45af-add3-a155a87c75e0
-- ============================================================

-- ── TOP-LEVEL CATEGORIES ──────────────────────────────────────

INSERT INTO product_categories (id, parent_id, name, slug, sort_order) VALUES
  ('pc000001-0000-0000-0000-000000000001', NULL, 'Skin Care',    'skin-care',    10),
  ('pc000001-0000-0000-0000-000000000002', NULL, 'Hair Care',    'hair-care',    20),
  ('pc000001-0000-0000-0000-000000000003', NULL, 'Nail Care',    'nail-care',    30),
  ('pc000001-0000-0000-0000-000000000004', NULL, 'Body Care',    'body-care',    40),
  ('pc000001-0000-0000-0000-000000000005', NULL, 'Hair Removal', 'hair-removal', 50),
  ('pc000001-0000-0000-0000-000000000006', NULL, 'Brows & Lashes','brows-lashes', 60),
  ('pc000001-0000-0000-0000-000000000007', NULL, 'Tools',        'tools',        70)
ON CONFLICT (id) DO NOTHING;

-- ── SKIN CARE SUBCATEGORIES ───────────────────────────────────

INSERT INTO product_categories (id, parent_id, name, slug, sort_order) VALUES
  ('pc000002-0000-0000-0000-000000000001', 'pc000001-0000-0000-0000-000000000001', 'Cleansers',      'cleansers',       10),
  ('pc000002-0000-0000-0000-000000000002', 'pc000001-0000-0000-0000-000000000001', 'Toners',         'toners',          20),
  ('pc000002-0000-0000-0000-000000000003', 'pc000001-0000-0000-0000-000000000001', 'Serums',         'serums',          30),
  ('pc000002-0000-0000-0000-000000000004', 'pc000001-0000-0000-0000-000000000001', 'Moisturisers',   'moisturisers',    40),
  ('pc000002-0000-0000-0000-000000000005', 'pc000001-0000-0000-0000-000000000001', 'SPF',            'spf',             50),
  ('pc000002-0000-0000-0000-000000000006', 'pc000001-0000-0000-0000-000000000001', 'Treatments',     'skin-treatments', 60),
  ('pc000002-0000-0000-0000-000000000007', 'pc000001-0000-0000-0000-000000000001', 'Eye Care',       'eye-care',        70),
  ('pc000002-0000-0000-0000-000000000008', 'pc000001-0000-0000-0000-000000000001', 'Face Masks',     'face-masks',      80)
ON CONFLICT (id) DO NOTHING;

-- ── HAIR CARE SUBCATEGORIES ───────────────────────────────────

INSERT INTO product_categories (id, parent_id, name, slug, sort_order) VALUES
  ('pc000002-0000-0000-0000-000000000011', 'pc000001-0000-0000-0000-000000000002', 'Shampoo',        'shampoo',         10),
  ('pc000002-0000-0000-0000-000000000012', 'pc000001-0000-0000-0000-000000000002', 'Conditioner',    'conditioner',     20),
  ('pc000002-0000-0000-0000-000000000013', 'pc000001-0000-0000-0000-000000000002', 'Hair Masks',     'hair-masks',      30),
  ('pc000002-0000-0000-0000-000000000014', 'pc000001-0000-0000-0000-000000000002', 'Styling',        'styling',         40),
  ('pc000002-0000-0000-0000-000000000015', 'pc000001-0000-0000-0000-000000000002', 'Hair Colour',    'hair-colour',     50),
  ('pc000002-0000-0000-0000-000000000016', 'pc000001-0000-0000-0000-000000000002', 'Scalp Care',     'scalp-care',      60),
  ('pc000002-0000-0000-0000-000000000017', 'pc000001-0000-0000-0000-000000000002', 'Hair Oil',       'hair-oil',        70)
ON CONFLICT (id) DO NOTHING;

-- ── NAIL CARE SUBCATEGORIES ───────────────────────────────────

INSERT INTO product_categories (id, parent_id, name, slug, sort_order) VALUES
  ('pc000002-0000-0000-0000-000000000021', 'pc000001-0000-0000-0000-000000000003', 'Nail Polish',    'nail-polish',     10),
  ('pc000002-0000-0000-0000-000000000022', 'pc000001-0000-0000-0000-000000000003', 'Nail Treatment', 'nail-treatment',  20),
  ('pc000002-0000-0000-0000-000000000023', 'pc000001-0000-0000-0000-000000000003', 'Cuticle Care',   'cuticle-care',    30)
ON CONFLICT (id) DO NOTHING;

-- ── BODY CARE SUBCATEGORIES ───────────────────────────────────

INSERT INTO product_categories (id, parent_id, name, slug, sort_order) VALUES
  ('pc000002-0000-0000-0000-000000000031', 'pc000001-0000-0000-0000-000000000004', 'Body Lotion',    'body-lotion',     10),
  ('pc000002-0000-0000-0000-000000000032', 'pc000001-0000-0000-0000-000000000004', 'Body Wash',      'body-wash',       20),
  ('pc000002-0000-0000-0000-000000000033', 'pc000001-0000-0000-0000-000000000004', 'Body Scrub',     'body-scrub',      30),
  ('pc000002-0000-0000-0000-000000000034', 'pc000001-0000-0000-0000-000000000004', 'Body Oil',       'body-oil',        40),
  ('pc000002-0000-0000-0000-000000000035', 'pc000001-0000-0000-0000-000000000004', 'Deodorant',      'deodorant',       50),
  ('pc000002-0000-0000-0000-000000000036', 'pc000001-0000-0000-0000-000000000004', 'Self Tan',       'self-tan',        60)
ON CONFLICT (id) DO NOTHING;

-- ── HAIR REMOVAL SUBCATEGORIES ────────────────────────────────

INSERT INTO product_categories (id, parent_id, name, slug, sort_order) VALUES
  ('pc000002-0000-0000-0000-000000000041', 'pc000001-0000-0000-0000-000000000005', 'Wax',            'wax',             10),
  ('pc000002-0000-0000-0000-000000000042', 'pc000001-0000-0000-0000-000000000005', 'Shaving',        'shaving',         20),
  ('pc000002-0000-0000-0000-000000000043', 'pc000001-0000-0000-0000-000000000005', 'Depilatory',     'depilatory',      30)
ON CONFLICT (id) DO NOTHING;

-- ── BROWS & LASHES SUBCATEGORIES ─────────────────────────────

INSERT INTO product_categories (id, parent_id, name, slug, sort_order) VALUES
  ('pc000002-0000-0000-0000-000000000051', 'pc000001-0000-0000-0000-000000000006', 'Brow Products',  'brow-products',   10),
  ('pc000002-0000-0000-0000-000000000052', 'pc000001-0000-0000-0000-000000000006', 'Lash Serums',    'lash-serums',     20),
  ('pc000002-0000-0000-0000-000000000053', 'pc000001-0000-0000-0000-000000000006', 'Tinting Kits',   'tinting-kits',    30)
ON CONFLICT (id) DO NOTHING;

-- ── TOOLS SUBCATEGORIES ───────────────────────────────────────

INSERT INTO product_categories (id, parent_id, name, slug, sort_order) VALUES
  ('pc000002-0000-0000-0000-000000000061', 'pc000001-0000-0000-0000-000000000007', 'Face Tools',     'face-tools',      10),
  ('pc000002-0000-0000-0000-000000000062', 'pc000001-0000-0000-0000-000000000007', 'Hair Tools',     'hair-tools',      20),
  ('pc000002-0000-0000-0000-000000000063', 'pc000001-0000-0000-0000-000000000007', 'Nail Tools',     'nail-tools',      30)
ON CONFLICT (id) DO NOTHING;

-- ── SKIN CARE LEAF TYPES ──────────────────────────────────────

INSERT INTO product_categories (id, parent_id, name, slug, sort_order) VALUES
  ('pc000003-0000-0000-0000-000000000001', 'pc000002-0000-0000-0000-000000000001', 'Gel Cleanser',   'gel-cleanser',    10),
  ('pc000003-0000-0000-0000-000000000002', 'pc000002-0000-0000-0000-000000000001', 'Cream Cleanser', 'cream-cleanser',  20),
  ('pc000003-0000-0000-0000-000000000003', 'pc000002-0000-0000-0000-000000000001', 'Micellar Water', 'micellar-water',  30),
  ('pc000003-0000-0000-0000-000000000004', 'pc000002-0000-0000-0000-000000000001', 'Cleansing Oil',  'cleansing-oil',   40),
  ('pc000003-0000-0000-0000-000000000011', 'pc000002-0000-0000-0000-000000000003', 'Vitamin C Serum','vitamin-c-serum', 10),
  ('pc000003-0000-0000-0000-000000000012', 'pc000002-0000-0000-0000-000000000003', 'Retinol Serum',  'retinol-serum',   20),
  ('pc000003-0000-0000-0000-000000000013', 'pc000002-0000-0000-0000-000000000003', 'Hyaluronic Acid','hyaluronic-acid', 30),
  ('pc000003-0000-0000-0000-000000000014', 'pc000002-0000-0000-0000-000000000003', 'Niacinamide',    'niacinamide',     40),
  ('pc000003-0000-0000-0000-000000000021', 'pc000002-0000-0000-0000-000000000006', 'Chemical Exfoliant','chemical-exfoliant',10),
  ('pc000003-0000-0000-0000-000000000022', 'pc000002-0000-0000-0000-000000000006', 'Physical Exfoliant','physical-exfoliant',20),
  ('pc000003-0000-0000-0000-000000000023', 'pc000002-0000-0000-0000-000000000006', 'Peel',           'peel',            30)
ON CONFLICT (id) DO NOTHING;

-- ── HAIR CARE LEAF TYPES ──────────────────────────────────────

INSERT INTO product_categories (id, parent_id, name, slug, sort_order) VALUES
  ('pc000003-0000-0000-0000-000000000031', 'pc000002-0000-0000-0000-000000000015', 'Box Colour',      'box-colour',     10),
  ('pc000003-0000-0000-0000-000000000032', 'pc000002-0000-0000-0000-000000000015', 'Root Touch-Up',   'root-touch-up',  20),
  ('pc000003-0000-0000-0000-000000000033', 'pc000002-0000-0000-0000-000000000015', 'Toner',           'hair-toner',     30),
  ('pc000003-0000-0000-0000-000000000034', 'pc000002-0000-0000-0000-000000000015', 'Developer',       'developer',      40),
  ('pc000003-0000-0000-0000-000000000041', 'pc000002-0000-0000-0000-000000000013', 'Deep Conditioner','deep-conditioner',10),
  ('pc000003-0000-0000-0000-000000000042', 'pc000002-0000-0000-0000-000000000013', 'Protein Mask',    'protein-mask',   20),
  ('pc000003-0000-0000-0000-000000000051', 'pc000002-0000-0000-0000-000000000016', 'Scalp Scrub',     'scalp-scrub',    10),
  ('pc000003-0000-0000-0000-000000000052', 'pc000002-0000-0000-0000-000000000016', 'Scalp Serum',     'scalp-serum',    20)
ON CONFLICT (id) DO NOTHING;

-- ── NAIL CARE LEAF TYPES ──────────────────────────────────────

INSERT INTO product_categories (id, parent_id, name, slug, sort_order) VALUES
  ('pc000003-0000-0000-0000-000000000061', 'pc000002-0000-0000-0000-000000000022', 'Strengthener',    'strengthener',   10),
  ('pc000003-0000-0000-0000-000000000062', 'pc000002-0000-0000-0000-000000000022', 'Ridge Filler',    'ridge-filler',   20),
  ('pc000003-0000-0000-0000-000000000063', 'pc000002-0000-0000-0000-000000000023', 'Cuticle Oil',     'cuticle-oil',    10),
  ('pc000003-0000-0000-0000-000000000064', 'pc000002-0000-0000-0000-000000000023', 'Cuticle Remover', 'cuticle-remover',20)
ON CONFLICT (id) DO NOTHING;

-- ── GENERIC SYSTEM PRODUCTS ───────────────────────────────────
-- Owned by the system user. Read-only reference products
-- users can select from the shelf / task form.

INSERT INTO products (
  id, user_id, name, brand,
  product_category_id, container_size, container_unit,
  uses_per_supply_unit, notes
) VALUES
  -- Skin Care
  ('pd000001-0000-0000-0000-000000000001',
   'db24c2d7-e677-45af-add3-a155a87c75e0',
   'Gel Cleanser', NULL,
   'pc000003-0000-0000-0000-000000000001', 150, 'ml',
   60, NULL),

  ('pd000001-0000-0000-0000-000000000002',
   'db24c2d7-e677-45af-add3-a155a87c75e0',
   'Micellar Water', NULL,
   'pc000003-0000-0000-0000-000000000003', 250, 'ml',
   100, NULL),

  ('pd000001-0000-0000-0000-000000000003',
   'db24c2d7-e677-45af-add3-a155a87c75e0',
   'Vitamin C Serum', NULL,
   'pc000003-0000-0000-0000-000000000011', 30, 'ml',
   90, NULL),

  ('pd000001-0000-0000-0000-000000000004',
   'db24c2d7-e677-45af-add3-a155a87c75e0',
   'Retinol Serum', NULL,
   'pc000003-0000-0000-0000-000000000012', 30, 'ml',
   90, NULL),

  ('pd000001-0000-0000-0000-000000000005',
   'db24c2d7-e677-45af-add3-a155a87c75e0',
   'Hyaluronic Acid Serum', NULL,
   'pc000003-0000-0000-0000-000000000013', 30, 'ml',
   90, NULL),

  ('pd000001-0000-0000-0000-000000000006',
   'db24c2d7-e677-45af-add3-a155a87c75e0',
   'Niacinamide Serum', NULL,
   'pc000003-0000-0000-0000-000000000014', 30, 'ml',
   90, NULL),

  ('pd000001-0000-0000-0000-000000000007',
   'db24c2d7-e677-45af-add3-a155a87c75e0',
   'Daily Moisturiser', NULL,
   'pc000002-0000-0000-0000-000000000004', 50, 'ml',
   50, NULL),

  ('pd000001-0000-0000-0000-000000000008',
   'db24c2d7-e677-45af-add3-a155a87c75e0',
   'SPF 50 Sunscreen', NULL,
   'pc000002-0000-0000-0000-000000000005', 50, 'ml',
   30, NULL),

  ('pd000001-0000-0000-0000-000000000009',
   'db24c2d7-e677-45af-add3-a155a87c75e0',
   'Chemical Exfoliant', NULL,
   'pc000003-0000-0000-0000-000000000021', 100, 'ml',
   40, NULL),

  ('pd000001-0000-0000-0000-000000000010',
   'db24c2d7-e677-45af-add3-a155a87c75e0',
   'Face Mask', NULL,
   'pc000002-0000-0000-0000-000000000008', 100, 'ml',
   20, NULL),

  -- Hair Care
  ('pd000001-0000-0000-0000-000000000011',
   'db24c2d7-e677-45af-add3-a155a87c75e0',
   'Shampoo', NULL,
   'pc000002-0000-0000-0000-000000000011', 300, 'ml',
   30, NULL),

  ('pd000001-0000-0000-0000-000000000012',
   'db24c2d7-e677-45af-add3-a155a87c75e0',
   'Conditioner', NULL,
   'pc000002-0000-0000-0000-000000000012', 300, 'ml',
   30, NULL),

  ('pd000001-0000-0000-0000-000000000013',
   'db24c2d7-e677-45af-add3-a155a87c75e0',
   'Deep Conditioning Mask', NULL,
   'pc000003-0000-0000-0000-000000000041', 200, 'ml',
   8, NULL),

  ('pd000001-0000-0000-0000-000000000014',
   'db24c2d7-e677-45af-add3-a155a87c75e0',
   'Box Hair Colour', NULL,
   'pc000003-0000-0000-0000-000000000031', 1, 'kit',
   1, NULL),

  ('pd000001-0000-0000-0000-000000000015',
   'db24c2d7-e677-45af-add3-a155a87c75e0',
   'Root Touch-Up Powder', NULL,
   'pc000003-0000-0000-0000-000000000032', 1, 'pot',
   30, NULL),

  ('pd000001-0000-0000-0000-000000000016',
   'db24c2d7-e677-45af-add3-a155a87c75e0',
   'Scalp Scrub', NULL,
   'pc000003-0000-0000-0000-000000000051', 200, 'ml',
   12, NULL),

  ('pd000001-0000-0000-0000-000000000017',
   'db24c2d7-e677-45af-add3-a155a87c75e0',
   'Hair Oil', NULL,
   'pc000002-0000-0000-0000-000000000017', 100, 'ml',
   40, NULL),

  -- Nail Care
  ('pd000001-0000-0000-0000-000000000018',
   'db24c2d7-e677-45af-add3-a155a87c75e0',
   'Cuticle Oil', NULL,
   'pc000003-0000-0000-0000-000000000063', 15, 'ml',
   60, NULL),

  ('pd000001-0000-0000-0000-000000000019',
   'db24c2d7-e677-45af-add3-a155a87c75e0',
   'Nail Strengthener', NULL,
   'pc000003-0000-0000-0000-000000000061', 10, 'ml',
   30, NULL),

  -- Body Care
  ('pd000001-0000-0000-0000-000000000020',
   'db24c2d7-e677-45af-add3-a155a87c75e0',
   'Body Lotion', NULL,
   'pc000002-0000-0000-0000-000000000031', 400, 'ml',
   40, NULL),

  ('pd000001-0000-0000-0000-000000000021',
   'db24c2d7-e677-45af-add3-a155a87c75e0',
   'Body Scrub', NULL,
   'pc000002-0000-0000-0000-000000000033', 300, 'ml',
   12, NULL),

  ('pd000001-0000-0000-0000-000000000022',
   'db24c2d7-e677-45af-add3-a155a87c75e0',
   'Self Tan', NULL,
   'pc000002-0000-0000-0000-000000000036', 200, 'ml',
   10, NULL),

  -- Hair Removal
  ('pd000001-0000-0000-0000-000000000023',
   'db24c2d7-e677-45af-add3-a155a87c75e0',
   'Wax Strips', NULL,
   'pc000002-0000-0000-0000-000000000041', 20, 'strips',
   20, NULL),

  ('pd000001-0000-0000-0000-000000000024',
   'db24c2d7-e677-45af-add3-a155a87c75e0',
   'Shaving Gel', NULL,
   'pc000002-0000-0000-0000-000000000042', 200, 'ml',
   20, NULL),

  -- Brows & Lashes
  ('pd000001-0000-0000-0000-000000000025',
   'db24c2d7-e677-45af-add3-a155a87c75e0',
   'Lash Serum', NULL,
   'pc000002-0000-0000-0000-000000000052', 6, 'ml',
   180, NULL),

  ('pd000001-0000-0000-0000-000000000026',
   'db24c2d7-e677-45af-add3-a155a87c75e0',
   'Brow Tinting Kit', NULL,
   'pc000002-0000-0000-0000-000000000053', 1, 'kit',
   4, NULL)

ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to read system products
DROP POLICY IF EXISTS "Users manage own products" ON products;

CREATE POLICY "Users manage own products"
  ON products FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users read system products"
  ON products FOR SELECT
  TO authenticated
  USING (user_id = 'db24c2d7-e677-45af-add3-a155a87c75e0'::uuid);
