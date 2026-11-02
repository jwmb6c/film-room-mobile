// Moving games in and out of the phone's Files app: the PC app's JSON game file and the box score CSV.
import { GameError, fileStem, boxCsv, upgrade } from './game.js';

export const gameFileName = game => fileStem(game.date, game.opponent) + '.json';

export const gameToFile = game =>
  new File([JSON.stringify(game, null, 1)], gameFileName(game), { type: 'application/json' });

export const csvToFile = game =>
  new File([boxCsv(game)], fileStem(game.date, game.opponent) + '.csv', { type: 'text/csv' });

const NOT_A_GAME = "That file isn't a Film Room game.";

// Text of a game JSON (from this app or the PC app, any version) to an up-to-date game, or a GameError.
export function parseGameFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new GameError(NOT_A_GAME);
  }
  const ok = data && typeof data === 'object' && !Array.isArray(data)
    && typeof data.opponent === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date)
    && Array.isArray(data.roster) && data.roster.every(p => p && typeof p.id === 'string' && typeof p.number === 'string')
    && Array.isArray(data.events) && data.events.every(e => e && typeof e === 'object' && Number.isFinite(e.t));
  if (!ok) throw new GameError(NOT_A_GAME);
  data.video = typeof data.video === 'string' ? data.video : '';
  return upgrade(data);
}

// Offer the file to the iOS share sheet (Save to Files); where that isn't available, download it instead.
// Resolves 'shared' (the sheet reported success), 'cancelled', 'busy' (a share sheet was already open: do
// nothing) or 'downloaded'. Any other share failure is raised, so nothing is ever reported saved by mistake.
// env is only swapped out in tests.
export async function saveToFiles(file, env = globalThis) {
  const nav = env.navigator;
  if (nav?.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: file.name });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      if (err?.name === 'InvalidStateError') return 'busy';
      if (err?.name !== 'NotAllowedError') throw err;
      // NotAllowedError: the tap was too long ago for the share sheet. Fall through to a plain download.
    }
  }
  const url = env.URL.createObjectURL(file);
  const link = env.document.createElement('a');
  link.href = url;
  link.download = file.name;
  env.document.body.append(link);
  link.click();
  link.remove();
  env.setTimeout(() => env.URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}
