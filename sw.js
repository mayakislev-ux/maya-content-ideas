const CACHE_NAME = 'moach-hashiveki-v1';
const APP_SHELL = ['./', './index.html', './css/style.css', './js/app.js', './manifest.json', './assets/favicon.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => {}))))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

// Network-first: always prefer a fresh network response so app updates show up
// immediately; only fall back to the cache when the network request fails
// (offline). This app changes often - a cache-first strategy would make the
// "still seeing the old version" problem worse, not better.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
