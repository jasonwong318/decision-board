/**
 * The probability core of the decision board.
 *
 * Why a binary tree instead of a real Galton board:
 * a physical decision board lets paths merge ("left then right" lands in the
 * same place as "right then left"), so its landing slots follow a binomial
 * distribution — the middle slot is far more likely than the edges. Worse, for
 * 3 or 5 options there is provably no way to partition binomial weights into
 * equal groups.
 *
 * Here the channels never merge. With depth d there are 2^d exits and every
 * root-to-exit path has probability exactly 1/2^d, so the exits can be split
 * into exactly equal groups. Each fork is still a genuine 50/50 coin flip
 * (see rng.js) — nothing is choreographed after the fact.
 */

import { defaultBitSource } from './rng.js';

/**
 * Board shape per option count. `per` exits go to each option, `retry` exits
 * are left over for the "go again" bin. per * k + retry === 2^depth.
 *
 * The retry bin exists to absorb exits that will not divide evenly, so 4
 * options — which split 16 exits perfectly — simply do not get one.
 *
 * Two options are the exception: 8/8 would also divide perfectly, but the
 * physical board's whole silhouette is A / retry / B, and the brief asked for
 * that third outcome, so they keep a deliberate 7/2/7.
 */
export const BOARD_SHAPES = {
  2: { depth: 4, per: 7, retry: 2 },
  3: { depth: 4, per: 5, retry: 1 },
  4: { depth: 4, per: 4, retry: 0 },
  5: { depth: 4, per: 3, retry: 1 },
};

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 5;

export const RETRY_BIN = 'retry';

/**
 * @param {number} k number of options
 * @returns {{depth:number, exits:number, per:number, retry:number}}
 */
export function shapeFor(k) {
  const shape = BOARD_SHAPES[k];
  if (!shape) throw new RangeError(`unsupported option count: ${k}`);
  return { ...shape, exits: 2 ** shape.depth };
}

/**
 * Bins laid out left to right along the bottom of the board, over *slots*
 * rather than exits — see slotForExit for why the two are not the same.
 *
 * The retry bin is inserted after the ceil(k/2)-th option so that it sits near
 * the middle; for k=2 that reproduces the physical board's A / retry / B.
 *
 * @param {number} k
 * @returns {{kind:'option'|'retry', optionIndex:number, slotStart:number,
 *            slotCount:number}[]}
 */
export function binsFor(k) {
  const { per, retry } = shapeFor(k);
  const retryAfter = Math.ceil(k / 2);
  const bins = [];
  let slot = 0;

  const push = (kind, optionIndex, slotCount) => {
    bins.push({ kind, optionIndex, slotStart: slot, slotCount });
    slot += slotCount;
  };

  for (let i = 0; i < k; i++) {
    push('option', i, per);
    if (i + 1 === retryAfter && retry > 0) push(RETRY_BIN, -1, retry);
  }
  return bins;
}

/**
 * Which bottom slot an exit feeds into: the exit index with its bits reversed.
 *
 * Without this the board gives itself away. Bins own runs of consecutive
 * positions, and `exitFromBits` reads the first fork as the *most* significant
 * bit — so with two options, going left at the very first fork lands in exits
 * 0–7, of which seven belong to A. One fork out of four and the answer is 87.5%
 * settled; the rest of the descent is theatre.
 *
 * Reversing the bits makes the first fork the *least* significant bit of the
 * landing slot, so it picks odd or even positions spread along the whole bottom
 * edge, and the last fork is what finally chooses a side. The same left-at-the-
 * first-fork now leaves A at 50% against B's 37.5%.
 *
 * Fairness is untouched, and that is the point of using a permutation rather
 * than a different shape: bit reversal is a bijection, every exit still has
 * probability exactly 1/2^depth, so every bin still owns exactly as many paths
 * as it owns slots. The board is drawn with the channels physically crossing
 * over and under each other to get there — they cross, they never merge.
 *
 * @param {number} exit
 * @param {number} depth
 * @returns {number} slot index
 */
export function slotForExit(exit, depth) {
  let slot = 0;
  for (let i = 0; i < depth; i++) slot = (slot << 1) | ((exit >> i) & 1);
  return slot;
}

/**
 * Slot index -> bin index, precomputed for the whole bottom row.
 * @param {number} k
 * @returns {number[]} length 2^depth
 */
export function slotToBin(k) {
  const bins = binsFor(k);
  const map = new Array(shapeFor(k).exits);
  bins.forEach((bin, binIndex) => {
    for (let i = 0; i < bin.slotCount; i++) map[bin.slotStart + i] = binIndex;
  });
  return map;
}

/**
 * Exit index -> bin index, following the weave.
 * @param {number} k
 * @returns {number[]} length 2^depth
 */
export function exitToBin(k) {
  const { depth, exits } = shapeFor(k);
  const slots = slotToBin(k);
  return Array.from({ length: exits }, (_, exit) => slots[slotForExit(exit, depth)]);
}

/**
 * Turn a sequence of fork decisions into the exit the ball drops out of.
 * Bit 0 = go left, 1 = go right; the bits read as a binary number are exactly
 * the exit index, which is what makes every exit equally likely.
 *
 * @param {(0|1)[]} bits length must equal depth
 * @returns {number} exit index
 */
export function exitFromBits(bits) {
  let exit = 0;
  for (const bit of bits) exit = exit * 2 + bit;
  return exit;
}

/**
 * Drop one ball.
 *
 * @param {number} k number of options
 * @param {{nextBit:() => 0|1}} [bitSource] injectable for tests
 * @returns {{bits:(0|1)[], exit:number, slot:number, binIndex:number,
 *            bin:object, isRetry:boolean, optionIndex:number}}
 */
export function drop(k, bitSource = defaultBitSource) {
  const { depth } = shapeFor(k);
  const bits = [];
  for (let i = 0; i < depth; i++) bits.push(bitSource.nextBit());

  const exit = exitFromBits(bits);
  const slot = slotForExit(exit, depth);
  const binIndex = slotToBin(k)[slot];
  const bin = binsFor(k)[binIndex];

  return {
    bits,
    exit,
    slot,
    binIndex,
    bin,
    isRetry: bin.kind === RETRY_BIN,
    optionIndex: bin.optionIndex,
  };
}

/**
 * Exact probabilities for display in the "why is this fair" panel.
 * @param {number} k
 * @returns {{perOption:number, retry:number, exits:number, depth:number}}
 */
export function probabilities(k) {
  const { per, retry, exits, depth } = shapeFor(k);
  return { perOption: per / exits, retry: retry / exits, exits, depth };
}
