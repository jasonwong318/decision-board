/** App wiring: screens, board lifecycle, sheets, service worker. */

import { MIN_OPTIONS, MAX_OPTIONS, drop, binsFor, probabilities, RETRY_BIN } from './tree.js';
import { ballRoute } from './layout.js';
import { renderBoard, placeBall, binLetter, binColor } from './render.js';
import { animateBall, prefersReducedMotion } from './animate.js';
import { t, setLang, getLang, detectLang, applyTranslations, LANGS } from './i18n.js';
import { store, playableOptions, readUrlOptions, shareUrl, sanitizeLabel, normalizeOptions } from './state.js';
import { loadHistory, pushHistory, clearHistory } from './history.js';

const $ = (id) => document.getElementById(id);

const app = $('app');
const optionList = $('option-list');
const rowTemplate = $('option-row-template');

/**
 * Beats either side of the drop itself. The pause before the ball is released
 * and the silence after it lands are what turn a random draw into a verdict —
 * both are skipped entirely when the user has asked for reduced motion.
 */
const CHARGE_MS = 620;
const HOLD_MS = 780;

const THEME_COLORS = { ritual: '#0b0a09', ivory: '#f3f0e8' };
const THEME_NAMES = { ritual: 'nav.themeRitual', ivory: 'nav.themeIvory' };

let board = null;      // { layout, ball, binNodes, pegNodes, bins }
let currentOptions = [];
let dropping = false;
let skipController = null;

/* ------------------------------------------------------------ helpers */

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A haptic tick per fork, where the platform has one. Never load-bearing. */
function tick() {
  if (prefersReducedMotion()) return;
  try {
    navigator.vibrate?.(6);
  } catch {
    /* unsupported, blocked, or the user has it off — all fine */
  }
}

let toastTimer = 0;
function toast(message) {
  const node = $('toast');
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, 2200);
}

function openSheet(overlay) {
  overlay.hidden = false;
  overlay.querySelector('button')?.focus();
}

function closeSheet(overlay) {
  overlay.hidden = true;
  // Dismissing the verdict is what brings the room back up.
  if (overlay.id === 'result-overlay') endCeremony();
}

function endCeremony() {
  document.body.classList.remove('is-ceremony');
  app.classList.remove('is-ceremony', 'is-charging', 'is-rolling');
}

function showScreen(name) {
  app.dataset.screen = name;
  window.scrollTo({ top: 0 });
}

/* ------------------------------------------------------ setup screen */

function optionRows() {
  return [...optionList.querySelectorAll('.option-input')];
}

function refreshRowState() {
  const rows = [...optionList.querySelectorAll('.option-row')];
  rows.forEach((row, i) => {
    row.querySelector('.option-key').textContent = String.fromCharCode(65 + i);
    row.style.setProperty('--row-color', binColor({ kind: 'option', optionIndex: i }));
    row.querySelector('.remove-btn').disabled = rows.length <= MIN_OPTIONS;
    const input = row.querySelector('.option-input');
    input.placeholder = t('setup.optionPlaceholder', { n: i + 1 });
  });
  $('btn-add').hidden = rows.length >= MAX_OPTIONS;
}

function addOptionRow(value = '') {
  if (optionRows().length >= MAX_OPTIONS) return;
  const row = rowTemplate.content.firstElementChild.cloneNode(true);
  row.querySelector('.option-input').value = value;
  row.querySelector('.remove-btn').addEventListener('click', () => {
    if (optionRows().length <= MIN_OPTIONS) return;
    row.remove();
    refreshRowState();
  });
  optionList.append(row);
  applyTranslations(row);
  refreshRowState();
}

function fillSetup({ question, options }) {
  $('question').value = question || '';
  optionList.replaceChildren();
  for (const option of normalizeOptions(options)) addOptionRow(option);
}

function readSetup() {
  return {
    question: sanitizeLabel($('question').value),
    options: optionRows().map((input) => sanitizeLabel(input.value)),
  };
}

function validate({ options }) {
  const filled = options.filter(Boolean);
  if (filled.length < MIN_OPTIONS) return t('setup.errorTooFew');
  if (new Set(filled).size !== filled.length) return t('setup.errorDuplicate');
  return null;
}

/* ----------------------------------------------------- board screen */

function renderLegend() {
  const legend = $('legend');
  legend.replaceChildren();
  for (const bin of binsFor(currentOptions.length)) {
    const item = document.createElement('li');
    item.className = `legend-item legend-${bin.kind}`;
    item.style.setProperty('--bin-color', binColor(bin));

    const key = document.createElement('span');
    key.className = 'legend-key';
    key.textContent = binLetter(bin);

    const label = document.createElement('span');
    label.className = 'legend-label';
    label.textContent = bin.kind === RETRY_BIN ? t('history.retryLabel') : currentOptions[bin.optionIndex];

    item.append(key, label);
    legend.append(item);
  }
}

