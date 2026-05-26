-- ============================================================
-- routine_templates.sql
-- System routine templates seed.
--
-- Run AFTER migration 013_system_templates.sql.
-- Safe to re-run — all inserts use ON CONFLICT DO NOTHING.
--
-- System user: 00000000-0000-0000-0000-000000000001
-- Routine IDs: 00000000-0000-0001-0000-{seq}
-- Task IDs:    00000000-0000-0002-0000-{seq}
-- Pair IDs:    00000000-0000-0003-0000-{seq}
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 0. System user
-- ────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000001'
  ) THEN
    INSERT INTO auth.users (
      id, email, role, aud,
      encrypted_password, created_at, updated_at,
      confirmation_token, email_confirmed_at, raw_app_meta_data, raw_user_meta_data
    ) VALUES (
      '00000000-0000-0000-0000-000000000001',
      'system@glowloop.internal',
      'authenticated', 'authenticated',
      '', NOW(), NOW(),
      '', NOW(), '{}', '{}'
    );
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 1. Routine templates
-- ────────────────────────────────────────────────────────────

INSERT INTO routines (
  id, user_id, name, description,
  color, is_template, is_public, is_system_template,
  template_category, template_description,
  conflict_intent, created_at, updated_at
) VALUES

-- ── Skincare ─────────────────────────────────────────────────

('00000000-0000-0001-0000-000000000001',
 '00000000-0000-0000-0000-000000000001',
 'Daily Glow', 'Morning + evening basics for healthy skin.',
 '#8ea394', TRUE, TRUE, TRUE,
 'Skincare', 'A simple morning-and-evening framework: cleanse, protect, moisturise.',
 'managed', NOW(), NOW()),

('00000000-0000-0001-0000-000000000002',
 '00000000-0000-0000-0000-000000000001',
 'Clear Skin Protocol', 'Actives-focused routine to keep breakouts in check.',
 '#93a3b1', TRUE, TRUE, TRUE,
 'Skincare', 'Salicylic acid, niacinamide, and targeted spot treatment.',
 'managed', NOW(), NOW()),

('00000000-0000-0001-0000-000000000003',
 '00000000-0000-0000-0000-000000000001',
 'Anti-Aging Ritual', 'Retinol, vitamin C, and peptides for long-term skin health.',
 '#b89880', TRUE, TRUE, TRUE,
 'Skincare', 'Pairs powerful actives with gentle timing so they don''t clash.',
 'managed', NOW(), NOW()),

('00000000-0000-0001-0000-000000000004',
 '00000000-0000-0000-0000-000000000001',
 'Sensitive Skin Care', 'Barrier-first routine for reactive or eczema-prone skin.',
 '#a0978c', TRUE, TRUE, TRUE,
 'Skincare', 'Gentle cleanse, barrier cream, and high-SPF sun protection — nothing harsh.',
 'independent', NOW(), NOW()),

-- ── Hair Care ─────────────────────────────────────────────────

('00000000-0000-0001-0000-000000000005',
 '00000000-0000-0000-0000-000000000001',
 'Healthy Hair Rhythm', 'Wash, condition, treat, and trim on a schedule.',
 '#a89aaa', TRUE, TRUE, TRUE,
 'Hair Care', 'From co-wash cadence to regular trims — keep length and health on track.',
 'independent', NOW(), NOW()),

('00000000-0000-0001-0000-000000000006',
 '00000000-0000-0000-0000-000000000001',
 'Color Care Cycle', 'Root touch-up, gloss, and bond repair for color-treated hair.',
 '#93a3b1', TRUE, TRUE, TRUE,
 'Hair Care', 'Time color appointments with bond-repair treatments for less breakage.',
 'managed', NOW(), NOW()),

('00000000-0000-0001-0000-000000000007',
 '00000000-0000-0000-0000-000000000001',
 'Scalp Health Routine', 'Scalp serum, clarifying wash, and hot-oil treatments.',
 '#8ea394', TRUE, TRUE, TRUE,
 'Hair Care', 'Addresses buildup and dryness at the root before they affect the strand.',
 'independent', NOW(), NOW()),

-- ── Body & Nails ─────────────────────────────────────────────

