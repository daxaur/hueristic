import { parseHex } from './color.js';
import { renderPreview } from './preview.js';

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

export function toCss(theme, { selector = ':root', prefix = '' } = {}) {
  const lines = Object.entries(theme).map(
    ([key, entry]) => `  --${prefix}${kebab(key)}: ${entry.hex};`,
  );
  return `${selector} {\n${lines.join('\n')}\n}`;
}

export function toTailwind(theme) {
  const lines = Object.entries(theme).map(
    ([key, entry]) => `  --color-${kebab(key)}: ${entry.hex};`,
  );
  return `@theme {\n${lines.join('\n')}\n}`;
}

export function toTokens(theme) {
  // W3C design token draft shape, so this can be dropped into a token pipeline.
  return Object.fromEntries(
    Object.entries(theme).map(([key, entry]) => [key, { $type: 'color', $value: entry.hex }]),
  );
}

const swatch = (hex) => {
  const [r, g, b] = parseHex(hex);
  return `\x1b[48;2;${r};${g};${b}m   \x1b[0m`;
};

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

export function toTerminal(result, { index = 1, total = 1 } = {}) {
  const { score, breakdown, critique } = result;
  const out = [];

  out.push(bold(`  Theme ${index}/${total}  ${score}/100`));
  out.push(
    dim(
      `  harmony ${Math.round(breakdown.harmony * 100)}  coherence ${Math.round(breakdown.coherence * 100)}`,
    ),
  );
  out.push('');

  const width = Math.max(...critique.roles.map((r) => r.role.length));
  for (const role of critique.roles) {
    const name = role.role.padEnd(width);
    const contrast = role.lc === null ? '     ' : `Lc ${String(role.lc).padStart(3)}`;
    const flag = role.meetsTarget ? ' ' : '!';
    const moved = role.from && role.from !== role.hex ? dim(` was ${role.from}`) : '';
    out.push(`  ${swatch(role.hex)} ${name}  ${role.hex}  ${contrast} ${flag}${moved}`);
  }

  const changed = critique.roles.filter((r) => r.changes.length);
  if (changed.length) {
    out.push('');
    out.push(dim('  changes'));
    for (const role of changed) {
      out.push(dim(`    ${role.role}: ${role.changes.join(', ')} — ${role.reason}`));
    }
  }

  if (critique.notes.length) {
    out.push('');
    for (const note of critique.notes) out.push(`  ${dim('·')} ${note}`);
  }

  return out.join('\n');
}

export function formatResult(result, format, options = {}) {
  switch (format) {
    case 'css':
      return toCss(result.theme);
    case 'tailwind':
      return toTailwind(result.theme);
    case 'tokens':
      return JSON.stringify(toTokens(result.theme), null, 2);
    case 'preview':
      return renderPreview(result.palette, {
        title: `${options.mode ?? ''} · ${result.score}/100`.trim(),
      });
    case 'json':
      return JSON.stringify(result, null, 2);
    default:
      return toTerminal(result);
  }
}
