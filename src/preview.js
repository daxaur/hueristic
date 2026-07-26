// Draws a theme as a single dense card: a working mock interface on the left,
// the numbers that produced it charted on the right, and the full palette along
// the bottom. Plain SVG — no image model, no canvas, no dependency.
//
// Everything is laid out with a running cursor rather than fixed coordinates,
// so the canvas ends where the content ends and there is no dead space.

import { roleTable } from './roles.js';
import { apcaAbs, wcagRatio, wcagLevel } from './contrast.js';

const FONT =
  "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const rect = (x, y, w, h, fill, { rx = 0, stroke, opacity, strokeWidth = 1 } = {}) =>
  `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" rx="${rx}"` +
  ` fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${strokeWidth}"` : ''}` +
  `${opacity != null ? ` opacity="${opacity}"` : ''}/>`;

const label = (x, y, content, fill, { size = 12, weight, anchor, family = FONT, opacity } = {}) =>
  `<text x="${round(x)}" y="${round(y)}" font-family="${family}" font-size="${size}" fill="${fill}"` +
  `${weight ? ` font-weight="${weight}"` : ''}${anchor ? ` text-anchor="${anchor}"` : ''}` +
  `${opacity != null ? ` opacity="${opacity}"` : ''}>${esc(content)}</text>`;

const round = (n) => Math.round(n * 100) / 100;

// Roles worth charting, in the order they make sense to read.
const CHARTED = ['text', 'textMuted', 'link', 'primary', 'onPrimary', 'accent', 'border'];
const WEIGHTED = ['bg', 'primary', 'text', 'surface', 'link', 'textMuted'];

/**
 * Render a theme as a preview card.
 *
 * @param {object} palette  role -> hex, as returned by generateThemes
 * @param {object} options
 * @param {string} options.title     caption in the title bar
 * @param {boolean} options.charts   include the contrast and weight charts
 * @param {object} options.weights   role weight overrides, to match the run
 */
export function renderPreview(palette, { title = 'hueristic', charts = true, weights = {} } = {}) {
  const p = palette;
  for (const key of ['bg', 'text', 'primary']) {
    if (!p[key]) throw new Error(`preview needs at least bg, text, primary — missing ${key}`);
  }

  const surface = p.surface ?? p.bg;
  const line = p.border ?? p.textMuted ?? p.text;
  const muted = p.textMuted ?? p.text;
  const accent = p.accent ?? p.primary;
  const link = p.link ?? p.primary;
  const onPrimary = p.onPrimary ?? p.bg;
  const onAccent = p.onAccent ?? p.bg;

  const table = roleTable({ mode: 'dark', weights });
  const spec = Object.fromEntries(table.map((r) => [r.key, r]));

  const PAD = 22;
  const BAR = 42;
  const leftW = charts ? 372 : 700;
  const gutter = 22;
  const rightW = 434;
  const W = charts ? PAD * 2 + leftW + gutter + rightW : PAD * 2 + leftW;

  const out = [];
  const left = [];
  const right = [];

  // ---- title bar -----------------------------------------------------------
  out.push(
    rect(0, 0, W, BAR, surface, { rx: 12 }),
    rect(0, BAR - 12, W, 12, surface),
    `<line x1="0" y1="${BAR}" x2="${W}" y2="${BAR}" stroke="${line}" stroke-width="1"/>`,
  );
  [p.danger, p.warning, p.success].forEach((c, i) => {
    if (c) out.push(`<circle cx="${20 + i * 17}" cy="${BAR / 2}" r="5" fill="${c}"/>`);
  });
  out.push(label(84, BAR / 2 + 4, title, muted, { size: 11.5, family: MONO }));

  // ---- left column: a working interface ------------------------------------
  const lx = PAD;
  let ly = BAR + PAD;

  // tabs
  ['Overview', 'Palettes', 'Contrast'].forEach((tab, i) => {
    const tw = 110;
    const x = lx + i * (tw + 8);
    if (i === 0) {
      left.push(rect(x, ly, tw, 30, p.primary, { rx: 7, opacity: 0.18 }));
      left.push(rect(x, ly, 3, 30, p.primary, { rx: 1.5 }));
    }
    left.push(
      label(x + (i === 0 ? 14 : 12), ly + 20, tab, i === 0 ? p.text : muted, {
        size: 12.5,
        weight: i === 0 ? 600 : undefined,
      }),
    );
  });
  ly += 30 + 16;

  // card
  const cardH = 168;
  left.push(rect(lx, ly, leftW, cardH, surface, { rx: 10, stroke: line }));
  left.push(
    label(lx + 18, ly + 30, 'Contrast is decided, not guessed', p.text, { size: 14, weight: 650 }),
    label(lx + 18, ly + 54, 'Body copy sits where the target demanded.', p.text, { size: 12.5 }),
    label(lx + 18, ly + 74, 'Secondary text reads quieter, on purpose.', muted, { size: 11.5 }),
  );
  const by = ly + 94;
  left.push(
    rect(lx + 18, by, 112, 33, p.primary, { rx: 8 }),
    label(lx + 74, by + 21, 'Get started', onPrimary, { size: 12.5, weight: 600, anchor: 'middle' }),
    rect(lx + 138, by, 92, 33, accent, { rx: 8 }),
    label(lx + 184, by + 21, 'Preview', onAccent, { size: 12.5, weight: 600, anchor: 'middle' }),
    label(lx + 244, by + 21, 'read the docs', link, { size: 12.5 }),
    `<line x1="${lx + 244}" y1="${by + 25}" x2="${lx + 324}" y2="${by + 25}" stroke="${link}" stroke-width="1"/>`,
  );
  ly += cardH + 16;

  // status pills
  const pills = [
    [p.success, 'Passing'],
    [p.warning, 'Review'],
    [p.danger, 'Failing'],
  ].filter(([c]) => c);
  pills.forEach(([color, word], i) => {
    const pw = (leftW - (pills.length - 1) * 10) / pills.length;
    const x = lx + i * (pw + 10);
    left.push(
      rect(x, ly, pw, 30, color, { rx: 15, opacity: 0.18 }),
      `<circle cx="${x + 17}" cy="${ly + 15}" r="4" fill="${color}"/>`,
      label(x + 29, ly + 19, word, muted, { size: 11.5 }),
    );
  });
  ly += 30 + 16;

  // an input row, because forms are where themes usually fall apart
  left.push(
    rect(lx, ly, leftW - 104, 34, p.bg, { rx: 8, stroke: line }),
    label(lx + 14, ly + 22, 'you@example.com', muted, { size: 12 }),
    rect(lx + leftW - 94, ly, 94, 34, p.primary, { rx: 8 }),
    label(lx + leftW - 47, ly + 22, 'Sign up', onPrimary, { size: 12.5, weight: 600, anchor: 'middle' }),
  );
  ly += 34 + 16;

  // three tiles of the numbers that decide whether this theme ships
  const bodyLc = Math.round(apcaAbs(p.text, p.bg));
  const ratio = wcagRatio(p.text, p.bg);
  const tiles = [
    [`Lc ${bodyLc}`, 'body on bg'],
    [`${ratio.toFixed(1)}:1`, 'WCAG ratio'],
    [wcagLevel(ratio), `${Object.keys(p).length} roles`],
  ];
  tiles.forEach(([big, small], i) => {
    const tw = (leftW - 20) / 3;
    const x = lx + i * (tw + 10);
    left.push(
      rect(x, ly, tw, 58, surface, { rx: 9, stroke: line }),
      label(x + 14, ly + 27, big, p.text, { size: 16, weight: 650 }),
      label(x + 14, ly + 45, small, muted, { size: 10, family: MONO }),
    );
  });
  ly += 58;

  // ---- right column: the numbers -------------------------------------------
  let ry = BAR + PAD;
  if (charts) {
    const rx = PAD + leftW + gutter;
    const labelW = 74;
    const barX = rx + labelW;
    const barW = rightW - labelW - 46;

    right.push(
      label(rx, ry + 11, 'CONTRAST', muted, { size: 9.5, weight: 700, family: MONO }),
      label(rx + 68, ry + 11, 'APCA Lc · tick is the target', muted, {
        size: 9.5,
        opacity: 0.7,
        family: MONO,
      }),
    );
    ry += 26;

    const rows = CHARTED.filter((k) => p[k] && spec[k]?.targetLc);
    const scale = barW / 110;
    for (const key of rows) {
      const role = spec[key];
      const against = p[role.on] ?? p.bg;
      const lc = Math.round(apcaAbs(p[key], against));
      const y = ry + 9;

      right.push(
        label(barX - 10, y + 4, key, muted, { size: 10.5, anchor: 'end', family: MONO }),
        rect(barX, y - 6, barW, 12, line, { rx: 6, opacity: 0.28 }),
        rect(barX, y - 6, Math.min(lc, 110) * scale, 12, p[key], {
          rx: 6,
          stroke: line,
          strokeWidth: 0.75,
        }),
        rect(barX + role.targetLc * scale, y - 11, 1.5, 22, p.text, { rx: 1, opacity: 0.5 }),
        label(barX + barW + 8, y + 4, String(lc), p.text, { size: 10.5, family: MONO }),
      );
      ry += 25;
    }

    ry += 14;
    right.push(
      label(rx, ry + 11, 'WEIGHT', muted, { size: 9.5, weight: 700, family: MONO }),
      label(rx + 56, ry + 11, 'how much each role counts', muted, {
        size: 9.5,
        opacity: 0.7,
        family: MONO,
      }),
    );
    ry += 26;

    const wRows = WEIGHTED.filter((k) => p[k] && spec[k]);
    const maxW = Math.max(...wRows.map((k) => spec[k].weight));
    for (const key of wRows) {
      const w = spec[key].weight;
      const y = ry + 8;
      right.push(
        label(barX - 10, y + 3, key, muted, { size: 10.5, anchor: 'end', family: MONO }),
        rect(barX, y - 4, barW, 9, line, { rx: 4.5, opacity: 0.28 }),
        rect(barX, y - 4, (w / maxW) * barW, 9, p[key], { rx: 4.5, stroke: line, strokeWidth: 0.75 }),
        label(barX + barW + 8, y + 3, w.toFixed(2), p.text, { size: 10.5, family: MONO }),
      );
      ry += 21;
    }
  }

  // ---- palette strip -------------------------------------------------------
  const columnsEnd = Math.max(ly, ry);
  const stripTop = columnsEnd + PAD;
  const keys = Object.keys(p);
  const cell = Math.min(64, (W - PAD * 2) / keys.length);
  const swatch = Math.min(30, cell - 6);

  const strip = [
    `<line x1="0" y1="${stripTop}" x2="${W}" y2="${stripTop}" stroke="${line}" stroke-width="1"/>`,
  ];
  keys.forEach((key, i) => {
    const x = PAD + i * cell;
    strip.push(
      rect(x, stripTop + 18, swatch, swatch, p[key], { rx: 7, stroke: line }),
      label(x, stripTop + 62, key.length > 9 ? `${key.slice(0, 8)}…` : key, muted, { size: 8.5, family: MONO }),
      label(x, stripTop + 74, p[key], p.text, { size: 8.5, opacity: 0.75, family: MONO }),
    );
  });

  const H = stripTop + 92;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">\n` +
    `<title>${esc(title)}</title>\n` +
    rect(0, 0, W, H, p.bg, { rx: 12 }) +
    '\n' +
    out.join('\n') +
    '\n' +
    left.join('\n') +
    '\n' +
    right.join('\n') +
    '\n' +
    strip.join('\n') +
    `\n</svg>\n`
  );
}