('00000000-0000-0001-0000-000000000008',
 '00000000-0000-0000-0000-000000000001',
 'Body Glow Ritual', 'Exfoliate, moisturise, and maintain an even tan.',
 '#b5a89a', TRUE, TRUE, TRUE,
 'Body & Nails', 'Sync exfoliation with self-tan so skin is always primed.',
 'managed', NOW(), NOW()),

('00000000-0000-0001-0000-000000000009',
 '00000000-0000-0000-0000-000000000001',
 'Nail Care Cycle', 'Shape, gel, and cuticle-oil maintenance.',
 '#a0978c', TRUE, TRUE, TRUE,
 'Body & Nails', 'Keeps nails healthy between salon visits with daily cuticle oil.',
 'independent', NOW(), NOW()),

('00000000-0000-0001-0000-000000000010',
 '00000000-0000-0000-0000-000000000001',
 'Smooth Skin Schedule', 'Coordinate waxing appointments for body, underarms, and brows.',
 '#b89880', TRUE, TRUE, TRUE,
 'Body & Nails', 'Groups all wax appointments so you can book one salon trip.',
 'managed', NOW(), NOW()),

('00000000-0000-0001-0000-000000000011',
 '00000000-0000-0000-0000-000000000001',
 'Express Body Care', 'Dry brush and body oil — five minutes, every other day.',
 '#a8a297', TRUE, TRUE, TRUE,
 'Body & Nails', 'Quick lymphatic support and skin-barrier maintenance.',
 'independent', NOW(), NOW()),

-- ── Treatments ───────────────────────────────────────────────

('00000000-0000-0001-0000-000000000012',
 '00000000-0000-0000-0000-000000000001',
 'Monthly Reset', 'Weekly masks, bi-weekly peels, monthly deep treatments.',
 '#8ea394', TRUE, TRUE, TRUE,
 'Treatments', 'A reset cadence of masks, exfoliants, and massage — scheduled to not overlap harsh actives.',
 'managed', NOW(), NOW()),

('00000000-0000-0001-0000-000000000013',
 '00000000-0000-0000-0000-000000000001',
 'Brow & Lash Focus', 'Tint, lift, and daily growth serum to define eyes.',
 '#93a3b1', TRUE, TRUE, TRUE,
 'Treatments', 'Pairs salon tint/lift appointments with daily at-home serum.',
 'managed', NOW(), NOW()),

('00000000-0000-0001-0000-000000000014',
 '00000000-0000-0000-0000-000000000001',
 'Quick Daily Essentials', 'SPF, lip care, and hand cream — the non-negotiables.',
 '#c08a6e', TRUE, TRUE, TRUE,
 'Treatments', 'Three daily habits that make the biggest long-term difference.',
 'independent', NOW(), NOW())

ON CONFLICT (id) DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- 2. Tasks for each template routine
-- ────────────────────────────────────────────────────────────

INSERT INTO tasks (
  id, user_id, name, description,
  interval_min_days, interval_max_days, default_reminder_days,
  is_active, mode, frequency_type, routine_id,
  created_at, updated_at
) VALUES

-- ── Daily Glow (001) ──
('00000000-0000-0002-0000-000000000001',
 '00000000-0000-0000-0000-000000000001',
 'Morning Cleanse', 'Gentle face wash to start the day.',
 1, 1, 0, TRUE, 'standard', 'daily',
 '00000000-0000-0001-0000-000000000001', NOW(), NOW()),

('00000000-0000-0002-0000-000000000002',
 '00000000-0000-0000-0000-000000000001',
 'SPF Application', 'Broad-spectrum SPF 30+ before going outside.',
 1, 1, 0, TRUE, 'standard', 'daily',
 '00000000-0000-0001-0000-000000000001', NOW(), NOW()),

('00000000-0000-0002-0000-000000000003',
 '00000000-0000-0000-0000-000000000001',
 'Evening Moisturiser', 'Repair and hydrate while you sleep.',
 1, 1, 0, TRUE, 'standard', 'daily',
 '00000000-0000-0001-0000-000000000001', NOW(), NOW()),

-- ── Clear Skin Protocol (002) ──
('00000000-0000-0002-0000-000000000004',
 '00000000-0000-0000-0000-000000000001',
 'Salicylic Acid Cleanse', 'BHA cleanse to clear congested pores.',
 1, 2, 0, TRUE, 'standard', 'interval',
 '00000000-0000-0001-0000-000000000002', NOW(), NOW()),

