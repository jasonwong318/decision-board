/**
 * Pure geometry for the board: turns a tree shape (from tree.js) into SVG
 * coordinates, channel path data, and the polyline a ball travels along.
 *
 * Forks are drawn as routed grooves — a short vertical stub, a straight
 * diagonal, then another stub into the child — rather than smooth S-curves.
 * Smooth curves make two neighbouring forks converge into an arch, which reads
 * like channels merging; the whole point of this board is that they never do.
 * Round joins on a thick stroke give the milled-slot look of the physical board.
 *
 * No DOM here — render.js draws it, animate.js walks it.
 */

import { shapeFor, binsFor, slotForExit, swapBits, weaveSwaps } from './tree.js';
import { CLASSIC_ROWS, CLASSIC_EXITS, classicBins } from './classic.js';

/**
 * Portrait, not square: the descent is the ceremony, so the board is given the
 * room to make it feel like one.
 */
export const VIEW = { w: 1000, h: 1240 };

export const PANEL = { x: 10, y: 10, w: 980, h: 1220, r: 30 };

/** The nameplate at the foot of each bin, and the shelf the ball rests on. */
export const PLATE = { h: 32, gap: 8 };

const PAD = 40;          // board edge -> playable area
const ENTRY_Y = 168;     // where the ball is released
const FIRST_ROW_Y = 236; // the single top fork
const LAST_ROW_Y = 648;  // the bottom row of forks
/**
 * The crossing bands, one per swap in the weave.
 *
 * They get a third of the board between them. One band would be quicker to
 * draw and would look like exactly that: two flat sheets of strands sliding
 * past each other, all the leftward ones beneath all the rightward ones.
 */
const WEAVE_TOP = 682;
const WEAVE_BOTTOM = 972;
const WEAVE_GAP = 26;    // breathing room between one band and the next
const BIN_TOP = 1006;
const BIN_BOTTOM = 1178;
const STUB = 0.24;       // share of the row gap spent going straight down
/** The weave spends most of its height crossing rather than dropping. */
const WEAVE_STUB = 0.18;

const INNER_W = VIEW.w - PAD * 2;

/**
 * Groove width has to shrink as the board gets denser. A 32-exit board has only
 * ~29 units between neighbouring channels, so a fixed 30-wide stroke would make
 * them overlap into one solid band — which would look exactly like the merging
 * Galton board this design exists to avoid.
 */
function grooveMetrics(exits) {
  const spacing = INNER_W / exits;
  const groove = Math.min(30, spacing * 0.55);
  const floor = groove * 0.72;
  return { groove, floor, ballR: Math.max(7, floor * 0.75) };
}

/** Centre x of node `index` on `level` (level L has 2^L nodes). */
function nodeX(level, index) {
  return PAD + ((index + 0.5) * INNER_W) / 2 ** level;
}

/**
 * Vertical gap for each level transition.
 *
 * Early levels fan out much further sideways than late ones, so a constant row
 * height makes the top forks look like flat wide V's. Weighting the gaps by the
 * square root of the horizontal travel keeps every fork at a similar slope.
 */
function rowGaps(depth) {
  const weights = [];
  for (let level = 0; level < depth; level++) {
    weights.push(Math.sqrt(INNER_W / 2 ** (level + 2)));
  }
  const total = weights.reduce((a, b) => a + b, 0);
  const span = LAST_ROW_Y - FIRST_ROW_Y;
  return weights.map((w) => (span * w) / total);
}

/**
 * One band per swap: where it sits, and where every channel enters and leaves.
 *
 * `before[i]` is the position channel i occupies entering the band and
 * `after[i]` where it leaves; both are indexed by the *original exit*, so a
 * single strand can be followed straight down through every band.
 */
function weaveBands(depth) {
  const swaps = weaveSwaps(depth);
  const height = (WEAVE_BOTTOM - WEAVE_TOP - WEAVE_GAP * (swaps.length - 1)) / swaps.length;
  const exits = 2 ** depth;

  let positions = Array.from({ length: exits }, (_, exit) => exit);
  return swaps.map(([i, j], band) => {
    const before = positions;
    const after = positions.map((p) => swapBits(p, i, j));
    positions = after;
    const top = WEAVE_TOP + band * (height + WEAVE_GAP);
    return { before, after, top, bottom: top + height };
  });
}

