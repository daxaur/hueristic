import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHex, hexToOklch, oklchToHex, clipToGamut, deltaE, hueDistance } from '../src/color.js';
import { apca, wcagRatio, wcagLevel } from '../src/contrast.js';

test('parses every hex shorthand', () => {
  assert.deepEqual(parseHex('#fff'), [255, 255, 255]);
  assert.deepEqual(parseHex('fff'), [255, 255, 255]);
  assert.deepEqual(parseHex('#34f003'), [52, 240, 3]);
  assert.throws(() => parseHex('nope'));
});

test('hex survives a round trip through oklch', () => {
  for (const hex of ['#000000', '#ffffff', '#34f003', '#5b21b6', '#64748b', '#f59e0b']) {
    assert.equal(oklchToHex(hexToOklch(hex)), hex);
  }
});

test('gamut clipping keeps hue and lands inside sRGB', () => {
  const wild = { L: 0.55, C: 0.9, h: 140 };
  const clipped = clipToGamut(wild);
  assert.equal(clipped.h, 140);
  assert.ok(clipped.C < wild.C, 'chroma should come down');
  assert.match(oklchToHex(wild), /^#[0-9a-f]{6}$/);
});

test('hue distance wraps the short way round', () => {
  assert.equal(hueDistance(10, 350), 20);
  assert.equal(hueDistance(0, 180), 180);
  assert.equal(hueDistance(200, 200), 0);
});

test('deltaE is zero for a color against itself', () => {
  const c = hexToOklch('#5b21b6');
  assert.equal(deltaE(c, c), 0);
  assert.ok(deltaE(c, hexToOklch('#ffffff')) > 0.5);
});

// The numbers below are the published APCA 0.1.9 reference values. If a change
// to contrast.js moves them, the change is wrong.
test('apca matches its reference values', () => {
  assert.ok(Math.abs(apca('#000000', '#ffffff') - 106.04) < 0.01);
  assert.ok(Math.abs(apca('#ffffff', '#000000') + 107.88) < 0.01);
  assert.ok(Math.abs(apca('#888888', '#ffffff') - 63.06) < 0.01);
});

test('apca signs the polarity', () => {
  assert.ok(apca('#111111', '#eeeeee') > 0, 'dark on light is positive');
  assert.ok(apca('#eeeeee', '#111111') < 0, 'light on dark is negative');
  assert.equal(apca('#777777', '#777777'), 0);
});

test('wcag ratio and levels', () => {
  assert.equal(wcagRatio('#ffffff', '#000000'), 21);
  assert.equal(wcagLevel(21), 'AAA');
  assert.equal(wcagLevel(4.6), 'AA');
  assert.equal(wcagLevel(3.2), 'AA-large');
  assert.equal(wcagLevel(1.5), 'fail');
});
