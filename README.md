# 決策板 Decision Board

A decision board as an installable PWA. Drop a ball, let it roll down the forks,
and take the answer it lands on. Works offline, no build step, no dependencies.

It ships as two boards, and you pick one before you start:

- **Classic** — the red 40×40cm "DECISION" toy, with its three printed outcomes
  ✕ / ↻ / ✓ and its bias faithfully reproduced.
- **Evolved** — the same idea with the maths fixed: 2–5 options of your own,
  every one exactly as likely as the others.

---

## Why the physical board is not fair, and the evolved one is

The toy is a Galton board: paths **merge**, because going left-then-right lands
you in the same place as right-then-left. That makes landing slots follow a
binomial distribution — the middle slot is far more likely than the edges. And
for 3 or 5 options there is provably no way to carve binomial weights into equal
groups at all.

Here the channels **never merge after a split**. With depth `d` there are `2^d`
exits and every root-to-exit path has probability exactly `1/2^d`, so the exits
divide exactly evenly. Each fork is a genuine 50/50 taken from
`crypto.getRandomValues` (see `js/rng.js`) — the outcome is decided by the forks
themselves, not chosen in advance and animated afterwards.

| Options | Exits | Per option | Each option's chance | Retry |
|--------:|------:|-----------:|---------------------:|------:|
| 2 | 16 | 7 | 43.75% | 12.5% |
| 3 | 16 | 5 | 31.25% | 6.25% |
| 4 | 16 | 4 | 25% | — |
| 5 | 16 | 3 | 18.75% | 6.25% |

The retry slot absorbs exits that will not divide evenly, so four options — which
split 16 perfectly — do not get one. Two options are the deliberate exception:
8/8 would also divide perfectly, but the physical board's silhouette is
A / retry / B, so they keep a 7/2/7.

Bins are laid out left to right in option order with the retry slot inserted
after the ⌈k/2⌉-th option, which puts it dead centre for two options.

## The classic board keeps its bias

Classic mode is not the evolved board in a red skin — it is a different draw.
`js/classic.js` makes the channels merge the way the milled slots do, and the
difference between the two boards is one line: the evolved board reads the fork
bits as a binary number, the classic one *sums* them. A binary number is unique
per path; a sum is not, so "left then right" and "right then left" land in the
same slot.

Six rows of forks therefore give binomial weights of 1 : 6 : 15 : 20 : 15 : 6 : 1
out of 64, and the toy's three printed slots come out at:

| Slot | Exits | Chance |
|:-----|------:|-------:|
| ✕ no | 3 | 34.375% |
| ↻ again | 1 | 31.25% |
| ✓ yes | 3 | 34.375% |

Yes and no are symmetric, which is the part the toy gets right. The middle slot
is one seventh of the board's width and takes nearly a third of every drop,
which is the part it does not — on the evolved board the same three outcomes put
"go again" at 12.5%. The fairness panel shows both numbers side by side.

Two caveats about the reproduction. The maths is the physical board's maths, and
tested as such. The *maze* is drawn as a full-panel lattice on a fixed grid —
the right family of shape and the right silhouette, but not a slot-for-slot
tracing of any particular panel, which a photograph cannot settle.

## Verifying those claims

```bash
node test/fairness.mjs   # the evolved board is exactly fair
node test/classic.mjs    # the classic board is exactly as biased as documented
```

The two are mirror images: one proves an absence of bias, the other proves the
presence of a specific one. Both run in CI before anything is published.

For `fairness.mjs`, part 1 is a proof rather than a sample: it enumerates all `2^d` fork sequences
and asserts every option owns exactly the same number of paths, that bits → exit
is a bijection, and that the bins tile the row with no gaps or overlaps. Part 2
then drives the real `drop()` through 1,000,000 draws with the real crypto bit
source and chi-square tests the result, which is what would catch an off-by-one
between the RNG and the exit mapping.

## The drop is a ceremony

A fair draw that resolves in a popup feels like a coin flip you did not watch,
so the result is staged rather than announced. Pressing the button dims the
whole page to a vignette and leaves the board as the only lit object; the
release point pulses while nothing happens; the ball takes a beat at each fork
and the peg it commits to flashes as it passes; the winning bin ignites and the
others fall away; and only after a held silence does the verdict name the
answer, one line at a time.

None of it touches the draw. `drop()` has already returned before the first
pixel moves — the whole sequence is a replay, which is why tapping the board to
skip it cannot change what it says. `prefers-reduced-motion` removes the pauses
and the descent entirely and goes straight to the verdict.

The two themes are the same instrument in different materials, and share every
token in `css/tokens.css` — only the palette differs. Option colours are CSS
custom properties rather than fixed hex values, because a colour luminous enough
against obsidian is unreadable on paper: the *index* is the option's identity,
and each theme cuts its own value for it.

## Running it locally

```bash
python3 -m http.server 8765
# then open http://localhost:8765/
```

It must be served over HTTP rather than opened as a `file://` URL — ES modules
and the service worker both require an origin.

## Deploying

Static files, so anything that serves a directory works. For GitHub Pages:
set **Settings → Pages → Source** to **GitHub Actions** once, and
`.github/workflows/pages.yml` publishes every push to `main` — but only after
both test suites pass.

## Layout

```
index.html            single page: mode picker, setup, board, sheets
app.webmanifest       PWA manifest
sw.js                 offline cache (cache-first, versioned)
css/tokens.css        type, space, radii and motion — shared by both themes
css/base.css          structure and components
css/theme-ritual.css  "Ritual" — obsidian and brass, the default
css/theme-ivory.css   "Ivory" — paper and ink, for daylight
css/board-classic.css the classic panel's material — red lacquer and brass
js/tree.js            evolved board: shapes, exit -> option mapping, drop()
js/classic.js         classic board: merging channels, binomial slots
js/rng.js             crypto-backed fair bit source
js/layout.js          geometry: node positions, grooves, ball route
js/render.js          draws the SVG board
js/animate.js         walks the ball along the route
js/state.js           options, persistence, share links
js/i18n.js            zh-Hant / en strings
js/history.js         recent results
js/main.js            wiring
test/fairness.mjs     the evolved board's fairness proof and chi-square test
test/classic.mjs      the classic board's bias proof and chi-square test
tools/make-icons.py   regenerates icons/ (needs Pillow)
```

## Features

- Two boards — Classic (✕ / ↻ / ✓, biased like the toy) and Evolved (2–5
  options of your own, exactly fair) — chosen before each board is built
- Optional question, bilingual UI (繁體中文 / English)
- Two themes: Ritual (obsidian and brass) and Ivory (paper and ink)
- Installable and fully offline after first load
- Share a board as a link (`?q=…&o=…&o=…`, or `?m=classic&q=…`); options never
  leave the device otherwise
- Local history of past decisions
- Honours `prefers-reduced-motion` by showing the result without the animation —
  the draw is identical either way
- Tapping the board fast-forwards the replay; it cannot change the outcome
