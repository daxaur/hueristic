#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { generateThemes, evaluateTheme } from '../src/index.js';
import { formatResult, toTerminal } from '../src/format.js';

const HELP = `hueristic — weighted color theme solver

  hueristic <color...> [options]

  Give it any number of colors. It assigns them to UI roles, tunes each one
  until the theme is readable, and returns the best candidates it found.

Options
  -m, --mode <dark|light|both>   which mode to solve for            (dark)
  -n, --count <n>                how many themes to return          (3)
  -s, --seed <n>                 same seed gives the same themes    (1)
  -w, --weight <role=value>      override a role weight, repeatable
  -f, --format <fmt>             table | json | css | tailwind | tokens
      --pick <n>                 output only the nth theme
      --effort <fast|normal|deep>  search budget                    (normal)
      --no-status                skip success/warning/danger roles
      --evaluate <json|file>     score an existing theme instead
  -h, --help

Examples
  hueristic '#0f172a' '#34f003' '#e2e8f0'
  hueristic '#5b21b6' '#f59e0b' --mode light --count 5 --format json
  hueristic '#111' '#0af' --weight primary=1.6 --weight textMuted=0.2
  hueristic --evaluate theme.json --mode dark
`;

const EFFORT = {
  fast: { restarts: 8, steps: 60 },
  normal: { restarts: 18, steps: 150 },
  deep: { restarts: 48, steps: 400 },
};

function parseArgs(argv) {
  const opts = {
    colors: [],
    mode: 'dark',
    count: 3,
    seed: 1,
    weights: {},
    format: 'table',
    effort: 'normal',
    includeStatus: true,
    pick: null,
    evaluate: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];

    switch (arg) {
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '-m':
      case '--mode':
        opts.mode = next();
        break;
      case '-n':
      case '--count':
        opts.count = Number(next());
        break;
      case '-s':
      case '--seed':
        opts.seed = Number(next());
        break;
      case '-f':
      case '--format':
        opts.format = next();
        break;
      case '--effort':
        opts.effort = next();
        break;
      case '--pick':
        opts.pick = Number(next());
        break;
      case '--no-status':
        opts.includeStatus = false;
        break;
      case '--evaluate':
        opts.evaluate = next();
        break;
      case '-w':
      case '--weight': {
        const [key, value] = String(next()).split('=');
        opts.weights[key] = Number(value);
        break;
      }
      default:
        if (arg.startsWith('-')) throw new Error(`unknown option: ${arg}`);
        opts.colors.push(arg);
    }
  }
  return opts;
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function loadEvaluate(source) {
  const text = source.trim().startsWith('{') ? source : readFileSync(source, 'utf8');
  return JSON.parse(text);
}

function run(opts) {
  if (opts.evaluate) {
    const palette = loadEvaluate(opts.evaluate);
    const modes = opts.mode === 'both' ? ['dark', 'light'] : [opts.mode];
    const results = modes.map((mode) => ({
      mode,
      ...evaluateTheme(palette, { mode, weights: opts.weights }),
    }));

    if (opts.format === 'json') return JSON.stringify(results, null, 2);
    return results
      .map((r) =>
        [
          `  ${r.mode} — ${r.score}/100`,
          ...r.critique.roles.map(
            (role) =>
              `    ${role.role.padEnd(10)} ${role.hex}  ${role.lc === null ? '' : `Lc ${role.lc}`}${role.meetsTarget ? '' : `  short of ${role.targetLc}`}`,
          ),
          ...r.critique.notes.map((n) => `    · ${n}`),
        ].join('\n'),
      )
      .join('\n\n');
  }

  const budget = EFFORT[opts.effort];
  if (!budget) throw new Error(`unknown effort: ${opts.effort}`);

  const modes = opts.mode === 'both' ? ['dark', 'light'] : [opts.mode];
  const runs = modes.map((mode) =>
    generateThemes(opts.colors, {
      mode,
      count: opts.count,
      seed: opts.seed,
      weights: opts.weights,
      includeStatus: opts.includeStatus,
      ...budget,
    }),
  );

  for (const result of runs) {
    if (opts.pick) result.themes = result.themes.slice(opts.pick - 1, opts.pick);
  }

  if (opts.format === 'json') {
    return JSON.stringify(runs.length === 1 ? runs[0] : runs, null, 2);
  }

  if (opts.format !== 'table') {
    return runs
      .flatMap((run) => run.themes.map((theme) => formatResult(theme, opts.format)))
      .join('\n\n');
  }

  return runs
    .map((run) => {
      const header = `\n  ${run.mode} mode · ${run.input.join(' ')}\n`;
      const themes = run.themes.map((theme, i) =>
        toTerminal(theme, { index: i + 1, total: run.themes.length }),
      );
      return [header, ...themes].join('\n');
    })
    .join('\n');
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }

  if (opts.help) {
    process.stdout.write(HELP);
    return;
  }

  if (!opts.colors.length && !opts.evaluate && !process.stdin.isTTY) {
    opts.colors = readStdin().split(/[\s,]+/).filter(Boolean);
  }

  if (!opts.colors.length && !opts.evaluate) {
    process.stdout.write(HELP);
    process.exit(1);
  }

  try {
    process.stdout.write(`${run(opts)}\n`);
  } catch (error) {
    console.error(`hueristic: ${error.message}`);
    process.exit(1);
  }
}

main();
