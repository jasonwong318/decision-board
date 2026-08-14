/**
 * The classic board — the physical 40×40 toy, bias included.
 *
 * This is the deliberate opposite of tree.js. There the channels never merge,
 * so every root-to-exit path is equally likely. Here they do merge, exactly as
 * the milled slots on the real board do: "left then right" lands in the same
 * place as "right then left", so the exit is the *count* of right-steps rather
 * than the sequence of them.
 *
 * That one line — a sum instead of a binary number — is the whole difference
 * between the two boards, and it is what turns a uniform draw into a binomial
 * one. With 6 rows the exits carry weights 1 : 6 : 15 : 20 : 15 : 6 : 1 out of
 * 64, so the single middle slot swallows 31.25% of every drop despite being one
 * seventh of the board's width.
 *
 * The board is not being corrected here. Reproducing the bias is the point:
 * the fairness panel puts the two distributions side by side, and you cannot
 * show what the evolved board fixed without also showing what it fixed.
 */

import { defaultBitSource } from './rng.js';

/** Rows of forks. 6 gives the toy's long descent and a 7-slot bottom row. */
export const CLASSIC_ROWS = 6;
export const CLASSIC_EXITS = CLASSIC_ROWS + 1;

/**
 * The three slots along the bottom edge, left to right, exactly as they are
 * printed on the physical board: ✗ / ↻ / ✓.
 *
 * The outer slots take three exits each and the middle takes one — that is the
 * board's real geometry, and it is what makes the middle's 31.25% so striking.
 */
const LAYOUT = [
  { kind: 'no', glyph: '✕', color: 'var(--cls-no)', exitCount: 3 },
  { kind: 'again', glyph: '↻', color: 'var(--cls-again)', exitCount: 1 },
  { kind: 'yes', glyph: '✓', color: 'var(--cls-yes)', exitCount: 3 },
];

/** n choose k, exact for the small n this board uses. */
function choose(n, k) {
  let result = 1;
  for (let i = 0; i < k; i++) result = (result * (n - i)) / (i + 1);
  return Math.round(result);
}

/** Weight of each exit: the binomial row, e.g. 1,6,15,20,15,6,1. */
export function exitWeights() {
  return Array.from({ length: CLASSIC_EXITS }, (_, p) => choose(CLASSIC_ROWS, p));
}

/**
 * @returns {{kind:string, glyph:string, color:string, exitStart:number,
 *            exitCount:number, optionIndex:number}[]}
 */
export function classicBins() {
  let exit = 0;
  return LAYOUT.map((slot) => {
    const bin = { ...slot, exitStart: exit, optionIndex: -1 };
    exit += slot.exitCount;
    return bin;
  });
}

/** Exit index -> bin index, for the whole bottom row. */
export function classicExitToBin() {
  const map = new Array(CLASSIC_EXITS);
  classicBins().forEach((bin, binIndex) => {
    for (let i = 0; i < bin.exitCount; i++) map[bin.exitStart + i] = binIndex;
  });
  return map;
}

/**
 * The merging step. Bit 1 = step right; the exit is how many rights were taken,
 * so the 2^rows distinct paths collapse onto rows+1 exits.
 *
 * @param {(0|1)[]} bits
 * @returns {number} exit index, 0..CLASSIC_ROWS
 */
export function exitFromBits(bits) {
  return bits.reduce((sum, bit) => sum + bit, 0);
}

/**
 * Drop one ball down the classic board.
 *
 * @param {{nextBit:() => 0|1}} [bitSource] injectable for tests
 * @returns {{bits:(0|1)[], exit:number, binIndex:number, bin:object,
 *            isRetry:boolean, optionIndex:number}}
 */
export function classicDrop(bitSource = defaultBitSource) {
  const bits = [];
  for (let i = 0; i < CLASSIC_ROWS; i++) bits.push(bitSource.nextBit());

  const exit = exitFromBits(bits);
  const binIndex = classicExitToBin()[exit];
  const bin = classicBins()[binIndex];

  return {
    bits,
    exit,
    binIndex,
    bin,
    // The app treats "land again" the same way whichever board produced it.
    isRetry: bin.kind === 'again',
    optionIndex: -1,
  };
}

/**
 * Exact probabilities per slot, for the fairness panel.
 * @returns {{bins:{kind:string, glyph:string, color:string, p:number}[],
 *            total:number, exits:number, rows:number}}
 */
export function classicProbabilities() {
  const weights = exitWeights();
  const total = weights.reduce((a, b) => a + b, 0);
  const bins = classicBins().map((bin) => {
    let weight = 0;
    for (let i = 0; i < bin.exitCount; i++) weight += weights[bin.exitStart + i];
    return { kind: bin.kind, glyph: bin.glyph, color: bin.color, p: weight / total };
  });
  return { bins, total, exits: CLASSIC_EXITS, rows: CLASSIC_ROWS };
}
