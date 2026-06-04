// ── tend, too design token palette ──────────────────────────────
// Single source of truth for all colours used in the app.
// Kept in sync with mobile lib/colors.ts

export const colors = {
  // ── Base palette ────────────────────────────────────────────
  cream:      '#f3ecd9',   // warm ivory canvas
  paperSoft:  '#faf4e6',   // warm ivory surface — cards, panels
  ink:        '#352720',   // deep espresso
  inkSoft:    '#6b5c52',   // warm mid-brown — secondary text
  inkFaint:   '#a8998e',   // warm light brown — tertiary, overlines
  divider:    '#ddd4c4',   // warm divider — borders, hairlines
  stone:      '#ede8df',   // subtle tint (kept for backwards compat)

  // ── Accents ─────────────────────────────────────────────────
  sage:       '#6e8c82',   // soft mineral green
  sageLt:     'rgba(110, 140, 130, 0.10)',
  bluegrey:   '#93a3b1',
  bluegreylLt:'rgba(147, 163, 177, 0.10)',
  refresh:    '#c08a6e',   // depletion / alert only

  // ── New accent additions ─────────────────────────────────────
  dustyRose:    '#c4918a',
  dustyRoseLt:  'rgba(196, 145, 138, 0.10)',
  blush:        '#d4a8a0',
  blushLt:      'rgba(212, 168, 160, 0.10)',
  apricot:      '#d4a478',
  apricotLt:    'rgba(212, 164, 120, 0.10)',
  marigold:     '#d4b870',
  marigoldLt:   'rgba(212, 184, 112, 0.10)',
  plum:         '#9D91B5',   // soft muted purple — Makeup category
  plumLt:       'rgba(157, 145, 181, 0.10)',
  mist:         '#c8ddd6',   // soft cool mint — Nails category
  mistLt:       'rgba(200, 221, 214, 0.10)',

  // ── Today hero card — soft sage wash (NOT the saturated `sage`) ──
  cardSageBg:     '#d9e2d8',   // card fill
  cardSageBorder: '#c7d4c5',   // border + internal dividers
  cardSageAccent: '#6e8478',   // kickers, labels
  cardSageStatus: '#5e7466',   // italic status line
  cardSageSub:    '#88958a',   // sub-labels, dates

  // ── Category dots (semantic aliases — kept for compat) ───────
  categorySkin:        '#93a3b1',
  categoryHair:        '#d4a478',
  categoryNails:       '#c8ddd6',
  categoryTreatments:  '#d4a478',
  categoryBody:        '#d4b870',
  categoryBrowsLashes: '#d4a8a0',
  categoryHairRemoval: '#d4b870',
  categoryMakeup:      '#9D91B5',
  categoryWellness:    '#c4918a',
  categoryDefault:     '#6B7280',   // unset/uncategorized fallback (mirrors mobile)
  routineDefault:      '#a6adc5',   // routines.color DB default (retired #EC4899)
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
  { label: 'Sage',       value: '#6e8c82' },
  { label: 'Slate',      value: '#93a3b1' },
  { label: 'Dusty Rose', value: '#c4918a' },
  { label: 'Blush',      value: '#d4a8a0' },
  { label: 'Apricot',    value: '#d4a478' },
  { label: 'Marigold',   value: '#d4b870' },
  { label: 'Terracotta', value: '#c08a6e' },
  { label: 'Charcoal',   value: '#6b5c52' },
];
