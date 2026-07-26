<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/banner-dark.webp">
  <img alt="hueristic" src="assets/banner-light.webp">
</picture>

# hueristic

Hand it colors. Get themes back, ranked, with the reasoning.

```bash
git clone https://github.com/daxaur/hueristic && cd hueristic
node bin/hueristic.js '#0f172a' '#34f003' '#e2e8f0'
```

```
  Theme 1/1  92.9/100
  harmony 95  coherence 100

  ███ bg         #0e182e          was #0f172a
  ███ surface    #1b2438          was #0f172a
  ███ border     #59647d  Lc  19   was #0f172a
  ███ text       #e4eaf3  Lc  93   was #e2e8f0
  ███ textMuted  #c9cfd7  Lc  76   was #e2e8f0
  ███ primary    #42ee25  Lc  77   was #34f003
  ███ onPrimary  #000000  Lc  79
  ███ accent     #33ef00  Lc  77   was #34f003
  ███ link       #32eb00  Lc  75   was #34f003

  changes
    bg: chroma +18% — pulled into the lightness band a background needs
    surface: lightness +5% — offset from the background so panels read as raised
    border: lightness +30% — Lc 0 on surface, needs 18 — now 19
    textMuted: lightness -8% — Lc 91 on bg, needs 58 — now 76
```

Ask for more than one and you get genuinely different answers, not the same
theme nudged — deduplicated by role assignment and by perceptual distance:

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/palettes-dark.svg">
  <img alt="Three ranked candidate themes generated from the same six input colors" src="assets/palettes-light.svg">
</picture>

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

Not on npm yet — clone it:

```bash
git clone https://github.com/daxaur/hueristic && cd hueristic
node bin/hueristic.js '#5b21b6' '#f59e0b' --mode light
npm link                  # optional, puts `hueristic` on your PATH
```

Node 18+. No dependencies, nothing to build, no install step.

## How it works

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/pipeline-dark.svg">
  <img alt="Pipeline: any number of colors, weighted roles, seeded search, ranked themes" src="assets/pipeline-light.svg">
</picture>

**1. Everything moves to OKLCh.** Perceptually uniform, so a lightness step
means the same thing at every hue and chroma stays independent of it. The
spectrum in the banner above is a plain hue sweep at one fixed lightness and
chroma — evenly spaced by construction, which the same sweep in HSL is not.

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

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/weights-dark.svg">
  <img alt="Bar chart of every role weight, from bg and primary at 1.00 down to the status colors at 0.25" src="assets/weights-light.svg">
</picture>

**3. Contrast is APCA.** WCAG 2.1's ratio badly mispredicts perceived contrast
on dark backgrounds, which is exactly where themes live now. The solver
optimises `Lc`; WCAG ratios are reported alongside for compliance.

Every role is solved against its own requirement, and the search is only done
when all of them clear:

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/contrast-dark.svg">
  <img alt="Achieved APCA Lc per role, each bar passing the tick that marks its target" src="assets/contrast-light.svg">
</picture>

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

Import from the package name once it is linked or vendored, or straight from
`src/index.js` if you have just cloned it.

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

## Figures

Every chart above is generated from live solver output, and every color in them
is mixed by the library itself:

```bash
npm run assets
```

So they cannot drift from what the code actually does. If a weight or a contrast
target changes, rerun it and the figures follow.

## Prior art

Standing on: Björn Ottosson's [OKLab](https://bottosson.github.io/posts/oklab/),
Andrew Somers' [APCA](https://github.com/Myndex/SAPC-APCA), and the thinking in
[Leonardo](https://github.com/adobe/leonardo), [Radix
Colors](https://www.radix-ui.com/colors) and Huetone about contrast-first
palettes. What is new here is treating the whole thing as a weighted assignment
and search problem over an arbitrary set of colors, and returning the reasoning.

## License

MIT
