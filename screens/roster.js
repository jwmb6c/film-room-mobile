// The saved roster: each new game starts with these jersey numbers.
import { h, toast, topbar } from '../dom.js';
import { getRoster, setRoster } from '../store.js';
import { parseNumbers, GameError } from '../game.js';

export async function render(root) {
  const error = h('p', { class: 'error', role: 'alert' });
  // No inputMode here: the iPhone number pad has no space or comma, so a list of numbers couldn't be typed.
  const field = h('textarea', { rows: 4, placeholder: 'Jersey numbers, e.g. 1 4 12 23' }, (await getRoster()).join(' '));

  async function save(event) {
    event.preventDefault();
    error.textContent = '';
    try {
      const numbers = parseNumbers(field.value);
      await setRoster(numbers);
      field.value = numbers.join(' ');
      toast('Roster saved');
    } catch (err) {
      error.textContent = err instanceof GameError ? err.message : 'Could not save the roster on this phone.';
    }
  }

  root.replaceChildren(
    topbar('Roster', { back: '#/' }),
    h('form', { class: 'stack', onsubmit: save },
      h('p', { class: 'muted' }, 'Each new game starts with these jersey numbers. You can change them for a game later.'),
      h('label', { class: 'field' }, 'Our jersey numbers', field),
      error,
      h('button', { class: 'btn primary', type: 'submit' }, 'Save roster')));
}