/** y of each fork row, length depth + 1. */
function rowYs(depth) {
  const gaps = rowGaps(depth);
  const ys = [FIRST_ROW_Y];
  for (const gap of gaps) ys.push(ys[ys.length - 1] + gap);
  return ys;
}

/**
 * The groove connecting a parent node to one of its children.
 * Shared by the renderer and the animator so the ball can never drift off it.
 */
function forkPoints(x0, y0, x1, y1, share = STUB) {
  const stub = (y1 - y0) * share;
  return [
    { x: x0, y: y0 },
    { x: x0, y: y0 + stub },
    { x: x1, y: y1 - stub },
    { x: x1, y: y1 },
  ];
}

function toPath(points) {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');
}

/**
 * Build every drawable piece of the board for a given option count.
 *
 * @param {number} k
 * @returns {{depth:number, exits:number, channelPath:string,
 *            pegs:{x:number,y:number}[], bins:object[], entry:{x:number,y:number}}}
 */
export function buildLayout(k) {
  const { depth, exits } = shapeFor(k);
  const ys = rowYs(depth);
  const centre = PAD + INNER_W / 2;

  const segments = [`M ${centre} ${ENTRY_Y} L ${centre} ${ys[0]}`];
  const pegs = [];

  for (let level = 0; level < depth; level++) {
    for (let index = 0; index < 2 ** level; index++) {
      const x = nodeX(level, index);
      pegs.push({ x, y: ys[level] });
      for (const child of [index * 2, index * 2 + 1]) {
        segments.push(toPath(forkPoints(x, ys[level], nodeX(level + 1, child), ys[level + 1])));
      }
    }
  }

  // Short drop out of the last fork row into the first crossing band.
  for (let exit = 0; exit < exits; exit++) {
    const x = nodeX(depth, exit);
    segments.push(`M ${x} ${ys[depth]} L ${x} ${WEAVE_TOP}`);
  }

  // The crossing bands. Each strand is kept separate so the renderer can decide
  // what passes over what; `band` lets it alternate the answer per band rather
  // than laying every leftward strand under every rightward one.
  const bands = weaveBands(depth);
  const weave = [];
  for (const [band, span] of bands.entries()) {
    for (let index = 0; index < exits; index++) {
      const from = nodeX(depth, span.before[index]);
      const to = nodeX(depth, span.after[index]);
      weave.push({
        band,
        index,
        dx: to - from,
        d: toPath(forkPoints(from, span.top, to, span.bottom, WEAVE_STUB)),
      });
    }
  }

  // Landing slot down into its bin.
  for (let slot = 0; slot < exits; slot++) {
    const x = nodeX(depth, slot);
    segments.push(`M ${x} ${WEAVE_BOTTOM} L ${x} ${BIN_TOP + 6}`);
  }

  const binWidth = INNER_W / exits;
  const bins = binsFor(k).map((bin, i) => ({
    ...bin,
    index: i,
    x: PAD + bin.slotStart * binWidth,
    width: bin.slotCount * binWidth,
    y: BIN_TOP,
    height: BIN_BOTTOM - BIN_TOP,
  }));

  return {
    view: VIEW,
    panel: PANEL,
    plate: PLATE,
    depth,
    exits,
    ys,
    channelPath: segments.join(' '),
    weave,
    pegs,
    bins,
    entry: { x: centre, y: ENTRY_Y },
    binTop: BIN_TOP,
    binBottom: BIN_BOTTOM,
    ...grooveMetrics(exits),
  };
}

/* ------------------------------------------------------------- classic */

/**
 * The classic board is square, because the object is: a 40 × 40 panel.
 */
export const CLASSIC_VIEW = { w: 1000, h: 1000 };
export const CLASSIC_PANEL = { x: 12, y: 12, w: 976, h: 976, r: 20 };

/**
 * How the toy is built, and therefore how it is drawn.
 *
 * The slots are far longer than the distance the ball actually travels between
 * decisions, and they overlap their neighbours — that overlap, plus a small
 * difference in height between one slot and the next along a row, is the whole
 * source of the panel's chain-link texture. Drawing each slot end-to-end at a
 * single height, as an earlier attempt did, collapses every row into one
 * unbroken rail and the object disappears.
 *
 * C_STEP is what the ball moves per row, so nodes on a row sit 2 × C_STEP
 * apart; a slot reaches 2 × C_STEP either side of its node, which is twice as
 * far as the ball will ever roll inside it. The ball leaves through the first
 * hole it meets, one step along, and the rest of the slot is simply the panel
 * being milled the way the photograph shows.
 */
