// ─────────────────────────────────────────────────────────────
// Persistence: which tasks were marked complete (and with which
// world), plus preferences and one-shot sound-cue bookkeeping.
// ─────────────────────────────────────────────────────────────

const KEY = 'night-routine.v2';

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }
  catch { return {}; }
}

let data = read();
if (!data.logs) data.logs = {};      // { 'YYYY-MM-DD': { TASK: { design, at } } }
if (!data.cues) data.cues = {};      // { '<sessionId>': { start: 1, last: 1 } }
if (!data.prefs) data.prefs = { sound: true, volume: 0.8, shift: 0, startOffset: 0, startOffsetDay: null, pause: null };

function write() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* private mode */ }
}

export const store = {
  get logs() { return data.logs; },
  get prefs() { return data.prefs; },

  sync() { data = { ...read(), ...{} }; if (!data.logs) data.logs = {}; if (!data.cues) data.cues = {}; if (!data.prefs) data.prefs = { sound: true, volume: 0.8, shift: 0, startOffset: 0, startOffsetDay: null, pause: null }; },

  isComplete(day, task) { return !!(data.logs[day] && data.logs[day][task]); },
  entry(day, task) { return (data.logs[day] || {})[task] || null; },

  complete(day, task, designId) {
    if (!data.logs[day]) data.logs[day] = {};
    if (data.logs[day][task]) return false;        // never double-record
    data.logs[day][task] = { design: designId, at: Date.now() };
    write();
    return true;
  },

  // One-shot guards. A cue fires at most once per taskSessionId, and a
  // page reopened mid-task marks the cue as spent instead of replaying it.
  cueFired(sessionId, kind) { return !!(data.cues[sessionId] && data.cues[sessionId][kind]); },
  markCue(sessionId, kind) {
    if (!data.cues[sessionId]) data.cues[sessionId] = {};
    data.cues[sessionId][kind] = 1;
    const keys = Object.keys(data.cues);
    if (keys.length > 60) delete data.cues[keys[0]];   // keep it small
    write();
  },

  setPref(k, v) { data.prefs[k] = v; write(); },
};
