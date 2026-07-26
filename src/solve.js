// The search. A theme is described by three numbers per role — which input
// color it draws from, how far past its contrast target to push, and how much
// of the source chroma to keep — and building a theme from those numbers is
// deterministic. So the whole problem reduces to hill-climbing that parameter
// vector from a lot of different random starts.

import { hexToOklch, oklchToHex, clipToGamut, clamp, hueDistance } from './color.js';
import { apcaAbs } from './contrast.js';
import { MODE_BANDS } from './roles.js';
import { scoreTheme } from './score.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Walk lightness away from the background until the target Lc is met, then
// bisect for a clean landing. Returns the closest workable lightness to where
// the source color already sits.
function lightnessForContrast(lch, bgHex, target, preferUp) {
  const at = (L) => apcaAbs(oklchToHex({ ...lch, L }), bgHex);
  const directions = preferUp ? [1, -1] : [-1, 1];

  let best = { L: lch.L, lc: at(lch.L) };
  if (best.lc >= target) return best;

  for (const dir of directions) {
    let prev = lch.L;

    for (let step = 1; step <= 50; step++) {
      const L = clamp(lch.L + dir * step * 0.02);
      const lc = at(L);
      if (lc > best.lc) best = { L, lc };

      if (lc >= target) {
        let lo = prev;
        let hi = L;
        for (let i = 0; i < 12; i++) {
          const mid = (lo + hi) / 2;
          if (at(mid) >= target) hi = mid;
          else lo = mid;
        }
        return { L: hi, lc: at(hi) };
      }
      if (L === 0 || L === 1) break;
      prev = L;
    }
  }
  return best;
}

function place(lch, source, extra = {}) {
  const safe = clipToGamut(lch);
  return { lch: safe, hex: oklchToHex(safe), clipped: safe.clipped, source, ...extra };
}

// Text sitting on a filled button: try both polarities at low chroma and keep
// whichever reads better, tie-breaking toward the theme's own text direction.
function deriveOnColor(role, fill, theme) {
  const hue = fill.lch.h;
  const chroma = Math.min(0.03, fill.lch.C * 0.25);
  const options = [1, 0].map((L) => {
    const solved = lightnessForContrast({ L, C: chroma, h: hue }, fill.hex, role.targetLc, L > 0.5);
    const lch = { L: solved.L, C: chroma, h: hue };
    return { lch, lc: apcaAbs(oklchToHex(lch), fill.hex) };
  });

  const preferLight = theme.text ? theme.text.lch.L > fill.lch.L : fill.lch.L < 0.6;
  options.sort((a, b) => b.lc - a.lc || 0);
  const [first, second] = options;
  const pick =
    second && second.lc >= role.targetLc && second.lch.L > 0.5 === preferLight ? second : first;

  return place(pick.lch, null, { lc: pick.lc });
}

function buildRole(role, entry, theme, pool) {
  const band = MODE_BANDS[role.mode];

  if (role.derived) {
    const fill = theme[role.on];
    return fill ? deriveOnColor(role, fill, theme) : null;
  }

  if (role.hue) {
    // Status colors keep their meaning-hue and borrow the theme's energy level.
    const chroma = Math.max(0.09, averageChroma(theme) * entry.cScale);
    const bg = theme.bg;
    const start = { L: bg ? bg.lch.L + band.direction * 0.35 : 0.6, C: chroma, h: role.hue };
    const solved = lightnessForContrast(start, bg.hex, role.targetLc, band.direction > 0);
    const L = clamp(solved.L + entry.lBias * band.direction);
    const lch = { L, C: chroma, h: role.hue };
    return place(lch, null, { lc: apcaAbs(oklchToHex(lch), bg.hex) });
  }

  const source = pool[entry.src];
  const chroma = source.lch.C * entry.cScale;

  if (role.key === 'bg') {
    const [lo, hi] = band.bg;
    const target = clamp(source.lch.L, lo, hi);
    const L = clamp(target + entry.lBias * 0.5, lo - 0.03, hi + 0.03);
    return place({ L, C: Math.min(chroma, 0.13), h: source.lch.h }, source);
  }

  if (role.kind === 'surface') {
    const bg = theme.bg;
    const L = clamp(bg.lch.L + band.direction * (role.separation + entry.lBias * 0.5));
    return place({ L, C: Math.min(chroma, 0.13), h: source.lch.h }, source);
  }

  const against = theme[role.on];
  if (!against) return null;

  const preferUp = band.direction > 0;
  const solved = lightnessForContrast(
    { ...source.lch, C: chroma },
    against.hex,
    role.targetLc,
    preferUp,
  );
  const L = clamp(solved.L + entry.lBias * band.direction);
  const lch = { L, C: chroma, h: source.lch.h };
  const built = place(lch, source);
  built.lc = apcaAbs(built.hex, against.hex);
  return built;
}

function averageChroma(theme) {
  const values = Object.values(theme)
    .map((e) => e?.lch.C ?? 0)
    .filter((c) => c > 0.04);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0.12;
}

export function buildTheme(params, pool, table) {
  const theme = {};
  for (const role of table) {
    const built = buildRole(role, params[role.key], theme, pool);
    if (built) {
      built.role = role.key;
      theme[role.key] = built;
    }
  }
  return theme;
}

