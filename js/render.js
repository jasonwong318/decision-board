/**
 * Draws the board into an <svg>.
 *
 * Every colour is a CSS custom property — including the gradient stops — so the
 * two themes recut the same instrument without this file knowing about either.
 * Shape and material live here; state (winner, strike, charge) is expressed as
 * classes and animated in CSS.
 */

import { buildLayout, VIEW, PANEL, PLATE } from './layout.js';
import { RETRY_BIN } from './tree.js';
import { OPTION_COLORS, RETRY_COLOR } from './state.js';

const NS = 'http://www.w3.org/2000/svg';

function el(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== null && value !== undefined) node.setAttribute(key, String(value));
  }
  return node;
}

export function binLetter(bin) {
  return bin.kind === RETRY_BIN ? '↻' : String.fromCharCode(65 + bin.optionIndex);
}

export function binColor(bin) {
  return bin.kind === RETRY_BIN ? RETRY_COLOR : OPTION_COLORS[bin.optionIndex % OPTION_COLORS.length];
}

/** Gradient stops carry var() so a theme swap restyles the material for free. */
function gradient(type, id, attrs, stops) {
  const node = el(type, { id, ...attrs });
  for (const [offset, color] of stops) {
    node.append(el('stop', { offset, 'stop-color': color }));
  }
  return node;
}

function defs() {
  const node = el('defs');

  node.append(gradient('linearGradient', 'db-panel', { x1: 0, y1: 0, x2: 0, y2: 1 }, [
    [0, 'var(--panel-top)'],
    [1, 'var(--panel-bottom)'],
  ]));

  node.append(gradient('linearGradient', 'db-well', { x1: 0, y1: 0, x2: 0, y2: 1 }, [
    [0, 'var(--well-top)'],
    [1, 'var(--well-bottom)'],
  ]));

  // Light lands top-left on every turned part, so pegs and ball share an origin.
  node.append(gradient('radialGradient', 'db-peg', { cx: '35%', cy: '30%', r: '75%' }, [
    [0, 'var(--peg-hi)'],
    [0.55, 'var(--peg)'],
    [1, 'var(--peg-lo)'],
  ]));

  node.append(gradient('radialGradient', 'db-ball', { cx: '34%', cy: '28%', r: '78%' }, [
    [0, 'var(--ball-hi)'],
    [0.45, 'var(--ball)'],
    [1, 'var(--ball-lo)'],
  ]));

  const bloom = el('filter', {
    id: 'db-bloom', x: '-70%', y: '-70%', width: '240%', height: '240%',
  });
  bloom.append(el('feGaussianBlur', { stdDeviation: 18 }));
  node.append(bloom);

  return node;
}

/** The engraved faceplate: a letterspaced mark between two hairlines. */
function faceplate() {
  const group = el('g', { class: 'faceplate' });
  const mid = VIEW.w / 2;
  const y = 78;

  // Offsetting a second copy by a pixel is what makes the type read as cut into
  // the panel rather than printed on it.
  for (const [cls, dy] of [['board-wordmark-shadow', 1.5], ['', 0]]) {
    const text = el('text', {
      class: `board-wordmark ${cls}`.trim(), x: mid, y: y + dy, 'text-anchor': 'middle',
      // Letter-spacing also trails the last glyph, so centring the advance box
      // leaves the word visually half a space to the left. Put it back.
      dx: 4.4,
    });
    text.textContent = 'DECISION';
    group.append(text);
  }

  group.append(el('line', { class: 'board-rule', x1: 96, y1: y - 7, x2: mid - 130, y2: y - 7 }));
  group.append(el('line', { class: 'board-rule', x1: mid + 130, y1: y - 7, x2: VIEW.w - 96, y2: y - 7 }));

  return group;
}

/**
 * @param {SVGSVGElement} svg
 * @param {number} k number of options
 * @returns {{layout:object, ball:SVGGElement, binNodes:SVGGElement[],
 *            pegNodes:SVGGElement[], bins:SVGGElement}}
 */
