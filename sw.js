/**
 * Offline support.
 *
 * Network-first for *everything* same-origin, not just navigations.
 *
 * The obvious split — fresh shell, cached assets — is a trap for an app with no
 * build step and therefore no hashed filenames. `index.html` would come back
 * new while `js/layout.js` and `css/base.css` came back from the old cache, so
 * every deploy produced a window where the page was a new shell wired to old
 * modules: markup for controls whose event handlers did not exist yet, elements
 * whose styles had not shipped. That is worse than being a version behind,
 * because it fails in ways that look like bugs in the new code.
 *
 * Serving everything the same way removes the skew: whatever the page gets, it
 * gets consistently. Offline still works — the cache is the fallback, and the
 * precache covers the whole app.
 */

const VERSION = 'decision-board-v6';

const ASSETS = [
  '.',
  'index.html',
  'app.webmanifest',
  'css/tokens.css',
  'css/base.css',
  'css/theme-ritual.css',
  'css/theme-ivory.css',
  'css/board-classic.css',
  'js/main.js',
  'js/tree.js',
  'js/classic.js',
  'js/rng.js',
  'js/layout.js',
  'js/render.js',
  'js/animate.js',
  'js/state.js',
  'js/i18n.js',
  'js/history.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  // addAll is all-or-nothing: a half-written cache would be worse than none.
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(ASSETS))
      // Take over straight away rather than idling until every tab has closed,
      // which is what used to leave people two visits behind a deploy.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          // A navigation can carry a query string (a shared board); the shell is
          // what belongs in the cache, not every link someone has opened.
          const key = request.mode === 'navigate' ? 'index.html' : request;
          caches.open(VERSION).then((cache) => cache.put(key, copy));
        }
        return response;
      })
      .catch(() => caches.match(request.mode === 'navigate' ? 'index.html' : request)),
  );
});
