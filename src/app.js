// ─────────────────────────────────────────────────────────────
// Wiring. The clock decides which task is running; the task decides
// which world you are in; the world runs itself. Nothing here shows
// a number, and nothing here completes a task on its own.
// ─────────────────────────────────────────────────────────────

import {
  resolve, absNow, effectiveNow, scheduleFor, wallClock, dayNumOf,
  nightKey, nightDayNum, startSecondsFor, startOffsetMin, isPaused, pausedSec,
  OFFSET_MIN, OFFSET_MAX, OFFSET_STEP
} from './schedule.js';
import { DESIGNS } from './designs.js';
import { store } from './store.js';
import { audio } from './audio.js';
import { cue, N } from './cues.js';
import { Scene } from './scene.js';
import { CompletionControl } from './completion.js';
import { renderArchive, TASK_COLORS } from './history.js';
import { clamp } from './util.js';

const COUNT_FROM = 3;      // seconds of countdown before a night begins
const COUNT_TICK = cue('glass', [N(4)], { spread: 0, durationMs: 150, gain: 0.05, attackMs: 4, releaseMs: 90 });

const GRACE_MS = 120000;   // how long a finished world waits to be closed by hand
const DWELL_MS = 8000;     // and how long its trace rests there afterwards

const el = (id) => document.getElementById(id);
const stage = el('stage');
const scene = new Scene(stage);

const taskNameEl = el('taskName');
const worldNameEl = el('worldName');
const hintEl = el('hint');
const affordanceEl = el('affordance');
const archiveEl = el('archive');
const countdownEl = el('countdown');
const countdownNum = countdownEl.querySelector('span');

let pending = null;        // a finished task waiting for the person
let lastSessionId = null;
let primed = false;        // first tick after load never rings anything
let startsAtMs = null;     // when the night begins, in wall-clock ms
let countShown = 0;        // the number on screen, so each one beats once

// One screen, every task, every night. The other engines are still in
// the repository, but a routine you do at the same time every evening
// wants the same picture every evening — the point is to read it without
// thinking, not to be surprised by it.
const SCREEN = DESIGNS.find((d) => d.engine === 'bar');

/** Which world belongs to this task on this night. */
function designFor() {
  return SCREEN;
}

/** #rrggbb from the record's palette, as the [h,s,l] the canvas wants. */
const HSL = {};
function hslOf(key) {
  if (HSL[key]) return HSL[key];
  const hex = TASK_COLORS[key] || '#8899aa';
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const l = (mx + mn) / 2;
  let hh = 0, ss = 0;
  if (d) {
    ss = d / (1 - Math.abs(2 * l - 1));
    hh = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? ((b - r) / d + 2) : ((r - g) / d + 4);
    hh *= 60;
  }
  return (HSL[key] = [hh, ss * 100, l * 100]);
}

