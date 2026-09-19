// ─────────────────────────────────────────────────────────────
// What has already been read.
//
// The papers publish the same headline for a day or two, so an evening
// that only ever looked at what is on the wire tonight would open on
// the same stories it closed with yesterday. This remembers the ones
// that have been on screen and hands them to the back of the queue
// instead — for a month, after which a story is old enough to have
// been forgotten anyway.
//
// Only the memory is kept, never the articles: a few bytes a headline,
// so a month of five-hour evenings is well within what a browser will
// hold. The papers still keep the articles themselves.
//
// Nothing here is allowed to fail loudly. A browser with storage
// turned off simply has no memory of last night, which is exactly how
// the screen behaved before this existed.
// ─────────────────────────────────────────────────────────────

const KEY = 'night-routine.seen.v1';
const DAYS = 30;             // how long a headline is remembered
const FLUSH = 120000;        // ms between writes to storage
const MOST = 70000;          // headlines remembered at most — a month of long evenings
const DAY = 86400000;

const today = () => Math.floor(Date.now() / DAY);

/** A short, stable id for a headline. FNV-1a, in base 36. */
export function idOf(title) {
  let h = 0x811c9dc5;
  for (let i = 0; i < title.length; i++) {
    h ^= title.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36);
}

export function createMemory() {
  let seen = Object.create(null);     // id → the day it was last shown
  let dirty = false;
  let wrote = 0;

  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const kept = JSON.parse(raw);
      const cut = today() - DAYS;
      for (const id in kept) if (kept[id] > cut) seen[id] = kept[id];
      if (Object.keys(seen).length !== Object.keys(kept).length) dirty = true;
    }
  } catch {
    seen = Object.create(null);       // unreadable, or storage refused: start fresh
  }

  // Writing is done rarely and never per headline: the whole memory is
  // one string in storage, and rewriting it is a few milliseconds that
  // the screen would otherwise spend drawing. Two minutes' worth is a
  // dozen headlines, and it is written in full whenever the phone is
  // put down, so nothing that matters is lost.
  function flush(force) {
    if (!dirty) return;
    const now = Date.now();
    if (!force && now - wrote < FLUSH) return;
    wrote = now;
    dirty = false;
    const ids = Object.keys(seen);
    if (ids.length > MOST) {
      ids.sort((a, b) => seen[a] - seen[b]);
      for (const id of ids.slice(0, ids.length - MOST)) delete seen[id];
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(seen));
    } catch {
      // Out of room. A month is more than is needed; keep a week and
      // try once more, and if that fails carry on without a memory.
      const cut = today() - 7;
      for (const id in seen) if (seen[id] <= cut) delete seen[id];
      try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch { /* no memory tonight */ }
    }
  }

  if (typeof addEventListener === 'function') {
    addEventListener('pagehide', () => flush(true));
    addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });
  }

  return {
    /** Days since this headline was last on screen; Infinity if never. */
    age(title) {
      const day = seen[idOf(title)];
      return day === undefined ? Infinity : today() - day;
    },
    /** Note that it has just been shown. */
    mark(title) {
      seen[idOf(title)] = today();
      dirty = true;
      flush(false);
    },
    get size() { return Object.keys(seen).length; },
    flush: () => flush(true)
  };
}
