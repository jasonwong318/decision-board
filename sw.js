/**
 * Offline support. Everything is static, so we precache the whole app and serve
 * cache-first; the version string is what invalidates an old install.
 */

const VERSION = 'decision-board-v4';

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
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(ASSETS)),
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

  // Navigations fall back to the cached shell so a shared ?o=... link opens offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put('index.html', copy));
          return response;
        })
        .catch(() => caches.match('index.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(VERSION).then((cache) => cache.put(request, copy));
      }
      return response;
    })),
  );
});
