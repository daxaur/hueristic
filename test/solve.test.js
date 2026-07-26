import test from 'node:test';
import assert from 'node:assert/strict';
import { generateThemes, evaluateTheme } from '../src/index.js';
import { apcaAbs } from '../src/contrast.js';

const BRAND = ['#0f172a', '#34f003', '#e2e8f0'];

test('the same seed gives the same themes', () => {
  const a = generateThemes(BRAND, { seed: 42, count: 3 });
  const b = generateThemes(BRAND, { seed: 42, count: 3 });
  assert.deepEqual(
    a.themes.map((t) => t.palette),
    b.themes.map((t) => t.palette),
  );
});

test('a different seed explores somewhere else', () => {
  const a = generateThemes(BRAND, { seed: 1, count: 3 });
  const b = generateThemes(BRAND, { seed: 999, count: 3 });
  assert.notDeepEqual(a.themes[0].palette, b.themes[0].palette);
});

test('returned themes are ranked and distinct', () => {
  const { themes } = generateThemes(BRAND, { count: 4, seed: 7 });
  assert.ok(themes.length > 1, 'should offer a choice');

  // Distinctness is a property of the whole palette, not of any one role —
  // two themes may well settle on the same primary and differ everywhere else.
  for (let i = 1; i < themes.length; i++) {
    assert.ok(themes[i - 1].score >= themes[i].score, 'scores must descend');
    assert.notDeepEqual(themes[i - 1].palette, themes[i].palette);
  }
});

test('body text is readable when the palette allows it', () => {
  for (const mode of ['dark', 'light']) {
    const { themes } = generateThemes(['#ffffff', '#111111', '#2563eb'], { mode, count: 2 });
    for (const { palette } of themes) {
      const lc = apcaAbs(palette.text, palette.bg);
      assert.ok(lc >= 70, `${mode}: body text at Lc ${Math.round(lc)} is too weak`);
    }
  }
});

test('secondary text sits below body text', () => {
  const { themes } = generateThemes(BRAND, { count: 3, seed: 3 });
  for (const { palette } of themes) {
    const text = apcaAbs(palette.text, palette.bg);
    const muted = apcaAbs(palette.textMuted, palette.bg);
    assert.ok(muted < text, 'muted text must not outshout body text');
  }
});

test('the background lands in the band its mode needs', () => {
  const dark = generateThemes(BRAND, { mode: 'dark', count: 1 });
  const light = generateThemes(BRAND, { mode: 'light', count: 1 });
  assert.ok(apcaAbs('#ffffff', dark.themes[0].palette.bg) > 80, 'dark bg should be dark');
  assert.ok(apcaAbs('#000000', light.themes[0].palette.bg) > 80, 'light bg should be light');
});

test('weights pull a color into the role you care about', () => {
  const colors = ['#ffffff', '#111111', '#64748b', '#e11d48'];
  const neutral = generateThemes(colors, { seed: 5, count: 1, mode: 'light' });
  const forced = generateThemes(colors, {
    seed: 5,
    count: 1,
    mode: 'light',
    weights: { primary: 2.5 },
  });
  assert.notEqual(neutral.themes[0].score, forced.themes[0].score);
});

test('one color in is still a theme out', () => {
  const { themes } = generateThemes(['#7c3aed'], { count: 2 });
  assert.ok(themes.length >= 1);
  assert.ok(themes[0].palette.bg);
  assert.ok(themes[0].palette.text);
});

test('a large palette does not break the search', () => {
  const many = Array.from({ length: 24 }, (_, i) => {
    const hue = Math.round((i * 360) / 24)
      .toString(16)
      .padStart(2, '0');
    return `#${hue}80c0`;
  });
  const { themes } = generateThemes(many, { count: 3, restarts: 6, steps: 40 });
  assert.ok(themes.length >= 1);
});

test('duplicate inputs collapse before solving', () => {
  const { input } = generateThemes(['#ff0000', '#FF0000', '#f00'], { count: 1 });
  assert.deepEqual(input, ['#ff0000']);
});

test('bad input is rejected clearly', () => {
  assert.throws(() => generateThemes([]), /at least one color/);
  assert.throws(() => generateThemes(['#fff'], { mode: 'sepia' }), /dark.*light/);
});

test('every theme reports what it changed and why', () => {
  const { themes } = generateThemes(BRAND, { count: 1 });
  const { critique } = themes[0];
  assert.ok(critique.roles.length > 5);
  for (const role of critique.roles) {
    assert.ok(role.reason.length > 0, `${role.role} should explain itself`);
    assert.match(role.hex, /^#[0-9a-f]{6}$/);
  }
});

test('evaluate scores a good theme above a broken one', () => {
  const good = evaluateTheme(
    {
      bg: '#0f172a',
      surface: '#1e293b',
      border: '#475569',
      text: '#f8fafc',
      textMuted: '#94a3b8',
      primary: '#22c55e',
      link: '#4ade80',
    },
    { mode: 'dark' },
  );
  const broken = evaluateTheme(
    {
      bg: '#0f172a',
      surface: '#101828',
      border: '#f8fafc',
      text: '#334155',
      textMuted: '#f8fafc',
      primary: '#1e293b',
      link: '#0f172a',
    },
    { mode: 'dark' },
  );
  assert.ok(good.score > broken.score + 15, `${good.score} should beat ${broken.score}`);
  assert.ok(broken.critique.notes.length > 0, 'a broken theme should get told why');
});

test('evaluate leaves the colors it was given alone', () => {
  const palette = { bg: '#101010', text: '#fafafa', primary: '#ff0080' };
  const { critique } = evaluateTheme(palette, { mode: 'dark' });
  for (const role of critique.roles) {
    assert.equal(role.hex, palette[role.role]);
    assert.deepEqual(role.changes, []);
  }
});