const C_STEP = 58;
const C_SLOT = 1.5 * C_STEP;
/** Neighbouring slots on a row sit slightly above and below each other. */
const C_STAGGER = 23;

const C_CENTRE = CLASSIC_VIEW.w / 2;
const C_ENTRY_Y = 118;
const C_FIRST_ROW_Y = 196;
const C_ROW_GAP = 86;
const C_LAST_ROW_Y = C_FIRST_ROW_Y + C_ROW_GAP * CLASSIC_ROWS;
/** The three stops: black pills, as they are printed on the panel. */
const C_STOP_Y = 818;
const C_STOP_W = 88;
const C_STOP_H = 30;
const C_MARK_Y = 896;
const C_STOP_X = [200, 500, 800];

/** Rows alternate parity: the ball is only ever on a node of its row's parity. */
function classicNodes(level) {
  const out = [];
  for (let p = -CLASSIC_ROWS; p <= CLASSIC_ROWS; p++) {
    if (((p % 2) + 2) % 2 === level % 2) out.push(p);
  }
  return out;
}

function classicNodeX(p) {
  return C_CENTRE + p * C_STEP;
}

/** Slot height on its row — neighbours are staggered so they can overlap. */
function classicNodeY(level, p) {
  const rank = Math.round((p - (level % 2)) / 2);
  return C_FIRST_ROW_Y + C_ROW_GAP * level + (((rank % 2) + 2) % 2 === 0 ? -C_STAGGER : C_STAGGER);
}

function classicGrooveMetrics() {
  // Narrow enough that red shows between the slots, which is most of what the
  // panel's texture is; the ball is sized off the cut so it sits inside it.
  const groove = 24;
  return { groove, floor: groove * 0.66, ballR: groove * 0.4 };
}

/** Which stop an exit feeds, and where that stop sits. */
function classicStops() {
  return classicBins().map((bin, index) => ({
    ...bin,
    index,
    x: C_STOP_X[index],
    y: C_STOP_Y,
    w: C_STOP_W,
    h: C_STOP_H,
    markY: C_MARK_Y,
  }));
}

/** Exit k is p = 2k - rows on the bottom row. */
function classicExitP(k) {
  return 2 * k - CLASSIC_ROWS;
}

function classicStopFor(k) {
  return classicStops().find((b) => k >= b.slotStart && k < b.slotStart + b.slotCount);
}

export function buildClassicLayout() {
  const segments = [`M ${C_CENTRE} ${C_ENTRY_Y} L ${C_CENTRE} ${classicNodeY(0, 0).toFixed(2)}`];

  // The slots, milled right across the panel — including the ones out at the
  // edges that the ball can never reach.
  for (let level = 0; level <= CLASSIC_ROWS; level++) {
    for (const p of classicNodes(level)) {
      const x = classicNodeX(p);
      const y = classicNodeY(level, p).toFixed(2);
      segments.push(`M ${(x - C_SLOT).toFixed(2)} ${y} L ${(x + C_SLOT).toFixed(2)} ${y}`);
    }
  }

  // The holes joining one slot to the slot a step along on the row below.
  for (let level = 0; level < CLASSIC_ROWS; level++) {
    const below = new Set(classicNodes(level + 1));
    for (const p of classicNodes(level)) {
      for (const q of [p - 1, p + 1]) {
        if (!below.has(q)) continue;
        segments.push(
          `M ${classicNodeX(q).toFixed(2)} ${classicNodeY(level, p).toFixed(2)}`
          + ` L ${classicNodeX(q).toFixed(2)} ${classicNodeY(level + 1, q).toFixed(2)}`,
        );
      }
    }
  }

  // Out of the bottom row into the three stops. These converge, which on this
  // board is honest — its channels merge by design.
  for (let k = 0; k < CLASSIC_EXITS; k++) {
    const p = classicExitP(k);
    segments.push(toPath(forkPoints(
      classicNodeX(p), classicNodeY(CLASSIC_ROWS, p), classicStopFor(k).x, C_STOP_Y, 0.3,
    )));
  }

  return {
    view: CLASSIC_VIEW,
    panel: CLASSIC_PANEL,
    depth: CLASSIC_ROWS,
    exits: CLASSIC_EXITS,
    channelPath: segments.join(' '),
    pegs: [],
    bins: classicStops(),
    entry: { x: C_CENTRE, y: C_ENTRY_Y },
    ...classicGrooveMetrics(),
  };
}

