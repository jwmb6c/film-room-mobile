// Scoring files and stats math: a port of ../game.py. A game is the PC app's JSON object
// ({version, video, opponent, date, roster, events}); functions here read it or change it in place.
// tests/parity.test.mjs checks every result against what game.py produces.
import { formatTime } from './lib.js';

export class GameError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GameError';
  }
}

export const STATS = [  // the scoring buttons
  ['2pm', '2PT make'], ['2px', '2PT miss'], ['3pm', '3PT make'], ['3px', '3PT miss'],
  ['ftm', 'FT make'], ['ftx', 'FT miss'], ['reb', 'Rebound'],
  ['ast', 'Assist'], ['stl', 'Steal'], ['blk', 'Block'], ['to', 'Turnover'],
  ['pf', 'Foul'], ['min', 'Minute'],
];
// A "reb" is offensive or defensive depending on the shot before it (see reboundKinds). These two force it
// either way from the event editor, and older games recorded them directly.
export const FIXED_REBOUNDS = [['oreb', 'Off reb'], ['dreb', 'Def reb']];
export const STAT_KEYS = [...STATS, ...FIXED_REBOUNDS].map(([key]) => key);
export const SHOTS = new Set(['2pm', '2px', '3pm', '3px', 'ftm', 'ftx']);
export const POINTS = { '2pm': 2, '3pm': 3, 'ftm': 1 };
export const OPP = 'opp';
export const BOX_COLUMNS = ['#', 'PTS', 'FGM', 'FGA', 'FG%', '3PM', '3PA', '3P%', 'FTM', 'FTA', 'FT%', 'OREB', 'DREB',
  'REB', 'AST', 'STL', 'BLK', 'TO', 'PF', 'MIN', '+/-'];

const SNAP = 0.5;  // seconds
const round3 = x => Math.round(x * 1000) / 1000;

function hex(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(Math.ceil(length / 2)));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').slice(0, length);
}

export const isSub = event => 'sub' in event;
export const isEnd = event => 'end' in event;

