/**
 * Walks the ball along the route from layout.ballRoute().
 *
 * The route is decided up-front by tree.js, so the animation is a replay of a
 * draw that already happened — speeding it up or skipping it cannot change the
 * outcome.
 */

import { placeBall } from './render.js';

const FIRST_STAGE_MS = 300;
const FORK_STAGE_MS = 340;
const DROP_STAGE_MS = 420;
const FORK_PAUSE_MS = 70;

export function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function easeIn(t) {
  return t * t;
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
 * @param {SVGCircleElement} ball
 * @param {{stages:{x:number,y:number}[][], rest:{x:number,y:number}}} route
 * @param {{signal?:AbortSignal, onSettled?:() => void}} [opts]
 * @returns {Promise<void>} resolves once the ball has settled
 */
export function animateBall(ball, route, opts = {}) {
  const { signal } = opts;

  if (prefersReducedMotion()) {
    placeBall(ball, route.rest.x, route.rest.y);
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let stageIndex = 0;
    let stageStart = null;
    let frame = 0;

    const finish = () => {
      cancelAnimationFrame(frame);
      placeBall(ball, route.rest.x, route.rest.y);
      signal?.removeEventListener('abort', finish);
      resolve();
    };

    signal?.addEventListener('abort', finish, { once: true });

    const stageDuration = (i) => {
      if (i === 0) return FIRST_STAGE_MS;
      if (i === route.stages.length - 1) return DROP_STAGE_MS;
      // Later forks run slightly quicker, so the ball reads as accelerating.
      const progress = i / route.stages.length;
      return FORK_STAGE_MS * (1 - progress * 0.35) + FORK_PAUSE_MS;
    };

    const step = (now) => {
      if (signal?.aborted) return;
      if (stageStart === null) stageStart = now;

      const isLast = stageIndex === route.stages.length - 1;
      const duration = stageDuration(stageIndex);
      const raw = Math.min((now - stageStart) / duration, 1);
      const eased = isLast ? easeIn(raw) : easeInOut(raw);
      const { x, y } = pointAt(route.stages[stageIndex], eased);
      placeBall(ball, x, y);

      if (raw < 1) {
        frame = requestAnimationFrame(step);
        return;
      }

      stageIndex += 1;
      stageStart = null;
      if (stageIndex >= route.stages.length) {
        signal?.removeEventListener('abort', finish);
        resolve();
        return;
      }
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
  });
}
