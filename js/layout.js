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

import { shapeFor, binsFor, slotForExit } from './tree.js';
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
const FIRST_ROW_Y = 250; // the single top fork
const LAST_ROW_Y = 756;  // the bottom row of forks
/**
 * The crossing band: exits are carried sideways to their landing slots.
 * It needs real height — a strand can travel seven slots, and squeezed into a
 * shallow band sixteen of those read as a tangle rather than a weave.
 */
const WEAVE_TOP = 792;
const WEAVE_BOTTOM = 1000;
const BIN_TOP = 1032;
const BIN_BOTTOM = 1186;
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

  // Short drop out of the last fork row into the weave.
  for (let exit = 0; exit < exits; exit++) {
    const x = nodeX(depth, exit);
    segments.push(`M ${x} ${ys[depth]} L ${x} ${WEAVE_TOP}`);
  }

  // The weave itself, and the drop from each landing slot into its bin. Each
  // strand is kept separate so the renderer can decide what crosses over what.
  const weave = [];
  for (let exit = 0; exit < exits; exit++) {
    const from = nodeX(depth, exit);
    const to = nodeX(depth, slotForExit(exit, depth));
    weave.push({
      exit,
      slot: slotForExit(exit, depth),
      dx: to - from,
      d: toPath(forkPoints(from, WEAVE_TOP, to, WEAVE_BOTTOM, WEAVE_STUB)),
    });
    segments.push(`M ${to} ${WEAVE_BOTTOM} L ${to} ${BIN_TOP + 6}`);
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
 * How the toy actually works, and therefore how it is drawn.
 *
 * The maze is rows of long horizontal capsules, each row offset by half a
 * capsule from the one above. A ball entering a capsule lands at its *middle*,
 * rolls to one end or the other, and drops through to the row below — where
 * that end is the middle of the next capsule. So one fork is one horizontal
 * run plus one short drop, and the ball moves half a capsule sideways per row.
 *
 * That is the same lattice the maths already uses; the earlier drawing rendered
 * each fork as a short diagonal, which collapsed the rows into a honeycomb and
 * lost the object entirely.
 *
 * `C_RUN` is half a capsule and the ball's step. Six rows carry it up to six
 * steps from centre, and a capsule reaches one step further than its centre, so
 * the widest thing on the panel is 7 × C_RUN either side — that is what sets it.
 */
const C_RUN = 62;
const C_REACH = 7 * C_RUN;
/**
 * The divider between two capsules on the same row.
 *
 * Neighbouring capsules are exactly 2 × C_RUN apart, so drawn at full length
 * they meet end to end and every row reads as one unbroken rail. The real panel
 * cannot be built that way — without a wall at each end the ball would roll
 * straight past instead of dropping — and it is that wall, more than anything,
 * that makes the slots read as separate capsules.
 */
const C_WALL = 20;

const C_CENTRE = CLASSIC_VIEW.w / 2;
const C_ENTRY_Y = 130;
const C_FIRST_ROW_Y = 236;
const C_ROW_GAP = 74;
const C_LAST_ROW_Y = C_FIRST_ROW_Y + C_ROW_GAP * CLASSIC_ROWS;
/** The three brass stops the ball comes to rest against. */
const C_STOP_Y = 816;
/** The printed ✕ ↻ ✓, below the stops on the bare panel. */
const C_MARK_Y = 900;
const C_STOP_R = 15;

function classicRowY(level) {
  return C_FIRST_ROW_Y + C_ROW_GAP * level;
}

/** Capsule centres on a row; alternate rows are offset by half a capsule. */
function classicRowCentres(level) {
  const offset = level % 2;
  const out = [];
  for (let m = -12; m <= 12; m++) {
    const cx = C_CENTRE + (2 * m + offset) * C_RUN;
    if (Math.abs(cx - C_CENTRE) + C_RUN <= C_REACH + 0.01) out.push(cx);
  }
  return out;
}

/** Where exit `k` sits on the bottom row: k rights and (rows - k) lefts. */
function classicExitX(k) {
  return C_CENTRE + (2 * k - CLASSIC_ROWS) * C_RUN;
}

/** Slots are wide enough to swallow the ball, narrow against a long capsule. */
function classicGrooveMetrics() {
  const groove = 32;
  // The ball has to sit *inside* the slot, so it is sized off the cut rather
  // than off the floor highlight the way the evolved board does it.
  return { groove, floor: groove * 0.68, ballR: groove * 0.40 };
}

/** The three stops, placed at the centroid of the exits that feed them. */
function classicStops() {
  return classicBins().map((bin, index) => {
    let sum = 0;
    for (let i = 0; i < bin.slotCount; i++) sum += classicExitX(bin.slotStart + i);
    return {
      ...bin,
      index,
      x: sum / bin.slotCount,
      y: C_STOP_Y,
      markY: C_MARK_Y,
      r: C_STOP_R,
    };
  });
}

export function buildClassicLayout() {
  const segments = [`M ${C_CENTRE} ${C_ENTRY_Y} L ${C_CENTRE} ${classicRowY(0)}`];

  // The capsules themselves, milled right across the panel — including the
  // ones at the edges that the ball can never reach.
  for (let level = 0; level <= CLASSIC_ROWS; level++) {
    const y = classicRowY(level);
    for (const cx of classicRowCentres(level)) {
      const half = C_RUN - C_WALL;
      segments.push(`M ${(cx - half).toFixed(2)} ${y} L ${(cx + half).toFixed(2)} ${y}`);
    }
  }

  // The short drops joining one capsule's end to the next capsule's middle.
  for (let level = 0; level < CLASSIC_ROWS; level++) {
    const below = new Set(classicRowCentres(level + 1).map((x) => x.toFixed(2)));
    for (const cx of classicRowCentres(level)) {
      for (const end of [cx - C_RUN, cx + C_RUN]) {
        if (!below.has(end.toFixed(2))) continue;
        segments.push(`M ${end.toFixed(2)} ${classicRowY(level)} L ${end.toFixed(2)} ${classicRowY(level + 1)}`);
      }
    }
  }

  // Out of the bottom row and into the three stops. These channels converge,
  // which on this board is honest — its channels merge by design.
  const bins = classicStops();
  for (let k = 0; k < CLASSIC_EXITS; k++) {
    const from = classicExitX(k);
    const stop = bins.find((b) => k >= b.slotStart && k < b.slotStart + b.slotCount);
    segments.push(toPath(forkPoints(from, C_LAST_ROW_Y, stop.x, C_STOP_Y, 0.3)));
  }

  return {
    view: CLASSIC_VIEW,
    panel: CLASSIC_PANEL,
    depth: CLASSIC_ROWS,
    exits: CLASSIC_EXITS,
    channelPath: segments.join(' '),
    pegs: [],
    bins,
    entry: { x: C_CENTRE, y: C_ENTRY_Y },
    ...classicGrooveMetrics(),
  };
}

/**
 * The classic ball's route: a horizontal roll and a drop, six times over, then
 * down into a stop. `pegs` is all -1 — the panel has no pins in the maze.
 *
 * @param {(0|1)[]} bits one per row, 1 = roll right
 */
export function classicRoute(bits) {
  const stages = [[{ x: C_CENTRE, y: C_ENTRY_Y }, { x: C_CENTRE, y: classicRowY(0) }]];
  const kinds = ['entry'];

  let x = C_CENTRE;
  for (let level = 0; level < CLASSIC_ROWS; level++) {
    const y = classicRowY(level);
    const end = x + (bits[level] ? C_RUN : -C_RUN);
    // Roll the length of the capsule, then fall through to the row below.
    stages.push([{ x, y }, { x: end, y }, { x: end, y: classicRowY(level + 1) }]);
    kinds.push('fork');
    x = end;
  }

  const stop = classicStops().find((b) => {
    const k = Math.round((x - C_CENTRE) / (2 * C_RUN) + CLASSIC_ROWS / 2);
    return k >= b.slotStart && k < b.slotStart + b.slotCount;
  });
  const rest = { x: stop.x, y: C_STOP_Y - C_STOP_R - classicGrooveMetrics().ballR + 4 };
  stages.push(toRoutePoints(forkPoints(x, C_LAST_ROW_Y, stop.x, C_STOP_Y, 0.3), rest));
  kinds.push('fall');

  return { stages, pegs: stages.map(() => -1), kinds, rest };
}

/** The routed channel, but stopping short where the ball actually rests. */
function toRoutePoints(points, rest) {
  return [...points.slice(0, -1), rest];
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

  // Out of the forks, across the weave, and down into the slot. The traverse is
  // its own stage because it is where the answer is actually decided.
  const exitX = nodeX(depth, index);
  const slotX = nodeX(depth, slotForExit(index, depth));

  stages.push([{ x: exitX, y: ys[depth] }, { x: exitX, y: WEAVE_TOP }]);
  pegs.push(-1);
  kinds.push('approach');

  stages.push(forkPoints(exitX, WEAVE_TOP, slotX, WEAVE_BOTTOM, WEAVE_STUB));
  pegs.push(-1);
  kinds.push('weave');

  // The ball comes to rest on the nameplate, not floating in the well.
  const plateTop = BIN_BOTTOM - PLATE.gap - PLATE.h;
  const rest = { x: slotX, y: plateTop - grooveMetrics(2 ** depth).ballR + 2 };
  stages.push([{ x: slotX, y: WEAVE_BOTTOM }, rest]);
  pegs.push(-1);
  kinds.push('fall');

  return { stages, pegs, kinds, rest };
}
