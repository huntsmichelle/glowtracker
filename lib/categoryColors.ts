import { tint, colors } from '@/lib/colors';

export const CATEGORY_COLORS: Record<string, {
  dot: string;
  border: string;
  tint: string;
  label: string;
}> = {
  'Skin':           { dot: colors.categorySkin,        border: colors.categorySkin,        tint: tint(colors.categorySkin,        0.10), label: 'Skin' },
  'Hair':           { dot: colors.categoryHair,        border: colors.categoryHair,        tint: tint(colors.categoryHair,        0.10), label: 'Hair' },
  'Nails':          { dot: colors.categoryNails,       border: colors.categoryNails,       tint: tint(colors.categoryNails,       0.10), label: 'Nails' },
  'Treatments':     { dot: colors.categoryTreatments,  border: colors.categoryTreatments,  tint: tint(colors.categoryTreatments,  0.10), label: 'Treatments' },
  'Body':           { dot: colors.categoryBody,        border: colors.categoryBody,        tint: tint(colors.categoryBody,        0.10), label: 'Body' },
  'Brows & Lashes': { dot: colors.categoryBrowsLashes, border: colors.categoryBrowsLashes, tint: tint(colors.categoryBrowsLashes, 0.10), label: 'Brows & Lashes' },
  'Hair Removal':   { dot: colors.categoryHairRemoval, border: colors.categoryHairRemoval, tint: tint(colors.categoryHairRemoval, 0.10), label: 'Hair Removal' },
  'Makeup':         { dot: colors.categoryMakeup,      border: colors.categoryMakeup,      tint: tint(colors.categoryMakeup,      0.10), label: 'Makeup' },
};

export const DEFAULT_CATEGORY_COLOR = {
  dot:    colors.categoryDefault,
  border: colors.categoryDefault,
  tint:   tint(colors.categoryDefault, 0.10),
};

export function getCategoryColor(categoryName: string) {
  return CATEGORY_COLORS[categoryName] ?? DEFAULT_CATEGORY_COLOR;
}
