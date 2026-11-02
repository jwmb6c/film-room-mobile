// Film Room on the phone: starts the app, routes between screens, keeps the app files available offline.
import * as games from './screens/games.js';
import * as newGame from './screens/newgame.js';
import * as roster from './screens/roster.js';
import * as score from './screens/score.js';
import { requestPersistence } from './store.js';
import { h } from './dom.js';

const routes = [
  [/^#\/$/, games],
  [/^#\/new$/, newGame],
  [/^#\/roster$/, roster],
  [/^#\/game\/(.+)$/, score],
];

const root = document.getElementById('app');
let current = null;      // the screen module being shown
let currentHash = null;

async function show() {
  const hash = location.hash || '#/';
  if (hash === currentHash) return;  // a refused leave puts the old hash back
  if (current?.leave && current.leave() === false) {  // a screen can refuse to be left (unsaved work, say)
    location.replace(currentHash);
    return;
  }
  const match = routes.map(([pattern, screen]) => [hash.match(pattern), screen]).find(([m]) => m);
  if (!match) return location.replace('#/');
  const [found, screen] = match;
  current = screen;
  currentHash = hash;
  // Each screen draws into its own container, so a slow one that finishes after the user has moved on
  // draws into a container nobody sees instead of over the current screen.
  const container = h('div');
  root.replaceChildren(container);
  window.scrollTo(0, 0);
  try {
    await screen.render(container, { key: found[1] && decodeURIComponent(found[1]) });
  } catch (err) {
    console.error(err);
    if (container.isConnected) {
      container.replaceChildren(h('div', { class: 'stack' },
        h('p', { class: 'error' }, `Film Room couldn't open this screen (${err?.message || 'storage error'}).`),
        h('p', { class: 'muted' }, 'Close the app and open it again. A copy you saved with Save to Files is not affected.'),
        h('a', { class: 'btn', href: '#/' }, 'Back to games')));
    }
  }
}

addEventListener('hashchange', show);
show();

requestPersistence();

// Keep the app files on the phone so it opens with no signal. Not on a local test server, where stale
// files would get in the way, unless the page was opened with ?cache.
if ('serviceWorker' in navigator && (location.hostname !== 'localhost' || location.search.includes('cache'))) {
  navigator.serviceWorker.register('sw.js' + (location.search.includes('cache') ? '?cache' : ''));
}