export function renderBoard(svg, k) {
  const layout = buildLayout(k);

  svg.setAttribute('viewBox', `0 0 ${VIEW.w} ${VIEW.h}`);
  svg.style.setProperty('--groove-w', layout.groove.toFixed(2));
  svg.style.setProperty('--floor-w', layout.floor.toFixed(2));
  svg.replaceChildren();

  svg.append(defs());

  svg.append(el('rect', {
    class: 'board-panel', x: PANEL.x, y: PANEL.y, width: PANEL.w, height: PANEL.h, rx: PANEL.r,
  }));
  svg.append(el('rect', {
    class: 'board-inlay',
    x: PANEL.x + 14, y: PANEL.y + 14,
    width: PANEL.w - 28, height: PANEL.h - 28,
    rx: PANEL.r - 8,
  }));

  svg.append(faceplate());

  // The groove is three strokes: the cut, the floor inside it, and a hairline
  // sheen along the centre that catches the light like a milled slot.
  const channels = el('g', { class: 'channels' });
  for (const cls of ['channel-cut', 'channel-floor', 'channel-sheen']) {
    channels.append(el('path', { class: `channel ${cls}`, d: layout.channelPath }));
  }
  svg.append(channels);

  const pegNodes = [];
  const pegs = el('g', { class: 'pegs' });
  const pegR = layout.floor * 0.27;
  for (const peg of layout.pegs) {
    const group = el('g', { class: 'peg', transform: `translate(${peg.x} ${peg.y})` });
    group.append(el('circle', { class: 'peg-body', r: pegR.toFixed(2) }));
    group.append(el('circle', { class: 'peg-ring', r: (pegR + 1).toFixed(2) }));
    pegNodes.push(group);
    pegs.append(group);
  }
  svg.append(pegs);

  const binNodes = [];
  const bins = el('g', { class: 'bins' });
  for (const bin of layout.bins) {
    const group = el('g', { class: `bin bin-${bin.kind}` });
    group.style.setProperty('--bin-color', binColor(bin));

    const x = bin.x + 4;
    const width = bin.width - 8;
    // The retry bin can be a single exit wide, so the plate's inset has to be a
    // share of the bin rather than a fixed margin or it collapses to nothing.
    const inset = Math.min(8, width * 0.14);
    const plateY = bin.y + bin.height - PLATE.h - PLATE.gap;

    group.append(el('rect', {
      class: 'bin-bloom',
      x, y: bin.y, width, height: bin.height, rx: 14,
      filter: 'url(#db-bloom)',
    }));
    group.append(el('rect', {
      class: 'bin-well', x, y: bin.y, width, height: bin.height, rx: 14,
    }));
    // A nameplate at the foot of the well, the way a bin on a real instrument
    // would be labelled — it is also what ignites when the ball lands.
    group.append(el('rect', {
      class: 'bin-plate',
      x: x + inset, y: plateY,
      width: width - inset * 2, height: PLATE.h, rx: 8,
    }));

    const label = el('text', {
      class: 'bin-label',
      x: bin.x + bin.width / 2,
      y: bin.y + (plateY - bin.y) / 2,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
    });
    label.textContent = binLetter(bin);
    group.append(label);

    binNodes.push(group);
    bins.append(group);
  }
  svg.append(bins);

  const pulse = el('g', {
    class: 'entry-pulse', transform: `translate(${layout.entry.x} ${layout.entry.y})`,
  });
  pulse.append(el('circle', { r: 30 }));
  pulse.append(el('circle', { r: 30 }));
  svg.append(pulse);

  const ballR = layout.ballR;
  const ball = el('g', { class: 'ball', transform: `translate(${layout.entry.x} ${layout.entry.y})` });
  ball.append(el('circle', { class: 'ball-body', r: ballR.toFixed(2) }));
  ball.append(el('circle', {
    class: 'ball-spec',
    cx: (-ballR * 0.3).toFixed(2),
    cy: (-ballR * 0.36).toFixed(2),
    r: (ballR * 0.2).toFixed(2),
  }));
  svg.append(ball);

  return { layout, ball, binNodes, pegNodes, bins };
}

export function placeBall(ball, x, y) {
  ball.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
}
