/** Draws the board into an <svg>. Colours and textures come from CSS. */

import { buildLayout, VIEW } from './layout.js';
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

/**
 * @param {SVGSVGElement} svg
 * @param {number} k number of options
 * @returns {{layout:object, ball:SVGCircleElement, binNodes:SVGGElement[]}}
 */
export function renderBoard(svg, k) {
  const layout = buildLayout(k);

  svg.setAttribute('viewBox', `0 0 ${VIEW.w} ${VIEW.h}`);
  svg.style.setProperty('--groove-w', layout.groove.toFixed(2));
  svg.style.setProperty('--floor-w', layout.floor.toFixed(2));
  svg.replaceChildren();

  svg.append(el('rect', { class: 'board-panel', x: 8, y: 8, width: VIEW.w - 16, height: VIEW.h - 16, rx: 26 }));

  const wordmark = el('text', { class: 'board-wordmark', x: VIEW.w - 46, y: 74, 'text-anchor': 'end' });
  wordmark.textContent = 'DECISION';
  svg.append(wordmark);

  // The groove is drawn twice: a wide dark stroke for the cut, a narrower
  // light stroke inside it for the highlight along the channel floor.
  svg.append(el('path', { class: 'channel channel-cut', d: layout.channelPath }));
  svg.append(el('path', { class: 'channel channel-floor', d: layout.channelPath }));

  const pegs = el('g', { class: 'pegs' });
  for (const peg of layout.pegs) {
    pegs.append(el('circle', { class: 'peg', cx: peg.x, cy: peg.y, r: layout.floor * 0.26 }));
  }
  svg.append(pegs);

  const binNodes = [];
  const binsGroup = el('g', { class: 'bins' });
  for (const bin of layout.bins) {
    const group = el('g', { class: `bin bin-${bin.kind}` });
    group.style.setProperty('--bin-color', binColor(bin));

    group.append(el('rect', {
      class: 'bin-well',
      x: bin.x + 3,
      y: bin.y,
      width: bin.width - 6,
      height: bin.height,
      rx: 12,
    }));
    group.append(el('rect', {
      class: 'bin-accent',
      x: bin.x + 3,
      y: bin.y + bin.height - 12,
      width: bin.width - 6,
      height: 9,
      rx: 4,
    }));

    const label = el('text', {
      class: 'bin-label',
      x: bin.x + bin.width / 2,
      y: bin.y + bin.height / 2 + 2,
      'text-anchor': 'middle',
    });
    label.textContent = binLetter(bin);
    group.append(label);

    binNodes.push(group);
    binsGroup.append(group);
  }
  svg.append(binsGroup);

  const ball = el('circle', {
    class: 'ball',
    cx: layout.entry.x,
    cy: layout.entry.y,
    r: layout.ballR.toFixed(2),
  });
  const ballLayer = el('g', { class: 'ball-layer' });
  ballLayer.append(ball);
  svg.append(ballLayer);

  return { layout, ball, binNodes };
}

export function placeBall(ball, x, y) {
  ball.setAttribute('cx', String(x));
  ball.setAttribute('cy', String(y));
}
