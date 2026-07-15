const CACHE_NAME = 'moach-hashiveki-v2';
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
// Important: fetch(event.request) alone still honors the browser/CDN HTTP
// cache, which can quietly serve a stale response even though this is
// "network-first" from the service worker's point of view. Re-issuing the
// fetch with { cache: 'no-store' } bypasses that layer for real.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request.url, { cache: 'no-store' })
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'המוח השיווקי', body: '' };
  try {
    data = { ...data, ...event.data.json() };
  } catch (err) {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './assets/favicon.png',
      badge: './assets/favicon.png',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});
