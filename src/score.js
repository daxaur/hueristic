// The objective function. Everything the solver does is a search for a higher
// number out of here, so the weights and curves in this file *are* the taste of
// the tool. They are deliberately readable and deliberately tunable.

import { deltaE, hueDistance, clamp } from './color.js';
import { apcaAbs } from './contrast.js';
import { MODE_BANDS } from './roles.js';

const gaussian = (x, sigma) => Math.exp(-(x * x) / (2 * sigma * sigma));

// Below target the score falls away fast; there is no partial credit for
// "almost readable".
function contrastFit(actual, role) {
  const target = role.targetLc;
  if (!target) return 1;
  const ratio = clamp(actual / target, 0, 1.6);
  let fit = ratio >= 1 ? 1 : ratio ** 1.6;

  // Maximum contrast body text (pure white on pure black) reads as harsh, so
  // trim a little off the top for text roles.
  if (role.kind === 'text' && actual > 96) fit -= Math.min(0.12, (actual - 96) / 90);

  return clamp(fit);
}

// Captions and hairline borders are defined by sitting back. One that shouts as
// loudly as body text has stopped being a caption, so this gates rather than
// nudges — same treatment a colorless primary gets.
function recedeGate(role, actual) {
  if (!role.recedes || !role.targetLc) return 1;
  const over = actual - (role.targetLc + 22);
  return over <= 0 ? 1 : 1 - 0.65 * clamp(over / 45);
}

// A primary action rendered in grey is not a primary action. For roles that
// require chroma this gates the whole score rather than nudging one term.
function chromaGate(role, { C }) {
  if (!role.minChroma) return 1;
  return 0.12 + 0.88 * clamp(C / role.minChroma) ** 0.9;
}

// And the reverse for text: paragraphs and captions in a saturated brand color
// are tiring to read however well they score on contrast.
function chromaCeilingGate(role, { C }) {
  if (role.kind !== 'text' || !role.maxChroma) return 1;
  const over = C / role.maxChroma;
  return over <= 1 ? 1 : 1 - 0.45 * clamp((over - 1) / 1.5);
}

const fidelityFit = (final, source) => Math.exp(-deltaE(final, source) / 0.14);

function chromaFit(role, { C }) {
  let fit = 1;
  if (role.maxChroma && C > role.maxChroma) {
    fit -= clamp((C - role.maxChroma) / Math.max(role.maxChroma, 0.02));
  }
  if (role.minChroma && C < role.minChroma) {
    fit *= clamp(C / role.minChroma) ** 0.8;
  }
  if (role.prefersNeutral) {
    fit -= role.prefersNeutral * 0.6 * clamp(C / 0.14);
  }
  return clamp(fit);
}

function surfaceFit(role, entry, theme) {
  const band = MODE_BANDS[role.mode];

  if (role.key === 'bg') {
    const [lo, hi] = band.bg;
    const { L } = entry.lch;
    if (L >= lo && L <= hi) return 1;
    return gaussian(L < lo ? lo - L : L - hi, 0.08);
  }

  const bg = theme.bg;
  if (!bg) return 0.5;
  const delta = entry.lch.L - bg.lch.L;
  const wanted = role.separation * band.direction;
  const sameSide = Math.sign(delta) === Math.sign(wanted) || Math.abs(delta) < 1e-4;
  return gaussian(Math.abs(delta) - Math.abs(wanted), 0.038) * (sameSide ? 1 : 0.4);
}

function scoreRole(role, entry, theme) {
  const contrast =
    role.kind === 'surface' ? surfaceFit(role, entry, theme) : contrastFit(entry.lc ?? 0, role);

  const fidelity = entry.source ? fidelityFit(entry.lch, entry.source.lch) : 0.85;
  const chroma = chromaFit(role, entry.lch);
  const gate =
    chromaGate(role, entry.lch) * chromaCeilingGate(role, entry.lch) * recedeGate(role, entry.lc ?? 0);

  return {
    contrast,
    fidelity,
    chroma,
    gate,
    // Chroma scales the result rather than adding to it: a caption in neon
    // green is readable and faithful to the input and still wrong.
    value: (0.62 * contrast + 0.38 * fidelity) * gate * (0.6 + 0.4 * chroma),
  };
}

