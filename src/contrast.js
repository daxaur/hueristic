// APCA (Lc) and WCAG 2.1 contrast.
//
// APCA drives the solver because it tracks perceived text contrast far better
// than the WCAG ratio, especially on dark backgrounds. WCAG is still computed
// so the report can say whether a theme passes the rules people get audited on.
// APCA constants are the 0.1.9 lookup used by the W3C Silver draft.

import { parseHex } from './color.js';

const RCO = 0.2126729;
const GCO = 0.7151522;
const BCO = 0.072175;

const BLACK_THRESHOLD = 0.022;
const BLACK_CLAMP = 1.414;
const DELTA_Y_MIN = 0.0005;
const LOW_CLIP = 0.1;
const LOW_OFFSET = 0.027;
const SCALE_BOW = 1.14;
const SCALE_WOB = 1.14;
const NORM_BG = 0.56;
const NORM_TEXT = 0.57;
const REV_BG = 0.65;
const REV_TEXT = 0.62;

function screenLuminance(hex) {
  const [r, g, b] = parseHex(hex);
  const y = RCO * (r / 255) ** 2.4 + GCO * (g / 255) ** 2.4 + BCO * (b / 255) ** 2.4;
  return y < BLACK_THRESHOLD ? y + (BLACK_THRESHOLD - y) ** BLACK_CLAMP : y;
}

/**
 * Lightness contrast. Positive means dark-on-light, negative light-on-dark.
 * Range is roughly -108..106.
 */
export function apca(textHex, bgHex) {
  const yText = screenLuminance(textHex);
  const yBg = screenLuminance(bgHex);

  if (Math.abs(yBg - yText) < DELTA_Y_MIN) return 0;

  if (yBg > yText) {
    const sapc = (yBg ** NORM_BG - yText ** NORM_TEXT) * SCALE_BOW;
    return (sapc < LOW_CLIP ? 0 : sapc - LOW_OFFSET) * 100;
  }
  const sapc = (yBg ** REV_BG - yText ** REV_TEXT) * SCALE_WOB;
  return (sapc > -LOW_CLIP ? 0 : sapc + LOW_OFFSET) * 100;
}

export const apcaAbs = (textHex, bgHex) => Math.abs(apca(textHex, bgHex));

function relativeLuminance(hex) {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function wcagRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function wcagLevel(ratio, { large = false } = {}) {
  if (large) {
    if (ratio >= 4.5) return 'AAA';
    if (ratio >= 3) return 'AA';
  } else {
    if (ratio >= 7) return 'AAA';
    if (ratio >= 4.5) return 'AA';
  }
  return ratio >= 3 ? 'AA-large' : 'fail';
}

// What the APCA bronze-tier tables ask for, condensed to the sizes a UI
// actually ships. Used for human-readable advice, not for scoring.
export function apcaAdvice(lc) {
  const v = Math.abs(lc);
  if (v >= 90) return 'any text, including thin weights';
  if (v >= 75) return 'body text down to 14px regular';
  if (v >= 60) return 'headings and 16px+ medium text';
  if (v >= 45) return 'large text, 24px+ or bold 16px';
  if (v >= 30) return 'non-text UI only — icons, borders, fills';
  if (v >= 15) return 'decorative separators only';
  return 'invisible in practice';
}
