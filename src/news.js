// ─────────────────────────────────────────────────────────────
// The wire.
//
// A five-hour routine has room for about eighteen hundred headlines, so
// this keeps a queue of hundreds rather than a handful, works through
// it in order and never shows the same one twice until the queue is
// exhausted. New headlines arriving from a later poll go to the front,
// because what has just happened is worth more than what happened an
// hour ago.
//
// What has been on screen before is remembered between evenings, so a
// night opens on what the papers have published since rather than on
// the stories it closed with. Roughly half the wire turns over in a
// day; the half that has not is not thrown away but sent to the back
// of the queue, oldest memory first, so the screen never runs out.
//
// Japanese is fetched thirty headlines ahead of where the screen is,
// in batches — translating the whole queue up front would spend a
// month of free translation quota in a single evening, and most of it
// on headlines nobody would reach, while translating one at a time
// would be a request every ten seconds all evening.
// ─────────────────────────────────────────────────────────────

import { createMemory } from './memory.js';

const POLL = 240000;         // ms between refreshes of the list
const RETRY = 20000;         // ms before trying again after a failure
const RETRY_MAX = 300000;    // ms — the wait doubles up to this
const LOOKAHEAD = 30;        // headlines translated ahead of the one on screen
const BATCH_MIN = 12;        // texts worth waiting for before asking
const GIVE_UP = 2;           // attempts at one text before letting it stand untranslated
const REACH = 120;           // headlines brought back from the spare list at a time
const KEEP = 2600;           // headlines held in the queue — five hours is 1,800
const LOW = 150;             // when fewer than this are left, fetch the next page
const AT_ONCE = 4;           // pictures being fetched at any one time
const STUCK = 15000;         // ms after which a picture is presumed lost
const WAIT = 2500;           // ms the screen waits for a picture before going without