function buildBoard() {
  board = renderBoard($('board'), currentOptions.length);
  $('board-question').textContent = store.question || t('app.tagline');
  renderLegend();
  $('skip-hint').hidden = prefersReducedMotion();
}

function clearWinner() {
  board.bins.classList.remove('has-winner');
  for (const node of board.binNodes) node.classList.remove('is-won');
  app.classList.remove('is-settled');
}

/** Flash the peg the ball has just committed to. -1 means "no fork here". */
function strikePeg(index) {
  const peg = index >= 0 ? board?.pegNodes[index] : null;
  if (!peg) return;
  peg.classList.add('is-struck');
  setTimeout(() => peg.classList.remove('is-struck'), 110);
  tick();
}

async function dropBall() {
  if (!board || dropping) return;
  dropping = true;
  clearWinner();

  const drawer = $('btn-drop');
  drawer.disabled = true;
  drawer.textContent = t('board.charging');

  // The room dims and the board is the only lit thing left.
  document.body.classList.add('is-ceremony');
  app.classList.add('is-ceremony', 'is-charging');

  // The draw happens here, before a single pixel moves — everything below is a
  // replay, which is why skipping it cannot change the outcome.
  const result = drop(currentOptions.length);
  const route = ballRoute(currentOptions.length, result.bits);

  placeBall(board.ball, board.layout.entry.x, board.layout.entry.y);
  if (!prefersReducedMotion()) await wait(CHARGE_MS);

  app.classList.remove('is-charging');
  app.classList.add('is-rolling');
  drawer.textContent = t('board.dropping');

  skipController = new AbortController();
  await animateBall(board.ball, route, {
    signal: skipController.signal,
    onStageEnd: (stage) => strikePeg(route.pegs[stage]),
  });
  skipController = null;

  app.classList.remove('is-rolling');
  app.classList.add('is-settled');

  board.bins.classList.add('has-winner');
  board.binNodes[result.binIndex].classList.add('is-won');
  tick();

  const label = result.isRetry ? null : currentOptions[result.optionIndex];
  $('live').textContent = result.isRetry
    ? t('a11y.retryAnnounce')
    : t('a11y.resultAnnounce', { label });

  pushHistory({ question: store.question, label, isRetry: result.isRetry });

  // Let the winning bin burn on its own for a beat before naming it.
  if (!prefersReducedMotion()) await wait(HOLD_MS);
  showResult(result, label);

  drawer.disabled = false;
  drawer.textContent = t('board.drop');
  dropping = false;
}

function showResult(result, label) {
  $('result-kicker').textContent = store.question || t('result.heading');
  $('result-label').textContent = result.isRetry ? t('result.retry') : label;
  $('result-body').textContent = result.isRetry ? t('result.retryBody') : '';
  $('result-body').hidden = !result.isRetry;
  $('btn-again').textContent = result.isRetry ? t('result.dropAgain') : t('result.again');

  const card = $('result-overlay').querySelector('.verdict');
  card.style.setProperty('--bin-color', binColor(result.bin));
  card.classList.toggle('is-retry', result.isRetry);

  openSheet($('result-overlay'));
}

/* ---------------------------------------------------------- sheets */

function renderOdds() {
  const k = currentOptions.length;
  const { perOption, retry, exits, depth } = probabilities(k);
  const table = $('odds-table');
  // Trim trailing zeros: 43.75% reads better than 43.750%.
  const pct = (value) => `${Number((value * 100).toFixed(3))}%`;

  const rows = [`<tr><th>${t('fair.tableOption')}</th><th>${t('fair.tableChance')}</th></tr>`];
  currentOptions.forEach((label, i) => {
    const swatch = binColor({ kind: 'option', optionIndex: i });
    rows.push(
      `<tr><td><span class="swatch" style="background:${swatch}"></span>${escapeHtml(label)}</td>` +
      `<td>${pct(perOption)}</td></tr>`,
    );
  });
  if (retry > 0) {
    rows.push(`<tr class="odds-retry"><td>↻ ${t('fair.retry')}</td><td>${pct(retry)}</td></tr>`);
  }

  table.innerHTML = rows.join('');
  $('fair-exits').textContent = t('fair.exits', { n: exits, d: depth });
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function renderHistory() {
  const list = $('history-list');
  const entries = loadHistory();
  list.replaceChildren();

  if (entries.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'history-empty';
    empty.textContent = t('history.empty');
    list.append(empty);
    return;
  }

  const formatter = new Intl.DateTimeFormat(getLang(), { dateStyle: 'short', timeStyle: 'short' });
  for (const entry of entries) {
    const item = document.createElement('li');
    item.className = 'history-item';

    const main = document.createElement('span');
    main.className = 'history-result';
    main.textContent = entry.isRetry ? `↻ ${t('history.retryLabel')}` : entry.label;

    const meta = document.createElement('span');
    meta.className = 'history-meta';
    meta.textContent = [entry.question, formatter.format(new Date(entry.at))].filter(Boolean).join(' · ');

    item.append(main, meta);
    list.append(item);
  }
}

/* ------------------------------------------------------ preferences */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').setAttribute('content', THEME_COLORS[theme]);

  // The control is a toggle, so it should say where it takes you, not where you are.
  const next = theme === 'ritual' ? 'ivory' : 'ritual';
  const button = $('btn-theme');
  button.textContent = theme === 'ritual' ? '◐' : '◑';
  const label = t('nav.themeSwitch', { name: t(THEME_NAMES[next]) });
  button.title = label;
  button.setAttribute('aria-label', label);
}