/** A wall-clock label like 19:30, from an absolute second. */
function atLabel(sec) {
  const s2 = ((Math.round(sec) % 86400) + 86400) % 86400;
  const h = Math.floor(s2 / 3600), m = Math.floor((s2 % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Everything the task screen needs to say where you are in the night. */
function clockFor(st, now, show, showProgress, paused) {
  const sch = st.sch;
  const tasks = sch.tasks.map((t) => ({
    key: t.key, durSec: t.dur, color: hslOf(t.key),
    done: store.isComplete(sch.key, t.key)
  }));
  const idx = show.task.index;
  const t = sch.tasks[idx];
  const dormant = st.mode === 'dormant';
  const elapsed = dormant ? 0 : clamp(showProgress) * t.dur;
  const next = sch.tasks[idx + 1];
  return {
    state: paused ? 'paused' : dormant ? 'dormant' : showProgress >= 1 ? 'closing' : 'live',
    taskName: show.task.key,
    taskIndex: idx,
    color: hslOf(show.task.key),
    progress: clamp(showProgress),
    durSec: t.dur,
    elapsedSec: elapsed,
    remainingSec: Math.max(0, t.dur - elapsed),
    startsInSec: Math.max(0, sch.start - now),
    startsAtLabel: atLabel(sch.start),
    tasks,
    nightTotal: sch.end - sch.start,
    nightProgress: clamp((now - sch.start) / (sch.end - sch.start)),
    nightRemainingSec: Math.max(0, sch.end - now),
    nextName: next ? next.key : '',
    nextAtLabel: next ? atLabel(next.start) : ''
  };
}

const control = new CompletionControl(affordanceEl, () => {
  const ctx = pending || current;
  if (!ctx || !ctx.task) return;
  const ok = store.complete(ctx.day, ctx.task.key, ctx.design.id);
  if (ok) {
    scene.state.completed = true;
    scene.markCompleted();
    // the world does not close on you: its mark stays a while before the
    // next task's world takes the screen
    if (pending) { pending.completed = true; pending.until = Date.now() + DWELL_MS; }
  }
});

let current = null;

function tick() {
  const now = effectiveNow();      // real time, less whatever was spent paused
  const st = resolve(now);
  const design = designFor();
  const sessionId = `${st.sch.key}:${st.task.key}`;
  const active = st.mode === 'active';
  const progress = active ? clamp((now - st.task.start) / st.task.dur) : 0;

  // ── a task has just run out: hold its world open for the person ──
  if (primed && lastSessionId && lastSessionId !== sessionId && current && current.active) {
    const finished = current;
    // only for a task that has *just* ended — waking the laptop an hour later
    // must not offer to close something that finished long ago
    const sinceEnd = now - finished.task.end;
    if (sinceEnd >= 0 && sinceEnd <= GRACE_MS / 1000 && !store.isComplete(finished.day, finished.task.key)) {
      pending = { ...finished, until: Date.now() + GRACE_MS, completed: false };
      control.fired = false;
      control.reset();
    }
  }

  // ── sound: one start cue and one last-minute cue per session, ever ──
  if (active) {
    if (!store.cueFired(sessionId, 'start')) {
      if (primed && lastSessionId && lastSessionId !== sessionId) playCue(design.sound.start);
      store.markCue(sessionId, 'start');       // opening the page mid-task only spends it
    }
    const remaining = st.task.end - now;
    if (remaining <= 60 && remaining > 0 && !store.cueFired(sessionId, 'last')) {
      if (primed) playCue(design.sound.last);
      store.markCue(sessionId, 'last');
    }
  }

  lastSessionId = sessionId;
  current = { design, sessionId, task: st.task, day: st.sch.key, active };

  // ── decide what is on screen ──
  if (pending && Date.now() > pending.until) pending = null;

  const show = pending || current;
  const showProgress = pending ? 1 : progress;
  const completed = store.isComplete(show.day, show.task.key);

  scene.setDesign(show.design, show.sessionId);
  scene.state.clock = clockFor(st, now, show, showProgress, isPaused());
  scene.state.progress = showProgress;
  scene.state.completed = completed;
  scene.state.canComplete = !!pending && !completed;
  if (completed) scene.markCompleted();

  // when the night begins, in wall-clock terms — the countdown reads from
  // this, so it stays smooth between ticks
  startsAtMs = (!pending && st.mode === 'dormant')
    ? Date.now() + (st.sch.start - now) * 1000
    : null;

  const paused = isPaused();
  scene.setPaused(paused);

  // the canvas carries the whole screen now; the caption stays empty so the
  // numbers are never said twice
  taskNameEl.textContent = '';
  taskNameEl.dataset.state = paused ? 'paused' : pending ? 'closing' : active ? 'live' : 'dormant';
  worldNameEl.textContent = '';

  // one line of guidance, only when there is something to say
  if (scene.state.canComplete) {
    // one line, one instruction — the same in every world
    hintEl.textContent = 'チェックをタップして完了';
    affordanceEl.setAttribute('aria-description', `${show.task.key} を完了としてマークします`);
  } else {
    // the screen itself says what is happening now
    hintEl.textContent = '';
  }
  if (paused) hintEl.dataset.paused = '1'; else delete hintEl.dataset.paused;
  // canvas text is invisible to a screen reader, so the stage says it instead
  const c = scene.state.clock;
  const said = c.state === 'dormant' ? `${c.taskName} 開始前`
    : c.state === 'closing' ? `${c.taskName} 完了。チェックをタップしてください`
    : `${c.taskName} 実行中`;
  stage.setAttribute('aria-label', paused
    ? `${said}。一時停止中。もう一度押すと再開します`
    : `${said}。押すと一時停止します`);
  stage.setAttribute('aria-pressed', String(paused));

  control.setSpec(scene.affordanceSpec());
  primed = true;
}

function playCue(c) {
  if (!store.prefs.sound) return;
  audio.play(c, store.prefs.volume ?? 0.8);
}

// ── frame loop ───────────────────────────────────────────────
let lastDraw = 0;
function frame(now) {
  requestAnimationFrame(frame);
  tickCountdown();
  const step = scene.reduced ? 250 : 33;        // slow worlds do not need 60fps
  if (now - lastDraw < step) return;
  lastDraw = now;
  scene.state.gesture = control.tick(now);
  scene.frame(now);
}

/** Three, two, one — so that a night beginning is unmistakable. */
function tickCountdown() {
  const left = startsAtMs === null ? Infinity : (startsAtMs - Date.now()) / 1000;
  const n = (left > 0 && left <= COUNT_FROM) ? Math.ceil(left) : 0;
  if (n === countShown) return;
  countShown = n;
  if (!n) {
    countdownEl.hidden = true;
    countdownEl.removeAttribute('data-beat');
    hintEl.hidden = false;
    return;
  }
  countdownNum.textContent = String(n);
  countdownEl.hidden = false;
  hintEl.hidden = true;                          // the number stands on its own
  countdownEl.removeAttribute('data-beat');
  void countdownEl.offsetWidth;                  // restart the beat for each number
  countdownEl.setAttribute('data-beat', String(n));
  if (store.prefs.sound) audio.play(COUNT_TICK, (store.prefs.volume ?? 0.8) * 0.5);
}
requestAnimationFrame(frame);

tick();
setInterval(tick, 500);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { store.sync(); tick(); } });
addEventListener('focus', tick);

// ── pause: a tap on the world holds the night still ──────────
function setPaused(next) {
  const p = store.prefs.pause;
  const mine = p && p.day === nightKey() ? p : { day: nightKey(), accum: 0, since: null };
  if (next && !mine.since) {
    mine.since = Date.now();
  } else if (!next && mine.since) {
    mine.accum = (mine.accum || 0) + Math.max(0, (Date.now() - mine.since) / 1000);
    mine.since = null;
  } else return;
  store.setPref('pause', mine);
  tick();
}

function togglePause() {
  // nothing to hold still before the night starts, or once a task is waiting
  // to be closed by hand
  if (!current || !current.active || scene.state.canComplete) return;
  setPaused(!isPaused());
}

let tapAt = null;
stage.addEventListener('pointerdown', (e) => { tapAt = { x: e.clientX, y: e.clientY, t: Date.now() }; });
stage.addEventListener('pointerup', (e) => {
  if (!tapAt) return;
  const moved = Math.hypot(e.clientX - tapAt.x, e.clientY - tapAt.y);
  const held = Date.now() - tapAt.t;
  tapAt = null;
  if (moved < 12 && held < 600) togglePause();     // a tap, not a drag or a rest
});
stage.addEventListener('pointercancel', () => { tapAt = null; });
stage.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
  e.preventDefault();
  togglePause();
});

