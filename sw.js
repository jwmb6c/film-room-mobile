// Offline support: keep the app files on the phone and serve them from there.
// An update arrives all at once: deploy.ps1 stamps a new CACHE name into the published copy of this file
// whenever any app file changes, so the browser installs a fresh copy of every file together and only then
// does the new set replace the old. If the phone loses signal mid-install, the old set stays in use.
const CACHE = 'film-room-65ff955cc9';
const FILES = [
  './', 'index.html', 'app.js', 'dom.js', 'style.css', 'game.js', 'lib.js', 'store.js', 'files.js', 'sheet.js',
  'screens/games.js', 'screens/newgame.js', 'screens/roster.js', 'screens/score.js', 'screens/boxscore.js',
  'video-test.html', 'spike.js', 'manifest.webmanifest', 'apple-touch-icon.png',
];

self.addEventListener('install', event => {
  // cache: 'reload' skips the browser's own HTTP cache, which could otherwise hand back a stale copy.
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(FILES.map(file => new Request(file, { cache: 'reload' }))))
      .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

// A local test server serves the files fresh every time, unless the worker was registered as sw.js?cache.
const DEV = location.hostname === 'localhost' && !location.search.includes('cache');

self.addEventListener('fetch', event => {
  if (DEV || event.request.method !== 'GET') return;
  event.respondWith(
    caches.open(CACHE)
      .then(cache => cache.match(event.request, { ignoreSearch: true }))
      .then(cached => cached || fetch(event.request)));
});
