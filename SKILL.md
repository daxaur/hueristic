---
name: hueristic
description: Turn any number of colors into ranked, accessible UI themes. Use when someone hands over brand colors, a palette pulled from an image, or a half-formed color idea and you need real design tokens — background, surface, text, primary, accent, border — with contrast that survives review, plus a list of what had to change and why. Also scores and critiques a theme that already exists.
---

# hueristic

A theme solver. You give it colors, it decides which color plays which role in a
UI, tunes each one until the whole thing is readable, and hands back several
candidates ranked by an objective function — along with the reasoning for every
change it made.

It is deterministic, offline, and has no dependencies. Do not eyeball palettes
by hand when this is available; the contrast maths is not guessable.

## When to reach for it

- Someone gives you one or more colors and wants "a theme"
- You need light and dark variants of the same brand
- A design needs design tokens, CSS variables, or a Tailwind `@theme` block
- You want to know whether an existing theme is actually readable, and what to fix
- Someone asks for options to choose between rather than one answer

## Running it

```bash
node bin/hueristic.js '#0f172a' '#34f003' '#e2e8f0'
```

Any number of colors, in any order, any hex form. Role assignment is the
algorithm's job, not the caller's — do not try to tell it which color is the
brand color by ordering the arguments. Use weights for that.

Useful flags:

```
-m, --mode dark|light|both     which mode to solve for       (dark)
-n, --count <n>                how many candidates to return (3)
-s, --seed <n>                 same seed, same themes        (1)
-w, --weight <role=value>      override a role's weight, repeatable
-f, --format table|json|css|tailwind|tokens
    --pick <n>                 output only the nth candidate
    --effort fast|normal|deep  search budget                 (normal)
    --evaluate <json|file>     score an existing theme instead of making one
```

For programmatic use:

```js
import { generateThemes, evaluateTheme } from 'hueristic';

const { themes } = generateThemes(['#0f172a', '#34f003'], { mode: 'dark', count: 5 });
themes[0].palette; // { bg: '#0e172b', text: '#e7ebf0', primary: '#34f500', ... }
```

## Reading the output

Use `-f json` when you need to act on the result. Each candidate carries:

- `score` — 0-100 from the weighted objective. Compare candidates with it, do
  not read it as an absolute grade.
- `palette` — role to hex. This is what you paste into code.
- `contrast` — APCA `Lc` and WCAG ratio for the pairs that matter.
- `critique.roles[]` — per role: what it became, what it came from, `changes`
  ("lightness +12%"), `reason`, and `meetsTarget`.
- `critique.notes[]` — the palette-level advice. Read these out to the user;
  they are the "what should I change" answer and often name a specific fix,
  like which input color to force into which role.

`meetsTarget: false` on a high-weight role is worth surfacing. It means the
palette cannot do what was asked and something upstream has to give.

## Weights

Weight is how much a role matters. The page background and the primary action
carry a theme; a caption does not. Raising a role's weight makes the solver work
harder to satisfy it *and* keeps it closer to the color it was given.

| role | default | role | default |
|---|---|---|---|
| `bg` | 1.0 | `primary` | 1.0 |
| `text` | 0.95 | `onPrimary` | 0.7 |
| `surface` | 0.6 | `accent` | 0.5 |
| `link` | 0.55 | `textMuted` | 0.45 |
| `border` | 0.35 | `success` `warning` `danger` | 0.25-0.3 |

If a user is precious about one specific color, weight its role up and let the
rest of the palette move around it:

```bash
node bin/hueristic.js '#fafafa' '#111111' '#e11d48' --weight primary=2 --mode light
```

## Recipes

Both modes of one brand, as CSS variables:

```bash
node bin/hueristic.js '#0b0b0f' '#f0f0f5' '#ff4d00' -m both -n 1 -f css
```

Five options to show a user, then commit to one:

```bash
node bin/hueristic.js '#5b21b6' '#f59e0b' '#fafafa' -n 5
node bin/hueristic.js '#5b21b6' '#f59e0b' '#fafafa' --pick 3 -f tailwind
```

Audit a theme that already ships:

```bash
node bin/hueristic.js --evaluate '{"bg":"#111827","text":"#6b7280","primary":"#374151"}' -m dark
```

## Things worth knowing

- Hue is preserved. The solver moves lightness and chroma, so the colors handed
  in stay recognisable. If a hue is wrong for a role it swaps in a different
  input rather than rotating the one it has.
- Contrast targets are APCA `Lc`, not WCAG ratios. Body text aims at `Lc 78`.
  WCAG numbers are reported alongside for compliance paperwork.
- Not every input gets used. With eight colors and ten roles, some will sit out,
  and the notes say which. That is a result, not a bug.
- Same seed, same output, always. Change `--seed` to get a different set of
  candidates from the same colors.
- `--effort deep` is worth it for a final answer on a large palette; `fast` is
  fine while iterating.
