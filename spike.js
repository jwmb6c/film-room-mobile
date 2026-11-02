// Video test page: can this phone load, play and seek in a big game video picked from Files?
import { formatTime, summarizeSeeks, describeMediaError, isVideoFile } from './lib.js';

const $ = id => document.getElementById(id);
const video = $('video');
const FRAME = 1 / 30;
const SEEKS = 10, SEEK_TIMEOUT_MS = 15000;
let objectUrl = null;

function say(text, bad = false) {
  $('msg').textContent = text;
  $('msg').classList.toggle('bad', bad);
}

function resetReadouts() {
  for (const id of ['r-load', 'r-duration', 'r-picture', 'r-seek']) $(id).textContent = '–';
  $('clock').textContent = formatTime(0);
}

$('file').onchange = e => {
  const file = e.target.files[0];
  if (!file) return;
  if (!isVideoFile(file)) return say("That doesn't look like a video.", true);
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  resetReadouts();
  say('Loading…');
  $('r-name').textContent = file.name;
  $('r-size').textContent = (file.size / 1e6).toFixed(0) + ' MB';
  const started = performance.now();
  video.addEventListener('loadedmetadata', () => {
    $('r-load').textContent = Math.round(performance.now() - started) + ' ms';
    $('r-duration').textContent = formatTime(video.duration);
    $('r-picture').textContent = `${video.videoWidth} × ${video.videoHeight}`;
    say('Loaded. Press Play.');
  }, { once: true });
  objectUrl = URL.createObjectURL(file);
  video.src = objectUrl;
};

video.addEventListener('error', () => say(describeMediaError(video.error?.code), true));
video.addEventListener('timeupdate', () => { $('clock').textContent = formatTime(video.currentTime); });
video.addEventListener('play', () => { $('play').textContent = 'Pause'; });
video.addEventListener('pause', () => { $('play').textContent = 'Play'; });

const ready = () => video.readyState >= 1;
const seek = t => { if (ready()) video.currentTime = Math.max(0, t); };
const step = frames => { video.pause(); seek(video.currentTime + frames * FRAME); };

$('play').onclick = () => { if (ready()) video.paused ? video.play().catch(() => {}) : video.pause(); };
$('back5').onclick = () => seek(video.currentTime - 5);
$('fwd5').onclick = () => seek(video.currentTime + 5);
$('frameBack').onclick = () => step(-1);
$('frameFwd').onclick = () => step(1);
$('speed').onchange = e => { video.playbackRate = Number(e.target.value); };

// Jump to random spots one after another and time how long each takes to land.
function seekOnce(target) {
  return new Promise(resolve => {
    const started = performance.now();
    const done = ms => {
      clearTimeout(timer);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('emptied', onGone);
      video.removeEventListener('error', onGone);
      resolve(ms);
    };
    const onSeeked = () => done(performance.now() - started);
    const onGone = () => done(null);  // the video was unloaded or failed mid-seek: don't wait out the timeout
    const timer = setTimeout(() => done(null), SEEK_TIMEOUT_MS);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('emptied', onGone);
    video.addEventListener('error', onGone);
    video.currentTime = target;
  });
}

// Everything that could change the video or its position is locked while the seek test runs, so a tap
// can't skew the timings or swap the file out from under it (a swap leaves duration NaN).
const LOCKED_DURING_TEST = ['file', 'play', 'back5', 'fwd5', 'frameBack', 'frameFwd', 'speed', 'seekTest'];
const lockControls = locked => { for (const id of LOCKED_DURING_TEST) $(id).disabled = locked; };

$('seekTest').onclick = async () => {
  if (!ready() || !Number.isFinite(video.duration)) return say('Pick a video and wait for it to load first.', true);
  lockControls(true);
  try {
    video.pause();
    const times = [];
    let stuck = 0;
    for (let i = 1; i <= SEEKS; i++) {
      if (!ready() || !Number.isFinite(video.duration)) throw Error('The video was unloaded during the seek test.');
      $('r-seek').textContent = `${i} of ${SEEKS}…`;
      const ms = await seekOnce(Math.random() * video.duration * 0.98);
      ms === null ? stuck++ : times.push(ms);
    }
    const s = summarizeSeeks(times);
    const text = s ? `${s.count} seeks: ${s.min} / ${s.median} / ${s.max} ms (min / median / max)` : 'no seek finished';
    $('r-seek').textContent = stuck ? `${text}; ${stuck} seek stuck` : text;
  } catch (err) {
    $('r-seek').textContent = 'Seek test failed';
    say(err.message, true);
  } finally {
    lockControls(false);
  }
};

const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
$('r-mode').textContent = standalone ? 'Home-screen app' : 'Safari tab';
