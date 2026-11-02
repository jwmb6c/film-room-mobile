// The scoring screen: video on top, the event log right under it. Tap the video to pause it and open the
// event sheet; every change is saved on the phone straight away, and Save to Files backs the game up.
import { h, fill, toast, topbar, openModal } from '../dom.js';
import { getGame, putGame, markSaved } from '../store.js';
import { gameToFile, saveToFiles } from '../files.js';
import {
  STATS, FIXED_REBOUNDS, OPP, GameError, addEvent, endPeriod, sub, undo, timeline, periods, periodName,
  reboundKinds, scoreAt, runningScores, resumeTime, lineupProblems, isSub, isEnd,
  editEvent, moveEvent, deleteEvent,
} from '../game.js';
import { formatTime, isVideoFile, describeMediaError, leaveWarning } from '../lib.js';
import { createSheet } from '../sheet.js';
import { showBoxScore } from './boxscore.js';

const TEAM = 'Rock Bridge';
const STAT_LABEL = Object.fromEntries([...STATS, ...FIXED_REBOUNDS]);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
// A game from the PC app remembers the video's full Windows path; only the file name means anything here.
const baseName = path => path.split(/[\\/]/).pop();

let active = null;  // {record, cleanup} while a game is open, so leave() can warn about unsaved changes

