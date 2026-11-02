// Offline support: keep the app files on the phone and serve them from there, refreshing them quietly in
// the background when there is a connection. Bump CACHE whenever the file list changes.
const CACHE = 'film-room-test-v3';
const FILES = ['./', 'index.html', 'spike.js', 'lib.js', 'manifest.webmanifest', 'apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(event.request, { ignoreSearch: true });
    const refresh = fetch(event.request).then(res => {
      if (res.ok) cache.put(event.request, res.clone());
      return res;
    });
    if (cached) { refresh.catch(() => {}); return cached; }
    return refresh;
  }));
});
