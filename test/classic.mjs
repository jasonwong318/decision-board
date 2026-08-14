/**
 * Verification for the classic board.
 *
 *   node test/classic.mjs
 *
 * This is the mirror image of test/fairness.mjs. There the claim is that the
 * board is fair; here the claim is that it is *biased in exactly the documented
 * way* — the toy's binomial distribution, reproduced rather than corrected.
 *
 * Part 1 is a proof: it enumerates all 2^rows fork sequences and checks the
 * exits carry binomial weights, that merging genuinely happens (interior exits
 * are reached by many distinct paths), and that the three printed slots add up
 * to the numbers the fairness panel prints.
 *
 * Part 2 drives the real classicDrop() through the real crypto bit source and
 * chi-square tests the result against those weights.
 */

import {
  CLASSIC_ROWS, CLASSIC_EXITS,
  classicBins, classicExitToBin, classicProbabilities, exitFromBits, classicDrop,
  exitWeights,
} from '../js/classic.js';
import { probabilities } from '../js/tree.js';

let failures = 0;

function check(label, condition, detail = '') {
  const status = condition ? 'PASS' : 'FAIL';
  if (!condition) failures++;
  console.log(`  [${status}] ${label}${detail ? ` — ${detail}` : ''}`);
}

/* ---------------------------------------------------------------- part 1 */

console.log('=== Part 1: every path enumerated ===\n');

const paths = 2 ** CLASSIC_ROWS;
const pathsPerExit = new Array(CLASSIC_EXITS).fill(0);

for (let mask = 0; mask < paths; mask++) {
  const bits = [];
  for (let row = 0; row < CLASSIC_ROWS; row++) bits.push((mask >> row) & 1);
  pathsPerExit[exitFromBits(bits)]++;
}

const weights = exitWeights();
check(
  `all ${paths} paths accounted for`,
  pathsPerExit.reduce((a, b) => a + b, 0) === paths,
);
check(
  `exit weights are the binomial row [${weights.join(', ')}]`,
  pathsPerExit.every((count, i) => count === weights[i]),
  pathsPerExit.join(', '),
);

// The defining property: unlike the evolved board, many paths share an exit.
const merged = pathsPerExit.filter((count) => count > 1).length;
check(
  'channels merge — interior exits are reached by more than one path',
  merged === CLASSIC_EXITS - 2,
  `${merged} of ${CLASSIC_EXITS} exits are shared`,
);
check(
  'only the two extreme exits have a single path',
  pathsPerExit[0] === 1 && pathsPerExit[CLASSIC_EXITS - 1] === 1,
);

const bins = classicBins();
const map = classicExitToBin();
check('every exit is claimed by exactly one slot', map.every((b) => Number.isInteger(b)));
check(
  'the three slots tile the bottom row with no gaps',
  bins.reduce((sum, bin) => sum + bin.exitCount, 0) === CLASSIC_EXITS
  && bins.every((bin, i) => bin.exitStart === bins.slice(0, i).reduce((s, b) => s + b.exitCount, 0)),
);

const { bins: odds } = classicProbabilities();
const total = odds.reduce((sum, bin) => sum + bin.p, 0);
check('slot probabilities sum to 1', Math.abs(total - 1) < 1e-12, total.toString());

const byKind = Object.fromEntries(odds.map((bin) => [bin.kind, bin.p]));
check(
  'the board is symmetric between yes and no',
  byKind.yes === byKind.no,
  `${(byKind.yes * 100).toFixed(3)}% each`,
);

// The headline: one seventh of the width, but nearly a third of every drop.
const widthShare = bins.find((b) => b.kind === 'again').exitCount / CLASSIC_EXITS;
check(
  'the middle slot takes far more than its share of the width',
  byKind.again > widthShare * 2,
  `${(widthShare * 100).toFixed(2)}% of the width, ${(byKind.again * 100).toFixed(3)}% of drops`,
);
check(
  'the middle slot is exactly 31.25%',
  byKind.again === 0.3125,
  `${(byKind.again * 100).toFixed(4)}%`,
);

// What the fairness panel claims when it compares the two boards.
const evolvedRetry = probabilities(2).retry;
check(
  'the evolved board keeps the same three outcomes far tighter',
  evolvedRetry < byKind.again,
  `evolved retry ${(evolvedRetry * 100).toFixed(2)}% vs classic ${(byKind.again * 100).toFixed(2)}%`,
);

console.log('\n  slot odds:');
for (const bin of odds) {
  console.log(`    ${bin.glyph} ${bin.kind.padEnd(6)} ${(bin.p * 100).toFixed(3)}%`);
}

/* ---------------------------------------------------------------- part 2 */

const TRIALS = 500_000;
console.log(`\n=== Part 2: ${TRIALS.toLocaleString()} real draws through classicDrop() ===\n`);

const observed = new Array(bins.length).fill(0);
const exitHits = new Array(CLASSIC_EXITS).fill(0);

for (let i = 0; i < TRIALS; i++) {
  const result = classicDrop();
  observed[result.binIndex]++;
  exitHits[result.exit]++;
}

const chi2 = (counts, expectations) => counts.reduce((sum, count, i) => (
  sum + (count - expectations[i]) ** 2 / expectations[i]
), 0);

/**
 * Critical values at p = 1e-5, not the usual 0.001.
 *
 * This runs on every push, so a correct implementation failing one run in a
 * thousand is not an acceptable gate — and nothing is lost by tightening it: a
 * genuine error in the exit mapping puts chi-square in the hundreds, orders of
 * magnitude clear of either threshold.
 */
const CRITICAL = { 2: 23.03, 6: 27.86 };

const slotChi2 = chi2(observed, odds.map((bin) => TRIALS * bin.p));
console.log(
  `  observed  ${odds.map((b, i) => `${b.glyph} ${(observed[i] / TRIALS * 100).toFixed(2)}%`).join('   ')}`,
);
check(
  `slot distribution matches the binomial (chi2 ${slotChi2.toFixed(2)} < ${CRITICAL[2]}, df 2)`,
  slotChi2 < CRITICAL[2],
);

// Per-exit is the sharper test: it would catch an off-by-one in the exit
// mapping that the three-slot grouping could average away.
const totalWeight = weights.reduce((a, b) => a + b, 0);
const exitChi2 = chi2(exitHits, weights.map((w) => (TRIALS * w) / totalWeight));
check(
  `exit distribution matches the binomial (chi2 ${exitChi2.toFixed(2)} < ${CRITICAL[6]}, df 6)`,
  exitChi2 < CRITICAL[6],
);
check('every exit was reached at least once', exitHits.every((h) => h > 0));

console.log(
  failures === 0
    ? '\nAll classic-board checks passed.\n'
    : `\n${failures} check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