('00000000-0000-0002-0000-000000000005',
 '00000000-0000-0000-0000-000000000001',
 'Niacinamide Serum', 'Pore-minimising and oil-control serum.',
 1, 1, 0, TRUE, 'standard', 'daily',
 '00000000-0000-0001-0000-000000000002', NOW(), NOW()),

('00000000-0000-0002-0000-000000000006',
 '00000000-0000-0000-0000-000000000001',
 'Spot Treatment', 'Targeted benzoyl peroxide or sulfur paste.',
 3, 7, 0, TRUE, 'standard', 'interval',
 '00000000-0000-0001-0000-000000000002', NOW(), NOW()),

-- ── Anti-Aging Ritual (003) ──
('00000000-0000-0002-0000-000000000007',
 '00000000-0000-0000-0000-000000000001',
 'Retinol Application', 'Vitamin A derivative — start slow, build up.',
 2, 3, 0, TRUE, 'standard', 'interval',
 '00000000-0000-0001-0000-000000000003', NOW(), NOW()),

('00000000-0000-0002-0000-000000000008',
 '00000000-0000-0000-0000-000000000001',
 'Vitamin C Serum', 'Brightening antioxidant — use on non-retinol mornings.',
 1, 1, 0, TRUE, 'standard', 'daily',
 '00000000-0000-0001-0000-000000000003', NOW(), NOW()),

('00000000-0000-0002-0000-000000000009',
 '00000000-0000-0000-0000-000000000001',
 'Eye Cream', 'Peptide or caffeine formula for the orbital area.',
 1, 1, 0, TRUE, 'standard', 'daily',
 '00000000-0000-0001-0000-000000000003', NOW(), NOW()),

('00000000-0000-0002-0000-000000000010',
 '00000000-0000-0000-0000-000000000001',
 'Peptide Moisturiser', 'Locks in serums and supports collagen.',
 1, 1, 0, TRUE, 'standard', 'daily',
 '00000000-0000-0001-0000-000000000003', NOW(), NOW()),

-- ── Sensitive Skin Care (004) ──
('00000000-0000-0002-0000-000000000011',
 '00000000-0000-0000-0000-000000000001',
 'Gentle Cleanse', 'Fragrance-free, surfactant-minimal formula.',
 1, 1, 0, TRUE, 'standard', 'daily',
 '00000000-0000-0001-0000-000000000004', NOW(), NOW()),

('00000000-0000-0002-0000-000000000012',
 '00000000-0000-0000-0000-000000000001',
 'Barrier Repair Cream', 'Ceramide + fatty acid moisturiser.',
 1, 1, 0, TRUE, 'standard', 'daily',
 '00000000-0000-0001-0000-000000000004', NOW(), NOW()),

('00000000-0000-0002-0000-000000000013',
 '00000000-0000-0000-0000-000000000001',
 'SPF 50+ Sunscreen', 'Mineral sunscreen — gentle on reactive skin.',
 1, 1, 0, TRUE, 'standard', 'daily',
 '00000000-0000-0001-0000-000000000004', NOW(), NOW()),

-- ── Healthy Hair Rhythm (005) ──
('00000000-0000-0002-0000-000000000014',
 '00000000-0000-0000-0000-000000000001',
 'Shampoo & Condition', 'Full wash day with conditioner.',
 2, 3, 0, TRUE, 'standard', 'interval',
 '00000000-0000-0001-0000-000000000005', NOW(), NOW()),

('00000000-0000-0002-0000-000000000015',
 '00000000-0000-0000-0000-000000000001',
 'Deep Conditioning Mask', 'Protein or moisture mask left on for 20–30 min.',
 7, 14, 1, TRUE, 'standard', 'interval',
 '00000000-0000-0001-0000-000000000005', NOW(), NOW()),

('00000000-0000-0002-0000-000000000016',
 '00000000-0000-0000-0000-000000000001',
 'Scalp Massage', 'Fingertip or tool massage to stimulate growth.',
 3, 7, 0, TRUE, 'standard', 'interval',
 '00000000-0000-0001-0000-000000000005', NOW(), NOW()),

