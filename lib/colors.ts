// ── GlowLoop design token palette ──────────────────────────────
// Single source of truth for all colours used in the app.

export const colors = {
  // ── Base palette ────────────────────────────────────────────
  cream:      '#efe9dd',   // page background
  paperSoft:  '#f6f1e6',   // cards, panels
  ink:        '#2b2823',   // primary text, dark actions
  inkSoft:    '#6b665e',   // secondary text
  inkFaint:   '#a8a297',   // tertiary, overlines, placeholders
  divider:    '#cdc6b6',   // borders, hairlines
  stone:      '#ede8df',   // subtle tint

  // ── Accents (kept) ───────────────────────────────────────────
  sage:          '#8ea394',
  sageLt:        'rgba(142, 163, 148, 0.10)',
  bluegrey:      '#93a3b1',
  bluegreylLt:   'rgba(147, 163, 177, 0.10)',
  refresh:       '#c08a6e',   // depletion / alert only

  // ── New accent additions ──────────────────────────────────────
  dustyRose:    '#c4918a',
  dustyRoseLt:  'rgba(196, 145, 138, 0.10)',
  blush:        '#d4a8a0',
  blushLt:      'rgba(212, 168, 160, 0.10)',
  apricot:      '#d4a478',
  apricotLt:    'rgba(212, 164, 120, 0.10)',
  marigold:     '#d4b870',
  marigoldLt:   'rgba(212, 184, 112, 0.10)',

  // ── Category dots ────────────────────────────────────────────
  categorySkin:        '#8ea394',
  categoryHair:        '#93a3b1',
  categoryNails:       '#c4918a',
  categoryTreatments:  '#d4a478',
  categoryBody:        '#d4b870',
  categoryBrowsLashes: '#d4a8a0',
  categoryHairRemoval: '#93a3b1',
  categoryMakeup:      '#c4918a',
  categoryDefault:     '#a8a297',
} as const;

export type ColorName = keyof typeof colors;

/**
 * Returns a CSS rgba() string with the given hex colour at the given opacity.
 * Hex must be 6-digit format.
 */
export function tint(hex: string, opacity: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// User-selectable routine card colour swatches
export const routinePalette: { label: string; value: string }[] = [
  { label: 'Sage',       value: '#8ea394' },
  { label: 'Slate',      value: '#93a3b1' },
  { label: 'Dusty Rose', value: '#c4918a' },
  { label: 'Blush',      value: '#d4a8a0' },
  { label: 'Apricot',    value: '#d4a478' },
  { label: 'Marigold',   value: '#d4b870' },
  { label: 'Terracotta', value: '#c08a6e' },
  { label: 'Charcoal',   value: '#6b665e' },
];
