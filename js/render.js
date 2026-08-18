/**
 * Draws a board into an <svg>.
 *
 * Two boards live here. The evolved board is a non-merging tree with a bin per
 * option; the classic board is the physical toy — square, red, three slots,
 * merging channels. They share every material in this file and differ only in
 * geometry (layout.js) and in how the bottom edge is dressed.
 *
 * Every colour is a CSS custom property, including the gradient stops, so a
 * theme swap recuts the instrument without this file knowing about either.
 */

import { buildLayout, buildClassicLayout } from './layout.js';
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

/** Classic bins carry their own glyph and colour; evolved bins derive theirs. */
export function binLetter(bin) {
  if (bin.glyph) return bin.glyph;
  return bin.kind === RETRY_BIN ? '↻' : String.fromCharCode(65 + bin.optionIndex);
}

export function binColor(bin) {
  if (bin.color) return bin.color;
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

  // Light lands top-left on every turned part, so pegs, rivets and ball agree.
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

/**
 * Offsetting a second copy of the type by a pixel is what makes it read as cut
 * into the panel rather than printed on it.
 */
function engraved(attrs, text, dy = 1.5) {
  const group = el('g');
  for (const [cls, offset] of [['board-wordmark-shadow', dy], ['', 0]]) {
    const node = el('text', {
      ...attrs,
      class: `board-wordmark ${cls}`.trim(),
      y: attrs.y + offset,
    });
    node.textContent = text;
    group.append(node);
  }
  return group;
}

/** The evolved faceplate: a letterspaced mark centred between two hairlines. */
function faceplate(view) {
  const group = el('g', { class: 'faceplate' });
  const mid = view.w / 2;
  const y = 78;

  // Letter-spacing also trails the last glyph, so centring the advance box
  // leaves the word visually half a space to the left. Put it back.
  group.append(engraved({ x: mid, 'text-anchor': 'middle', dx: 4.4, y }, 'DECISION'));
  group.append(el('line', { class: 'board-rule', x1: 96, y1: y - 7, x2: mid - 130, y2: y - 7 }));
  group.append(el('line', { class: 'board-rule', x1: mid + 130, y1: y - 7, x2: view.w - 96, y2: y - 7 }));

  return group;
}

/** The classic faceplate: the wordmark sits top-right, as it does on the toy. */
function classicFaceplate(view, panel) {
  const group = el('g', { class: 'faceplate' });
  group.append(engraved(
    { x: panel.x + panel.w - 46, 'text-anchor': 'end', y: 92, class: 'board-wordmark' },
    'DECISION',
    2,
  ));
  return group;
}

function channels(layout) {
  const group = el('g', { class: 'channels' });
  for (const cls of ['channel-cut', 'channel-floor', 'channel-sheen']) {
    group.append(el('path', { class: `channel ${cls}`, d: layout.channelPath }));
  }
  return group;
}

/**
 * The crossing band, drawn strand by strand.
 *
 * These channels cross; they never merge, and the drawing has to say so or the
 * board's whole claim looks false. Each strand that passes over another carries
 * a casing in the panel's own colour, which reads as a bridge: the groove
 * underneath visibly runs on beneath it.
 *
 * Strands moving left are laid down first and those moving right on top, so
 * every crossing resolves the same way and the band reads as woven rather than
 * as a tangle. A strand that does not move sideways needs no bridge at all.
 */
function weave(strands) {
  const group = el('g', { class: 'weave' });
  const ordered = [...strands].sort((a, b) => a.dx - b.dx);

  for (const strand of ordered) {
    const layer = el('g', { class: 'weave-strand' });
    if (strand.dx !== 0) {
      layer.append(el('path', { class: 'channel weave-casing', d: strand.d }));
    }
    layer.append(el('path', { class: 'channel channel-cut', d: strand.d }));
    layer.append(el('path', { class: 'channel channel-floor', d: strand.d }));
    layer.append(el('path', { class: 'channel channel-sheen', d: strand.d }));
    group.append(layer);
  }
  return group;
}

function rivet(x, y, r) {
  const group = el('g', { class: 'rivet', transform: `translate(${x} ${y})` });
  group.append(el('circle', { class: 'peg-body', r }));
  group.append(el('circle', { class: 'peg-ring', r: r + 1 }));
  return group;
}

/** Evolved bottom edge: a nameplate carrying the option's letter. */
function evolvedBin(bin, plate) {
  const group = el('g', { class: `bin bin-${bin.kind}` });
  group.style.setProperty('--bin-color', binColor(bin));

  const x = bin.x + 4;
  const width = bin.width - 8;
  // The retry bin can be a single exit wide, so the plate's inset has to be a
  // share of the bin rather than a fixed margin or it collapses to nothing.
  const inset = Math.min(8, width * 0.14);
  const plateY = bin.y + bin.height - plate.h - plate.gap;

  group.append(el('rect', {
    class: 'bin-bloom', x, y: bin.y, width, height: bin.height, rx: 14, filter: 'url(#db-bloom)',
  }));
  group.append(el('rect', { class: 'bin-well', x, y: bin.y, width, height: bin.height, rx: 14 }));
  group.append(el('rect', {
    class: 'bin-plate',
    x: x + inset, y: plateY, width: width - inset * 2, height: plate.h, rx: 8,
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

  return group;
}

/**
 * Classic bottom edge: a stop, and the mark printed on the bare panel below it.
 *
 * No wells and no nameplates — the object has neither. The channels simply end
 * at a screw, and ✕ ↻ ✓ are painted on the red underneath.
 */
function classicStop(bin) {
  const group = el('g', { class: `bin bin-${bin.kind} bin-classic` });
  group.style.setProperty('--bin-color', binColor(bin));

  group.append(el('circle', {
    class: 'bin-bloom', cx: bin.x, cy: bin.y, r: bin.r * 2.8, filter: 'url(#db-bloom)',
  }));
  group.append(rivet(bin.x, bin.y, bin.r));

  const label = el('text', {
    class: 'bin-label bin-glyph',
    x: bin.x,
    y: bin.markY,
    'text-anchor': 'middle',
    'dominant-baseline': 'middle',
  });
  label.textContent = binLetter(bin);
  group.append(label);

  return group;
}

/**
 * @param {SVGSVGElement} svg
 * @param {{mode:'evolved'|'classic', k?:number}} spec
 * @returns {{layout:object, ball:SVGGElement, binNodes:SVGGElement[],
 *            pegNodes:SVGGElement[], bins:SVGGElement}}
 */
export function renderBoard(svg, spec) {
  const classic = spec.mode === 'classic';
  const layout = classic ? buildClassicLayout() : buildLayout(spec.k);
  const { view, panel, plate } = layout;

  svg.setAttribute('viewBox', `0 0 ${view.w} ${view.h}`);
  svg.style.setProperty('--groove-w', layout.groove.toFixed(2));
  svg.style.setProperty('--floor-w', layout.floor.toFixed(2));
  svg.replaceChildren();

  svg.append(defs());

  svg.append(el('rect', {
    class: 'board-panel', x: panel.x, y: panel.y, width: panel.w, height: panel.h, rx: panel.r,
  }));
  svg.append(el('rect', {
    class: 'board-inlay',
    x: panel.x + 14, y: panel.y + 14,
    width: panel.w - 28, height: panel.h - 28,
    rx: panel.r - 8,
  }));

  svg.append(classic ? classicFaceplate(view, panel) : faceplate(view));
  svg.append(channels(layout));
  if (layout.weave) svg.append(weave(layout.weave));

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
    const group = classic ? classicStop(bin) : evolvedBin(bin, plate);
    binNodes.push(group);
    bins.append(group);
  }
  svg.append(bins);

  // The classic panel has a knob where the ball is loaded; the evolved board
  // releases from an open channel, so it gets the pulse instead.
  if (classic) svg.append(rivet(layout.entry.x, layout.entry.y - layout.ballR - 16, 11));

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
