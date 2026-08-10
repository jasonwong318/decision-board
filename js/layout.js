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

import { shapeFor, binsFor } from './tree.js';

/**
 * Portrait, not square: the descent is the ceremony, so the board is given the
 * room to make it feel like one.
 */
export const VIEW = { w: 1000, h: 1240 };

export const PANEL = { x: 10, y: 10, w: 980, h: 1220, r: 30 };

/** The nameplate at the foot of each bin, and the shelf the ball rests on. */
export const PLATE = { h: 32, gap: 8 };

const PAD = 40;          // board edge -> playable area
const ENTRY_Y = 176;     // where the ball is released
const FIRST_ROW_Y = 288; // the single top fork
const LAST_ROW_Y = 946;  // the bottom row of forks
const BIN_TOP = 1006;
const BIN_BOTTOM = 1174;
const STUB = 0.24;       // share of the row gap spent going straight down

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
function forkPoints(x0, y0, x1, y1) {
  const stub = (y1 - y0) * STUB;
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

  // Straight drop from each exit into its bin.
  for (let exit = 0; exit < exits; exit++) {
    const x = nodeX(depth, exit);
    segments.push(`M ${x} ${ys[depth]} L ${x} ${BIN_TOP + 6}`);
  }

  const binWidth = INNER_W / exits;
  const bins = binsFor(k).map((bin, i) => ({
    ...bin,
    index: i,
    x: PAD + bin.exitStart * binWidth,
    width: bin.exitCount * binWidth,
    y: BIN_TOP,
    height: BIN_BOTTOM - BIN_TOP,
  }));

  return {
    depth,
    exits,
    ys,
    channelPath: segments.join(' '),
    pegs,
    bins,
    entry: { x: centre, y: ENTRY_Y },
    binTop: BIN_TOP,
    binBottom: BIN_BOTTOM,
    ...grooveMetrics(exits),
  };
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

  let index = 0;
  for (let level = 0; level < depth; level++) {
    const x = nodeX(level, index);
    index = index * 2 + bits[level];
    stages.push(forkPoints(x, ys[level], nodeX(level + 1, index), ys[level + 1]));
    pegs.push(level + 1 < depth ? pegIndex(level + 1, index) : -1);
  }

  // The ball comes to rest on the nameplate, not floating in the well.
  const exitX = nodeX(depth, index);
  const plateTop = BIN_BOTTOM - PLATE.gap - PLATE.h;
  const rest = { x: exitX, y: plateTop - grooveMetrics(2 ** depth).ballR + 2 };
  stages.push([{ x: exitX, y: ys[depth] }, rest]);
  pegs.push(-1);

  return { stages, pegs, rest };
}
