import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPreview, generateThemes } from '../src/index.js';
import { apcaAbs } from '../src/contrast.js';

const palette = generateThemes(['#0f172a', '#34f003', '#e2e8f0'], { count: 1, seed: 2 }).themes[0]
  .palette;

test('renders a self-contained svg', () => {
  const svg = renderPreview(palette);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<\/svg>\n$/);
  assert.doesNotMatch(svg, /<script|href=|xlink/i, 'nothing external, nothing executable');
});

test('every color in the palette actually appears', () => {
  const svg = renderPreview(palette);
  for (const [role, hex] of Object.entries(palette)) {
    assert.ok(svg.includes(hex), `${role} (${hex}) missing from the preview`);
  }
});

test('the title is escaped, not injected', () => {
  const svg = renderPreview(palette, { title: '<script>alert(1)</script>' });
  assert.ok(!svg.includes('<script>'));
  assert.ok(svg.includes('&lt;script&gt;'));
});

test('same palette renders the same bytes', () => {
  assert.equal(renderPreview(palette), renderPreview(palette));
});

test('a partial palette still draws', () => {
  const svg = renderPreview({ bg: '#101010', text: '#fafafa', primary: '#ff0080' });
  assert.match(svg, /^<svg/);
  assert.ok(svg.includes('#ff0080'));
});

test('it refuses a palette it cannot draw', () => {
  assert.throws(() => renderPreview({ bg: '#fff' }), /missing text/);
  assert.throws(() => renderPreview({ bg: '#fff', text: '#000' }), /missing primary/);
});

test('charts can be turned off, and the canvas narrows to suit', () => {
  const wide = Number(renderPreview(palette).match(/width="(\d+)"/)[1]);
  const narrow = Number(renderPreview(palette, { charts: false }).match(/width="(\d+)"/)[1]);
  assert.ok(narrow < wide, `${narrow} should be narrower than ${wide}`);
});

test('the charts carry real measurements, not decoration', () => {
  const svg = renderPreview(palette);
  assert.match(svg, /CONTRAST/);
  assert.match(svg, /WEIGHT/);
  // body text Lc against the background must appear as a printed number
  const lc = String(Math.round(apcaAbs(palette.text, palette.bg)));
  assert.ok(svg.includes(`>${lc}<`), `expected the real Lc ${lc} to be printed`);
  assert.ok(svg.includes('>1.00<'), 'expected a printed role weight');
});

// The layout runs off a cursor, so a spacing change could silently push content
// past the edge. Measure it instead of hoping.
test('nothing is drawn outside the canvas', () => {
  const svg = renderPreview(palette, { title: 'bounds check' });
  const [, w, h] = svg.match(/viewBox="0 0 (\d+) (\d+)"/).map(Number);

  for (const m of svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)) {
    assert.ok(+m[1] + +m[3] <= w + 0.5, `a rect reaches x=${+m[1] + +m[3]}, past ${w}`);
    assert.ok(+m[2] + +m[4] <= h + 0.5, `a rect reaches y=${+m[2] + +m[4]}, past ${h}`);
  }

  for (const m of svg.matchAll(/<text x="([\d.]+)"[^>]*font-size="([\d.]+)"[^>]*>([^<]*)</g)) {
    const width = m[3].length * Number(m[2]) * 0.62; // generous monospace estimate
    assert.ok(+m[1] + width <= w, `text "${m[3]}" runs to ${Math.round(+m[1] + width)}, past ${w}`);
  }
});
