// Box score for the game so far, the players-in-this-game editor, and the box score CSV.
import { h, fill, toast } from '../dom.js';
import { BOX_COLUMNS, GameError, boxScore, lineupProblems, plusMinus, setRoster } from '../game.js';
import { csvToFile, saveToFiles } from '../files.js';

// A full-screen view over the scoring screen. onRosterChange() runs after the roster is changed so the
// scoring screen can save and redraw.
export function showBoxScore({ game, onRosterChange }) {
  const view = h('div', { class: 'fullscreen' });
  const close = () => view.remove();

  async function saveCsv() {
    try {
      const result = await saveToFiles(csvToFile(game));
      if (result === 'downloaded') toast('Downloaded. Look in the Files app, Downloads.');
    } catch {
      toast('Could not save the file.', true);
    }
  }

  function rosterEditor() {
    const rows = h('div', { class: 'roster-edit' });
    const addRow = player => {
      const row = h('div', { class: 'roster-row', dataset: { id: player.id ?? '' } },
        h('input', { inputMode: 'numeric', maxLength: 3, value: player.number, 'aria-label': 'Jersey number' }),
        h('button', { class: 'btn small danger', onclick: () => row.remove() }, 'Remove'));
      rows.append(row);
      return row;
    };
    game.roster.forEach(addRow);

    function save() {
      const players = [...rows.children]
        .map(row => ({ id: row.dataset.id || undefined, number: row.querySelector('input').value.trim() }))
        .filter(p => p.id || p.number);
      try {
        setRoster(game, players);
        onRosterChange();
        toast('Players saved');
        draw();
      } catch (err) {
        toast(err instanceof GameError ? err.message : 'Could not save the players.', true);
      }
    }

    return h('section', { class: 'stack' },
      h('h2', null, 'Players in this game'),
      h('p', { class: 'muted' }, 'Renumber, add, or remove. Only players with no stats or subs can be removed; stats follow a player when renumbered.'),
      rows,
      h('div', { class: 'row' },
        h('button', { class: 'btn grow', onclick: () => addRow({ number: '' }).querySelector('input').focus() }, '+ Player'),
        h('button', { class: 'btn primary grow', onclick: save }, 'Save players')));
  }

  function draw() {
    const { unassigned } = plusMinus(game);
    const problems = lineupProblems(game);
    const table = h('table', { class: 'box' },
      h('thead', null, h('tr', null, BOX_COLUMNS.map(c => h('th', null, c)))),
      h('tbody', null, boxScore(game).map(row =>
        h('tr', { class: row['#'] === 'TEAM' || row['#'] === 'OPP' ? 'total' : '' },
          BOX_COLUMNS.map(c => h('td', null, row[c]))))));
    fill(view,
      h('header', { class: 'topbar' },
        h('button', { class: 'back', onclick: close, 'aria-label': 'Close' }, '‹'),
        h('h1', null, 'Box score'),
        h('div', { class: 'actions' }, h('button', { class: 'btn small', onclick: saveCsv }, 'Save CSV'))),
      h('div', { class: 'table-wrap' }, table),
      unassigned ? h('p', { class: 'muted note' }, `${unassigned} points were scored with nobody subbed in, so they aren't in +/-.`) : null,
      problems.length ? h('ul', { class: 'problems note' }, problems.map(text => h('li', null, text))) : null,
      rosterEditor());
  }

  draw();
  document.body.append(view);
  return { close };
}
