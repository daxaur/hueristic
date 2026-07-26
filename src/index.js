import { hexToOklch, oklchToHex } from './color.js';
import { roleTable } from './roles.js';
import { search, buildTheme, mulberry32 } from './solve.js';
import { scoreTheme } from './score.js';
import { critique, contrastMatrix } from './critique.js';
import { apcaAbs } from './contrast.js';

export { toCss, toTailwind, toTokens, toTerminal, formatResult } from './format.js';
export { renderPreview } from './preview.js';
export { apca, apcaAbs, wcagRatio, wcagLevel, apcaAdvice } from './contrast.js';
export { ROLES, STATUS_ROLES, roleTable } from './roles.js';
export * from './color.js';
export { mulberry32, buildTheme, search };

const KEY_PAIRS = [
  ['text', 'bg'],
  ['textMuted', 'bg'],
  ['text', 'surface'],
  ['link', 'bg'],
  ['onPrimary', 'primary'],
  ['onAccent', 'accent'],
  ['border', 'surface'],
];

function normalize(colors) {
  const seen = new Set();
  const out = [];
  for (const raw of colors) {
    const hex = oklchToHex(hexToOklch(raw)).toLowerCase();
    if (seen.has(hex)) continue;
    seen.add(hex);
    out.push(hex);
  }
  if (!out.length) throw new Error('give me at least one color');
  return out;
}

/**
 * Generate ranked theme candidates from an arbitrary set of input colors.
 *
 * @param {string[]} colors   any number of hex colors
 * @param {object}   options
 * @param {'dark'|'light'} options.mode
 * @param {number}   options.count      how many themes to return
 * @param {number}   options.seed       same seed, same themes
 * @param {object}   options.weights    role key -> weight override
 * @param {number}   options.restarts   search restarts
 * @param {number}   options.steps      hill-climbing steps per restart
 */
export function generateThemes(colors, options = {}) {
  const {
    mode = 'dark',
    count = 5,
    seed = 1,
    weights = {},
    includeStatus = true,
    restarts = 18,
    steps = 150,
    diversity = 0.04,
  } = options;

  if (!Object.hasOwn({ dark: 1, light: 1 }, mode)) {
    throw new Error(`mode must be "dark" or "light", got "${mode}"`);
  }

  const inputs = normalize(colors);
  const table = roleTable({ mode, weights, includeStatus });
  const winners = search(inputs, table, { seed, restarts, steps, count, diversity });

  return {
    input: inputs,
    mode,
    seed,
    weights: Object.fromEntries(table.map((r) => [r.key, r.weight])),
    themes: winners.map((candidate, i) => shape(candidate, table, inputs, i)),
  };
}

function shape({ theme, score }, table, inputs, i) {
  return {
    rank: i + 1,
    score: score.total,
    breakdown: {
      harmony: round(score.harmony),
      coherence: round(score.coherence),
      penalties: score.penalties,
    },
    palette: Object.fromEntries(Object.entries(theme).map(([k, v]) => [k, v.hex])),
    contrast: contrastMatrix(theme, KEY_PAIRS),
    critique: critique(theme, table, inputs),
    theme,
  };
}

const round = (x) => Math.round(x * 1000) / 1000;

/**
 * Score and critique a theme that already exists, without changing it.
 * Same objective function the generator optimizes, so the numbers are
 * comparable to generateThemes output.
 */
export function evaluateTheme(palette, options = {}) {
  const { mode = 'dark', weights = {}, includeStatus = false } = options;
  const table = roleTable({ mode, weights, includeStatus }).filter((r) => palette[r.key]);

  const theme = {};
  for (const role of table) {
    const hex = palette[role.key];
    const lch = hexToOklch(hex);
    theme[role.key] = { hex, lch, clipped: 0, role: role.key, source: { hex, lch } };
  }
  for (const role of table) {
    const against = theme[role.on];
    if (against && role.kind !== 'surface') {
      theme[role.key].lc = apcaAbs(theme[role.key].hex, against.hex);
    }
  }

  const score = scoreTheme(theme, table);
  return {
    score: score.total,
    breakdown: { harmony: round(score.harmony), coherence: round(score.coherence) },
    contrast: contrastMatrix(theme, KEY_PAIRS),
    critique: critique(theme, table, Object.values(palette)),
  };
}
