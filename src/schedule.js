// ─────────────────────────────────────────────────────────────
// The routine itself. Times are JST wall-clock, taken from the real
// system clock, and a session started before midnight keeps running
// past it.
// ─────────────────────────────────────────────────────────────

import { store } from './store.js';

/** How far the whole routine may be nudged, in minutes. */
export const OFFSET_MIN = -60;
export const OFFSET_MAX = 120;
export const OFFSET_STEP = 10;

/** The nudge, in seconds — set in Settings, applied to every night. */
export function startOffsetSec() {
  const m = Math.round((store.prefs.startOffset | 0) / OFFSET_STEP) * OFFSET_STEP;
  return Math.max(OFFSET_MIN, Math.min(OFFSET_MAX, m)) * 60;
}

export const TASKS = [
  { key: 'PIANO',   min: 120 },
  { key: 'ENGLISH', min: 30  },
  { key: 'CHINESE', min: 30  },
  { key: 'SPANISH', min: 30  },
  { key: 'FRENCH',  min: 30  },
  { key: 'WORKOUT', min: 60  }
];

const WEEKDAY_START = 19 * 3600 + 30 * 60;   // 19:30
const WEEKEND_START = 20 * 3600;             // 20:00

let dtf = null;
try {
  dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
} catch { dtf = null; }

export function wallClock() {
  const d = new Date();
  if (!dtf) {
    return { y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate(),
             h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds() };
  }
  const p = {};
  for (const part of dtf.formatToParts(d)) p[part.type] = part.value;
  let h = parseInt(p.hour, 10); if (h === 24) h = 0;
  return { y: +p.year, mo: +p.month, d: +p.day, h, mi: +p.minute, s: +p.second };
}

export const dayNumOf = (y, mo, d) => Math.round(Date.UTC(y, mo - 1, d) / 86400000);
export const dateKey = (dn) => new Date(dn * 86400000).toISOString().slice(0, 10);

export function absNow() {
  const w = wallClock();
  return dayNumOf(w.y, w.mo, w.d) * 86400 + w.h * 3600 + w.mi * 60 + w.s + (Date.now() % 1000) / 1000;
}

/** Wall-clock seconds at which a given day's routine begins. */
export function startSecondsFor(weekend) {
  return (weekend ? WEEKEND_START : WEEKDAY_START) + startOffsetSec();
}

export function scheduleFor(dn) {
  const dow = new Date(dn * 86400000).getUTCDay();
  const weekend = dow === 0 || dow === 6;
  let cursor = dn * 86400 + (weekend ? WEEKEND_START : WEEKDAY_START) + startOffsetSec();
  const tasks = TASKS.map((t, index) => {
    const dur = t.min * 60;
    const item = { key: t.key, index, dur, start: cursor, end: cursor + dur };
    cursor += dur;
    return item;
  });
  return { dayNum: dn, key: dateKey(dn), weekend, tasks, start: tasks[0].start, end: cursor };
}

export function resolve(now = absNow()) {
  const w = wallClock();
  const today = dayNumOf(w.y, w.mo, w.d);
  for (let dn = today - 1; dn <= today; dn++) {
    const sch = scheduleFor(dn);
    if (now >= sch.start && now < sch.end) {
      const task = sch.tasks.find((t) => now >= t.start && now < t.end);
      if (task) return { mode: 'active', sch, task, progress: (now - task.start) / task.dur };
    }
  }
  for (let dn = today; dn <= today + 1; dn++) {
    const sch = scheduleFor(dn);
    if (now < sch.start) return { mode: 'dormant', sch, task: sch.tasks[0], progress: 0 };
  }
  const sch = scheduleFor(today + 1);
  return { mode: 'dormant', sch, task: sch.tasks[0], progress: 0 };
}
