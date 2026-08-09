# 決策板 Decision Board

A provably fair decision board as an installable PWA. Type in 2–5 options, drop
a ball, and let it roll down the forks to pick one. Works offline, no build step,
no dependencies.

Inspired by the red 40×40cm "DECISION" board toy — but with the maths fixed.

---

## Why the physical board is not fair, and this one is

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

## Verifying that claim

```bash
node test/fairness.mjs
```

Part 1 is a proof rather than a sample: it enumerates all `2^d` fork sequences
and asserts every option owns exactly the same number of paths, that bits → exit
is a bijection, and that the bins tile the row with no gaps or overlaps. Part 2
then drives the real `drop()` through 1,000,000 draws with the real crypto bit
source and chi-square tests the result, which is what would catch an off-by-one
between the RNG and the exit mapping.

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
`test/fairness.mjs` passes.

## Layout

```
index.html            single page: setup screen, board, sheets
app.webmanifest       PWA manifest
sw.js                 offline cache (cache-first, versioned)
css/base.css          structure and components
css/theme-board.css   "physical board" theme — the red panel
css/theme-modern.css  "modern" theme, follows OS light/dark
js/tree.js            board shapes, exit -> option mapping, drop()
js/rng.js             crypto-backed fair bit source
js/layout.js          geometry: node positions, grooves, ball route
js/render.js          draws the SVG board
js/animate.js         walks the ball along the route
js/state.js           options, persistence, share links
js/i18n.js            zh-Hant / en strings
js/history.js         recent results
js/main.js            wiring
test/fairness.mjs     the fairness proof and chi-square test
tools/make-icons.py   regenerates icons/ (needs Pillow)
```

## Features

- 2–5 options, optional question, bilingual UI (繁體中文 / English)
- Two themes: the red physical board, or a modern light/dark interface
- Installable and fully offline after first load
- Share a board as a link (`?q=…&o=…&o=…`); options never leave the device otherwise
- Local history of past decisions
- Honours `prefers-reduced-motion` by showing the result without the animation —
  the draw is identical either way
- Tapping the board fast-forwards the replay; it cannot change the outcome