('00000000-0000-0002-0000-000000000017',
 '00000000-0000-0000-0000-000000000001',
 'Hair Trim', 'Dust ends or reshape for length retention.',
 42, 56, 7, TRUE, 'standard', 'interval',
 '00000000-0000-0001-0000-000000000005', NOW(), NOW()),

-- ── Color Care Cycle (006) ──
('00000000-0000-0002-0000-000000000018',
 '00000000-0000-0000-0000-000000000001',
 'Root Touch-Up', 'Single-process color or bleach at the root.',
 28, 42, 7, TRUE, 'standard', 'interval',
 '00000000-0000-0001-0000-000000000006', NOW(), NOW()),

('00000000-0000-0002-0000-000000000019',
 '00000000-0000-0000-0000-000000000001',
 'Color-Safe Gloss Treatment', 'Toning gloss to refresh vibrancy between colors.',
 14, 21, 3, TRUE, 'standard', 'interval',
 '00000000-0000-0001-0000-000000000006', NOW(), NOW()),

('00000000-0000-0002-0000-000000000020',
 '00000000-0000-0000-0000-000000000001',
 'Bond-Repair Mask', 'Olaplex-style treatment to restore broken bonds.',
 7, 14, 1, TRUE, 'standard', 'interval',
 '00000000-0000-0001-0000-000000000006', NOW(), NOW()),

-- ── Scalp Health Routine (007) ──
('00000000-0000-0002-0000-000000000021',
 '00000000-0000-0000-0000-000000000001',
 'Scalp Serum', 'Growth or balancing serum applied to the scalp.',
 3, 7, 0, TRUE, 'standard', 'interval',
 '00000000-0000-0001-0000-000000000007', NOW(), NOW()),

('00000000-0000-0002-0000-000000000022',
 '00000000-0000-0000-0000-000000000001',
 'Clarifying Shampoo', 'Removes buildup from product and minerals.',
 7, 14, 1, TRUE, 'standard', 'interval',
 '00000000-0000-0001-0000-000000000007', NOW(), NOW()),

('00000000-0000-0002-0000-000000000023',
 '00000000-0000-0000-0000-000000000001',
 'Hot Oil Treatment', 'Penetrating oil pre-poo for moisture.',
 14, 21, 2, TRUE, 'standard', 'interval',
 '00000000-0000-0001-0000-000000000007', NOW(), NOW()),

-- ── Body Glow Ritual (008) ──
('00000000-0000-0002-0000-000000000024',
 '00000000-0000-0000-0000-000000000001',
 'Body Exfoliation', 'Scrub or dry brush to prep skin.',
 5, 7, 0, TRUE, 'standard', 'interval',
 '00000000-0000-0001-0000-000000000008', NOW(), NOW()),

('00000000-0000-0002-0000-000000000025',
 '00000000-0000-0000-0000-000000000001',
 'Body Moisturiser', 'Lotion or butter applied after shower.',
 1, 1, 0, TRUE, 'standard', 'daily',
 '00000000-0000-0001-0000-000000000008', NOW(), NOW()),

('00000000-0000-0002-0000-000000000026',
 '00000000-0000-0000-0000-000000000001',
 'Self-Tanner Application', 'Apply tan the day after exfoliating.',
 5, 7, 1, TRUE, 'standard', 'interval',
 '00000000-0000-0001-0000-000000000008', NOW(), NOW()),

-- ── Nail Care Cycle (009) ──
('00000000-0000-0002-0000-000000000027',
 '00000000-0000-0000-0000-000000000001',
 'Nail File & Shape', 'File, buff, and push back cuticles.',
 7, 10, 0, TRUE, 'standard', 'interval',
 '00000000-0000-0001-0000-000000000009', NOW(), NOW()),

('00000000-0000-0002-0000-000000000028',
 '00000000-0000-0000-0000-000000000001',
 'Gel Manicure', 'Full gel application or infill.',
 14, 21, 3, TRUE, 'standard', 'interval',
 '00000000-0000-0001-0000-000000000009', NOW(), NOW()),

('00000000-0000-0002-0000-000000000029',
 '00000000-0000-0000-0000-000000000001',
 'Cuticle Oil', 'Jojoba or vitamin E oil to keep cuticles supple.',
 1, 2, 0, TRUE, 'standard', 'interval',
 '00000000-0000-0001-0000-000000000009', NOW(), NOW()),

