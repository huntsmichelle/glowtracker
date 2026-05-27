-- ============================================================
-- service_types seed
-- Reference list of service types linked to product categories.
-- All UUIDs are deterministic (st000001-... pattern).
-- ============================================================

INSERT INTO service_types (id, name, product_category_id, sort_order) VALUES
  ('st000001-0000-0000-0000-000000000001',
   'Colorist',
   'pc000002-0000-0000-0000-000000000015',  -- Hair Colour
   10),

  ('st000001-0000-0000-0000-000000000002',
   'Hair Salon',
   'pc000001-0000-0000-0000-000000000002',  -- Hair Care
   20),

  ('st000001-0000-0000-0000-000000000003',
   'Nail Salon',
   'pc000001-0000-0000-0000-000000000003',  -- Nail Care
   30),

  ('st000001-0000-0000-0000-000000000004',
   'Aesthetician',
   'pc000001-0000-0000-0000-000000000001',  -- Skin Care
   40),

  ('st000001-0000-0000-0000-000000000005',
   'Waxing Salon',
   'pc000001-0000-0000-0000-000000000005',  -- Hair Removal
   50),

  ('st000001-0000-0000-0000-000000000006',
   'Laser Clinic',
   'pc000001-0000-0000-0000-000000000005',  -- Hair Removal
   60),

  ('st000001-0000-0000-0000-000000000007',
   'Brow & Lash Studio',
   'pc000001-0000-0000-0000-000000000006',  -- Brows & Lashes
   70),

  ('st000001-0000-0000-0000-000000000008',
   'Massage Therapist',
   'pc000001-0000-0000-0000-000000000004',  -- Body Care
   80),

  ('st000001-0000-0000-0000-000000000009',
   'Dermatologist',
   'pc000001-0000-0000-0000-000000000001',  -- Skin Care
   90),

  ('st000001-0000-0000-0000-000000000010',
   'Spa',
   NULL,
   100)

ON CONFLICT (id) DO NOTHING;
