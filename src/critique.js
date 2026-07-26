// Turns a solved theme back into advice: for every role, what changed against
// the color you handed in, and why it had to.

import { apcaAbs, wcagRatio, wcagLevel, apcaAdvice } from './contrast.js';
import { hueDistance, deltaE, hexToOklch } from './color.js';

const pct = (x) => `${x > 0 ? '+' : ''}${Math.round(x * 100)}%`;

function describeChange(entry) {
  if (!entry.source) return [];
  const from = entry.source.lch;
  const to = entry.lch;
  const changes = [];

  const dL = to.L - from.L;
  if (Math.abs(dL) >= 0.015) changes.push(`lightness ${pct(dL)}`);

  if (from.C > 0.005) {
    const dC = (to.C - from.C) / from.C;
    if (Math.abs(dC) >= 0.08) changes.push(`chroma ${pct(dC)}`);
  } else if (to.C > 0.02) {
    changes.push('chroma added');
  }

  const dH = hueDistance(from.h, to.h);
  if (dH >= 1.5 && to.C > 0.02) changes.push(`hue ${Math.round(dH)}°`);

  return changes;
}

function reasonFor(role, entry, theme) {
  if (role.derived) return `derived to sit on ${role.on}`;
  if (role.hue) return 'anchored to the conventional hue for this meaning';
  if (role.key === 'bg') return 'pulled into the lightness band a background needs';
  if (role.kind === 'surface') return 'offset from the background so panels read as raised';

  const against = theme[role.on];
  if (!against || !entry.source) return 'tuned to fit the palette';

  const before = Math.round(apcaAbs(entry.source.hex, against.hex));
  const after = Math.round(entry.lc ?? 0);
  if (before === after) return `already cleared Lc ${role.targetLc} on ${role.on}`;
  return `Lc ${before} on ${role.on}, needs ${role.targetLc} — now ${after}`;
}

export function critique(theme, table, inputs) {
  const roles = table
    .filter((role) => theme[role.key])
    .map((role) => {
      const entry = theme[role.key];
      const against = theme[role.on];
      const lc = Math.round(entry.lc ?? 0);
      const ratio = against ? wcagRatio(entry.hex, against.hex) : null;
      const changes = describeChange(entry);

      return {
        role: role.key,
        label: role.label,
        weight: role.weight,
        hex: entry.hex,
        from: entry.source?.hex ?? null,
        on: role.on,
        lc: role.kind === 'surface' ? null : lc,
        targetLc: role.targetLc ?? null,
        meetsTarget: role.targetLc ? lc >= role.targetLc - 1 : true,
        wcag: ratio ? { ratio: Math.round(ratio * 100) / 100, level: wcagLevel(ratio) } : null,
        usableFor: role.kind === 'surface' ? null : apcaAdvice(lc),
        changes,
        reason: reasonFor(role, entry, theme),
      };
    });

  return { roles, notes: globalNotes(theme, table, inputs, roles) };
}

function globalNotes(theme, table, inputs, roles) {
  const notes = [];

  const used = new Set(
    Object.values(theme)
      .map((e) => e.source?.hex)
      .filter(Boolean),
  );
  const unused = inputs.filter((hex) => !used.has(hex));
  if (unused.length) {
    notes.push(
      `${unused.join(', ')} did not earn a role — no slot suited ${unused.length > 1 ? 'them' : 'it'} better than the colors that won.`,
    );
  }

  const short = roles.filter((r) => r.targetLc && !r.meetsTarget);
  for (const r of short) {
    const against = theme[r.on];
    // Before blaming the palette, check whether one of the colors we passed
    // over would have cleared the bar untouched.
    const rescue = against
      ? inputs.filter((hex) => hex !== r.from && apcaAbs(hex, against.hex) >= r.targetLc)
      : [];

    if (rescue.length) {
      notes.push(
        `${r.label}: Lc ${r.lc}, short of ${r.targetLc}. ${rescue[0]} clears it on ${r.on} untouched — that color belongs in this role. Weight ${r.role} up to force it.`,
      );
    } else {
      notes.push(
        `${r.label}: Lc ${r.lc}, short of ${r.targetLc}, and nothing in the palette closes that on ${r.on}. Change ${r.on}, or accept ${r.usableFor}.`,
      );
    }
  }

  const hues = inputs.map(hexToOklch).filter((lch) => lch.C > 0.04);
  if (hues.length >= 3) {
    const spread = Math.max(...hues.map((a) => Math.max(...hues.map((b) => hueDistance(a.h, b.h)))));
    if (spread < 18) {
      notes.push(
        `All your saturated inputs sit within ${Math.round(spread)}° of hue. The theme will read as monochrome — add a color 120-180° away if you want an accent that actually pops.`,
      );
    }
  }

  const heavy = roles.filter((r) => r.weight >= 0.9 && r.changes.length >= 2 && r.from);
  for (const r of heavy) {
    notes.push(
      `${r.label} carries the theme and ${r.from} still needed ${r.changes.join(' and ')}. If that exact color is non-negotiable, it cannot hold this role here — move it somewhere with less contrast to satisfy.`,
    );
  }

  return notes;
}

export function contrastMatrix(theme, pairs) {
  return pairs
    .filter(([a, b]) => theme[a] && theme[b])
    .map(([a, b]) => ({
      pair: `${a} on ${b}`,
      lc: Math.round(apcaAbs(theme[a].hex, theme[b].hex)),
      wcag: Math.round(wcagRatio(theme[a].hex, theme[b].hex) * 100) / 100,
    }));
}

export const paletteDrift = (theme) =>
  Object.values(theme)
    .filter((e) => e.source)
    .reduce((max, e) => Math.max(max, deltaE(e.lch, e.source.lch)), 0);