-- ── Smooth Skin Schedule (010) ──
('00000000-0000-0002-0000-000000000030',
 '00000000-0000-0000-0000-000000000001',
 'Leg Wax', 'Full leg wax at salon or at home.',
 28, 35, 3, TRUE, 'standard', 'interval',
 '00000000-0000-0001-0000-000000000010', NOW(), NOW()),

('00000000-0000-0002-0000-000000000031',
 '00000000-0000-0000-0000-000000000001',
 'Underarm Wax', 'Underarm hair removal.',
 21, 28, 2, TRUE, 'standard', 'interval',
 '00000000-0000-0001-0000-000000000010', NOW(), NOW()),

('00000000-0000-0002-0000-000000000032',
 '00000000-0000-0000-0000-000000000001',
 'Brow Wax & Shape', 'Defined arch and clean shape.',
 21, 28, 3, TRUE, 'standard', 'interval',
 '00000000-0000-0001-0000-000000000010', NOW(), NOW()),

-- ── Express Body Care (011) ──
('00000000-0000-0002-0000-000000000033',
 '00000000-0000-0000-0000-000000000001',
 'Dry Brushing', 'Lymphatic stimulation with a natural-bristle brush.',
 2, 3, 0, TRUE, 'standard', 'interval',
 '00000000-0000-0001-0000-000000000011', NOW(), NOW()),

('00000000-0000-0002-0000-000000000034',
 '00000000-0000-0000-0000-000000000001',
 'Body Oil', 'Lightweight oil applied to damp skin after shower.',
 1, 1, 0, TRUE, 'standard', 'daily',
 '00000000-0000-0001-0000-000000000011', NOW(), NOW()),

-- ── Monthly Reset (012) ──
('00000000-0000-0002-0000-000000000035',
 '00000000-0000-0000-0000-000000000001',
 'Face Mask', 'Clay, hydrating, or brightening mask.',
 7, 7, 1, TRUE, 'standard', 'interval',
 '00000000-0000-0001-0000-000000000012', NOW(), NOW()),

('00000000-0000-0002-0000-000000000036',
 '00000000-0000-0000-0000-000000000001',
 'Chemical Exfoliant', 'AHA or enzyme peel for cell turnover.',
 7, 14, 1, TRUE, 'standard', 'interval',
 '00000000-0000-0001-0000-000000000012', NOW(), NOW()),

('00000000-0000-0002-0000-000000000037',
 '00000000-0000-0000-0000-000000000001',
 'Hair Mask', 'Intensive conditioning treatment.',
 14, 14, 2, TRUE, 'standard', 'interval',
 '00000000-0000-0001-0000-000000000012', NOW(), NOW()),

('00000000-0000-0002-0000-000000000038',
 '00000000-0000-0000-0000-000000000001',
 'Facial Massage', 'Gua sha or roller to lift and depuff.',
 7, 7, 0, TRUE, 'standard', 'interval',
 '00000000-0000-0001-0000-000000000012', NOW(), NOW()),

-- ── Brow & Lash Focus (013) ──
('00000000-0000-0002-0000-000000000039',
 '00000000-0000-0000-0000-000000000001',
 'Brow Tint', 'Henna or semi-permanent tint.',
 28, 35, 5, TRUE, 'standard', 'interval',
 '00000000-0000-0001-0000-000000000013', NOW(), NOW()),

('00000000-0000-0002-0000-000000000040',
 '00000000-0000-0000-0000-000000000001',
 'Lash Lift & Tint', 'Salon lift to curl and define natural lashes.',
 42, 56, 7, TRUE, 'standard', 'interval',
 '00000000-0000-0001-0000-000000000013', NOW(), NOW()),

('00000000-0000-0002-0000-000000000041',
 '00000000-0000-0000-0000-000000000001',
 'Lash Growth Serum', 'Daily serum applied to the lash line.',
 1, 1, 0, TRUE, 'standard', 'daily',
 '00000000-0000-0001-0000-000000000013', NOW(), NOW()),

('00000000-0000-0002-0000-000000000042',
 '00000000-0000-0000-0000-000000000001',
 'Brow Shaping', 'Tweeze, thread, or razor maintenance between tints.',
 14, 21, 2, TRUE, 'standard', 'interval',
 '00000000-0000-0001-0000-000000000013', NOW(), NOW()),

