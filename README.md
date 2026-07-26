# hueristic

Hand it colors. Get themes back, ranked, with the reasoning.

```bash
npx hueristic '#0f172a' '#34f003' '#e2e8f0'
```

```
  Theme 1/3  92.9/100
  harmony 95  coherence 100

  ███ bg         #0e172b
  ███ surface    #172033
  ███ border     #576075  Lc  19   was #0f172a
  ███ text       #e7ebf0  Lc  93   was #e2e8f0
  ███ textMuted  #d2d7df  Lc  81   was #e2e8f0
  ███ primary    #34f500  Lc  80   was #34f003
  ███ onPrimary  #000000  Lc  82
  ███ accent     #35f800  Lc  82   was #34f003
  ███ link       #43f225  Lc  79   was #34f003

  changes
    border: lightness +28% — Lc 0 on surface, needs 18 — now 19
    textMuted: lightness -5% — Lc 92 on bg, needs 58 — now 81

  · #34f003 is a high-weight role and still needed chroma -13%. If that color is
    non-negotiable, pin it and let the others move instead.
```

## Why this exists

Every palette tool on the internet takes **one** color and expands it into a
scale. [Adobe Leonardo](https://github.com/adobe/leonardo) generates colors at a
target contrast ratio from one key color. Material's HCT does tonal palettes
from one seed. The various palette MCP servers and generators do 11 shades from
one brand hex.

Real briefs are not one color. They are "here's our brand purple, our logo
orange, the grey from the old site, and this green the CEO likes" — and the
question is not *what shades exist* but **which color should be the background,
which should be the button, what has to change to make that readable, and can I
see a few options.**

That is an assignment-and-search problem, not a scale-generation problem. So:

- **Any number of input colors.** One or forty.
- **Weighted roles.** The page background and the primary action matter more
  than a caption, and the objective function says so in numbers.
- **Many candidates, ranked.** Randomised restarts produce genuinely different
  themes from the same colors; only the best survive, and near-duplicates are
  filtered out.
- **A critique, not just an answer.** Every color reports what changed, by how
  much, and which contrast requirement forced it.

## Install

```bash
npm install hueristic     # library + CLI
npx hueristic '#5b21b6' '#f59e0b' --mode light
```

Node 18+. No dependencies.

## How it works

**1. Everything moves to OKLCh.** Perceptually uniform, so a lightness step
means the same thing at every hue and chroma stays independent of it.

**2. Roles have weights and constraints.** Ten UI roles plus optional status
colors. Each declares what it sits on, the contrast it needs, whether it must
carry chroma, and whether it is supposed to recede.

| role | weight | needs |
|---|---|---|
| `bg` | 1.0 | to land in the lightness band its mode requires |
| `primary` | 1.0 | `Lc 42` on `bg`, and real chroma — a grey button is not a button |
| `text` | 0.95 | `Lc 78` on `bg`, near-neutral |
| `onPrimary` | 0.7 | `Lc 72` on `primary`, derived not assigned |
| `surface` | 0.6 | a specific lightness step off `bg` |
| `link` | 0.55 | `Lc 62` on `bg` |
| `accent` | 0.5 | `Lc 33` on `bg` |
| `textMuted` | 0.45 | `Lc 58` on `bg`, and to stay *below* body text |
| `border` | 0.35 | `Lc 18` on `surface`, and to stay quiet |

**3. Contrast is APCA.** WCAG 2.1's ratio badly mispredicts perceived contrast
on dark backgrounds, which is exactly where themes live now. The solver
optimises `Lc`; WCAG ratios are reported alongside for compliance.

**4. A theme is three numbers per role** — which input color it draws from, how
far past its contrast target to push, and how much of the source chroma to keep.
Building a theme from those numbers is deterministic: solve roles in dependency
order, bisecting lightness against the already-fixed background until the target
`Lc` is met. Hue never rotates, so your colors stay your colors.

**5. Score, then search.** The objective is a weighted sum of per-role fitness —
contrast against target, fidelity to the color you supplied, chroma appropriate
to the role — plus hue harmony, chroma coherence, and palette coverage, minus
penalties for flat hierarchy and gamut damage. Some constraints gate rather than
nudge: a colorless primary or a border shouting as loudly as body text is not
"slightly worse", it is broken.

Then it hill-climbs that parameter vector from many random starts, seeded so the
same input always gives the same output. Survivors are deduplicated by role
assignment and by perceptual distance, so five candidates are five real choices.

## Output

```bash
hueristic '#0b0b0f' '#ff4d00' -f css        # :root { --bg: ...; }
hueristic '#0b0b0f' '#ff4d00' -f tailwind   # @theme { --color-bg: ...; }
hueristic '#0b0b0f' '#ff4d00' -f tokens     # W3C design tokens
hueristic '#0b0b0f' '#ff4d00' -f json       # everything, including the critique
```

## API

```js
import { generateThemes, evaluateTheme } from 'hueristic';

const { themes } = generateThemes(['#0f172a', '#34f003', '#e2e8f0'], {
  mode: 'dark',        // or 'light'
  count: 5,
  seed: 1,             // same seed, same themes
  weights: { primary: 1.6, textMuted: 0.2 },
});

themes[0].palette;           // { bg: '#0e172b', primary: '#34f500', ... }
themes[0].critique.notes;    // what to change, in words
```

`evaluateTheme` runs the same objective over a theme you already have, without
changing it — useful for auditing something that already ships:

```js
evaluateTheme({ bg: '#111827', text: '#6b7280', primary: '#374151' }, { mode: 'dark' });
// { score: 61.3, critique: { notes: ['secondary text is as loud as body text', ...] } }
```

The color and contrast primitives are exported too, if you only want those:

```js
import { apca, wcagRatio, hexToOklch, oklchToHex } from 'hueristic';
```

## Agent use

`SKILL.md` in this repo is written for coding agents — when to reach for the
tool, how to read the JSON, and how to translate the critique into advice. Drop
the repo into a skills directory and it works as-is.

## Tests

```bash
npm test
```

The APCA implementation is checked against its published reference values
(`Lc 106.04` black on white, `-107.88` white on black, `63.06` for `#888` on
white). If a change moves those, the change is wrong.

## Prior art

Standing on: Björn Ottosson's [OKLab](https://bottosson.github.io/posts/oklab/),
Andrew Somers' [APCA](https://github.com/Myndex/SAPC-APCA), and the thinking in
[Leonardo](https://github.com/adobe/leonardo), [Radix
Colors](https://www.radix-ui.com/colors) and Huetone about contrast-first
palettes. What is new here is treating the whole thing as a weighted assignment
and search problem over an arbitrary set of colors, and returning the reasoning.

## License

MIT
