// The role table. Weight is how much a role matters to the final score — the
// page background and the brand color carry the theme, a muted caption does not.
// Raising a weight makes the solver both work harder to satisfy that role and
// stay closer to the color you gave it.

export const ROLES = [
  {
    key: 'bg',
    label: 'page background',
    weight: 1.0,
    kind: 'surface',
    on: null,
    prefersNeutral: 0.8,
  },
  {
    key: 'surface',
    label: 'card / panel',
    weight: 0.6,
    kind: 'surface',
    on: 'bg',
    separation: 0.045, // target OKLab lightness step away from bg
    prefersNeutral: 0.8,
  },
  {
    key: 'border',
    label: 'borders and dividers',
    weight: 0.35,
    kind: 'line',
    on: 'surface',
    targetLc: 18,
    recedes: true,
    maxChroma: 0.09,
    prefersNeutral: 0.5,
  },
  {
    key: 'text',
    label: 'body text',
    weight: 0.95,
    kind: 'text',
    on: 'bg',
    targetLc: 78,
    maxChroma: 0.05,
    prefersNeutral: 0.9,
  },
  {
    key: 'textMuted',
    label: 'secondary / small text',
    weight: 0.45,
    kind: 'text',
    on: 'bg',
    targetLc: 58,
    recedes: true,
    maxChroma: 0.07,
    prefersNeutral: 0.7,
  },
  {
    key: 'primary',
    label: 'primary action',
    weight: 1.0,
    kind: 'fill',
    on: 'bg',
    targetLc: 42,
    minChroma: 0.09,
  },
  {
    key: 'onPrimary',
    label: 'text on primary',
    weight: 0.7,
    kind: 'text',
    on: 'primary',
    targetLc: 72,
    derived: true,
    maxChroma: 0.04,
  },
  {
    key: 'accent',
    label: 'accent / highlight',
    weight: 0.5,
    kind: 'fill',
    on: 'bg',
    targetLc: 33,
    minChroma: 0.07,
  },
  {
    key: 'onAccent',
    label: 'text on accent',
    weight: 0.35,
    kind: 'text',
    on: 'accent',
    targetLc: 68,
    derived: true,
    maxChroma: 0.04,
  },
  {
    key: 'link',
    label: 'inline links',
    weight: 0.55,
    kind: 'text',
    on: 'bg',
    targetLc: 62,
    minChroma: 0.05,
  },
];

// Status colors are anchored to hues people already read as meaning, so they
// are derived rather than picked from the input pool.
export const STATUS_ROLES = [
  { key: 'success', label: 'success', weight: 0.25, kind: 'fill', on: 'bg', targetLc: 38, hue: 148 },
  { key: 'warning', label: 'warning', weight: 0.25, kind: 'fill', on: 'bg', targetLc: 38, hue: 82 },
  { key: 'danger', label: 'danger', weight: 0.3, kind: 'fill', on: 'bg', targetLc: 40, hue: 28 },
];

// Where a background wants to sit in OKLab lightness for each mode.
export const MODE_BANDS = {
  dark: { bg: [0.14, 0.3], ideal: 0.2, direction: 1 },
  light: { bg: [0.9, 1.0], ideal: 0.97, direction: -1 },
};

export function roleTable({ mode = 'dark', weights = {}, includeStatus = true } = {}) {
  const base = includeStatus ? [...ROLES, ...STATUS_ROLES] : [...ROLES];
  return base.map((role) => ({
    ...role,
    mode,
    weight: weights[role.key] ?? role.weight,
  }));
}

export const assignableRoles = (table) => table.filter((r) => !r.derived && !r.hue);
