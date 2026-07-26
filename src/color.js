// sRGB <-> OKLab/OKLCh conversions, plus the gamut handling the solver leans on.
// OKLab matrices are Björn Ottosson's: https://bottosson.github.io/posts/oklab/

const clamp = (x, lo = 0, hi = 1) => (x < lo ? lo : x > hi ? hi : x);

export function parseHex(input) {
  const raw = String(input).trim().replace(/^#/, '');
  const hex =
    raw.length === 3 || raw.length === 4
      ? raw
          .slice(0, 3)
          .split('')
          .map((c) => c + c)
          .join('')
      : raw.slice(0, 6);

  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`not a hex color: "${input}"`);
  }
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex([r, g, b]) {
  const part = (v) =>
    Math.round(clamp(v, 0, 255))
      .toString(16)
      .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

export function rgbToOklab([r8, g8, b8]) {
  const r = toLinear(r8 / 255);
  const g = toLinear(g8 / 255);
  const b = toLinear(b8 / 255);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return [fromLinear(lr) * 255, fromLinear(lg) * 255, fromLinear(lb) * 255];
}

export function oklabToOklch([L, a, b]) {
  const C = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  // Hue is meaningless once chroma collapses; pin it so neutrals stay stable.
  return { L, C, h: C < 1e-6 ? 0 : h };
}

export function oklchToOklab({ L, C, h }) {
  const rad = (h * Math.PI) / 180;
  return [L, C * Math.cos(rad), C * Math.sin(rad)];
}

export const hexToOklch = (hex) => oklabToOklch(rgbToOklab(parseHex(hex)));

function inGamut([r, g, b], eps = 0.35) {
  return r >= -eps && g >= -eps && b >= -eps && r <= 255 + eps && g <= 255 + eps && b <= 255 + eps;
}

// Pull chroma down until the color fits sRGB, keeping L and hue. Same idea as
// CSS Color 4's gamut mapping, just with a plain bisection.
export function clipToGamut({ L, C, h }) {
  const lightness = clamp(L);
  const direct = oklabToRgb(oklchToOklab({ L: lightness, C, h }));
  if (inGamut(direct)) return { L: lightness, C, h, clipped: 0 };

  let lo = 0;
  let hi = C;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklabToRgb(oklchToOklab({ L: lightness, C: mid, h })))) lo = mid;
    else hi = mid;
  }
  return { L: lightness, C: lo, h, clipped: C - lo };
}

export function oklchToHex(lch) {
  const safe = clipToGamut(lch);
  return toHex(oklabToRgb(oklchToOklab(safe)));
}

// Euclidean distance in OKLab. Roughly 0.02 is one just-noticeable step.
export function deltaE(a, b) {
  const p = oklchToOklab(a);
  const q = oklchToOklab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

export function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export { clamp };
