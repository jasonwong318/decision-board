/**
 * Persisted app state: the option list, the question, theme and language.
 *
 * Options can also arrive in the URL (?q=…&o=…&o=…) so a board can be shared
 * with a friend; the URL wins over whatever is in localStorage.
 */

import { MIN_OPTIONS, MAX_OPTIONS } from './tree.js';

const KEY = 'decision-board:v1';
export const MAX_LABEL_LEN = 60;

export const OPTION_COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#ec4899'];
export const RETRY_COLOR = '#94a3b8';

const DEFAULTS = {
  question: '',
  options: ['', ''],
  theme: 'board',
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

/** Read a shared board out of the current URL, if there is one. */
export function readUrlOptions(search = window.location.search) {
  const params = new URLSearchParams(search);
  const options = params.getAll('o').map(sanitizeLabel).filter(Boolean);
  if (options.length < MIN_OPTIONS) return null;
  return {
    question: sanitizeLabel(params.get('q') || ''),
    options: options.slice(0, MAX_OPTIONS),
  };
}

export function shareUrl({ question, options }) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  const params = new URLSearchParams();
  if (question) params.set('q', question);
  for (const option of options) params.append('o', option);
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
  get theme() {
    return state.theme;
  },
  get lang() {
    return state.lang;
  },

  setBoard({ question, options }) {
    state.question = sanitizeLabel(question);
    state.options = normalizeOptions(options);
    persist();
  },
  setTheme(theme) {
    state.theme = theme === 'modern' ? 'modern' : 'board';
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