// ── audio unlock: first touch anywhere in the page ───────────
function unlock() {
  audio.unlock();
  audio.setVolume(store.prefs.volume ?? 0.8);
  removeEventListener('pointerdown', unlock, true);
  removeEventListener('keydown', unlock, true);
  el('soundBtn').dataset.on = store.prefs.sound ? '1' : '0';
}
addEventListener('pointerdown', unlock, true);
addEventListener('keydown', unlock, true);

// ── chrome ───────────────────────────────────────────────────
const soundBtn = el('soundBtn');
soundBtn.dataset.on = store.prefs.sound ? '1' : '0';
soundBtn.addEventListener('click', () => {
  store.setPref('sound', !store.prefs.sound);
  soundBtn.dataset.on = store.prefs.sound ? '1' : '0';
  soundBtn.setAttribute('aria-pressed', String(store.prefs.sound));
  if (store.prefs.sound && current) playCue(current.design.sound.start);
});

const archiveBtn = el('archiveBtn');
function openArchive() {
  store.sync();
  renderArchive(el('archRows'), nightDayNum());
  archiveEl.hidden = false;
  el('archClose').focus();
}
function closeArchive() { archiveEl.hidden = true; archiveBtn.focus(); }
archiveBtn.addEventListener('click', openArchive);
el('archClose').addEventListener('click', closeArchive);
el('archBackdrop').addEventListener('click', closeArchive);
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!archiveEl.hidden) closeArchive();
  else if (!el('settings').hidden) closeSettings();
});

