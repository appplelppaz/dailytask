// ─────────────────────────────────────────────────────────────
// The pictures.
//
// Photographs posted by people, pulled at random while the task runs
// and changed every few seconds. The source is Lorem Picsum, which
// serves photographs from Unsplash: no API key, no sign-in, and a
// curated pool — which matters, because this is on a screen in a room
// at eleven at night and nothing unexpected should appear on it.
//
// Two things are handled carefully here. The first is data: a new photo
// every three seconds is a great many photos over a two-hour session,
// so after a while it stops asking for new ones and revisits the ones
// it has already seen, which the browser serves from its own cache. The
// second is failure: if the network is gone, nothing throws and nothing
// blocks — the screen simply stays dark, and the routine goes on.
// ─────────────────────────────────────────────────────────────

const QUEUE = 4;         // photos held ready, waiting their turn
const FRESH = 900;       // new photos per session before it starts revisiting
const RETRY = 4000;      // ms to wait after the first failure
const RETRY_MAX = 60000; // ms — the wait doubles up to this while it keeps failing

export function createPhotos(tag, rng) {
  const st = {
    tag, rng,
    queue: [],           // loaded, not yet shown
    loading: 0,
    asked: 0,            // how many distinct photos have been requested
    seen: [],            // seeds already fetched, for revisiting
    blocked: 0,          // timestamp to wait until, after an error
    fails: 0             // consecutive failures, for backing off
  };

  function url(seed, w, h) {
    return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`;
  }

  /** Ask for one more photo. */
  function fetchOne(w, h) {
    const fresh = st.asked < FRESH || !st.seen.length;
    const seed = fresh ? `${st.tag}-${st.asked}` : st.seen[Math.floor(st.rng() * st.seen.length)];
    if (fresh) st.asked++;
    st.loading++;
    const img = new Image();
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      st.loading--;
      st.fails = 0;
      if (fresh) st.seen.push(seed);
      if (st.queue.length < QUEUE) st.queue.push(img);
    };
    img.onerror = () => {
      st.loading--;
      // the network is away: back off, doubling the wait, so a phone with
      // no signal is not asking four times a minute all evening
      st.fails++;
      st.blocked = Date.now() + Math.min(RETRY_MAX, RETRY * Math.pow(2, st.fails - 1));
    };
    img.src = url(seed, w, h);
  }

  return {
    /**
     * Keep a few photos ready. Because one is taken every few seconds and
     * only the shortfall is requested, this settles at one fetch per
     * change of picture rather than one per frame.
     */
    pump(w, h) {
      if (Date.now() < st.blocked) return;
      while (st.queue.length + st.loading < QUEUE) fetchOne(w, h);
    },
    /** The next photo to show, or null if none has arrived yet. */
    take() {
      return st.queue.length ? st.queue.shift() : null;
    },
    get ready() { return st.queue.length; },
    get fetched() { return st.asked; }
  };
}

/** Cover-fit: fill the frame, crop the overflow, never distort. */
export function cover(ctx, img, w, h, scale = 1) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return false;
  const s = Math.max(w / iw, h / ih) * scale;
  const dw = iw * s, dh = ih * s;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return true;
}
