// New game: opponent, date and the jersey numbers on the floor roster. The video is picked on the scoring screen.
import { h, topbar, today } from '../dom.js';
import { getRoster, putGame, uniqueKey } from '../store.js';
import { newGame, parseNumbers, fileStem, GameError } from '../game.js';

export async function render(root) {
  const saved = await getRoster();
  const error = h('p', { class: 'error', role: 'alert' });
  const opponent = h('input', { type: 'text', autocomplete: 'off', placeholder: 'Opponent', required: true });
  const date = h('input', { type: 'date', value: today() });
  // No inputMode here: the iPhone number pad has no space or comma, so a list of numbers couldn't be typed.
  const roster = h('textarea', { rows: 3, placeholder: 'Jersey numbers, e.g. 1 4 12 23' }, saved.join(' '));

  async function start(event) {
    event.preventDefault();
    error.textContent = '';
    try {
      if (!opponent.value.trim()) throw new GameError('Enter the opponent.');
      const numbers = parseNumbers(roster.value);
      if (!numbers.length) throw new GameError('Add at least one jersey number.');
      const game = newGame({ video: '', opponent: opponent.value, date: date.value || today(), numbers });
      const key = await uniqueKey(fileStem(game.date, game.opponent));
      await putGame(key, game, { fresh: true });
      location.hash = `#/game/${encodeURIComponent(key)}`;
    } catch (err) {
      error.textContent = err instanceof GameError ? err.message : 'Could not save the game on this phone.';
    }
  }

  root.replaceChildren(
    topbar('New game', { back: '#/' }),
    h('form', { class: 'stack', onsubmit: start },
      h('label', { class: 'field' }, 'Opponent', opponent),
      h('label', { class: 'field' }, 'Date', date),
      h('label', { class: 'field' }, 'Our jersey numbers', roster),
      error,
      h('button', { class: 'btn primary', type: 'submit' }, 'Start scoring')));
}
