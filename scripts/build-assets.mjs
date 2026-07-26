// Builds the README figures. Every number in them comes out of the solver, and
// every color is mixed by the library itself — the rainbow is a straight OKLCh
// hue sweep at fixed lightness and chroma, which is the whole point being made.
//
//   node scripts/build-assets.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { generateThemes } from '../src/index.js';
import { roleTable } from '../src/roles.js';
import { oklchToHex } from '../src/color.js';
import { renderPreview } from '../src/preview.js';
import { apcaAbs } from '../src/contrast.js';

const OUT = new URL('../assets/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const FONT =
  "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";

const THEMES = {
  light: { bg: '#fafafa', fg: '#18181b', muted: '#71717a', grid: '#e4e4e7', track: '#ececef' },
  dark: { bg: '#0d0d11', fg: '#fafafa', muted: '#a1a1aa', grid: '#27272a', track: '#1c1c22' },
};

// The brand spectrum: equal steps around the hue circle at one lightness and
// one chroma. Perceptually even by construction, which a naive HSL rainbow is not.
const sweep = (i, n, { L = 0.72, C = 0.16, from = 268 } = {}) =>
  oklchToHex({ L, C, h: (from + (i / n) * 330) % 360 });

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const text = (x, y, content, { size = 13, fill, anchor = 'start', family = FONT, weight } = {}) =>
  `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" fill="${fill}"` +
  `${anchor === 'start' ? '' : ` text-anchor="${anchor}"`}` +
  `${weight ? ` font-weight="${weight}"` : ''}>${esc(content)}</text>`;

const svg = (w, h, body, t) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">\n` +
  `<rect width="${w}" height="${h}" rx="10" fill="${t.bg}"/>\n${body}\n</svg>\n`;

const write = (name, contents) => {
  writeFileSync(new URL(name, OUT), contents);
  console.log(`  ${name}`);
};

// ---------------------------------------------------------------- role weights

function roleWeights(t) {
  // Derived roles are in here too — they are not picked from your inputs, but
  // they still carry weight in the score.
  const roles = roleTable({ mode: 'dark' }).sort((a, b) => b.weight - a.weight);

  const pad = 28;
  const labelW = 96;
  const rowH = 26;
  const barW = 560;
  const w = pad * 2 + labelW + barW + 56;
  const h = pad * 2 + 34 + roles.length * rowH;

  const parts = [
    text(pad, pad + 12, 'Role weights', { size: 15, fill: t.fg, weight: 600 }),
    text(pad, pad + 30, 'how much each role counts toward the score', {
      size: 12,
      fill: t.muted,
    }),
  ];

  roles.forEach((role, i) => {
    const y = pad + 52 + i * rowH;
    const x = pad + labelW;
    const width = Math.round(barW * role.weight);

    parts.push(
      text(x - 10, y + 4, role.key, { size: 12, fill: t.muted, anchor: 'end', family: MONO }),
      `<rect x="${x}" y="${y - 7}" width="${barW}" height="12" rx="6" fill="${t.track}"/>`,
      `<rect x="${x}" y="${y - 7}" width="${width}" height="12" rx="6" fill="${sweep(i, roles.length)}"/>`,
      text(x + barW + 12, y + 4, role.weight.toFixed(2), {
        size: 12,
        fill: t.muted,
        family: MONO,
      }),
    );
  });

  return svg(w, h, parts.join('\n'), t);
}

// ------------------------------------------------------------- ranked palettes

function rankedPalettes(t, mode) {
  const inputs = ['#5b21b6', '#f59e0b', '#fafafa', '#18181b', '#ec4899', '#06b6d4'];
  const { themes } = generateThemes(inputs, { mode, count: 3, seed: 3 });
  const keys = ['bg', 'surface', 'border', 'text', 'textMuted', 'primary', 'accent', 'link'];

  const pad = 28;
  const sw = 70;
  const gap = 9;
  const rowH = 76;
  const headTop = pad + 84;
  const w = pad * 2 + keys.length * (sw + gap) - gap;
  const h = headTop + 14 + themes.length * rowH;

  const parts = [
    text(pad, pad + 12, 'Three candidates, same six colors', { size: 15, fill: t.fg, weight: 600 }),
    text(pad, pad + 30, `${mode} mode · ranked by the objective function`, {
      size: 12,
      fill: t.muted,
    }),
  ];

  // The six colors that went in.
  inputs.forEach((hex, i) => {
    const x = pad + i * 26;
    parts.push(
      `<rect x="${x}" y="${pad + 42}" width="18" height="18" rx="4" fill="${hex}" stroke="${t.grid}"/>`,
    );
  });
  parts.push(
    text(pad + inputs.length * 26 + 6, pad + 56, 'in', { size: 11, fill: t.muted, family: MONO }),
  );

  keys.forEach((key, j) => {
    parts.push(
      text(pad + j * (sw + gap), headTop, key, { size: 10, fill: t.muted, family: MONO }),
    );
  });

  themes.forEach((theme, i) => {
    const y = headTop + 14 + i * rowH;
    parts.push(
      text(pad, y + 12, `#${theme.rank}`, { size: 12, fill: t.fg, weight: 600, family: MONO }),
      text(pad + 26, y + 12, `${theme.score}`, { size: 12, fill: t.muted, family: MONO }),
    );

    keys.forEach((key, j) => {
      const hex = theme.palette[key];
      if (!hex) return;
      const x = pad + j * (sw + gap);
      parts.push(
        `<rect x="${x}" y="${y + 22}" width="${sw}" height="32" rx="6" fill="${hex}" stroke="${t.grid}"/>`,
        text(x, y + 66, hex, { size: 9.5, fill: t.muted, family: MONO }),
      );
    });
  });

  return svg(w, h, parts.join('\n'), t);
}

// ------------------------------------------------------------- contrast ladder

function contrastLadder(t) {
  const { themes } = generateThemes(['#0f172a', '#34f003', '#e2e8f0'], {
    mode: 'dark',
    count: 1,
    seed: 4,
  });
  const theme = themes[0];
  const rows = theme.critique.roles.filter((r) => r.targetLc);

  const pad = 28;
  const labelW = 96;
  const rowH = 26;
  const barW = 520;
  const scale = barW / 110;
  const w = pad * 2 + labelW + barW + 70;
  const h = pad * 2 + 34 + rows.length * rowH;

  const parts = [
    text(pad, pad + 12, 'Contrast against target', { size: 15, fill: t.fg, weight: 600 }),
    text(pad, pad + 30, 'APCA Lc achieved · tick marks the role requirement', {
      size: 12,
      fill: t.muted,
    }),
  ];

  rows.forEach((row, i) => {
    const y = pad + 52 + i * rowH;
    const x = pad + labelW;
    const achieved = Math.min(row.lc, 110) * scale;
    const target = row.targetLc * scale;

    parts.push(
      text(x - 10, y + 4, row.role, { size: 12, fill: t.muted, anchor: 'end', family: MONO }),
      `<rect x="${x}" y="${y - 7}" width="${barW}" height="12" rx="6" fill="${t.track}"/>`,
      // Outlined, because a role that resolved to black would otherwise vanish
      // into a dark background.
      `<rect x="${x}" y="${y - 7}" width="${Math.round(achieved)}" height="12" rx="6" fill="${theme.palette[row.role]}" stroke="${t.grid}" stroke-width="0.75"/>`,
      `<rect x="${x + target}" y="${y - 12}" width="2" height="22" rx="1" fill="${t.fg}" opacity="0.55"/>`,
      text(x + barW + 12, y + 4, `${row.lc}`, { size: 12, fill: t.muted, family: MONO }),
      text(x + barW + 44, y + 4, `/${row.targetLc}`, { size: 11, fill: t.grid, family: MONO }),
    );
  });

  return svg(w, h, parts.join('\n'), t);
}

// -------------------------------------------------------------------- pipeline

function pipeline(t) {
  const steps = [
    ['any number of colors', 'no fixed arity'],
    ['weighted roles', 'bg · text · primary …'],
    ['seeded search', 'restart · climb · score'],
    ['ranked themes', 'deduped, with reasons'],
  ];

  const pad = 28;
  const boxW = 196;
  const boxH = 62;
  const gap = 30;
  const w = pad * 2 + steps.length * boxW + (steps.length - 1) * gap;
  const h = pad * 2 + 46 + boxH;

  const parts = [text(pad, pad + 12, 'The pipeline', { size: 15, fill: t.fg, weight: 600 })];

  steps.forEach(([title, sub], i) => {
    const x = pad + i * (boxW + gap);
    const y = pad + 36;
    const color = sweep(i, steps.length);

    parts.push(
      `<rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="8" fill="${t.track}" stroke="${t.grid}"/>`,
      `<rect x="${x}" y="${y}" width="4" height="${boxH}" rx="2" fill="${color}"/>`,
      text(x + 16, y + 26, title, { size: 12.5, fill: t.fg, weight: 600 }),
      text(x + 16, y + 44, sub, { size: 11, fill: t.muted, family: MONO }),
    );

    if (i < steps.length - 1) {
      const ax = x + boxW + gap / 2;
      const ay = y + boxH / 2;
      parts.push(
        `<path d="M${ax - 9} ${ay} H${ax + 5} M${ax + 1} ${ay - 4} L${ax + 5} ${ay} L${ax + 1} ${ay + 4}" fill="none" stroke="${t.muted}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
    }
  });

  return svg(w, h, parts.join('\n'), t);
}

// ------------------------------------------------------------- brand spectrum

function spectrum(t) {
  const n = 48;
  const w = 1000;
  const h = 20;
  const bw = w / n;

  const bars = Array.from(
    { length: n },
    (_, i) => `<rect x="${(i * bw).toFixed(2)}" y="0" width="${(bw + 0.6).toFixed(2)}" height="${h}" fill="${sweep(i, n)}"/>`,
  );

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">\n` +
    `<g>${bars.join('')}</g>\n</svg>\n`
  );
}

// --------------------------------------------------------------- theme preview

function previews() {
  const inputs = ['#5b21b6', '#f59e0b', '#fafafa', '#18181b', '#ec4899', '#06b6d4'];
  for (const mode of ['light', 'dark']) {
    const { themes } = generateThemes(inputs, { mode, count: 1, seed: 3 });
    write(
      `preview-${mode}.svg`,
      renderPreview(themes[0].palette, { title: `${mode} · ${themes[0].score}/100` }),
    );
  }
}

// ------------------------------------------------------------------------ main

console.log('writing assets/');
for (const [name, theme] of Object.entries(THEMES)) {
  write(`weights-${name}.svg`, roleWeights(theme));
  write(`palettes-${name}.svg`, rankedPalettes(theme, name === 'dark' ? 'dark' : 'light'));
  write(`contrast-${name}.svg`, contrastLadder(theme));
  write(`pipeline-${name}.svg`, pipeline(theme));
}
write('spectrum.svg', spectrum(THEMES.light));
previews();

// A quick sanity check that the ladder is telling the truth.
const { themes } = generateThemes(['#0f172a', '#34f003', '#e2e8f0'], {
  mode: 'dark',
  count: 1,
  seed: 4,
});
const { palette } = themes[0];
console.log(
  `\nverified: text on bg is Lc ${Math.round(apcaAbs(palette.text, palette.bg))} in the figure and in the solver`,
);
