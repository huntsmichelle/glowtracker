import { tint, colors } from '@/lib/colors';

export const CATEGORY_COLORS: Record<string, {
  dot: string;
  border: string;
  tintBg: string;
  tint: string;
  label: string;
}> = {
  'Hair':           { dot: '#d4a478', border: '#d4a478', tintBg: 'rgba(212,164,120,0.10)', tint: tint('#d4a478', 0.10), label: 'Hair' },
  'Skin':           { dot: '#93a3b1', border: '#93a3b1', tintBg: 'rgba(147,163,177,0.10)', tint: tint('#93a3b1', 0.10), label: 'Skin' },
  'Nails':          { dot: '#c08a6e', border: '#c08a6e', tintBg: 'rgba(192,138,110,0.10)', tint: tint('#c08a6e', 0.10), label: 'Nails' },
  'Makeup':         { dot: '#9D91B5', border: '#9D91B5', tintBg: 'rgba(157,145,181,0.10)', tint: tint('#9D91B5', 0.10), label: 'Makeup' },
  'Hair Removal':   { dot: '#d4b870', border: '#d4b870', tintBg: 'rgba(212,184,112,0.10)', tint: tint('#d4b870', 0.10), label: 'Hair Removal' },
  'Wellness':       { dot: '#c4918a', border: '#c4918a', tintBg: 'rgba(196,145,138,0.10)', tint: tint('#c4918a', 0.10), label: 'Wellness' },
  'Brows & Lashes': { dot: '#d4a8a0', border: '#d4a8a0', tintBg: 'rgba(212,168,160,0.10)', tint: tint('#d4a8a0', 0.10), label: 'Brows & Lashes' },
  'Treatments':     { dot: '#d4a478', border: '#d4a478', tintBg: 'rgba(212,164,120,0.10)', tint: tint('#d4a478', 0.10), label: 'Treatments' },
  // Legacy
  'Body':           { dot: colors.categoryBody, border: colors.categoryBody, tintBg: tint(colors.categoryBody, 0.10), tint: tint(colors.categoryBody, 0.10), label: 'Body' },
};

export const DEFAULT_CATEGORY_COLOR = {
  dot:    colors.categoryDefault,
  border: colors.categoryDefault,
  tintBg: tint(colors.categoryDefault, 0.10),
  tint:   tint(colors.categoryDefault, 0.10),
};

export function getCategoryColor(categoryName: string) {
  return CATEGORY_COLORS[categoryName] ?? DEFAULT_CATEGORY_COLOR;
}

export const CATEGORY_ICONS: Record<string, string> = {
  'Hair':           'Scissors',
  'Hair Removal':   'Zap',
  'Makeup':         'Palette',
  'Nails':          'Hand',
  'Skin':           'Droplets',
  'Brows & Lashes': 'Eye',
  'Wellness':       'Heart',
  'Treatments':     'Sparkles',
};
