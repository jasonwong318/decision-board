/**
 * Walks the ball along the route from layout.ballRoute().
 *
 * The route is decided up-front by tree.js, so the animation is a replay of a
 * draw that already happened — speeding it up or skipping it cannot change the
 * outcome.
 *
 * The pacing is deliberate rather than brisk: each fork gets a beat of its own
 * so the ball reads as *deciding*, and the drop into the bin lands with a short
 * settle instead of stopping dead.
 */

import { placeBall } from './render.js';

const FIRST_STAGE_MS = 340;
const FORK_STAGE_MS = 330;
const DROP_STAGE_MS = 460;
const FORK_PAUSE_MS = 80;
const SETTLE_MS = 240;
/** The traverse across the weave is where the answer is decided; let it read. */
const APPROACH_MS = 200;
const WEAVE_MS = 700;
const SETTLE_RISE = 9; // how far the ball rebounds out of the well, in view units

export function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function easeIn(t) {
  return t * t;
}

/** One rebound, decaying — a half sine is enough to sell the weight. */
function settleOffset(t) {
  return Math.sin(t * Math.PI) * (1 - t) * SETTLE_RISE;
}

/**
 * Position along a polyline at normalized *arc length* t.
 *
 * A fork is a short stub, a long diagonal and another short stub, so stepping
 * by vertex index would make the ball crawl through the stubs and jump the
 * diagonal. Measuring real distance keeps the speed even.
 */
function pointAt(points, t) {
  if (points.length === 1) return points[0];

  const spans = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const length = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    spans.push(length);
    total += length;
  }
  if (total === 0) return points[0];

  let travelled = t * total;
  for (let i = 0; i < spans.length; i++) {
    if (travelled <= spans[i] || i === spans.length - 1) {
      const local = spans[i] === 0 ? 0 : Math.min(travelled / spans[i], 1);
      const a = points[i];
      const b = points[i + 1];
      return { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local };
    }
    travelled -= spans[i];
  }
  return points[points.length - 1];
}

/**
 * @param {SVGGElement} ball
 * @param {{stages:{x:number,y:number}[][], rest:{x:number,y:number}}} route
 * @param {{signal?:AbortSignal, onStageEnd?:(stageIndex:number) => void}} [opts]
 * @returns {Promise<void>} resolves once the ball has settled
 */
export function animateBall(ball, route, opts = {}) {
  const { signal, onStageEnd } = opts;
  const stageCount = route.stages.length;

  if (prefersReducedMotion()) {
    placeBall(ball, route.rest.x, route.rest.y);
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let stageIndex = 0;
    let stageStart = null;
    let settling = false;
    let frame = 0;

    const done = () => {
      signal?.removeEventListener('abort', finish);
      resolve();
    };

    const finish = () => {
      cancelAnimationFrame(frame);
      placeBall(ball, route.rest.x, route.rest.y);
      done();
    };

    signal?.addEventListener('abort', finish, { once: true });

    const kindOf = (i) => route.kinds?.[i] ?? (i === 0 ? 'entry' : 'fork');

    const stageDuration = (i) => {
      switch (kindOf(i)) {
        case 'entry': return FIRST_STAGE_MS;
        case 'approach': return APPROACH_MS;
        case 'weave': return WEAVE_MS;
        case 'fall': return DROP_STAGE_MS;
        default:
          // Later forks run slightly quicker, so the ball reads as accelerating.
          return FORK_STAGE_MS * (1 - (i / stageCount) * 0.35) + FORK_PAUSE_MS;
      }
    };

    const step = (now) => {
      if (signal?.aborted) return;
      if (stageStart === null) stageStart = now;

      if (settling) {
        const raw = Math.min((now - stageStart) / SETTLE_MS, 1);
        placeBall(ball, route.rest.x, route.rest.y - settleOffset(raw));
        if (raw < 1) {
          frame = requestAnimationFrame(step);
          return;
        }
        placeBall(ball, route.rest.x, route.rest.y);
        done();
        return;
      }

      const raw = Math.min((now - stageStart) / stageDuration(stageIndex), 1);
      // The final drop accelerates under gravity; everything else eases.
      const eased = kindOf(stageIndex) === 'fall' && stageIndex === stageCount - 1
        ? easeIn(raw)
        : easeInOut(raw);
      const { x, y } = pointAt(route.stages[stageIndex], eased);
      placeBall(ball, x, y);

      if (raw < 1) {
        frame = requestAnimationFrame(step);
        return;
      }

      onStageEnd?.(stageIndex);
      stageIndex += 1;
      stageStart = null;
      if (stageIndex >= stageCount) settling = true;
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
  });
}
