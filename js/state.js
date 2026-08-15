/**
 * Persisted app state: the option list, the question, theme and language.
 *
 * Options can also arrive in the URL (?q=…&o=…&o=…) so a board can be shared
 * with a friend; the URL wins over whatever is in localStorage.
 */

import { MIN_OPTIONS, MAX_OPTIONS } from './tree.js';

const KEY = 'decision-board:v1';
export const MAX_LABEL_LEN = 60;

/**
 * Option identities are CSS custom properties rather than literal hex, because
 * the two themes need different values for the same hue: a colour luminous
 * enough on obsidian is unreadable on paper. The index is the identity; the
 * theme decides what it looks like.
 */
export const OPTION_COLORS = [
  'var(--opt-0)', 'var(--opt-1)', 'var(--opt-2)', 'var(--opt-3)', 'var(--opt-4)',
];
export const RETRY_COLOR = 'var(--opt-retry)';

export const THEMES = ['ritual', 'ivory'];

/** 'classic' is the physical toy, bias and all; 'evolved' is the fair board. */
export const MODES = ['evolved', 'classic'];

/** Themes were once named after the physical board they imitated. */
const LEGACY_THEMES = { board: 'ritual', modern: 'ivory' };

const DEFAULTS = {
  question: '',
  options: ['', ''],
  mode: 'evolved',
  theme: 'ritual',
  lang: null,
};

function readStore() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

let state = readStore();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private browsing / storage full — the app still works for this session */
  }
}

export function sanitizeLabel(text) {
  return String(text ?? '').trim().slice(0, MAX_LABEL_LEN);
}

/** Clamp an arbitrary list into a legal option list. */
export function normalizeOptions(list) {
  const cleaned = (list || []).map(sanitizeLabel).filter((s) => s.length > 0);
  const out = cleaned.slice(0, MAX_OPTIONS);
  while (out.length < MIN_OPTIONS) out.push('');
  return out;
}

/**
 * Read a shared board out of the current URL, if there is one.
 *
 * A classic link needs no options — the toy's three slots are fixed — so it is
 * complete with nothing but `?m=classic`.
 */
export function readUrlBoard(search = window.location.search) {
  const params = new URLSearchParams(search);
  const question = sanitizeLabel(params.get('q') || '');
  const mode = params.get('m');

  if (mode === 'classic') return { mode: 'classic', question, options: [] };

  const options = params.getAll('o').map(sanitizeLabel).filter(Boolean);
  if (options.length < MIN_OPTIONS) return null;
  return { mode: 'evolved', question, options: options.slice(0, MAX_OPTIONS) };
}

export function shareUrl({ mode, question, options }) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  const params = new URLSearchParams();
  if (mode === 'classic') params.set('m', 'classic');
  if (question) params.set('q', question);
  if (mode !== 'classic') for (const option of options) params.append('o', option);
  url.search = params.toString();
  return url.toString();
}

export const store = {
  get question() {
    return state.question;
  },
  get options() {
    return state.options.slice();
  },
  get mode() {
    return MODES.includes(state.mode) ? state.mode : 'evolved';
  },
  get theme() {
    return LEGACY_THEMES[state.theme] || (THEMES.includes(state.theme) ? state.theme : 'ritual');
  },
  get lang() {
    return state.lang;
  },

  setBoard({ question, options }) {
    state.question = sanitizeLabel(question);
    if (options) state.options = normalizeOptions(options);
    persist();
  },
  setMode(mode) {
    state.mode = MODES.includes(mode) ? mode : 'evolved';
    persist();
  },
  setTheme(theme) {
    state.theme = THEMES.includes(theme) ? theme : 'ritual';
    persist();
  },
  setLang(lang) {
    state.lang = lang;
    persist();
  },
};

/** Options with a label good enough to play with, i.e. non-empty. */
export function playableOptions(options = store.options) {
  return options.map(sanitizeLabel).filter(Boolean);
}
