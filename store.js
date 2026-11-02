// Games and the saved roster, kept in the browser's IndexedDB (nothing leaves the phone).
// A game record is {key, game, modified, changes, savedAt}: changes counts saves since the game was last
// written to the Files app, so the screen can say how much isn't in Files yet.
const DB_NAME = 'film-room';

// The open connection. iOS can drop it when an installed app returns from the background, so it is forgotten
// when it closes and opened again on the next use.
let opened;
function db() {
  opened ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('games', { keyPath: 'key' });
      request.result.createObjectStore('kv');
    };
    request.onsuccess = () => {
      const connection = request.result;
      connection.onclose = () => { opened = null; };
      connection.onversionchange = () => { connection.close(); opened = null; };
      resolve(connection);
    };
    request.onerror = () => { opened = null; reject(request.error); };
  });
  return opened;
}

const wrap = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

// Run fn on the store and resolve once the transaction has committed, so "saved" means saved. If the
// connection turns out to be dead, reconnect and try once more.
async function run(storeName, mode, fn, retry = true) {
  try {
    const transaction = (await db()).transaction(storeName, mode);
    const committed = new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
    committed.catch(() => {});  // reported below; don't also raise it as unhandled if fn fails first
    const value = await fn(transaction.objectStore(storeName));
    await committed;
    return value;
  } catch (err) {
    if (retry && (err?.name === 'InvalidStateError' || err?.name === 'UnknownError')) {
      opened = null;
      return run(storeName, mode, fn, false);
    }
    throw err;
  }
}

export async function listGames() {
  const records = await run('games', 'readonly', store => wrap(store.getAll()));
  return records.sort((a, b) => b.modified - a.modified);
}

export const getGame = key => run('games', 'readonly', store => wrap(store.get(key)));

// Save a game after a change. {saved: true} is for a game that just came from a file, so nothing is unsaved;
// {fresh: true} is for a brand-new empty game, which has nothing worth saving yet; {quiet: true} is for
// bookkeeping (like the video's file name) that shouldn't count as a change to back up.
export function putGame(key, game, { saved = false, fresh = false, quiet = false } = {}) {
  return run('games', 'readwrite', async store => {
    const before = await wrap(store.get(key));
    const changes = saved || fresh ? 0 : quiet ? (before?.changes ?? 0) : (before?.changes ?? 0) + 1;
    await wrap(store.put({ key, game, modified: Date.now(), changes, savedAt: saved ? Date.now() : before?.savedAt ?? null }));
  });
}

// The game was just written to Files.
export function markSaved(key) {
  return run('games', 'readwrite', async store => {
    const record = await wrap(store.get(key));
    if (record) await wrap(store.put({ ...record, changes: 0, savedAt: Date.now() }));
  });
}

export const deleteGame = key => run('games', 'readwrite', store => wrap(store.delete(key)));

// stem, then stem_2, stem_3... whichever isn't taken.
export async function uniqueKey(stem) {
  const taken = new Set((await listGames()).map(r => r.key));
  let key = stem, n = 2;
  while (taken.has(key)) key = `${stem}_${n++}`;
  return key;
}

export async function getRoster() {
  return (await run('kv', 'readonly', store => wrap(store.get('roster')))) ?? [];
}

export const setRoster = numbers => run('kv', 'readwrite', store => wrap(store.put(numbers, 'roster')));

// Ask the browser not to clear this data when the phone is short on space.
export async function requestPersistence() {
  try {
    return await navigator.storage?.persist?.() ?? false;
  } catch {
    return false;
  }
}