/**
 * The classic ball's route: roll along a slot, drop through, six times over,
 * then down into a stop. `pegs` is all -1 — the panel has no pins in the maze.
 *
 * @param {(0|1)[]} bits one per row, 1 = roll right
 */
export function classicRoute(bits) {
  const stages = [[
    { x: C_CENTRE, y: C_ENTRY_Y },
    { x: C_CENTRE, y: classicNodeY(0, 0) },
  ]];
  const kinds = ['entry'];

  let p = 0;
  for (let level = 0; level < CLASSIC_ROWS; level++) {
    const y = classicNodeY(level, p);
    const q = p + (bits[level] ? 1 : -1);
    // Roll along the slot to the hole, then fall through to the row below.
    stages.push([
      { x: classicNodeX(p), y },
      { x: classicNodeX(q), y },
      { x: classicNodeX(q), y: classicNodeY(level + 1, q) },
    ]);
    kinds.push('fork');
    p = q;
  }

  const stop = classicStopFor((p + CLASSIC_ROWS) / 2);
  const rest = {
    x: stop.x,
    y: C_STOP_Y - C_STOP_H / 2 - classicGrooveMetrics().ballR + 6,
  };
  const run = forkPoints(
    classicNodeX(p), classicNodeY(CLASSIC_ROWS, p), stop.x, C_STOP_Y, 0.3,
  );
  stages.push([...run.slice(0, -1), rest]);
  kinds.push('fall');

  return { stages, pegs: stages.map(() => -1), kinds, rest };
}

/**
 * The exact route this ball takes, as a list of stages. Each stage is a
 * polyline; the animator eases through them one at a time so the ball visibly
 * hesitates at every fork.
 *
 * `pegs[i]` is the index — into the flat `layout.pegs` array — of the peg the
 * ball reaches at the end of stage `i`, or -1 for the final drop into the bin.
 * The renderer uses it to make each fork flash as the ball commits to it.
 *
 * @param {number} k
 * @param {(0|1)[]} bits one per fork, 0 = left
 * @returns {{stages:{x:number,y:number}[][], pegs:number[], rest:{x:number,y:number}}}
 */
export function ballRoute(k, bits) {
  const { depth } = shapeFor(k);
  const ys = rowYs(depth);
  const centre = PAD + INNER_W / 2;

  // Pegs are emitted level by level, so level L occupies 2^L slots starting
  // at 2^L - 1. Stage 0 lands the ball on the single peg of level 0.
  const pegIndex = (level, index) => 2 ** level - 1 + index;

  const stages = [[{ x: centre, y: ENTRY_Y }, { x: centre, y: ys[0] }]];
  const pegs = [pegIndex(0, 0)];
  const kinds = ['entry'];

  let index = 0;
  for (let level = 0; level < depth; level++) {
    const x = nodeX(level, index);
    index = index * 2 + bits[level];
    stages.push(forkPoints(x, ys[level], nodeX(level + 1, index), ys[level + 1]));
    pegs.push(level + 1 < depth ? pegIndex(level + 1, index) : -1);
    kinds.push('fork');
  }

  // Out of the forks and down through every crossing band. Each band is its own
  // stage, because each one is a place where the answer could still change.
  const exitX = nodeX(depth, index);

  stages.push([{ x: exitX, y: ys[depth] }, { x: exitX, y: WEAVE_TOP }]);
  pegs.push(-1);
  kinds.push('approach');

  // Both arrays are indexed by the original exit, so this ball is simply
  // `index` in every band — no searching for where it ended up.
  for (const band of weaveBands(depth)) {
    stages.push(forkPoints(
      nodeX(depth, band.before[index]), band.top,
      nodeX(depth, band.after[index]), band.bottom,
      WEAVE_STUB,
    ));
    pegs.push(-1);
    kinds.push('weave');
  }

  const slotX = nodeX(depth, slotForExit(index, depth));

  // The ball comes to rest on the nameplate, not floating in the well.
  const plateTop = BIN_BOTTOM - PLATE.gap - PLATE.h;
  const rest = { x: slotX, y: plateTop - grooveMetrics(2 ** depth).ballR + 2 };
  stages.push([{ x: slotX, y: WEAVE_BOTTOM }, rest]);
  pegs.push(-1);
  kinds.push('fall');

  return { stages, pegs, kinds, rest };
}
