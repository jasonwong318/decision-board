/** Recent results, newest first, capped so localStorage never grows unbounded. */

const KEY = 'decision-board:history:v1';
const LIMIT = 30;

export function loadHistory() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * @param {{question:string, label:string|null, isRetry:boolean}} entry
 */
export function pushHistory(entry) {
  const list = loadHistory();
  list.unshift({ ...entry, at: Date.now() });
  const trimmed = list.slice(0, LIMIT);
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
  return trimmed;
}

export function clearHistory() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return [];
}