export async function render(root, { key }) {
  const record = await getGame(key);
  if (!root.isConnected) return;  // the user already moved on while the game loaded
  if (!record) {
    toast('That game is no longer on this phone.', true);
    location.replace('#/');
    return;
  }
  const game = record.game;
  let objectUrl = null;
  let saving = Promise.resolve();
  let saveFailed = false;  // the last save on the phone failed: scoring since then exists only on screen
  let sharing = false;     // a Save to Files is in progress

  const video = h('video', { playsinline: true, preload: 'metadata' });
  video.defaultPlaybackRate = video.playbackRate = 1.5;
  const clock = h('span', { class: 'clock' }, formatTime(0));
  const fileInput = h('input', { type: 'file', accept: 'video/*,.mp4,.m4v,.mov', hidden: true, onchange: pickVideo });
  const pickPrompt = h('div', { class: 'pick-prompt' },
    h('p', null, game.video ? `Pick the game video again (last time: ${baseName(game.video)}).` : 'Pick the game video from Files.'),
    h('button', { class: 'btn primary', onclick: () => fileInput.click() }, 'Pick the video'));
  const title = h('h1');
  const status = h('span', { class: 'status' }, 'Saved');
  const bar = topbar('', { back: '#/', actions: [status] });
  bar.querySelector('h1').replaceWith(title);
  const unsaved = h('div', { class: 'unsaved', hidden: true });
  const problems = h('ul', { class: 'problems' });
  const events = h('ul', { class: 'events' });
  const playButton = h('button', { class: 'ctl play', 'aria-label': 'Play or pause', onclick: togglePlay });
  const speed = h('select', { 'aria-label': 'Speed', onchange: () => { video.defaultPlaybackRate = video.playbackRate = Number(speed.value); } },
    [0.5, 0.75, 1, 1.25, 1.5, 2].map(s => h('option', { value: s, selected: s === 1.5 }, `${s}×`)));

  const sheet = createSheet({
    getGame: () => game,
    getTime: () => ready() ? video.currentTime : 0,
    onRecord: recordStat, onSub: doSub, onEnd: doEnd, onUndo: doUndo, onResume: resume,
    endLabel: () => `End of ${periodNow()}`,
    lastText: () => { const e = game.events.at(-1); return e ? `${describe(e)} at ${formatTime(e.t)}` : ''; },
  });

  // ---- helpers
  const ready = () => video.readyState >= 1 && Number.isFinite(video.duration);
  const now = () => (ready() ? video.currentTime : Infinity) + 0.001;
  const jerseyOf = id => id === OPP ? 'OPP' : '#' + (game.roster.find(p => p.id === id)?.number ?? '?');
  // The quarter at the playhead. Before a video is picked there is no playhead, so use the last event's quarter.
  const periodNow = () => {
    if (ready()) return periodName(game.events.filter(e => isEnd(e) && e.t <= now()).length);
    const last = timeline(game).at(-1);
    return last ? periods(game)[last.id] : periodName(0);
  };

  function what(e, kinds, per) {
    if (isEnd(e)) return `End of ${per[e.id]}`;
    if (isSub(e)) return e.sub === 'in' ? 'Sub in' : 'Sub out';
    return STAT_LABEL[kinds[e.id] ?? e.stat];
  }

  function describe(e) {
    const kinds = reboundKinds(game), per = periods(game);
    return isEnd(e) ? what(e, kinds, per) : `${jerseyOf(e.player)} ${what(e, kinds, per)}`;
  }

  function setStatus(text, bad = false) {
    status.textContent = text;
    status.classList.toggle('bad', bad);
  }

  // Saves are queued so quick taps are stored in order, and each one writes the whole game, so one good save
  // recovers everything after a failed one. quiet: bookkeeping that doesn't count as a change to back up.
  function persist(quiet = false) {
    setStatus('Saving…');
    saving = saving
      .then(() => putGame(key, game, { quiet }))
      .then(() => {
        if (!quiet) record.changes += 1;
        saveFailed = false;
        setStatus('Saved');
        renderUnsaved();
      })
      .catch(err => {
        saveFailed = true;
        setStatus('NOT SAVED', true);
        renderUnsaved();
        toast(`NOT SAVED on this phone (${err?.message || 'storage error'}). Use Save to Files now.`, true);
      });
  }

  function afterChange() {
    persist();
    renderLog();
    renderProblems();
    showScore();
  }

  function fail(err) {
    toast(err instanceof GameError ? err.message : 'Something went wrong.', true);
    return false;
  }

  function needTime() {
    if (ready() && !video.seeking) return true;
    toast(objectUrl ? "Video time isn't ready yet. Try again in a second." : 'Pick the game video first.', true);
    return false;
  }

  // ---- recording
  function recordStat(player, stat) {
    if (!needTime()) return false;
    try {
      const e = addEvent(game, player, stat, video.currentTime);
      afterChange();
      toast(`${describe(e)} at ${formatTime(e.t)}`);
      return true;
    } catch (err) { return fail(err); }
  }

  function doSub(player) {
    if (!needTime()) return false;
    try {
      const e = sub(game, player, video.currentTime);
      afterChange();
      toast(`${jerseyOf(e.player)} ${e.sub === 'in' ? 'in' : 'out'} at ${formatTime(e.t)}`);
      return true;
    } catch (err) { return fail(err); }
  }

  function doEnd() {
    if (!needTime()) return false;
    try {
      const e = endPeriod(game, video.currentTime);
      afterChange();
      toast(`${describe(e)} recorded. Tap Save to Files to back it up.`);
      unsaved.classList.add('flash');
      setTimeout(() => unsaved.classList.remove('flash'), 2500);
      return true;
    } catch (err) { return fail(err); }
  }

  function doUndo() {
    try {
      const e = undo(game);
      afterChange();
      toast(`Undid ${describe(e)}`);
    } catch (err) { fail(err); }
  }

  // ---- video
  function pickVideo(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (!isVideoFile(file)) return toast("That doesn't look like a video.", true);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    video.addEventListener('loadedmetadata', () => { seek(resumeTime(game)); showScore(); }, { once: true });
    video.src = objectUrl;
    pickPrompt.hidden = true;
    if (game.video !== file.name) {
      if (game.video && baseName(game.video) !== file.name) {
        toast(`Different file from last time (${baseName(game.video)}). Using ${file.name}.`);
      }
      game.video = file.name;
      persist(true);
    }
  }

  const seek = t => { if (ready()) video.currentTime = Math.max(0, t); };
  const play = () => video.play().catch(() => {});
  const step = frames => { video.pause(); seek(video.currentTime + frames / 30); };
  function togglePlay() { if (ready()) video.paused ? play() : video.pause(); }

  function resume() {
    sheet.close();
    if (ready()) play();
  }

  function tapVideo() {
    if (sheet.isOpen()) return resume();
    if (!ready()) return toast(objectUrl ? 'Still loading the video…' : 'Pick the game video first.', true);
    video.pause();
    sheet.open();
  }

  // ---- drawing
  function showScore() {
    const { us, them } = scoreAt(game, now() - 0.001);
    title.textContent = `${TEAM} ${us}–${them} ${game.opponent} · ${periodNow()}`;
    const t = now();
    for (const row of events.children) row.classList.toggle('later', Number(row.dataset.t) > t);
  }

  function renderProblems() {
    problems.replaceChildren(...lineupProblems(game).map(text => h('li', null, text)));
  }

  const clockTime = ms => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  // The strip under the video: red if the phone itself couldn't save, amber while changes aren't in Files,
  // grey with the time of the last Save to Files once they are.
  function renderUnsaved() {
    const text = saveFailed ? 'NOT saved on this phone. Save to Files now.'
      : record.changes ? `${plural(record.changes, 'change')} not in Files${record.savedAt ? ` · last saved ${clockTime(record.savedAt)}` : ''}`
      : record.savedAt ? `All in Files · saved ${clockTime(record.savedAt)}` : '';
    unsaved.hidden = !text;
    unsaved.classList.toggle('failed', saveFailed);
    unsaved.classList.toggle('clean', !saveFailed && !record.changes);
    fill(unsaved, h('span', null, text), h('button', { class: 'btn small', onclick: saveNow }, 'Save to Files'));
  }

  // A second tap while the share sheet is open does nothing. The count is cleared only when the share sheet
  // reports success, and only after pending saves have finished (so it can't be cleared and then bumped).
  async function saveNow() {
    if (sharing) return;
    sharing = true;
    try {
      const result = await saveToFiles(gameToFile(game));
      if (result === 'cancelled' || result === 'busy') return;
      try {
        const marked = saving.then(() => markSaved(key));
        saving = marked.catch(() => {});
        await marked;
        record.changes = 0;
        record.savedAt = Date.now();
        renderUnsaved();
        toast(result === 'downloaded' ? 'Downloaded. Look in the Files app, Downloads.' : 'Saved to Files.');
      } catch {
        toast('Saved to Files, but this phone could not update its count.', true);
      }
    } catch {
      toast('Could not save the file.', true);
    } finally {
      sharing = false;
    }
  }

  function renderLog() {
    const kinds = reboundKinds(game), per = periods(game), running = runningScores(game);
    const rows = timeline(game).reverse().map(e => h('li', {
      class: ['event', isEnd(e) && 'period-end', isSub(e) && 'lineup', running[e.id] && 'scoring',
        running[e.id] && e.player === OPP && 'opp-scoring'].filter(Boolean).join(' '),
      dataset: { t: e.t },
      onclick: () => jumpTo(e),
    },
    h('span', { class: 'time' }, formatTime(e.t)),
    h('span', { class: 'per' }, per[e.id]),
    h('span', { class: 'who' }, isEnd(e) ? '' : jerseyOf(e.player)),
    h('span', { class: 'what' }, what(e, kinds, per)),
    h('span', { class: 'run' }, running[e.id] ?? ''),
    h('button', { class: 'more', 'aria-label': 'Event actions', onclick: ev => { ev.stopPropagation(); openRowMenu(e); } }, '⋯')));
    events.replaceChildren(...(rows.length ? rows : [h('li', { class: 'none' }, 'No events yet. Tap the video to pause it and score.')]));
  }

  // ---- changing events already in the log (the ... button on a row)
  function jumpTo(e) {
    sheet.close();
    seek(e.t - 3);
    if (ready()) play();
  }

  function openRowMenu(e) {
    const modal = openModal(`${formatTime(e.t)} · ${describe(e)}`, h('div', { class: 'menu' },
      h('button', { class: 'btn', onclick: () => { modal.close(); jumpTo(e); } }, 'Jump here (3 s before)'),
      isEnd(e) ? null : h('button', { class: 'btn', onclick: () => { modal.close(); openEditor(e); } }, 'Change player or event'),
      h('button', { class: 'btn', onclick: () => { modal.close(); openMove(e); } }, 'Move after…'),
      h('button', { class: 'btn danger', onclick: () => { modal.close(); removeEvent(e); } }, 'Delete'),
      h('button', { class: 'btn', onclick: () => modal.close() }, 'Cancel')));
  }

  const option = (value, label, selected) => h('option', { value, selected }, label);

  // Change who an event is for and what it was; its time stays the same.
  function openEditor(e) {
    const players = isSub(e) ? game.roster : [...game.roster, { id: OPP, number: 'OPP' }];
    const kinds = isSub(e)
      ? [['in', 'Sub in'], ['out', 'Sub out']]
      : [...STATS, ...FIXED_REBOUNDS].map(([k, label]) => [k, k === 'reb' ? 'Rebound (auto)' : label]);
    const player = h('select', { 'aria-label': 'Player' },
      players.map(p => option(p.id, p.id === OPP ? 'OPP' : '#' + p.number, p.id === e.player)));
    const kind = h('select', { 'aria-label': 'Event' }, kinds.map(([k, label]) => option(k, label, k === (e.sub ?? e.stat))));
    const modal = openModal(`Change event at ${formatTime(e.t)}`, h('div', { class: 'menu' },
      h('label', { class: 'field' }, 'Player', player),
      h('label', { class: 'field' }, 'Event', kind),
      h('div', { class: 'row' },
        h('button', { class: 'btn grow', onclick: () => modal.close() }, 'Cancel'),
        h('button', {
          class: 'btn primary grow',
          onclick: () => {
            try {
              editEvent(game, e.id, player.value, kind.value);
              modal.close();
              afterChange();
              toast(`Changed to ${describe(e)}`);
            } catch (err) { fail(err); }
          },
        }, 'Save'))));
  }

  // Put an event just after another one in video time (so it also takes that event's quarter).
  function openMove(e) {
    const others = timeline(game).filter(x => x !== e).reverse();
    const after = h('select', { 'aria-label': 'Move after' }, [
      ...others.map(x => option(x.id, `${formatTime(x.t)} · ${describe(x)}`)),
      option('', 'Before everything'),
    ]);
    const modal = openModal(`Move ${describe(e)}`, h('div', { class: 'menu' },
      h('label', { class: 'field' }, 'Move it to just after', after),
      h('div', { class: 'row' },
        h('button', { class: 'btn grow', onclick: () => modal.close() }, 'Cancel'),
        h('button', {
          class: 'btn primary grow',
          onclick: () => {
            try {
              moveEvent(game, e.id, after.value || null);
              modal.close();
              afterChange();
              toast(`Moved ${describe(e)} to ${formatTime(e.t)}`);
            } catch (err) { fail(err); }
          },
        }, 'Move'))));
  }

  function removeEvent(e) {
    try {
      const label = `${describe(e)} at ${formatTime(e.t)}`;
      deleteEvent(game, e.id);
      afterChange();
      toast(`Deleted ${label}`);
    } catch (err) { fail(err); }
  }

  // ---- the page
  video.addEventListener('click', tapVideo);
  video.addEventListener('error', () => toast(describeMediaError(video.error?.code), true));
  video.addEventListener('play', () => playButton.classList.add('playing'));
  video.addEventListener('pause', () => playButton.classList.remove('playing'));
  video.addEventListener('timeupdate', () => { clock.textContent = formatTime(video.currentTime); showScore(); });

  root.replaceChildren(
    h('div', { class: 'stage' },
      bar,
      h('div', { class: 'film' }, video, clock, pickPrompt),
      h('div', { class: 'transport' },
        h('button', { class: 'ctl', onclick: () => seek(video.currentTime - 5) }, '−5'),
        h('button', { class: 'ctl', 'aria-label': 'Back one frame', onclick: () => step(-1) }, '‹'),
        playButton,
        h('button', { class: 'ctl', 'aria-label': 'Forward one frame', onclick: () => step(1) }, '›'),
        h('button', { class: 'ctl', onclick: () => seek(video.currentTime + 5) }, '+5'),
        speed)),
    unsaved,
    h('section', { class: 'log' },
      h('h2', null, 'Events'),
      problems,
      events),
    h('div', { class: 'stack' },
      h('div', { class: 'row' },
        h('button', { class: 'btn grow', onclick: () => showBoxScore({ game, onRosterChange: afterChange }) }, 'Box score'),
        h('button', { class: 'btn grow', onclick: saveNow }, 'Save to Files')),
      h('button', { class: 'btn', onclick: () => fileInput.click() }, 'Change video'),
      fileInput),
    sheet.element);

  renderLog();
  renderProblems();
  renderUnsaved();
  showScore();

  active = {
    state: () => ({ changes: record.changes, saveFailed }),
    cleanup() {
      document.querySelectorAll('.modal, .fullscreen').forEach(el => el.remove());
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      video.pause();
      video.removeAttribute('src');
    },
  };
}

// Called by the router before leaving: remind the user about changes that aren't in Files yet.
export function leave() {
  if (!active) return true;
  const warning = leaveWarning(active.state());
  if (warning && !confirm(warning)) return false;
  active.cleanup();
  active = null;
  return true;
}
