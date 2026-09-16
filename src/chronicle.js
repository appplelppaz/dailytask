// ─────────────────────────────────────────────────────────────
// History as a clock.
//
// A task lasts as long as it lasts; what fills it is a real span of
// years — a railway network spreading, a periodic table filling, five
// centuries of emperors going past. The year you are looking at IS the
// progress bar, and because the whole of it is drawn faintly from the
// first moment, you can always see how much is left.
//
// Two rules make it readable and keep it moving:
//
//   The ghost. Everything that will ever exist is drawn first, unlit.
//   What has happened is lit. The gap between them is the time left.
//
//   Even events, not even years. Progress maps to the list of events,
//   not to the calendar, so something always happens within the next
//   half minute or so. The year then runs fast through quiet centuries
//   and slows where history is dense — which is itself worth seeing.
//
// The camera frames what is happening: it opens tight on the first
// event and pulls back as the subject grows, and punches in for a
// moment whenever something new lands.
// ─────────────────────────────────────────────────────────────

import { clamp, lerp, css, TAU, makeRng } from './util.js';
import { TOPICS } from './chronicle/index.js';

const HOLD = 0.34;          // of each event's slot spent on the event itself

/* ── time ────────────────────────────────────────────────────── */

/**
 * Progress across the event list, so every event gets the same share of
 * the task. Returns the year on the clock, which event is current, and
 * how far into that event's slot we are.
 */
export function readClock(events, p) {
  const n = events.length;
  const u = clamp(p) * (n - 1);
  const i = Math.min(n - 2, Math.floor(u));
  const f = n < 2 ? 0 : u - i;
  const a = events[i], b = events[Math.min(n - 1, i + 1)];
  // hold on the event, then travel to the next one
  const travel = clamp((f - HOLD) / (1 - HOLD));
  return {
    index: i,
    since: f,                                   // 0..1 through this slot
    fresh: clamp(1 - f / HOLD),                 // 1 at the moment it lands
    travel,                                     // 0 on the event, 1 at the next
    year: lerp(a.t, b.t, travel),
    event: p >= 0.9995 ? b : a,
    next: b
  };
}

/* ── camera ──────────────────────────────────────────────────── */

/**
 * Frame a box into the stage — the part of the screen below the year and
 * the caption. `cy` is where the middle of the box should land, as a
 * fraction of the height.
 */
export function fitTo(box, w, h, padX = 0.88, padY = 0.58, cy = 0.605) {
  const bw = Math.max(1e-4, box.w), bh = Math.max(1e-4, box.h);
  const S = Math.min((w * padX) / bw, (h * padY) / bh);
  return { x: box.x + bw / 2, y: box.y + bh / 2 + (h / 2 - h * cy) / S, S };
}

