import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPreview, generateThemes } from '../src/index.js';

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

test('swatches can be turned off, and the canvas shrinks', () => {
  const withStrip = renderPreview(palette);
  const without = renderPreview(palette, { swatches: false });
  assert.ok(withStrip.includes('height="476"'));
  assert.ok(without.includes('height="400"'));
});