// ── settings: nudging when the night begins ──────────────────
const settingsEl = el('settings');
const offsetValue = el('offsetValue');
const offsetUp = el('offsetUp');
const offsetDown = el('offsetDown');
const offsetReset = el('offsetReset');

const hhmm = (sec) => {
  const s2 = ((Math.round(sec) % 86400) + 86400) % 86400;
  const h = Math.floor(s2 / 3600), m = Math.floor((s2 % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

function renderSettings() {
  const off = startOffsetMin();
  offsetValue.textContent = off === 0 ? '±0分' : (off > 0 ? `+${off}分` : `−${Math.abs(off)}分`);
  offsetUp.disabled = off >= OFFSET_MAX;
  offsetDown.disabled = off <= OFFSET_MIN;
  offsetReset.hidden = off === 0;

  // show where each night actually starts now, against where it used to
  for (const [id, weekend, base] of [['wdTime', false, '19:30'], ['weTime', true, '20:00']]) {
    const now = hhmm(startSecondsFor(weekend));
    el(id).innerHTML = off === 0 ? now : `<small>${base}</small>${now}`;
  }
}

function setOffset(next) {
  const clamped = Math.max(OFFSET_MIN, Math.min(OFFSET_MAX, next));
  store.setPref('startOffset', clamped);
  store.setPref('startOffsetDay', nightKey());     // tomorrow starts from the default again
  renderSettings();
  tick();                                  // the night re-times itself at once
}

offsetUp.addEventListener('click', () => setOffset(startOffsetMin() + OFFSET_STEP));
offsetDown.addEventListener('click', () => setOffset(startOffsetMin() - OFFSET_STEP));
offsetReset.addEventListener('click', () => setOffset(0));

function openSettings() {
  store.sync();
  renderSettings();
  settingsEl.hidden = false;
  el('setClose').focus();
}
function closeSettings() { settingsEl.hidden = true; el('settingsBtn').focus(); }
el('settingsBtn').addEventListener('click', openSettings);
el('setClose').addEventListener('click', closeSettings);
el('setBackdrop').addEventListener('click', closeSettings);
renderSettings();

// ── a quiet way to meet a different world ────────────────────
el('shiftBtn').addEventListener('click', () => {
  store.setPref('shift', ((store.prefs.shift | 0) + 1) % DESIGNS.length);
  scene.completedAt = 0;
  tick();
  if (current) playCue(current.design.sound.start);
});

// exposed for the smoke tests
window.__app = { scene, control, tick, DESIGNS, store };
window.__sched = { scheduleFor, wallClock, dayNumOf, resolve, effectiveNow, isPaused, pausedSec, nightKey, startOffsetMin };