export function growBox(box, x, y, pad = 0) {
  if (!box) return { x: x - pad, y: y - pad, w: pad * 2, h: pad * 2 };
  const x0 = Math.min(box.x, x - pad), y0 = Math.min(box.y, y - pad);
  const x1 = Math.max(box.x + box.w, x + pad), y1 = Math.max(box.y + box.h, y + pad);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/* ── the engine ──────────────────────────────────────────────── */

export const chronicle = {
  init(env) {
    return { cam: null, cache: new Map(), rng: makeRng(0x51f7) };
  },

  draw(env) {
    const { ctx, w, h, p, prm, st, time, reduced } = env;
    const topic = TOPICS[prm.topic];
    if (!topic) return;

    const events = st.cache.get('events') || (() => {
      const e = topic.events(env);
      st.cache.set('events', e);
      return e;
    })();

    const clock = readClock(events, p);
    const pal = topic.palette;

    const g = {
      ctx, w, h, p, time, reduced, prm,
      year: clock.year, index: clock.index, since: clock.since, fresh: clock.fresh,
      travel: clock.travel, event: clock.event, next: clock.next, events, pal,
      cache: (key, make) => {
        if (!st.cache.has(key)) st.cache.set(key, make());
        return st.cache.get(key);
      },
      /** Has this year already gone by? */
      seen: (t) => clock.year >= t,
      /** 0..1 how recently this year went by — for the flash on arrival. */
      justNow: (t, span = 6) => clamp(1 - (clock.year - t) / span) * (clock.year >= t ? 1 : 0),
      /** Screen pixels, whatever the camera is doing. */
      px: (n) => n / (st.cam ? st.cam.S : 1)
    };

    // the camera goes where the subject is
    const want = topic.focus(g);
    if (!st.cam) st.cam = { ...want };
    else {
      const k = reduced ? 1 : 1 - Math.pow(0.0016, Math.min(0.1, 1 / 30));
      st.cam.x = lerp(st.cam.x, want.x, k);
      st.cam.y = lerp(st.cam.y, want.y, k);
      st.cam.S = lerp(st.cam.S, want.S, k);
    }

    ctx.fillStyle = css(pal.bg);
    ctx.fillRect(0, 0, w, h);
    if (topic.backdrop) topic.backdrop(g);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(st.cam.S, st.cam.S);
    ctx.translate(-st.cam.x, -st.cam.y);
    g.cam = st.cam;
    topic.draw(g);
    ctx.restore();

    // Lettering is laid over the picture rather than inside the camera:
    // type wants to be a fixed size on the screen, and labels can only be
    // kept from colliding once you know where they land in pixels.
    if (topic.overlay) {
      g.screen = (x, y) => ({
        x: (x - st.cam.x) * st.cam.S + w / 2,
        y: (y - st.cam.y) * st.cam.S + h / 2
      });
      topic.overlay(g);
    }

    chrome(g, topic, clock, p);
  },

  anchors(env) {
    const { w, h } = env;
    // the mark is left in the lower margin, clear of the picture
    const x0 = w * 0.30, y0 = h * 0.86, path = [];
    for (let i = 0; i <= 7; i++) {
      const u = i / 7;
      path.push({ x: x0 + u * w * 0.40, y: y0 + Math.sin(u * Math.PI * 2) * h * 0.012 });
    }
    return { head: path[0], rest: path[path.length - 1], path };
  }
};

/**
 * The year, what just happened, and a strip showing where in the whole
 * span we are. This is the only text on the screen.
 */
function chrome(g, topic, clock, p) {
  const { ctx, w, h, pal } = g;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // One notch per event, evenly spaced — so what the strip shows is how
  // many things are left to happen, which is what you actually want to
  // know. Lit notches are behind you.
  const n = g.events.length;
  const bx = w * 0.08, bw = w * 0.84, by = h * 0.085;
  const step = bw / Math.max(1, n - 1);
  const thin = step < 3.2;
  ctx.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    if (thin && i % 2) continue;
    const x = bx + step * i, on = i <= clock.index;
    ctx.strokeStyle = css(pal.ink, on ? 0.58 : 0.17);
    ctx.beginPath();
    ctx.moveTo(x, by - (on ? 4.5 : 3)); ctx.lineTo(x, by + (on ? 4.5 : 3));
    ctx.stroke();
  }
  ctx.fillStyle = css(pal.ink, 0.92);
  ctx.beginPath(); ctx.arc(bx + bw * clamp(p), by, 3.6, 0, TAU); ctx.fill();

  // the year
  const yr = Math.round(g.year);
  const label = topic.stamp ? topic.stamp(yr) : String(yr);
  ctx.font = `300 ${Math.round(Math.min(w, h) * 0.115)}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.fillStyle = css(pal.ink, 0.92);
  ctx.fillText(label, bx, by + Math.min(w, h) * 0.135);

  // What just happened. It fades as the clock leaves it behind, so the
  // year on the screen and the words under it never disagree.
  const e = clock.event;
  if (e && e.label) {
    const a = clamp(1 - clock.travel * 1.5);
    if (a > 0.02) {
      ctx.font = `400 ${Math.round(Math.min(w, h) * 0.036)}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = css(pal.ink, 0.28 + a * 0.62);
      wrap(ctx, e.label, bx, by + Math.min(w, h) * 0.20, bw, Math.min(w, h) * 0.05);
    }
  }
  ctx.restore();
}

function wrap(ctx, text, x, y, maxW, lh) {
  const words = String(text).split(/(?<=[\s、。])/);
  let line = '', ly = y;
  for (const wd of words) {
    if (ctx.measureText(line + wd).width > maxW && line) { ctx.fillText(line, x, ly); line = wd; ly += lh; }
    else line += wd;
  }
  if (line) ctx.fillText(line, x, ly);
}

/* ── drawing kit the topics share ────────────────────────────── */

/** A polyline in world coordinates. */
export function path(ctx, pts, from = 0, to = 1) {
  const n = pts.length - 1;
  const a = Math.max(0, from * n), b = Math.min(n, to * n);
  if (b <= a) return false;
  ctx.beginPath();
  const at = (u) => {
    const i = Math.min(n - 1, Math.floor(u)), f = u - i;
    return { x: lerp(pts[i].x, pts[i + 1].x, f), y: lerp(pts[i].y, pts[i + 1].y, f) };
  };
  const s = at(a);
  ctx.moveTo(s.x, s.y);
  for (let i = Math.ceil(a); i <= Math.floor(b); i++) ctx.lineTo(pts[i].x, pts[i].y);
  const e = at(b);
  ctx.lineTo(e.x, e.y);
  return true;
}

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
