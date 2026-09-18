// ─────────────────────────────────────────────────────────────
// The wire.
//
// Headlines and their pictures, from the papers' own feeds by way of
// the small server function in /api/news. It is polled every few
// minutes rather than on every change of headline: the papers update
// on the order of minutes, and there is no sense asking more often
// than they publish.
//
// A picture is never shown before it has loaded, so a headline and the
// wrong photograph are never on screen together.
// ─────────────────────────────────────────────────────────────

const POLL = 180000;         // ms between refreshes of the list
const RETRY = 20000;         // ms before trying again after a failure
const RETRY_MAX = 300000;    // ms — the wait doubles up to this

export function createNews(rng) {
  const st = {
    items: [],               // as delivered, newest first
    ready: [],               // those whose picture has loaded
    seen: new Set(),
    idx: 0,
    at: 0,                   // when the list was last fetched
    blocked: 0,
    fails: 0,
    loading: 0
  };

  function preload(item) {
    if (st.loading > 3) return;
    st.loading++;
    const img = new Image();
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => { st.loading--; item.img = img; st.ready.push(item); };
    img.onerror = () => { st.loading--; };
    img.src = item.image;
  }

  async function refresh() {
    const now = Date.now();
    if (now < st.blocked || (st.at && now - st.at < POLL)) return;
    st.at = now;
    try {
      const res = await fetch('/api/news', { cache: 'no-store' });
      if (res.status === 404) {
        // The site is being served without its server function — that is a
        // standing fact, not a hiccup, so stop asking and let the screen
        // fall back to the plain bar.
        st.blocked = Date.now() + 3600000;
        return;
      }
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      st.fails = 0;
      const fresh = (data.items || []).filter((it) => it.image && it.title && !st.seen.has(it.title));
      for (const it of fresh) st.seen.add(it.title);
      // newest at the front, and the queue never grows without bound
      st.items = fresh.concat(st.items).slice(0, 80);
      for (const it of fresh.slice(0, 6)) preload(it);
    } catch {
      st.fails++;
      st.blocked = Date.now() + Math.min(RETRY_MAX, RETRY * Math.pow(2, st.fails - 1));
    }
  }

  return {
    /** Called every frame; does nothing most of the time. */
    pump() {
      refresh();
      // keep a few pictures loaded ahead of the one on screen
      if (st.ready.length < 4) {
        for (const it of st.items) {
          if (!it.img && !it.tried) { it.tried = true; preload(it); break; }
        }
      }
    },
    /** The next headline whose picture is ready, or null. */
    take() {
      if (!st.ready.length) return null;
      const it = st.ready[st.idx % st.ready.length];
      st.idx++;
      // once everything has been round once, prefer anything newly arrived
      if (st.idx >= st.ready.length && st.ready.length > 12) {
        st.ready = st.ready.slice(-12);
        st.idx = 0;
      }
      return it;
    },
    get ready() { return st.ready.length; },
    get known() { return st.items.length; }
  };
}
