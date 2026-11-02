// Small pure helpers for the video test page (and, later, the phone app).

// Like fmt() in ../static/score.js: m:ss.s, or h:mm:ss.s from one hour up. Rounds to tenths first so
// 59.96 reads 1:00.0, not 0:60.0.
export function formatTime(t) {
  t = Math.round(Math.max(0, t) * 10) / 10;
  const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = (t % 60).toFixed(1).padStart(4, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// Milliseconds per seek -> {count, min, median, max}, whole milliseconds; null when there are none.
export function summarizeSeeks(ms) {
  if (!ms.length) return null;
  const sorted = [...ms].sort((a, b) => a - b), mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { count: sorted.length, min: Math.round(sorted[0]), median: Math.round(median), max: Math.round(sorted.at(-1)) };
}

const MEDIA_ERRORS = {
  1: 'Playback was aborted.',
  2: 'A network error stopped the video loading.',
  3: 'The video could not be decoded.',
  4: 'This phone cannot play that video (unsupported format or codec).',
};

export function describeMediaError(code) {
  return MEDIA_ERRORS[code] || 'The video failed to load for an unknown reason.';
}

// What to ask before leaving a game, or null when nothing is at risk. saveFailed means the last save on the
// phone itself failed, so scoring since then exists only on screen.
export function leaveWarning({ changes, saveFailed }) {
  if (saveFailed) {
    return 'Your latest scoring is NOT saved on this phone and will be lost if you leave. Tap Save to Files first. Leave anyway?';
  }
  if (changes) return `${changes} change${changes === 1 ? '' : 's'} not saved to Files yet (they stay on this phone). Leave anyway?`;
  return null;
}

// Same extensions as VIDEO_TYPES in ../game.py.
const VIDEO_EXTENSIONS = /\.(mp4|m4v|mov|webm)$/i;

export function isVideoFile(file) {
  return file.type ? file.type.startsWith('video/') : VIDEO_EXTENSIONS.test(file.name);
}