function applyLang(lang) {
  const active = setLang(lang);
  $('btn-lang').textContent = active === 'zh-Hant' ? 'EN' : '中';
  refreshRowState();
  if (board) {
    renderLegend();
    $('board-question').textContent = store.question || t('app.tagline');
    $('btn-drop').textContent = t('board.drop');
  }
  // setLang re-ran the translations, which would have flattened the theme
  // button's label back to the generic one.
  applyTheme(store.theme);
}

/* ------------------------------------------------------------- init */

function wireEvents() {
  $('btn-add').addEventListener('click', () => addOptionRow());

  $('setup-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const data = readSetup();
    const error = validate(data);
    $('setup-error').textContent = error || '';
    if (error) return;

    store.setBoard(data);
    currentOptions = playableOptions(data.options);
    buildBoard();
    showScreen('board');
  });

  $('btn-edit').addEventListener('click', () => {
    fillSetup({ question: store.question, options: store.options });
    showScreen('setup');
  });

  $('btn-drop').addEventListener('click', dropBall);

  // Tapping the board fast-forwards the replay; it cannot change the result.
  $('board').addEventListener('click', () => skipController?.abort());

  $('btn-share').addEventListener('click', async () => {
    const url = shareUrl({ question: store.question, options: currentOptions });
    try {
      if (navigator.share) await navigator.share({ title: t('app.name'), url });
      else {
        await navigator.clipboard.writeText(url);
        toast(t('board.shared'));
      }
    } catch (err) {
      if (err?.name !== 'AbortError') toast(t('board.shareFailed'));
    }
  });

  // Straight back into another drop, so the ceremony is never torn down and
  // rebuilt between two rounds.
  $('btn-again').addEventListener('click', () => {
    $('result-overlay').hidden = true;
    dropBall();
  });
  $('btn-result-close').addEventListener('click', () => closeSheet($('result-overlay')));

  $('btn-fair').addEventListener('click', () => {
    if (!currentOptions.length) currentOptions = playableOptions();
    if (currentOptions.length >= MIN_OPTIONS) renderOdds();
    openSheet($('fair-overlay'));
  });
  $('btn-fair-close').addEventListener('click', () => closeSheet($('fair-overlay')));

  $('btn-history').addEventListener('click', () => {
    renderHistory();
    openSheet($('history-overlay'));
  });
  $('btn-history-clear').addEventListener('click', () => {
    clearHistory();
    renderHistory();
  });
  $('btn-history-close').addEventListener('click', () => closeSheet($('history-overlay')));

  $('btn-theme').addEventListener('click', () => {
    const next = store.theme === 'ritual' ? 'ivory' : 'ritual';
    store.setTheme(next);
    applyTheme(next);
  });

  $('btn-lang').addEventListener('click', () => {
    const next = LANGS[(LANGS.indexOf(getLang()) + 1) % LANGS.length];
    store.setLang(next);
    applyLang(next);
  });

  for (const overlay of document.querySelectorAll('.overlay')) {
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeSheet(overlay);
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    for (const overlay of document.querySelectorAll('.overlay:not([hidden])')) closeSheet(overlay);
  });
}

function init() {
  applyTheme(store.theme);
  applyLang(store.lang || detectLang());

  const shared = readUrlOptions();
  if (shared) {
    store.setBoard(shared);
    // Drop the query once it has been absorbed, otherwise editing the options
    // and reloading would silently snap back to the shared set. The Share
    // button rebuilds the link on demand.
    history.replaceState({}, '', window.location.pathname);
  }

  fillSetup({ question: store.question, options: store.options });
  wireEvents();

  const ready = playableOptions();
  if (shared && ready.length >= MIN_OPTIONS) {
    currentOptions = ready;
    buildBoard();
    showScreen('board');
  }

  registerServiceWorker();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('sw.js');
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            const banner = $('update-banner');
            banner.hidden = false;
            banner.onclick = () => {
              worker.postMessage({ type: 'SKIP_WAITING' });
              window.location.reload();
            };
          }
        });
      });
    } catch {
      /* offline support is a bonus; the app works without it */
    }
  });
}

init();
