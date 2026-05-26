export const CATEGORY_COLORS: Record<string, {
  dot: string;
  border: string;
  tint: string;
  label: string;
}> = {
  'Skin': {
    dot:    '#8ea394',
    border: '#8ea394',
    tint:   'rgba(142, 163, 148, 0.10)',
    label:  'Skin',
  },
  'Hair': {
    dot:    '#93a3b1',
    border: '#93a3b1',
    tint:   'rgba(147, 163, 177, 0.10)',
    label:  'Hair',
  },
  'Nails': {
    dot:    '#b5a89a',
    border: '#b5a89a',
    tint:   'rgba(181, 168, 154, 0.10)',
    label:  'Nails',
  },
  'Treatments': {
    dot:    '#b89880',
    border: '#b89880',
    tint:   'rgba(184, 152, 128, 0.10)',
    label:  'Treatments',
  },
  'Body': {
    dot:    '#a89aaa',
    border: '#a89aaa',
    tint:   'rgba(168, 154, 170, 0.10)',
    label:  'Body',
  },
  'Brows & Lashes': {
    dot:    '#a0978c',
    border: '#a0978c',
    tint:   'rgba(160, 151, 140, 0.10)',
    label:  'Brows & Lashes',
  },
  'Hair Removal': {
    dot:    '#93a3b1',
    border: '#93a3b1',
    tint:   'rgba(147, 163, 177, 0.10)',
    label:  'Hair Removal',
  },
};

export const DEFAULT_CATEGORY_COLOR = {
  dot:    '#a8a297',
  border: '#a8a297',
  tint:   'rgba(168, 162, 151, 0.10)',
};

export function getCategoryColor(categoryName: string) {
  return CATEGORY_COLORS[categoryName] ?? DEFAULT_CATEGORY_COLOR;
}
