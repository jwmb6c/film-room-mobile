// The event sheet: slides up over the bottom of the scoring screen when the video is tapped.
// Pick a jersey (or OPP), then a stat. Hold a jersey to sub that player in or out.
import { h, fill, toast } from './dom.js';
import { STATS, OPP, onFloor } from './game.js';

const LONG_PRESS_MS = 450;  // a little under iOS's own long-press recognizer (about 500 ms)

function readStayOpen() {
  try { return localStorage.getItem('stayOpen') === '1'; } catch { return false; }
}

function writeStayOpen(value) {
  try { localStorage.setItem('stayOpen', value ? '1' : '0'); } catch { /* private mode: just don't remember it */ }
}

// getGame(): the current game; getTime(): the video's current time.
// onRecord(player, stat) and onSub(player) return true when something was recorded; onEnd() and onUndo() act
// on the game; onResume() closes the sheet and plays the video; endLabel() is the text for the quarter button;
// lastText() describes the most recent event (the log is hidden behind the sheet), or is empty.
export function createSheet({ getGame, getTime, onRecord, onSub, onEnd, onUndo, onResume, endLabel, lastText }) {
  const element = h('section', { class: 'sheet', hidden: true, 'aria-label': 'Score an event' });
  let selected = null;
  let stayOpen = readStayOpen();

  // After a hold has subbed someone, the click iOS sends when the finger lifts must not also select them.
  // That click arrives later than the pointer events, so ignore every click for a short while instead of
  // trusting a flag. And don't rebuild the buttons: only the green marks change, in place.
  let ignoreClicksUntil = 0;

  function markFloor() {
    const on = onFloor(getGame(), getTime() + 0.001);  // saved times are rounded to the millisecond
    for (const button of element.querySelectorAll('.jersey')) button.classList.toggle('on', on.has(button.dataset.id));
    const last = element.querySelector('.last');
    if (last && lastText()) last.textContent = `Last: ${lastText()}`;
  }

  function jersey(player, on) {
    let timer = null;
    const stop = () => clearTimeout(timer);
    return h('button', {
      class: ['jersey', player.id === OPP && 'opp', player.id === selected && 'selected', on.has(player.id) && 'on']
        .filter(Boolean).join(' '),
      dataset: { id: player.id },
      onpointerdown: () => {
        if (player.id === OPP) return;
        timer = setTimeout(() => {
          ignoreClicksUntil = performance.now() + 800;
          navigator.vibrate?.(30);
          onSub(player.id);
          markFloor();
        }, LONG_PRESS_MS);
      },
      onpointerup: stop, onpointerleave: stop, onpointercancel: stop,
      oncontextmenu: e => e.preventDefault(),
      onclick: () => {
        if (performance.now() < ignoreClicksUntil) return;
        selected = player.id;
        refresh();
      },
    }, player.number);
  }

  function stat(key) {
    if (!selected) return toast('Pick a player first.', true);
    const recorded = onRecord(selected, key);
    if (recorded && !stayOpen) onResume(); else refresh();
  }

  function refresh() {
    const game = getGame();
    const on = onFloor(game, getTime() + 0.001);  // saved times are rounded to the millisecond
    if (selected && selected !== OPP && !game.roster.some(p => p.id === selected)) selected = null;
    const who = selected === OPP ? 'OPP' : selected ? '#' + game.roster.find(p => p.id === selected).number : null;
    fill(element,
      h('div', { class: 'sheet-head' },
        h('div', null,
          h('strong', null, who ? `${who} selected` : 'Pick a player'),
          lastText() ? h('div', { class: 'last' }, `Last: ${lastText()}`) : null),
        h('button', { class: 'btn primary', onclick: () => onResume() }, 'Resume')),
      h('div', { class: 'sheet-tools' },
        h('button', { class: 'btn small', onclick: () => { onUndo(); refresh(); } }, 'Undo last'),
        h('button', { class: 'btn small', onclick: () => { onEnd(); refresh(); } }, endLabel()),
        h('label', { class: 'switch' },
          h('input', { type: 'checkbox', checked: stayOpen, onchange: e => { stayOpen = e.target.checked; writeStayOpen(stayOpen); } }),
          'Stay open')),
      h('div', { class: 'jerseys' }, [...game.roster, { id: OPP, number: 'OPP' }].map(p => jersey(p, on))),
      game.events.length < 10 ? h('p', { class: 'hint' }, 'Tap a number, then a stat. Hold a number to sub it in or out.') : null,
      h('div', { class: 'stats' }, STATS.map(([key, label]) => h('button', { class: 'stat', onclick: () => stat(key) }, label))));
  }

  return {
    element,
    open() { refresh(); element.hidden = false; },
    close() { element.hidden = true; },
    isOpen: () => !element.hidden,
    refresh,
  };
}
