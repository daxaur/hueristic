import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../bin/hueristic.js', import.meta.url));
const run = (args) => execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

test('json output parses and carries the whole report', () => {
  const out = JSON.parse(run(['#0f172a', '#34f003', '-f', 'json', '-n', '2', '--effort', 'fast']));
  assert.equal(out.mode, 'dark');
  assert.equal(out.themes.length <= 2, true);

  const [first] = out.themes;
  assert.equal(first.rank, 1);
  assert.ok(first.score > 0);
  assert.ok(first.palette.bg && first.palette.text && first.palette.primary);
  assert.ok(Array.isArray(first.contrast));
  assert.ok(Array.isArray(first.critique.roles));
});

test('css and tailwind output are usable as written', () => {
  const css = run(['#111111', '#0af0ff', '-f', 'css', '-n', '1', '--effort', 'fast']);
  assert.match(css, /^:root \{/m);
  assert.match(css, /--text-muted: #[0-9a-f]{6};/);

  const tw = run(['#111111', '#0af0ff', '-f', 'tailwind', '-n', '1', '--effort', 'fast']);
  assert.match(tw, /^@theme \{/m);
  assert.match(tw, /--color-primary: #[0-9a-f]{6};/);
});

test('both modes come back from one call', () => {
  const out = JSON.parse(
    run(['#fafafa', '#111111', '#e11d48', '-m', 'both', '-f', 'json', '-n', '1', '--effort', 'fast']),
  );
  assert.equal(out.length, 2);
  assert.deepEqual(
    out.map((r) => r.mode),
    ['dark', 'light'],
  );
});

test('colors can arrive on stdin', () => {
  const out = execFileSync(process.execPath, [CLI, '-f', 'json', '-n', '1', '--effort', 'fast'], {
    encoding: 'utf8',
    input: '#0f172a, #34f003\n#e2e8f0',
  });
  assert.deepEqual(JSON.parse(out).input, ['#0f172a', '#34f003', '#e2e8f0']);
});

test('help is what you get with no arguments', () => {
  const help = run(['--help']);
  assert.match(help, /weighted color theme solver/);
  assert.match(help, /--weight/);
});

test('unknown options fail loudly', () => {
  assert.throws(() => run(['#fff', '--nonsense']), /status 2|unknown option/);
});
