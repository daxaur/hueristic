// Draws a theme as a small mock interface, so you can look at a palette doing
// its job instead of reading a column of hex codes. Plain SVG — no image model,
// no canvas, no dependency. An agent can render this and hand it straight to
// whoever asked for the theme.

const FONT =
  "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const rect = (x, y, w, h, fill, { rx = 0, stroke, opacity } = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"` +
  `${stroke ? ` stroke="${stroke}"` : ''}${opacity != null ? ` opacity="${opacity}"` : ''}/>`;

const label = (x, y, content, fill, { size = 12, weight, anchor, family = FONT } = {}) =>
  `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" fill="${fill}"` +
  `${weight ? ` font-weight="${weight}"` : ''}${anchor ? ` text-anchor="${anchor}"` : ''}>` +
  `${esc(content)}</text>`;

const NAV = ['Overview', 'Palettes', 'Contrast', 'Settings'];

/**
 * Render a theme as a mock UI.
 *
 * @param {object} palette  role -> hex, as returned by generateThemes
 * @param {object} options
 * @param {string} options.title    caption in the title bar
 * @param {boolean} options.swatches show the swatch strip along the bottom
 */
export function renderPreview(palette, { title = 'hueristic', swatches = true } = {}) {
  const p = palette;
  const need = ['bg', 'text', 'primary'];
  for (const key of need) {
    if (!p[key]) throw new Error(`preview needs at least ${need.join(', ')} — missing ${key}`);
  }

  // Fall back sensibly so a partial palette still draws something honest.
  const surface = p.surface ?? p.bg;
  const border = p.border ?? p.textMuted ?? p.text;
  const muted = p.textMuted ?? p.text;
  const accent = p.accent ?? p.primary;
  const link = p.link ?? p.primary;
  const onPrimary = p.onPrimary ?? p.bg;
  const onAccent = p.onAccent ?? p.bg;

  const W = 760;
  const bar = 40;
  const body = 400;
  const H = swatches ? 476 : body;
  const sideW = 190;

  const out = [rect(0, 0, W, H, p.bg, { rx: 12 })];

  // title bar, with the status colors doing duty as window buttons
  out.push(
    rect(0, 0, W, bar, surface, { rx: 12 }),
    rect(0, bar - 12, W, 12, surface),
    `<line x1="0" y1="${bar}" x2="${W}" y2="${bar}" stroke="${border}" stroke-width="1"/>`,
  );
  [p.danger, p.warning, p.success].forEach((c, i) => {
    if (c) out.push(`<circle cx="${20 + i * 18}" cy="${bar / 2}" r="5" fill="${c}"/>`);
  });
  out.push(label(W / 2, bar / 2 + 4, title, muted, { size: 11.5, anchor: 'middle', family: MONO }));

  // sidebar
  out.push(
    rect(0, bar, sideW, body - bar, surface),
    `<line x1="${sideW}" y1="${bar}" x2="${sideW}" y2="${body}" stroke="${border}" stroke-width="1"/>`,
  );
  NAV.forEach((item, i) => {
    const y = bar + 26 + i * 34;
    if (i === 0) {
      out.push(rect(12, y - 2, sideW - 24, 30, p.primary, { rx: 7, opacity: 0.16 }));
      out.push(rect(12, y - 2, 3, 30, p.primary, { rx: 1.5 }));
    }
    out.push(label(28, y + 18, item, i === 0 ? p.text : muted, { size: 12.5, weight: i === 0 ? 600 : undefined }));
  });

  // main column
  const mx = sideW + 28;
  out.push(
    label(mx, bar + 44, 'Good morning', p.text, { size: 20, weight: 650 }),
    label(mx, bar + 68, 'Four roles carry this theme. The rest stay out of the way.', muted, {
      size: 12.5,
    }),
  );

  // card
  const cx = mx;
  const cy = bar + 92;
  const cw = W - mx - 28;
  const ch = 168;
  out.push(rect(cx, cy, cw, ch, surface, { rx: 10, stroke: border }));
  out.push(
    label(cx + 20, cy + 32, 'Contrast is decided, not guessed', p.text, { size: 14, weight: 600 }),
    label(cx + 20, cy + 56, 'Body copy sits at the lightness the target demanded.', p.text, {
      size: 12.5,
    }),
    label(cx + 20, cy + 76, 'Secondary text deliberately reads quieter than body text.', muted, {
      size: 11.5,
    }),
  );

  const by = cy + 96;
  out.push(
    rect(cx + 20, by, 118, 34, p.primary, { rx: 8 }),
    label(cx + 79, by + 22, 'Get started', onPrimary, { size: 12.5, weight: 600, anchor: 'middle' }),
    rect(cx + 148, by, 96, 34, accent, { rx: 8 }),
    label(cx + 196, by + 22, 'Preview', onAccent, { size: 12.5, weight: 600, anchor: 'middle' }),
    label(cx + 262, by + 22, 'or read the docs', link, { size: 12.5 }),
    `<line x1="${cx + 262}" y1="${by + 26}" x2="${cx + 355}" y2="${by + 26}" stroke="${link}" stroke-width="1"/>`,
  );

  // status row
  const sy = cy + ch + 30;
  [
    ['success', p.success, 'Passing'],
    ['warning', p.warning, 'Review'],
    ['danger', p.danger, 'Failing'],
  ]
    .filter(([, color]) => color)
    .forEach(([, color, word], i) => {
      const x = mx + i * 118;
      out.push(
        rect(x, sy - 16, 106, 26, color, { rx: 13, opacity: 0.18 }),
        `<circle cx="${x + 16}" cy="${sy - 3}" r="4" fill="${color}"/>`,
        label(x + 28, sy + 1, word, muted, { size: 11.5 }),
      );
    });

  // swatch strip
  if (swatches) {
    const keys = Object.keys(p);
    const size = 26;
    const gap = 7;
    out.push(
      `<line x1="0" y1="${body}" x2="${W}" y2="${body}" stroke="${border}" stroke-width="1"/>`,
    );
    keys.forEach((key, i) => {
      const x = 24 + i * (size + gap);
      if (x + size > W - 20) return;
      out.push(rect(x, body + 24, size, size, p[key], { rx: 6, stroke: border }));
    });
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">\n` +
    `<title>${esc(title)}</title>\n${out.join('\n')}\n</svg>\n`
  );
}
