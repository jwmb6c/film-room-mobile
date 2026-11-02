// The home screen: saved games, new game, roster, import from Files.
import { h, toast, topbar } from '../dom.js';
import { listGames, putGame, markSaved, deleteGame, uniqueKey } from '../store.js';
import { gameToFile, saveToFiles, parseGameFile } from '../files.js';
import { fileStem, scoreAt, GameError } from '../game.js';

const TEAM = 'Rock Bridge';
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

async function importFiles(files, refresh) {
  for (const file of files) {
    try {
      const game = parseGameFile(await file.text());
      const key = await uniqueKey(fileStem(game.date, game.opponent));
      await putGame(key, game, { saved: true });
      toast(`Imported ${game.date} vs ${game.opponent}`);
    } catch (err) {
      toast(`${file.name}: ${err instanceof GameError ? err.message : 'could not be imported.'}`, true);
    }
  }
  refresh();
}

let sharing = false;  // a Save to Files is in progress; a second tap does nothing

async function saveGame(record, refresh) {
  if (sharing) return;
  sharing = true;
  try {
    const result = await saveToFiles(gameToFile(record.game));
    if (result === 'cancelled' || result === 'busy') return;
    await markSaved(record.key);
    refresh();
  } catch {
    toast('Could not save the file.', true);
  } finally {
    sharing = false;
  }
}

async function removeGame(record, refresh) {
  const warning = record.changes ? `\n\nIt has ${plural(record.changes, 'change')} that are not in Files.` : '';
  if (!confirm(`Delete the game vs ${record.game.opponent} (${record.game.date}) from this phone?${warning}`)) return;
  await deleteGame(record.key);
  refresh();
}

function gameCard(record, refresh) {
  const { game } = record;
  const { us, them } = scoreAt(game, Infinity);
  return h('li', { class: 'card' },
    h('a', { class: 'card-main', href: `#/game/${encodeURIComponent(record.key)}` },
      h('strong', null, `vs ${game.opponent}`),
      h('span', { class: 'muted' }, `${game.date} · ${plural(game.events.length, 'event')} · ${TEAM} ${us}–${them}`),
      record.changes ? h('span', { class: 'badge' }, `${plural(record.changes, 'change')} not in Files`) : null),
    h('div', { class: 'card-actions' },
      h('button', { class: 'btn', onclick: () => saveGame(record, refresh) }, 'Save to Files'),
      h('button', { class: 'btn danger', onclick: () => removeGame(record, refresh) }, 'Delete')));
}

export async function render(root) {
  const refresh = () => render(root);
  const records = await listGames();
  const picker = h('input', {
    type: 'file', accept: '.json,application/json', multiple: true, hidden: true,
    onchange: e => { importFiles([...e.target.files], refresh); e.target.value = ''; },
  });
  root.replaceChildren(
    topbar('Film Room', { actions: [h('a', { class: 'btn', href: '#/roster' }, 'Roster')] }),
    h('div', { class: 'stack' },
      h('div', { class: 'row' },
        h('a', { class: 'btn primary grow', href: '#/new' }, 'New game'),
        h('button', { class: 'btn grow', onclick: () => picker.click() }, 'Import game')),
      picker,
      records.length
        ? h('ul', { class: 'cards' }, records.map(r => gameCard(r, refresh)))
        : h('p', { class: 'muted empty' }, 'No games yet. Start a new game, or import one from Files.')));
}