-- ── Quick Daily Essentials (014) ──
('00000000-0000-0002-0000-000000000043',
 '00000000-0000-0000-0000-000000000001',
 'SPF', 'Sunscreen — every single day.',
 1, 1, 0, TRUE, 'standard', 'daily',
 '00000000-0000-0001-0000-000000000014', NOW(), NOW()),

('00000000-0000-0002-0000-000000000044',
 '00000000-0000-0000-0000-000000000001',
 'Lip Care', 'Balm or treatment with SPF.',
 1, 1, 0, TRUE, 'standard', 'daily',
 '00000000-0000-0001-0000-000000000014', NOW(), NOW()),

('00000000-0000-0002-0000-000000000045',
 '00000000-0000-0000-0000-000000000001',
 'Hand Cream', 'Moisturising hand cream after washing.',
 1, 1, 0, TRUE, 'standard', 'daily',
 '00000000-0000-0001-0000-000000000014', NOW(), NOW())

ON CONFLICT (id) DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- 3. Routine task pairs (managed-intent routines only)
-- ────────────────────────────────────────────────────────────

INSERT INTO routine_task_pairs (
  id, routine_id, user_id,
  task_a_id, task_b_id,
  default_resolution, proximity_enabled, proximity_resolution,
  created_at
) VALUES

-- Daily Glow: SPF conflicts with Evening Moisturiser (different times)
('00000000-0000-0003-0000-000000000001',
 '00000000-0000-0001-0000-000000000001',
 '00000000-0000-0000-0000-000000000001',
 '00000000-0000-0002-0000-000000000002',
 '00000000-0000-0002-0000-000000000003',
 'no_conflict', FALSE, 'ask', NOW()),

-- Anti-Aging: Retinol must not be same day as Vitamin C
('00000000-0000-0003-0000-000000000002',
 '00000000-0000-0001-0000-000000000003',
 '00000000-0000-0000-0000-000000000001',
 '00000000-0000-0002-0000-000000000007',
 '00000000-0000-0002-0000-000000000008',
 'no_conflict', TRUE, 'looks_good', NOW()),

-- Color Care: Root touch-up should happen before or same time as gloss
('00000000-0000-0003-0000-000000000003',
 '00000000-0000-0001-0000-000000000006',
 '00000000-0000-0000-0000-000000000001',
 '00000000-0000-0002-0000-000000000018',
 '00000000-0000-0002-0000-000000000019',
 'auto_adjust', TRUE, 'auto_adjust', NOW()),

-- Body Glow: Exfoliation must come before self-tanner
('00000000-0000-0003-0000-000000000004',
 '00000000-0000-0001-0000-000000000008',
 '00000000-0000-0000-0000-000000000001',
 '00000000-0000-0002-0000-000000000024',
 '00000000-0000-0002-0000-000000000026',
 'auto_adjust', TRUE, 'looks_good', NOW()),

-- Smooth Skin: Leg + underarm wax should land same day when possible
('00000000-0000-0003-0000-000000000005',
 '00000000-0000-0001-0000-000000000010',
 '00000000-0000-0000-0000-000000000001',
 '00000000-0000-0002-0000-000000000030',
 '00000000-0000-0002-0000-000000000031',
 'no_conflict', TRUE, 'looks_good', NOW()),

-- Monthly Reset: Chemical peel must not land same day as face mask
('00000000-0000-0003-0000-000000000006',
 '00000000-0000-0001-0000-000000000012',
 '00000000-0000-0000-0000-000000000001',
 '00000000-0000-0002-0000-000000000035',
 '00000000-0000-0002-0000-000000000036',
 'skip_one', TRUE, 'ask', NOW()),

-- Brow & Lash: Brow tint and lash lift should not land same week
('00000000-0000-0003-0000-000000000007',
 '00000000-0000-0001-0000-000000000013',
 '00000000-0000-0000-0000-000000000001',
 '00000000-0000-0002-0000-000000000039',
 '00000000-0000-0002-0000-000000000040',
 'ask', TRUE, 'remind_closer', NOW())

ON CONFLICT (id) DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- 4. Denormalised task count
-- ────────────────────────────────────────────────────────────

UPDATE routines SET template_task_count = (
  SELECT COUNT(*) FROM tasks WHERE tasks.routine_id = routines.id
)
WHERE is_system_template = TRUE;