// Jersey numbers from free text, one per line or comma/space separated. 0 and 00 stay distinct.
export function parseNumbers(text) {
  return checkNumbers(text.split(/[\s,]+/).filter(Boolean).map(n => n.replace(/^#+/, '')));
}

function checkNumbers(numbers) {
  for (const n of numbers) {
    if (!/^\d{1,2}$/.test(n)) throw new GameError(`'${n}' isn't a jersey number (use 0-99).`);
  }
  const dupes = [...new Set(numbers.filter(n => numbers.filter(m => m === n).length > 1))].sort();
  if (dupes.length) throw new GameError('Duplicate jersey number: ' + dupes.join(', '));
  return numbers;
}

export function newGame({ video, opponent, date, numbers }) {
  return {
    version: 3,
    video: String(video),
    opponent: opponent.trim(),
    date,
    roster: checkNumbers(numbers).map(number => ({ id: hex(8), number })),
    events: [],
  };
}

export function fileStem(date, opponent) {
  const slug = opponent.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'game';
  return `${date}_vs_${slug}`;
}

// Validate a video time for a new entry. The playhead can slip back a few hundredths of a second (pausing,
// reloading), which would save an entry just before the one entered right before it. Anything less than SNAP
// seconds earlier than the last entry takes that entry's time, so entry order keeps it after.
function entryTime(game, t) {
  if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) {
    throw new GameError("The video time couldn't be read. Let the video load, then try again.");
  }
  t = round3(t);
  const last = game.events.at(-1);
  if (last && 0 < last.t - t && last.t - t < SNAP) t = last.t;
  return t;
}

function record(game, fields, t) {
  const event = { id: hex(10), ...fields, t: entryTime(game, t), at: new Date().toISOString().slice(0, 19) + '+00:00' };
  game.events.push(event);
  return event;
}

export function addEvent(game, player, stat, t) {
  if (player !== OPP && !game.roster.some(p => p.id === player)) throw new GameError('Pick a player first.');
  if (!STAT_KEYS.includes(stat)) throw new GameError(`Unknown stat '${stat}'.`);
  return record(game, { player, stat }, t);
}

// Mark the end of the current quarter (or overtime) at video time t.
export function endPeriod(game, t) {
  return record(game, { end: true }, t);
}

// 0 -> Q1 ... 3 -> Q4, then OT, OT2, OT3...
export function periodName(index) {
  return index < 4 ? `Q${index + 1}` : index === 4 ? 'OT' : `OT${index - 3}`;
}

// Events in video-time order; entry order breaks ties.
export function timeline(game) {
  return game.events.map((e, i) => [e, i]).sort(([a, i], [b, j]) => a.t - b.t || i - j).map(([e]) => e);
}

// {event id: period name}. Each event is in the period after the end markers before it in video time; an end
// marker belongs to the period it ends. Moving a marker relabels everything around it.
export function periods(game) {
  const result = {};
  let index = 0;
  for (const e of timeline(game)) {
    result[e.id] = periodName(index);
    if (isEnd(e)) index++;
  }
  return result;
}

// Players on the floor after every event at or before video time t.
export function onFloor(game, t) {
  const on = new Set();
  for (const e of timeline(game)) {
    if (e.t > t) break;
    if (isSub(e)) e.sub === 'in' ? on.add(e.player) : on.delete(e.player);
  }
  return on;
}

// Sub a player in, or out if they're already on the floor, at video time t.
export function sub(game, player, t) {
  if (!game.roster.some(p => p.id === player)) throw new GameError('Unknown player. Reload the page and try again.');
  const on = onFloor(game, entryTime(game, t));
  if (!on.has(player) && on.size >= 5) {
    throw new GameError('Already 5 on the floor. Long-press someone to sub them out first.');
  }
  return record(game, { player, sub: on.has(player) ? 'out' : 'in' }, t);
}

// Each player's +/- from who was on the floor at each scoring play's video time. Events are replayed in
// video-time order, so a sub recorded later at an earlier video time (or moved there) still applies.
// unassigned: points scored with nobody on the floor.
export function plusMinus(game) {
  const byPlayer = Object.fromEntries(game.roster.map(p => [p.id, 0]));
  const on = new Set();
  let unassigned = 0;
  for (const e of timeline(game)) {
    if (isSub(e)) {
      e.sub === 'in' ? on.add(e.player) : on.delete(e.player);
      continue;
    }
    const points = POINTS[e.stat] || 0;
    if (points && !on.size) unassigned += points;
    if (points) {
      for (const id of on) {
        if (id in byPlayer) byPlayer[id] += e.player !== OPP ? points : -points;
      }
    }
  }
  return { byPlayer, unassigned };
}

// {event id: "oreb" or "dreb"} for each "reb": offensive if the last shot before it in video time was by the
// same team, otherwise (or with no shot yet) defensive.
export function reboundKinds(game) {
  const kinds = {};
  let shooterIsOpp = null;
  for (const e of timeline(game)) {
    if (SHOTS.has(e.stat)) shooterIsOpp = e.player === OPP;
    else if (e.stat === 'reb') kinds[e.id] = shooterIsOpp === (e.player === OPP) ? 'oreb' : 'dreb';
  }
  return kinds;
}

// Plain-language warnings for subs that don't add up, e.g. after moving events around.
export function lineupProblems(game) {
  const numbers = Object.fromEntries(game.roster.map(p => [p.id, '#' + p.number]));
  const on = new Set();
  const problems = [];
  for (const e of timeline(game)) {
    if (!isSub(e)) continue;
    const who = numbers[e.player] ?? '?', when = formatTime(e.t);
    if (e.sub === 'in') {
      if (on.has(e.player)) problems.push(`${who} subbed in at ${when} but was already on the floor.`);
      on.add(e.player);
      if (on.size > 5) problems.push(`${on.size} on the floor at ${when}.`);
    } else {
      if (!on.has(e.player)) problems.push(`${who} subbed out at ${when} but wasn't on the floor.`);
      on.delete(e.player);
    }
  }
  return problems;
}

// Move an event to just after another one in video time (afterId null: before everything). It takes the earlier
// event's time plus 0.1 s, or splits the gap if the next event is closer than that. Its period follows from
// where it lands among the end-of-period markers.
export function moveEvent(game, eventId, afterId) {
  const moving = game.events.find(e => e.id === eventId);
  if (!moving) throw new GameError('That event is gone. Reload the page.');
  const others = timeline(game).filter(e => e !== moving);
  let before, after;
  if (afterId == null) {
    before = null;
    after = others[0] ?? null;
  } else {
    const k = others.findIndex(e => e.id === afterId);
    if (k < 0) throw new GameError('That event is gone. Reload the page.');
    before = others[k];
    after = others[k + 1] ?? null;
  }

  let t;
  if (before) {
    t = before.t + 0.1;
    if (after && after.t <= t) t = (before.t + after.t) / 2;
  } else {
    t = after ? Math.max(0, after.t - 0.1) : moving.t;
  }
  moving.t = round3(t);

  // Same time as a neighbor: entry order decides, so place it right next to that neighbor.
  const events = game.events;
  const i = events.indexOf(moving);
  events.splice(i, 1);
  if (before && moving.t === before.t) events.splice(events.indexOf(before) + 1, 0, moving);
  else if (after && moving.t === after.t) events.splice(events.indexOf(after), 0, moving);
  else events.splice(i, 0, moving);
  return moving;
}

// Remove the most recently recorded event.
export function undo(game) {
  if (!game.events.length) throw new GameError('Nothing to undo.');
  return game.events.pop();
}

export function deleteEvent(game, eventId) {
  const i = game.events.findIndex(e => e.id === eventId);
  if (i < 0) throw new GameError('That event is already gone.');
  return game.events.splice(i, 1)[0];
}

// Change who an event is for and what it is, keeping its time. kind is a stat key for stat events, or "in"/"out"
// for subs. Subs stay subs and stats stay stats.
export function editEvent(game, eventId, player, kind) {
  const event = game.events.find(e => e.id === eventId);
  if (!event) throw new GameError('That event is gone. Reload the page.');
  if (isEnd(event)) throw new GameError('An end of quarter has nothing to edit. Drag it to move it.');
  const onRoster = game.roster.some(p => p.id === player);
  if (isSub(event)) {
    if (!onRoster) throw new GameError('Subs are for Rock Bridge players only.');
    if (kind !== 'in' && kind !== 'out') throw new GameError('A sub is either in or out.');
    Object.assign(event, { player, sub: kind });
  } else {
    if (!onRoster && player !== OPP) throw new GameError('Unknown player. Reload the page and try again.');
    if (!STAT_KEYS.includes(kind)) throw new GameError(`Unknown stat '${kind}'.`);
    Object.assign(event, { player, stat: kind });
  }
  return event;
}

// Replace the game roster. Existing ids keep their stats when renumbered; new rows get new ids.
export function setRoster(game, players) {
  const known = new Set(game.roster.map(p => p.id));
  const rows = players.map(p => {
    const id = p.id || hex(8);
    if (p.id && !known.has(id)) throw new GameError('Unknown player. Reload the page and try again.');
    return { id, number: String(p.number ?? '').trim().replace(/^#+/, '') };
  });
  checkNumbers(rows.map(r => r.number));
  const kept = new Set(rows.map(r => r.id));
  for (const p of game.roster) {
    const count = game.events.filter(e => e.player === p.id).length;
    if (!kept.has(p.id) && count) {
      throw new GameError(`#${p.number} is in ${count} recorded events (stats or subs). Delete those first.`);
    }
  }
  game.roster = rows;
}

// Furthest video time with an entry: where scoring left off, even after rewinding or moving events.
export function resumeTime(game) {
  return game.events.reduce((latest, e) => Math.max(latest, e.t), 0);
}

// Python's round(): halves go to the even number, so box scores match the PC app.
function pyRound(x) {
  const floor = Math.floor(x), rest = x - floor;
  if (rest < 0.5) return floor;
  if (rest > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

// Whole-number percentage, blank with no attempts.
const pct = (made, attempts) => attempts ? pyRound(100 * made / attempts) : '';

function line(counts) {
  const c = Object.fromEntries(STAT_KEYS.map(k => [k, counts[k] || 0]));
  const fgm = c['2pm'] + c['3pm'], fga = c['2pm'] + c['2px'] + c['3pm'] + c['3px'];
  const tpa = c['3pm'] + c['3px'], fta = c['ftm'] + c['ftx'];
  return {
    'PTS': 2 * c['2pm'] + 3 * c['3pm'] + c['ftm'],
    'FGM': fgm, 'FGA': fga, 'FG%': pct(fgm, fga),
    '3PM': c['3pm'], '3PA': tpa, '3P%': pct(c['3pm'], tpa),
    'FTM': c['ftm'], 'FTA': fta, 'FT%': pct(c['ftm'], fta),
    'OREB': c['oreb'], 'DREB': c['dreb'], 'REB': c['oreb'] + c['dreb'],
    'AST': c['ast'], 'STL': c['stl'], 'BLK': c['blk'], 'TO': c['to'], 'PF': c['pf'], 'MIN': c['min'],
  };
}

// Rows for each player, then TEAM (players only) and OPP. TEAM/OPP +/- is the scoring margin.
export function boxScore(game) {
  const counts = Object.fromEntries(game.roster.map(p => [p.id, {}]));
  counts[OPP] = {};
  const rebounds = reboundKinds(game);
  for (const e of game.events) {
    if ('stat' in e && e.player in counts) {
      const stat = rebounds[e.id] ?? e.stat;
      counts[e.player][stat] = (counts[e.player][stat] || 0) + 1;
    }
  }
  const { byPlayer } = plusMinus(game);
  const rows = game.roster.map(p => ({ '#': p.number, ...line(counts[p.id]), '+/-': byPlayer[p.id] }));
  const teamCounts = Object.fromEntries(STAT_KEYS.map(k => [k, game.roster.reduce((sum, p) => sum + (counts[p.id][k] || 0), 0)]));
  const team = { '#': 'TEAM', ...line(teamCounts) };
  const opp = { '#': 'OPP', ...line(counts[OPP]) };
  team['+/-'] = team.PTS - opp.PTS;
  opp['+/-'] = opp.PTS - team.PTS;
  return [...rows, team, opp];
}

export function boxCsv(game) {
  const cell = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  const lines = [BOX_COLUMNS, ...boxScore(game).map(row => BOX_COLUMNS.map(c => row[c]))];
  return lines.map(row => row.map(cell).join(',')).join('\n') + '\n';
}

// Score at video time t (points up to and including t), as the top bar shows it.
export function scoreAt(game, t) {
  const now = t + 0.001;  // saved times are rounded to the millisecond
  let us = 0, them = 0;
  for (const e of game.events) {
    if (isSub(e) || e.t > now) continue;
    if (e.player === OPP) them += POINTS[e.stat] || 0; else us += POINTS[e.stat] || 0;
  }
  return { us, them };
}

// {event id: "us–them"} after each scoring play, in video-time order.
export function runningScores(game) {
  const result = {};
  let us = 0, them = 0;
  for (const e of timeline(game)) {
    const points = isSub(e) ? 0 : POINTS[e.stat] || 0;
    if (!points) continue;
    if (e.player === OPP) them += points; else us += points;
    result[e.id] = `${us}–${them}`;
  }
  return result;
}

// Bring older files up to date: lineup snapshots become subs, period labels become end markers.
export function upgrade(game) {
  const events = game.events;
  if (events.some(e => 'on' in e)) {
    // Version 1 stored lineups as full five-player snapshots ("on"); turn each into in/out subs.
    const replaced = new Map();
    let prev = [];
    const order = events.map((_, i) => i).sort((i, j) => events[i].t - events[j].t || i - j);
    for (const i of order) {
      const e = events[i];
      if (!('on' in e)) continue;
      const changes = [
        ...prev.filter(p => !e.on.includes(p)).map(p => [p, 'out']),
        ...e.on.filter(p => !prev.includes(p)).map(p => [p, 'in']),
      ];
      replaced.set(i, changes.map(([player, sub], k) => ({
        id: k === 0 ? e.id : hex(10), player, sub, period: e.period ?? 'Q1', t: e.t, at: e.at,
      })));
      prev = e.on;
    }
    game.events = events.flatMap((e, i) => replaced.get(i) ?? [e]);
  }
  if (game.events.some(e => 'period' in e)) {
    // Version 2 labeled each event with the period picked at the time; put an end-of-period marker just
    // after the last event of each period instead (move it to adjust).
    const order = { Q1: 0, Q2: 1, Q3: 2, Q4: 3, OT: 4 };
    const tl = timeline(game);
    const markers = new Map();
    let current = 0;
    tl.forEach((e, k) => {
      while ((order[e.period] ?? current) > current) {
        const prev = k ? tl[k - 1] : null;
        const t = prev ? Math.min(prev.t + 0.1, (prev.t + e.t) / 2) : Math.max(0, e.t - 0.1);
        if (!markers.has(e.id)) markers.set(e.id, []);
        markers.get(e.id).push({ id: hex(10), end: true, t: round3(t), at: e.at });
        current++;
      }
    });
    game.events = game.events.flatMap(e => [...(markers.get(e.id) ?? []), e]);
    for (const e of game.events) delete e.period;
  }
  game.version = 3;
  return game;
}
