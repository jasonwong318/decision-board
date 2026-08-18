/**
 * Fairness verification for the decision board.
 *
 *   node test/fairness.mjs
 *
 * Part 1 is a proof, not a sample: it enumerates every one of the 2^depth
 * possible fork sequences and checks that each option owns exactly the same
 * number of exits, that every exit is claimed exactly once, and that the retry
 * bin holds the documented remainder.
 *
 * Part 2 drives the real drop() path with the real crypto bit source and
 * chi-square tests the observed counts, which is what catches an off-by-one
 * between the RNG and the exit mapping.
 */

import {
  BOARD_SHAPES, MIN_OPTIONS, MAX_OPTIONS,
  shapeFor, binsFor, exitToBin, slotToBin, slotForExit, exitFromBits, drop, probabilities,
  swapBits, weaveSwaps,
} from '../js/tree.js';

let failures = 0;

function check(label, condition, detail = '') {
  const status = condition ? 'PASS' : 'FAIL';
  if (!condition) failures++;
  console.log(`  [${status}] ${label}${detail ? ` — ${detail}` : ''}`);
}

/* ---------------------------------------------------------------- part 1 */

console.log('\n=== Part 1: exhaustive enumeration of every path ===');

for (let k = MIN_OPTIONS; k <= MAX_OPTIONS; k++) {
  const { depth, exits, per, retry } = shapeFor(k);
  console.log(`\n${k} options — depth ${depth}, ${exits} exits`);

  check('shape adds up', per * k + retry === exits, `${per}*${k}+${retry}=${exits}`);

  const bins = binsFor(k);
  const map = exitToBin(k);

  check('every exit is mapped', map.every((b) => Number.isInteger(b)));
  check(
    'bins tile the row with no gaps or overlaps',
    bins.reduce((sum, b) => sum + b.slotCount, 0) === exits &&
      bins.every((b, i) => b.slotStart === (i === 0 ? 0 : bins[i - 1].slotStart + bins[i - 1].slotCount)),
  );
  check(
    'a retry bin exists exactly when there is a remainder to absorb',
    bins.filter((b) => b.kind === 'retry').length === (retry > 0 ? 1 : 0),
  );

  // Walk all 2^depth fork sequences.
  const counts = new Array(k).fill(0);
  let retryCount = 0;
  const seen = new Set();

  for (let n = 0; n < exits; n++) {
    const bits = [];
    for (let i = depth - 1; i >= 0; i--) bits.push((n >> i) & 1);

    const exit = exitFromBits(bits);
    seen.add(exit);

    const bin = bins[map[exit]];
    if (bin.kind === 'retry') retryCount++;
    else counts[bin.optionIndex]++;
  }

  check('bits -> exit is a bijection', seen.size === exits, `${seen.size}/${exits} distinct exits`);

  // The weave is only safe because it is a permutation. If two exits ever
  // shared a slot the channels would have merged and the whole claim would
  // collapse, so this is the load-bearing assertion for the crossing band.
  const landed = new Set();
  for (let exit = 0; exit < exits; exit++) {
    const slot = slotForExit(exit, depth);
    if (slot >= 0 && slot < exits) landed.add(slot);
  }
  check(
    'the weave is a bijection — every exit lands in its own slot',
    landed.size === exits,
    `${landed.size}/${exits} distinct slots`,
  );
  check(
    'reversing the weave twice is the identity',
    Array.from({ length: exits }, (_, e) => slotForExit(slotForExit(e, depth), depth))
      .every((e, i) => e === i),
  );
  // The weave is drawn as one band per swap. If the bands ever stopped
  // composing back to the reversal the picture and the maths would disagree,
  // and the picture is the part nobody would think to re-derive.
  check(
    'the crossing bands compose back to the whole weave',
    Array.from({ length: exits }, (_, e) => (
      weaveSwaps(depth).reduce((x, [i, j]) => swapBits(x, i, j), e)
    )).every((got, e) => got === slotForExit(e, depth)),
    `${weaveSwaps(depth).length} band(s)`,
  );
  check(
    'every option owns exactly the same number of paths',
    counts.every((c) => c === counts[0]),
    `counts = [${counts.join(', ')}]`,
  );
  check('option share matches the documented shape', counts[0] === per);
  check('retry share matches the documented shape', retryCount === retry);
  check('all paths accounted for', counts.reduce((a, b) => a + b, 0) + retryCount === exits);

  // No single fork may hand over the answer. Before the weave existed the
  // first fork settled two options at 87.5%, which made the rest of the
  // descent decoration; the bound here is what stops that regressing.
  const slots = slotToBin(k);
  let worstShare = 0;
  for (const firstBit of [0, 1]) {
    const reachable = new Array(bins.length).fill(0);
    for (let n = 0; n < exits; n++) {
      const bits = [];
      for (let i = depth - 1; i >= 0; i--) bits.push((n >> i) & 1);
      if (bits[0] !== firstBit) continue;
      reachable[slots[slotForExit(exitFromBits(bits), depth)]]++;
    }
    const total = reachable.reduce((a, b) => a + b, 0);
    worstShare = Math.max(worstShare, ...reachable.map((c) => c / total));
  }
  check(
    'no single fork settles the outcome',
    worstShare <= 0.55,
    `worst bin after the first fork: ${(worstShare * 100).toFixed(2)}%`,
  );

  const p = probabilities(k);
  console.log(
    `         each option ${(p.perOption * 100).toFixed(3)}%  ·  retry ${(p.retry * 100).toFixed(3)}%`,
  );
}

/* ---------------------------------------------------------------- part 2 */

const TRIALS = 1_000_000;
console.log(`\n=== Part 2: ${TRIALS.toLocaleString()} real draws through drop() ===`);

// Critical values for chi-square at p = 0.001, df = number of bins - 1.
const CHI2_CRITICAL = { 1: 10.83, 2: 13.82, 3: 16.27, 4: 18.47, 5: 20.52 };

for (let k = MIN_OPTIONS; k <= MAX_OPTIONS; k++) {
  const bins = binsFor(k);
  const { exits } = shapeFor(k);
  const observed = new Array(bins.length).fill(0);
  const exitHits = new Array(exits).fill(0);

  for (let i = 0; i < TRIALS; i++) {
    const result = drop(k);
    observed[result.binIndex]++;
    exitHits[result.exit]++;
  }

  const chi2 = bins.reduce((sum, bin, i) => {
    const expected = TRIALS * (bin.slotCount / exits);
    return sum + (observed[i] - expected) ** 2 / expected;
  }, 0);
  const df = bins.length - 1;
  const critical = CHI2_CRITICAL[df];

  const optionShares = bins
    .map((b, i) => (b.kind === 'option' ? (observed[i] / TRIALS * 100).toFixed(2) + '%' : null))
    .filter(Boolean);

  console.log(`\n${k} options — observed ${optionShares.join('  ')}`);
  check(
    `bin distribution matches theory (chi2 ${chi2.toFixed(2)} < ${critical}, df ${df})`,
    chi2 < critical,
  );
  check('every exit was reached at least once', exitHits.every((h) => h > 0));
}

console.log(
  failures === 0
    ? '\nAll fairness checks passed.\n'
    : `\n${failures} check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