// Hues that sit at tidy intervals read as intentional. Hues 12-26 degrees apart
// read as a mistake — close enough to look like the same color, far enough to
// look wrong. That near-miss band is the only thing actively punished here.
function harmonyScore(table, theme) {
  const chromatic = table
    .map((role) => ({ role, entry: theme[role.key] }))
    .filter(({ role, entry }) => entry && entry.lch.C > 0.035 && !role.derived && !role.hue);

  if (chromatic.length < 2) return 0.75;

  let sum = 0;
  let total = 0;
  for (let i = 0; i < chromatic.length; i++) {
    for (let j = i + 1; j < chromatic.length; j++) {
      const a = chromatic[i];
      const b = chromatic[j];
      const w = a.role.weight * b.role.weight;
      const delta = hueDistance(a.entry.lch.h, b.entry.lch.h);
      const nearest = Math.round(delta / 30) * 30;

      let s = gaussian(delta - nearest, 11);
      if (delta > 11 && delta < 26) s *= 0.35;

      sum += w * s;
      total += w;
    }
  }
  return total ? sum / total : 0.75;
}

// Does the theme hold together as one object: consistent saturation energy, and
// a sensible depth order from background to body text.
function coherenceScore(table, theme) {
  // Only colors that read as colors take part — a near-neutral background is
  // not "inconsistent" with a saturated accent, that is just how themes work.
  const chromas = table
    .filter((r) => !r.derived && !r.hue && theme[r.key]?.lch.C > 0.08)
    .map((r) => theme[r.key].lch.C);

  let consistency = 0.8;
  if (chromas.length >= 2) {
    const mean = chromas.reduce((a, b) => a + b, 0) / chromas.length;
    const sd = Math.sqrt(chromas.reduce((a, c) => a + (c - mean) ** 2, 0) / chromas.length);
    consistency = gaussian(sd / mean, 0.55);
  }

  let order = 1;
  const { bg, text, textMuted, border } = theme;
  if (bg && text && textMuted) {
    const dText = Math.abs(text.lch.L - bg.lch.L);
    const dMuted = Math.abs(textMuted.lch.L - bg.lch.L);
    if (dMuted >= dText) order -= 0.5;
    if (border) {
      const dBorder = Math.abs(border.lch.L - bg.lch.L);
      if (dBorder > dMuted) order -= 0.25;
    }
  }
  return clamp(0.55 * consistency + 0.45 * order);
}

function penalties(table, theme) {
  const notes = [];
  let total = 0;

  const visible = table.filter((r) => !r.derived && theme[r.key]);
  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      const a = theme[visible[i].key];
      const b = theme[visible[j].key];
      if (a.hex === b.hex) {
        total += 0.04;
        notes.push(`${visible[i].key} and ${visible[j].key} resolved to the same color`);
      }
    }
  }

  // Reading order is the whole point of having separate text roles.
  const { text, textMuted, border } = theme;
  if (text && textMuted && text.lc - textMuted.lc < 10) {
    total += 0.05;
    notes.push('secondary text is as loud as body text — the hierarchy is flat');
  }
  if (border && textMuted && border.lc > textMuted.lc - 10) {
    total += 0.04;
    notes.push('borders compete with text for attention');
  }

  for (const role of table) {
    const entry = theme[role.key];
    if (!entry) continue;
    if (entry.clipped > 0.03) {
      total += 0.02;
      notes.push(`${role.key} lost chroma to the sRGB gamut`);
    }
    if (role.weight >= 0.9 && role.targetLc) {
      const fit = contrastFit(entry.lc ?? 0, role);
      if (fit < 0.55) {
        total += 0.06;
        notes.push(`${role.key} cannot reach its contrast target here`);
      }
    }
  }

  return { total: Math.min(total, 0.4), notes };
}

// A gentle pull toward actually using the palette you were handed. Deliberately
// small — ignoring a color that fits nowhere beats forcing it into a role.
function coverageScore(theme, inputCount) {
  if (!inputCount) return 1;
  const used = new Set(
    Object.values(theme)
      .map((e) => e.source?.hex)
      .filter(Boolean),
  );
  return clamp(used.size / Math.min(inputCount, 5));
}

export function scoreTheme(theme, table, inputCount = 0) {
  const roles = {};
  let weighted = 0;
  let weightSum = 0;

  for (const role of table) {
    const entry = theme[role.key];
    if (!entry) continue;
    const detail = scoreRole(role, entry, theme);
    roles[role.key] = detail;
    weighted += role.weight * detail.value;
    weightSum += role.weight;
  }

  const base = weightSum ? weighted / weightSum : 0;
  const harmony = harmonyScore(table, theme);
  const coherence = coherenceScore(table, theme);
  const coverage = coverageScore(theme, inputCount);
  const penalty = penalties(table, theme);

  const total = clamp(
    0.82 * base + 0.09 * harmony + 0.05 * coherence + 0.04 * coverage - penalty.total,
  );

  return {
    total: Math.round(total * 1000) / 10,
    base,
    harmony,
    coherence,
    coverage,
    penalties: penalty.notes,
    roles,
  };
}