// How plausible is this input color for this role, before any tuning. Used to
// bias the random starts so restarts explore sensible assignments instead of
// wasting time on a neon body text.
function suitability(role, color, mode) {
  const band = MODE_BANDS[mode];
  let s = 1;

  if (role.prefersNeutral) s *= 1 - role.prefersNeutral * 0.7 * clamp(color.lch.C / 0.18);
  if (role.minChroma) s *= clamp(color.lch.C / role.minChroma, 0.05, 1) ** 0.6;
  if (role.key === 'bg') {
    const [lo, hi] = band.bg;
    const mid = (lo + hi) / 2;
    s *= Math.exp(-((color.lch.L - mid) ** 2) / (2 * 0.22 ** 2));
  }
  if (role.kind === 'text' && !role.derived) {
    const wanted = band.direction > 0 ? color.lch.L : 1 - color.lch.L;
    s *= 0.35 + 0.65 * clamp(wanted);
  }
  return Math.max(s, 0.02);
}

function pickWeighted(rng, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

function randomParams(rng, pool, table, priors) {
  const params = {};
  for (const role of table) {
    params[role.key] = {
      src: role.derived || role.hue ? 0 : pickWeighted(rng, priors[role.key]),
      lBias: (rng() - 0.5) * 0.06,
      cScale: 0.75 + rng() * 0.6,
    };
  }
  return params;
}

function mutate(rng, params, table, pool, priors) {
  const next = {};
  for (const key of Object.keys(params)) next[key] = { ...params[key] };

  const roles = table.filter((r) => !r.derived);
  const role = roles[Math.floor(rng() * roles.length)];
  const slot = next[role.key];
  const roll = rng();

  if (roll < 0.3 && !role.hue && pool.length > 1) {
    // Mostly propose colors that stand a chance in this role, but leave room
    // for the odd unlikely swap — that is where the surprising themes come from.
    slot.src = rng() < 0.75 ? pickWeighted(rng, priors[role.key]) : Math.floor(rng() * pool.length);
  } else if (roll < 0.68) {
    slot.lBias = clamp(slot.lBias + (rng() - 0.5) * 0.09, -0.3, 0.3);
  } else {
    slot.cScale = clamp(slot.cScale + (rng() - 0.5) * 0.35, 0.05, 1.9);
  }
  return next;
}

// Two candidates that draw the same input color for every role are the same
// idea with slightly different numbers, however different the hexes look.
function signature(params, table) {
  return table
    .filter((r) => !r.derived && !r.hue)
    .map((r) => params[r.key].src)
    .join('-');
}

function distance(a, b) {
  const keys = ['bg', 'surface', 'primary', 'accent', 'text', 'link'];
  let sum = 0;
  for (const k of keys) {
    if (!a.theme[k] || !b.theme[k]) continue;
    const p = a.theme[k].lch;
    const q = b.theme[k].lch;
    sum += Math.abs(p.L - q.L) + Math.abs(p.C - q.C) + hueDistance(p.h, q.h) / 360;
  }
  return sum / keys.length;
}

export function search(inputs, table, options = {}) {
  const { seed = 1, restarts = 18, steps = 150, count = 5, diversity = 0.04 } = options;

  const pool = inputs.map((hex) => ({ hex, lch: hexToOklch(hex) }));
  const rng = mulberry32(seed);

  const priors = {};
  for (const role of table) {
    priors[role.key] = pool.map((color) => suitability(role, color, role.mode) ** 2);
  }

  const found = [];
  // More colors means a bigger assignment space, so give the search more starts
  // rather than making the caller remember to.
  const starts = Math.max(restarts, 6 + 2 * pool.length);

  for (let restart = 0; restart < starts; restart++) {
    let params = randomParams(rng, pool, table, priors);
    let theme = buildTheme(params, pool, table);
    let score = scoreTheme(theme, table, pool.length);

    let best = { params, theme, score };

    for (let step = 0; step < steps; step++) {
      const temperature = 0.9 * (1 - step / steps) ** 2;
      const candidate = mutate(rng, params, table, pool, priors);
      const candidateTheme = buildTheme(candidate, pool, table);
      const candidateScore = scoreTheme(candidateTheme, table, pool.length);

      const delta = candidateScore.total - score.total;
      if (delta > 0 || rng() < Math.exp(delta / Math.max(temperature, 1e-6)) * 0.15) {
        params = candidate;
        theme = candidateTheme;
        score = candidateScore;
        if (score.total > best.score.total) best = { params, theme, score };
      }
    }
    found.push(best);
  }

  found.sort((a, b) => b.score.total - a.score.total);

  const kept = [];
  const seen = new Set();
  for (const candidate of found) {
    const sig = signature(candidate.params, table);
    if (seen.has(sig)) continue;
    if (kept.some((k) => distance(k, candidate) < diversity)) continue;
    seen.add(sig);
    kept.push(candidate);
    if (kept.length >= count) break;
  }

  // If the inputs are so constrained that everything collapses to one theme,
  // return what we have rather than padding with duplicates.
  return kept.length ? kept : found.slice(0, count);
}
