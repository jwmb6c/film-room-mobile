// Small pure helpers for the video test page (and, later, the phone app).

// Same arithmetic as fmt() in ../static/score.js: m:ss.s, or h:mm:ss.s from one hour up.
export function formatTime(t) {
  t = Math.max(0, t);
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

// Same extensions as VIDEO_TYPES in ../game.py.
const VIDEO_EXTENSIONS = /\.(mp4|m4v|mov|webm)$/i;

export function isVideoFile(file) {
  return file.type ? file.type.startsWith('video/') : VIDEO_EXTENSIONS.test(file.name);
}
