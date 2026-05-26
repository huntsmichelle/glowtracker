-- ============================================================
-- 011_common_tasks.sql
-- Reference tables for common beauty/wellness tasks and their
-- relationships (conflicts + sync suggestions).
-- ============================================================

-- ── Tables ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS common_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,
  interval_min_days INTEGER,
  interval_max_days INTEGER,
  description     TEXT,
  prep_steps      TEXT,
  suggested_notes TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS common_task_relationships (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_a_name       TEXT NOT NULL,
  task_b_name       TEXT NOT NULL,
  relationship_type TEXT NOT NULL, -- 'conflict' | 'sync'
  suggestion_text   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Read-only for all authenticated users (reference data)
ALTER TABLE common_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read common tasks"
  ON common_tasks FOR SELECT TO authenticated USING (true);

ALTER TABLE common_task_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read common task relationships"
  ON common_task_relationships FOR SELECT TO authenticated USING (true);


-- ── Seed: common_tasks ────────────────────────────────────────

INSERT INTO common_tasks (name, category, interval_min_days, interval_max_days, prep_steps, suggested_notes) VALUES
('Botox / Neurotoxin',            'Skin',            84,  120, NULL, 'No rubbing or massaging treated areas for 24 hrs; no lying down for 2–4 hrs after.'),
('Classic Facial',                'Skin',            28,   56, 'Arrive makeup-free if possible.', NULL),
('HydraFacial',                   'Skin',            30,   56, 'Stop retinol and peels about 3 days before; avoid waxing or shaving treated area 24 hrs before.', 'Avoid retinol, clay masks, peels, and salicylic acid for about 3 days after.'),
('Chemical Peel',                 'Skin',            28,   42, NULL, 'Avoid unprotected sun; pause actives, retinoids, and exfoliants as instructed.'),
('Microneedling',                 'Skin',            28,   42, NULL, 'Avoid harsh products and sun for several days; avoid sweating 24 hrs after; skin may be red or sensitive for up to a week.'),
('Microdermabrasion',             'Skin',            28,   42, NULL, 'Avoid direct sun for at least 7 days after.'),
('At-Home Retinoid Routine',      'Skin',             1,    2, NULL, 'Do not combine aggressively with exfoliants on the same night.'),
('At-Home Exfoliation / AHA-BHA', 'Skin',             1,    7, NULL, 'Do not combine aggressively with retinoids on the same night.'),
('Laser Hair Removal',            'Hair Removal',    28,   56, 'Stop waxing, plucking, and electrolysis at least 4 weeks before; shave the day before; avoid sun and tanning.', NULL),
('Waxing / Sugaring',             'Hair Removal',    21,   42, NULL, NULL),
('Threading / Brow Wax',          'Brows & Lashes',  21,   35, NULL, 'Avoid spray tan immediately before brow shaping — it can lift the tan.'),
('Brow Tint',                     'Brows & Lashes',  21,   42, NULL, 'Avoid oil-based cleansers immediately after; avoid peels or abrasive treatments near brows.'),
('Brow Lamination',               'Brows & Lashes',  35,   56, NULL, 'Keep brows dry for 24 hrs; avoid sunbeds, saunas, steam, and pools for 48 hrs.'),
('Lash Extensions Fill',          'Brows & Lashes',  14,   21, 'Arrive with clean lashes; no eye makeup or oils.', 'Avoid water for 24 hrs and steam or heat for the first 1–2 days; no rubbing or pulling lashes.'),
('Lash Lift / Tint',              'Brows & Lashes',  42,   56, 'Avoid eye makeup and oils day of.', 'Keep lashes dry and steam-free for 24 hrs; avoid oil-based products early on.'),
('Manicure / Gel Manicure',       'Nails',           14,   21, NULL, NULL),
('Pedicure',                      'Nails',           21,   42, 'Do not shave legs right before; avoid if you have cuts, blisters, or infection.', NULL),
('Haircut / Trim',                'Hair',            70,  120, NULL, NULL),
('Root Color Touch-Up',           'Hair',            28,   56, 'Clarify a few days before if there is heavy product buildup.', NULL),
('Highlights / Balayage',         'Hair',            56,  112, 'Clarify a few days before if there is heavy product buildup.', NULL),
('Gloss / Toner',                 'Hair',            28,   56, NULL, 'Avoid clarifying shampoo right after; use color-safe products.'),
('Keratin / Brazilian Blowout',   'Hair',            84,  180, NULL, 'Avoid washing or wetting hair for 48–72 hrs; avoid humidity, sweat, swimming, and clips or ponytails during the set window.'),
('Color Mask',                    'Hair',             7,    7, NULL, NULL),
('Spray Tan / Self-Tan',          'Skin',             7,   10, 'Exfoliate and shave or wax at least 8–24 hrs before; arrive product-free; wear loose dark clothing.', 'Do nails before tan; avoid water, sweat, and tight clothes until first rinse.')
ON CONFLICT DO NOTHING;


-- ── Seed: common_task_relationships ──────────────────────────

INSERT INTO common_task_relationships (task_a_name, task_b_name, relationship_type, suggestion_text) VALUES
-- Botox conflicts
('Botox / Neurotoxin', 'Classic Facial',  'conflict', 'Facials and Botox may interfere — consider spacing these at least 2 weeks apart.'),
('Botox / Neurotoxin', 'HydraFacial',     'conflict', 'HydraFacial and Botox may interfere — consider spacing these at least 2 weeks apart.'),
-- Facial conflicts
('Classic Facial', 'HydraFacial',         'conflict', 'Two facial treatments on the same day can over-sensitize skin — these are typically not done together.'),
('Classic Facial', 'Chemical Peel',       'conflict', 'Facial and chemical peel on the same day can over-sensitize skin.'),
('Classic Facial', 'Microneedling',       'conflict', 'Facials and microneedling should not be done on the same day.'),
('Classic Facial', 'Microdermabrasion',   'conflict', 'Facial and microdermabrasion should not be done on the same day.'),
-- HydraFacial conflicts
('HydraFacial', 'Chemical Peel',          'conflict', 'HydraFacial and chemical peels should not be done on the same day.'),
('HydraFacial', 'Laser Hair Removal',     'conflict', 'HydraFacial and laser treatments should not be done on the same day.'),
('HydraFacial', 'Microneedling',          'conflict', 'HydraFacial and microneedling should not be done on the same day.'),
-- Peel conflicts
('Chemical Peel', 'Microneedling',        'conflict', 'Chemical peel and microneedling should not be done on the same day.'),
('Chemical Peel', 'Microdermabrasion',    'conflict', 'Chemical peel and microdermabrasion should not be done on the same day.'),
-- Retinoid conflicts
('At-Home Retinoid Routine', 'Microneedling',         'conflict', 'Retinoids should be paused before microneedling — these conflict.'),
('At-Home Retinoid Routine', 'Waxing / Sugaring',     'conflict', 'Retinoids can sensitize skin — avoid waxing on or near days you use retinoids.'),
('At-Home Retinoid Routine', 'Chemical Peel',         'conflict', 'Retinoids and peels should not be used on the same day.'),
('At-Home Retinoid Routine', 'Laser Hair Removal',    'conflict', 'Retinoids should be paused before laser — these conflict.'),
('At-Home Retinoid Routine', 'Classic Facial',        'conflict', 'Pause retinoids before facials — these conflict.'),
('At-Home Retinoid Routine', 'Threading / Brow Wax',  'conflict', 'Retinoids sensitize skin — avoid brow waxing or threading on days you use retinoids.'),
('At-Home Retinoid Routine', 'Brow Lamination',       'conflict', 'Pause retinoids before brow lamination — skin sensitization can affect results.'),
-- AHA/BHA conflicts
('At-Home Exfoliation / AHA-BHA', 'Microneedling',    'conflict', 'Exfoliants should be paused before microneedling.'),
('At-Home Exfoliation / AHA-BHA', 'Waxing / Sugaring','conflict', 'Exfoliants sensitize skin — avoid waxing on days you use AHAs or BHAs.'),
('At-Home Exfoliation / AHA-BHA', 'Chemical Peel',    'conflict', 'AHAs/BHAs and chemical peels should not be used on the same day.'),
('At-Home Exfoliation / AHA-BHA', 'Laser Hair Removal','conflict', 'Pause exfoliants before laser treatments.'),
('At-Home Exfoliation / AHA-BHA', 'Classic Facial',   'conflict', 'Pause exfoliants before facials to avoid over-sensitizing skin.'),
-- Brow tint conflicts
('Brow Tint', 'Chemical Peel',            'conflict', 'Chemical peels near the brow area can affect tint — space these apart.'),
('Brow Tint', 'Microdermabrasion',        'conflict', 'Microdermabrasion near brows can affect tint results.'),
-- Hair conflicts
('Color Mask', 'Root Color Touch-Up',     'conflict', 'Color mask and color on the same day can affect results — consider spacing these.'),
('Color Mask', 'Highlights / Balayage',   'conflict', 'Color mask and highlights on the same day can affect results.'),
('Color Mask', 'Gloss / Toner',           'conflict', 'Color mask and toner on the same day may not be ideal — consider spacing these.'),
('Keratin / Brazilian Blowout', 'Root Color Touch-Up', 'conflict', 'Keratin treatments and color are typically not done on the same day — color usually comes first.'),
('Keratin / Brazilian Blowout', 'Highlights / Balayage','conflict', 'Keratin and highlights are typically not done on the same day.'),
-- Sync relationships
('Root Color Touch-Up',    'Haircut / Trim',          'sync', 'Color and cut are often done together — want to add them to a routine?'),
('Highlights / Balayage',  'Haircut / Trim',           'sync', 'Highlights and a trim are often done in the same visit — want to link them?'),
('Highlights / Balayage',  'Gloss / Toner',            'sync', 'A gloss or toner is often applied after highlights — want to link them?'),
('Root Color Touch-Up',    'Gloss / Toner',            'sync', 'A toner is often applied after color — want to link them?'),
('Lash Extensions Fill',   'Brow Tint',                'sync', 'Lash fills and brow tints are often done in the same appointment — want to link them?'),
('Lash Extensions Fill',   'Threading / Brow Wax',     'sync', 'Lash fills and brow shaping are often done together — want to link them?'),
('Manicure / Gel Manicure','Pedicure',                 'sync', 'Mani and pedi are often done together — want to link them?'),
('Classic Facial',         'Brow Tint',                'sync', 'Facial and brow tint appointments are often combined — want to link them?'),
('Waxing / Sugaring',      'Spray Tan / Self-Tan',     'sync', 'Waxing before a tan is recommended — want to link these in sequence?')
ON CONFLICT DO NOTHING;