export function createNews() {
  const memory = createMemory();
  const st = {
    queue: [],               // not seen on any earlier evening, in the order it will be shown
    spare: [],               // seen before: kept back, and used only if the queue runs out
    at: 0,                   // how far through the queue the screen has got
    seen: new Set(),         // titles, so a headline is never queued twice
    fetched: 0,              // when the list was last pulled
    next: 0,                 // the offset of the next page to ask for
    total: 0,                // how many the server has in all
    paging: false,
    blocked: 0,
    fails: 0,
    asking: false,           // a translation request is in flight
    jaBlocked: 0,            // when the translator may be asked again
    jaFails: 0,
    via: ''
  };

  const flight = new Set();  // items whose picture is on its way

  function inFlight() {
    const now = Date.now();
    for (const it of flight) if (now - it.began > STUCK) flight.delete(it);
    return flight.size;
  }

  // A picture is fetched a little ahead of the screen. Only a few at a
  // time, so a slow paper cannot hold up the rest; an image that never
  // answers ages out of that budget instead of jamming it shut.
  function preload(item) {
    if (!item.image || item.img !== undefined || item.tried) return;
    if (inFlight() >= AT_ONCE) return;
    item.tried = true;
    item.began = Date.now();
    flight.add(item);
    const img = new Image();
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => { flight.delete(item); item.img = img; };
    img.onerror = () => { flight.delete(item); item.img = null; };
    img.src = item.image;
  }

  async function load(offset) {
    const res = await fetch(`/api/news?offset=${offset}`, { cache: 'no-store' });
    if (res.status === 404) { st.blocked = Date.now() + 3600000; return 0; }  // no server function here
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    st.fails = 0;
    st.via = data.via || st.via;
    st.total = data.total || st.total;
    const fresh = (data.items || []).filter((it) => it.title && !st.seen.has(it.title));
    const New = [];
    for (const it of fresh) {
      st.seen.add(it.title);
      const days = memory.age(it.title);
      if (days === Infinity) New.push(it);
      else { it.days = days; st.spare.push(it); }   // read on an earlier evening
    }
    if (offset) st.queue.push(...New);            // a later page goes on the end
    else st.queue.splice(st.at, 0, ...New);       // what has just happened goes next
    if (st.queue.length > KEEP) st.at -= st.queue.splice(0, st.queue.length - KEEP).length;
    if (st.at < 0) st.at = 0;
    return (data.items || []).length;
  }

  async function refresh() {
    const now = Date.now();
    if (now < st.blocked) return;
    // the front page again, for whatever the papers have put out since
    if (!st.fetched || now - st.fetched >= POLL) {
      st.fetched = now;
      try {
        const n = await load(0);
        if (n && !st.next) st.next = n;
      } catch {
        st.fails++;
        st.blocked = Date.now() + Math.min(RETRY_MAX, RETRY * Math.pow(2, st.fails - 1));
      }
      return;
    }
    // running low, and the server has more: take the next page
    if (!st.paging && st.next && st.next < st.total && st.queue.length - st.at < LOW) {
      st.paging = true;
      try {
        const n = await load(st.next);
        st.next += n || 0;
      } catch {
        /* the next poll will try again */
      } finally {
        st.paging = false;
      }
    }
  }

  /** Ask for the Japanese of the next few, in one request. */
  async function askJapanese() {
    if (st.asking || Date.now() < st.jaBlocked) return;
    const texts = [];
    const window = st.queue.slice(st.at, st.at + LOOKAHEAD);
    for (const it of window) {
      if (wants(it, 'ja')) texts.push({ text: it.title, lang: it.lang });
      if (it.body && wants(it, 'bodyJa')) texts.push({ text: it.body, lang: it.lang });
    }
    if (!texts.length) return;
    // One request for sixty texts costs no more than one for two, so
    // wait for a decent batch — unless what is about to go on screen is
    // still untranslated, headline or summary, in which case it goes now.
    const next = window[0];
    const soon = next && (wants(next, 'ja') || (next.body && wants(next, 'bodyJa')));
    if (texts.length < BATCH_MIN && !soon) return;
    st.asking = true;
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: texts.slice(0, 60) })
      });
      // No translator here at all: the site is running without its
      // server functions. Stop asking for an hour.
      if (res.status === 404 || res.status === 405 || res.status === 501) {
        st.jaBlocked = Date.now() + 3600000;
        return;
      }
      if (!res.ok) throw new Error(res.status);
      const { ja, via } = await res.json();
      st.jaFails = 0;
      if (via) st.via = via;
      for (const it of window) {
        if (wants(it, 'ja')) got(it, 'ja', ja[it.title]);
        if (it.body && wants(it, 'bodyJa')) got(it, 'bodyJa', ja[it.body]);
      }
    } catch {
      // Something went wrong on the way. Back off rather than ask again
      // on the next frame; the headline reads perfectly well in its own
      // language in the meantime.
      st.jaFails++;
      st.jaBlocked = Date.now() + Math.min(RETRY_MAX, RETRY * Math.pow(2, st.jaFails - 1));
    } finally {
      st.asking = false;
    }
  }

  /**
   * Whether a field is still worth asking for. Some headlines simply
   * cannot be translated — a name on its own, a service that has
   * nothing for that language — and asking again every frame for the
   * one at the front of the queue would be a request every frame.
   */
  function wants(item, field) {
    return !item[field] && !((item.missed && item.missed[field]) >= GIVE_UP);
  }

  function got(item, field, value) {
    if (value) { item[field] = value; return; }
    if (!item.missed) item.missed = {};
    item.missed[field] = (item.missed[field] || 0) + 1;
  }

  /**
   * Nothing unread is left. Take the headlines read longest ago — a
   * month-old story is closer to new than one from last night — and
   * put them back in the queue.
   */
  function reach() {
    if (!st.spare.length) return false;
    st.spare.sort((a, b) => b.days - a.days);
    st.queue.push(...st.spare.splice(0, REACH));
    return true;
  }

  return {
    /** Called every frame; nearly always does nothing. */
    pump() {
      refresh();
      askJapanese();
      for (const it of st.queue.slice(st.at, st.at + 4)) preload(it);
    },
    /**
     * The next headline. Waits for its picture if it is still coming,
     * but not for its translation — the original is enough to be going
     * on with, and the Japanese usually arrives before the change.
     */
    take() {
      const now = Date.now();
      for (let n = 0; n < 8; n++) {
        const it = st.queue[st.at];
        if (!it) {
          if (reach()) continue;              // nothing new left: bring back the oldest read
          if (!st.queue.length) return null;
          st.at = 0;                          // and only then round again
          continue;
        }
        // Its picture is still on its way. Wait a couple of seconds —
        // the caller comes back every frame, so nothing is lost — and
        // then put the headline up without it. The wait is counted from
        // the moment the screen asked for it, not from the moment the
        // fetch started, or a busy loader could hold a headline back
        // for ever.
        if (it.image && it.img === undefined) {
          if (!it.since) it.since = now;
          preload(it);
          if (now - it.since < WAIT) return null;
          it.img = null;
        }
        st.at++;
        memory.mark(it.title);  // not to be shown again for a month
        return it;              // if its picture never arrived, the headline still stands
      }
      return null;
    },
    get ready() { return st.queue.length - st.at + st.spare.length; },
    get unread() { return st.queue.length - st.at; },
    get remembered() { return memory.size; },
    get known() { return st.queue.length; },
    get total() { return st.total; },
    get via() { return st.via; }
  };
}
