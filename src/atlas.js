// ─────────────────────────────────────────────────────────────
// A country, and what happened in it.
//
// A country is drawn at random when a task begins, and its history runs
// from beginning to end while the task lasts: every event lands on the
// spot where it happened, with the name of the place and an account of
// what it was and what it changed. The camera leans towards each event
// and pulls back square to travel to the next, so the whole country
// stays on screen — knowing where in the country you are looking is the
// reason for using a map at all.
//
// Events abroad — the wars, the missions, the invasions — are placed
// where they actually happened whenever that is close enough to show on
// the same map. The camera widens to take them in, which is itself worth
// seeing: you watch a country reach outside itself and come back.
//
// There are no numbers counting down here. The time left shows as the
// history left: the timeline at the foot of the screen fills up, and the
// country ends when the task does.
// ─────────────────────────────────────────────────────────────

import { clamp, lerp, css, TAU } from './util.js';
import { CATALOG } from './atlas/index.js';

const CHAPTER_SEC = 1800;    // about how long one country should get
const HOLD = 0.42;           // of an event's slot spent sitting on it
const FADE = 0.012;          // of a chapter spent changing country
const RAD = Math.PI / 180;

/* ── the country ─────────────────────────────────────────────── */

/**
 * Rings come off disk as flat lon/lat arrays. Project them once, with a
 * cosine correction at the country's own latitude, so a map of Norway is
 * not four times too wide.
 */
function build(country) {
  const s = country.shape;
  let y0 = 1e9, y1 = -1e9;
  for (const r of s.r) for (let i = 1; i < r.length; i += 2) {
    y0 = Math.min(y0, r[i]); y1 = Math.max(y1, r[i]);
  }
  const k = Math.cos(((y0 + y1) / 2) * RAD);
  const proj = (r) => {
    const out = new Float64Array(r.length);
    for (let i = 0; i < r.length; i += 2) { out[i] = r[i] * k; out[i + 1] = -r[i + 1]; }
    return out;
  };
  const land = s.r.map(proj), near = s.k.map(proj);
  let x0 = 1e9, x1 = -1e9, ty0 = 1e9, ty1 = -1e9;
  for (const r of land) for (let i = 0; i < r.length; i += 2) {
    x0 = Math.min(x0, r[i]); x1 = Math.max(x1, r[i]);
    ty0 = Math.min(ty0, r[i + 1]); ty1 = Math.max(ty1, r[i + 1]);
  }
  const raw = country.events.map((e) => ({ ...e, x: e.lon * k, y: -e.lat }));
  const box = { x: x0, y: ty0, w: x1 - x0, h: ty1 - ty0 };
  const events = raw.map((e) => {
    const p = hold(box, e.x, e.y);
    return { ...e, x: p.x, y: p.y, off: p.off };
  });
  return { country, land, near, events, box };
}

/** Where the clock is, across one country's events. */
function readClock(events, p) {
  const n = events.length;
  const u = clamp(p) * (n - 1);
  const i = Math.min(n - 2, Math.floor(u));
  const f = n < 2 ? 0 : u - i;
  const travel = clamp((f - HOLD) / (1 - HOLD));
  return {
    index: i, fresh: clamp(1 - f / HOLD), travel,
    event: p >= 0.9995 ? events[n - 1] : events[i],
    next: events[Math.min(n - 1, i + 1)]
  };
}

/** Fit a box into a band of the screen. */
function frame(box, w, h, top, bottom) {
  const bh = (bottom - top) * h;
  const S = Math.min((w * 0.80) / Math.max(1e-6, box.w), (bh * 0.84) / Math.max(1e-6, box.h));
  return { x: box.x + box.w / 2, y: box.y + box.h / 2, S, cy: (top + bottom) / 2 * h };
}

// How far outside itself a country will follow an event before it stops:
// far enough for a war next door, not far enough for Pearl Harbor.
const LIMIT = 0.45;

/** Pull a point in to where the map still has something to show. */
function hold(box, x, y) {
  const mx = box.w * LIMIT, my = box.h * LIMIT;
  const cx = clamp(x, box.x - mx, box.x + box.w + mx);
  const cy = clamp(y, box.y - my, box.y + box.h + my);
  return { x: cx, y: cy, off: cx !== x || cy !== y };
}

/** The country's box, widened to take in a place outside it. */
function reach(box, x, y) {
  const x0 = Math.min(box.x, x), x1 = Math.max(box.x + box.w, x);
  const y0 = Math.min(box.y, y), y1 = Math.max(box.y + box.h, y);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

const yearOf = (t) => (t <= -100000 ? `${Math.round(-t / 10000) / 100}百万年前`
  : t < 0 ? `前${-t}` : String(t));

/* ── the engine ──────────────────────────────────────────────── */

export const atlas = {
  ownPaused: true,

  init(env) {
    // A seeded shuffle: the same night and task always draws the same
    // countries in the same order, so a reload does not start over.
    const order = CATALOG.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(env.rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return { order, built: new Map(), loading: new Set(), cam: null, was: -1, said: '' };
  },

  /** Load a country's history and map, once. */
  fetch(st, entry) {
    if (st.built.has(entry.code) || st.loading.has(entry.code)) return;
    st.loading.add(entry.code);
    entry.load().then((c) => st.built.set(entry.code, build(c)))
      .catch(() => st.loading.delete(entry.code));
  },

  draw(env) {
    const { ctx, w, h, st, clock, reduced, time } = env;
    if (!clock) return;
    const U = Math.min(w, h);
    const ink = [212, 12, 92];
    const dim = [212, 14, 30];
    const sea = [214, 26, 8];
    const soil = [38, 16, 27];        // the country: warm, like paper
    const coast = [40, 34, 66];
    const other = [212, 10, 15];      // its neighbours: land, but not the subject
    const col = clock.color;
    const F = (weight, px, mono) =>
      `${weight} ${Math.round(px)}px ${mono ? '"JetBrains Mono", ui-monospace, monospace'
                                            : 'Inter, system-ui, "Hiragino Sans", sans-serif'}`;

    // ── which country, and how far into it ──
    // Each country gets the whole of its history told, so the chapters
    // divide the task evenly rather than by how much there is to say.
    const chapters = clamp(Math.round((clock.durSec || 1800) / CHAPTER_SEC), 1, st.order.length);
    const pp = clamp(clock.progress, 0, 0.999999);
    const ci = Math.min(chapters - 1, Math.floor(pp * chapters));
    const q = clamp(pp * chapters - ci);
    const country = st.order[ci % st.order.length];
    const m = st.built.get(country.code);
    // the next country is fetched while this one is still being read
    this.fetch(st, country);
    if (q > 0.3) this.fetch(st, st.order[(ci + 1) % st.order.length]);
    if (st.was !== ci) { st.cam = null; st.was = ci; }
    if (!m) { waiting(ctx, w, h, U, country, clock, col, F); return; }

    const cl = readClock(m.events, q);
    const e = cl.event, nx = cl.next;

    // ── the camera ──
    const row1 = Math.max(h * 0.050, 30);
    const row2 = Math.max(h * 0.100, 74);
    const MAP_TOP = Math.max(0.140, (row2 + U * 0.028) / h), MAP_BOT = 0.455;
    // both the country and whatever is happening outside it
    const seen = reach(reach(m.box, e.x, e.y), nx.x, nx.y);
    const wide = frame(seen, w, h, MAP_TOP, MAP_BOT);
    const out = Math.sin(clamp(cl.travel) * Math.PI);
    const intro = clamp(1 - q / 0.035);                // establish the country first
    const t = easeInOut(clamp(cl.travel));
    const cx = lerp(e.x, nx.x, t), cy = lerp(e.y, nx.y, t);
    const zoom = Math.max(out, intro);                 // 1 = the whole country, square on
    const lean = 0.34 * (1 - zoom);
    const want = {
      x: lerp(wide.x, cx, lean), y: lerp(wide.y, cy, lean),
      S: wide.S * lerp(1.16, 1, zoom),
      cy: wide.cy
    };
    if (!st.cam) st.cam = { ...want };
    else {
      const k = reduced ? 1 : 0.055;
      st.cam.x = lerp(st.cam.x, want.x, k);
      st.cam.y = lerp(st.cam.y, want.y, k);
      st.cam.S = lerp(st.cam.S, want.S, k);
      st.cam.cy = want.cy;
    }
    const cam = st.cam;
    const screen = (x, y) => ({ x: (x - cam.x) * cam.S + w / 2, y: (y - cam.y) * cam.S + cam.cy });

    // ── ground ──
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, css([214, 26, 8]));
    bg.addColorStop(1, css([220, 30, 5]));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    const wash = ctx.createRadialGradient(w / 2, h * 0.32, 0, w / 2, h * 0.32, Math.max(w, h) * 0.75);
    wash.addColorStop(0, css(col, 0.08));
    wash.addColorStop(1, css(col, 0));
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);

    // One country gives way to the next. Only between chapters: the start
    // and the end of the task are not transitions.
    const inEdge = ci > 0 ? clamp(q / FADE) : 1;
    const outEdge = ci < chapters - 1 ? clamp((1 - q) / FADE) : 1;
    const fade = clock.state === 'dormant' ? 1 : 0.22 + 0.78 * Math.min(inEdge, outEdge);

    // ── the map ──
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, h * MAP_TOP, w, h * (MAP_BOT - MAP_TOP));
    ctx.clip();
    ctx.globalAlpha = fade;
    ctx.translate(w / 2, cam.cy);
    ctx.scale(cam.S, cam.S);
    ctx.translate(-cam.x, -cam.y);
    const px = (n) => n / cam.S;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const ring = (r) => {
      ctx.beginPath();
      ctx.moveTo(r[0], r[1]);
      for (let i = 2; i < r.length; i += 2) ctx.lineTo(r[i], r[i + 1]);
      ctx.closePath();
    };

    // the countries around it, so the place is not floating in the dark.
    // No outline: these are cut to a rectangle, and a stroke would draw
    // borders where there are none.
    ctx.fillStyle = css(other, 1);
    for (const r of m.near) { ring(r); ctx.fill(); }

    // the country itself, lit against them
    for (const r of m.land) {
      ring(r);
      ctx.fillStyle = css(soil, 1);
      ctx.fill();
      ctx.strokeStyle = css(coast, 0.9);
      ctx.lineWidth = px(1.3);
      ctx.stroke();
    }

    // the line drawn on towards where the next thing happens
    if (cl.travel > 0.01 && nx !== e) {
      const mx = (e.x + nx.x) / 2, my = (e.y + nx.y) / 2 - Math.abs(nx.x - e.x) * 0.22;
      ctx.strokeStyle = css(ink, 0.30);
      ctx.lineWidth = px(1.2);
      ctx.setLineDash([px(4), px(5)]);
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.quadraticCurveTo(mx, my, lerp(e.x, nx.x, t), lerp(e.y, nx.y, t));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // everything already gone past stays on the map
    for (let i = 0; i <= cl.index; i++) {
      const ev = m.events[i];
      const age = clamp((cl.index - i) / 12);
      ctx.fillStyle = css(coast, 0.95 - age * 0.55, 16);
      ctx.beginPath(); ctx.arc(ev.x, ev.y, px(2.4), 0, TAU); ctx.fill();
    }

    // and the one being read
    const live = clamp(1 - cl.travel * 1.3);
    if (e.off) {
      // the place is beyond what this map shows; the mark sits at the edge
      ctx.globalAlpha = fade * 0.9;
      ctx.strokeStyle = css(col, 0.5, 20);
      ctx.lineWidth = px(1.4);
      ctx.setLineDash([px(3), px(4)]);
      ctx.beginPath(); ctx.arc(e.x, e.y, px(16), 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
    const pulse = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(time * 2.1);
    ctx.globalAlpha = fade * (0.3 + live * 0.7);
    ctx.fillStyle = css(col, 0.98, 26);
    ctx.beginPath(); ctx.arc(e.x, e.y, px(5), 0, TAU); ctx.fill();
    ctx.strokeStyle = css(col, 0.28 + pulse * 0.4, 20);
    ctx.lineWidth = px(1.6);
    ctx.beginPath(); ctx.arc(e.x, e.y, px(10 + pulse * 7), 0, TAU); ctx.stroke();
    if (cl.fresh > 0.02) {
      ctx.strokeStyle = css([0, 0, 100], cl.fresh * 0.5);
      ctx.lineWidth = px(2);
      ctx.beginPath(); ctx.arc(e.x, e.y, px(9 + (1 - cl.fresh) * 55), 0, TAU); ctx.stroke();
    }
    ctx.restore();

    // The land around the country is cut to a rectangle; feathering the
    // top and bottom of the band keeps that cut from reading as a coast.
    const bandTop = h * MAP_TOP, bandH = h * (MAP_BOT - MAP_TOP);
    for (const [y0, y1] of [[bandTop, bandTop + bandH * 0.12], [bandTop + bandH, bandTop + bandH * 0.88]]) {
      const g2 = ctx.createLinearGradient(0, y0, 0, y1);
      g2.addColorStop(0, css(sea, 1));
      g2.addColorStop(1, css(sea, 0));
      ctx.fillStyle = g2;
      ctx.fillRect(0, Math.min(y0, y1), w, Math.abs(y1 - y0));
    }

    // ── the name of the place, beside its mark ──
    const sp = screen(e.x, e.y);
    if (live > 0.04 && fade > 0.2 && sp.y > h * MAP_TOP + 8 && sp.y < h * MAP_BOT - 8) {
      const size = Math.max(12, U * 0.032);
      ctx.font = F(600, size);
      ctx.textBaseline = 'middle';
      const right = sp.x > w * 0.58;
      ctx.textAlign = right ? 'right' : 'left';
      const dx = right ? -16 : 16;
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = css(sea, 0.85 * live * fade);
      ctx.strokeText(e.place, sp.x + dx, sp.y);
      ctx.fillStyle = css(ink, 0.95 * live * fade);
      ctx.fillText(e.place, sp.x + dx, sp.y);
    }

    // ── which task this is ──
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
    ctx.font = F(600, U * 0.028);
    ctx.letterSpacing = '0.16em';
    ctx.fillStyle = css(col, 0.85, 14);
    ctx.fillText(clock.taskName, w * 0.08, row1);
    ctx.letterSpacing = '0px';

    // ── which country ──
    ctx.globalAlpha = fade;
    ctx.font = F(600, U * 0.056);
    ctx.fillStyle = css(ink, 0.95);
    ctx.fillText(country.ja, w * 0.08, row2);
    const nameW = ctx.measureText(country.ja).width;
    ctx.font = F(400, U * 0.025);
    ctx.letterSpacing = '0.20em';
    ctx.fillStyle = css(ink, 0.32);
    ctx.fillText(country.en, w * 0.08 + nameW + U * 0.026, row2);
    ctx.letterSpacing = '0px';
    ctx.textAlign = 'right';
    ctx.font = F(400, U * 0.024, true);
    ctx.fillStyle = css(ink, 0.26);
    ctx.fillText(chapters > 1 ? `${ci + 1}/${chapters}` : '', w * 0.92, row2);
    ctx.globalAlpha = 1;

    // ── the year, what happened, where, and what it was ──
    const T = Math.min(U, h * 0.46);
    const yearY = h * MAP_BOT + T * 0.135;
    ctx.textAlign = 'left';
    ctx.font = F(300, T * 0.082, true);
    ctx.fillStyle = css(ink, 0.9 * fade);
    ctx.fillText(yearOf(e.t), w * 0.08, yearY);

    // the place, set to the right of the year
    const yw = ctx.measureText(yearOf(e.t)).width;
    ctx.font = F(400, T * 0.030);
    ctx.fillStyle = css(ink, 0.38 * fade);
    ctx.fillText(e.place, w * 0.08 + yw + T * 0.035, yearY);

    const et = fade * (0.45 + 0.55 * clamp(1 - cl.travel * 1.6));
    ctx.globalAlpha = Math.min(1, et);
    ctx.font = F(600, T * 0.049);
    ctx.fillStyle = css(ink, 0.95);
    ctx.fillText(e.title, w * 0.08, yearY + T * 0.115);
    // the account is the point of the screen, so it gets the room
    ctx.font = F(400, T * 0.0375);
    ctx.fillStyle = css(ink, 0.68);
    wrap(ctx, e.text, w * 0.08, yearY + T * 0.215, w * 0.84, T * 0.058);
    ctx.globalAlpha = 1;

    // ── the history of this country, as a line ──
    timeline(ctx, w, h, U, m.events, cl, q, ink, dim, col, F, fade);

    // the sentence the page reads out, since a canvas says nothing
    st.said = `${country.ja}　${yearOf(e.t)}　${e.place}　${e.title}。${e.text}`;

    // ── held, and done ──
    if (clock.state === 'paused') {
      ctx.textAlign = 'center';
      const gy = h * (MAP_BOT - 0.05), s = U * 0.024;
      const label = '一時停止中　タップで再開';
      ctx.font = F(500, U * 0.034);
      const pw = ctx.measureText(label).width + s * 6.2, ph = s * 3.2;
      ctx.fillStyle = css(dim, 0.92, -2);
      ctx.beginPath(); ctx.roundRect(w / 2 - pw / 2, gy - ph / 2, pw, ph, ph / 2); ctx.fill();
      const bx0 = w / 2 - pw / 2 + s * 1.5;
      ctx.fillStyle = css(ink, 0.78);
      ctx.beginPath();
      ctx.roundRect(bx0 - s * 0.75, gy - s * 0.85, s * 0.62, s * 1.7, s * 0.2);
      ctx.roundRect(bx0 + s * 0.2, gy - s * 0.85, s * 0.62, s * 1.7, s * 0.2);
      ctx.fill();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = css(ink, 0.84);
      ctx.fillText(label, bx0 + s * 1.6, gy + 1);
      ctx.textBaseline = 'alphabetic';
    }
    if (clock.state === 'closing') {
      const veil = ctx.createRadialGradient(w / 2, h * 0.34, 0, w / 2, h * 0.34, Math.max(w, h) * 0.6);
      veil.addColorStop(0, css(sea, 0.88));
      veil.addColorStop(1, css(sea, 0.58));
      ctx.fillStyle = veil;
      ctx.fillRect(0, h * MAP_TOP, w, h * (MAP_BOT - MAP_TOP));
      ctx.textAlign = 'center';
      ctx.font = F(500, U * 0.052);
      ctx.fillStyle = css(col, 0.95, 18);
      ctx.fillText('おつかれさま', w / 2, h * 0.225);
      ctx.font = F(400, U * 0.030);
      ctx.fillStyle = css(ink, 0.45);
      ctx.fillText(clock.taskName, w / 2, h * 0.263);
    }
  },

  /** The completion mark sits in the middle of the map, which clears for it. */
  tapSpot(env) {
    const { w, h } = env;
    return { x: w / 2, y: h * 0.325, r: Math.max(30, Math.min(44, Math.min(w, h) * 0.078)) };
  },

  anchors(env) {
    const { w, h } = env;
    const y = h * 0.325, x = w / 2;
    const path = [];
    for (let i = 0; i <= 6; i++) path.push({ x: x - w * 0.16 + (i / 6) * w * 0.16, y });
    return { head: path[0], rest: { x, y }, path };
  }
};

/** The half-second before a country's history has arrived. */
function waiting(ctx, w, h, U, country, clock, col, F) {
  const ink = [212, 12, 92];
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, css([214, 26, 8]));
  bg.addColorStop(1, css([220, 30, 5]));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = F(600, U * 0.028);
  ctx.letterSpacing = '0.16em';
  ctx.fillStyle = css(col, 0.85, 14);
  ctx.fillText(clock.taskName, w * 0.08, Math.max(h * 0.050, 30));
  ctx.letterSpacing = '0px';
  ctx.font = F(600, U * 0.056);
  ctx.fillStyle = css(ink, 0.5);
  ctx.fillText(country.ja, w * 0.08, Math.max(h * 0.100, 74));
}

/**
 * One notch per event, evenly spaced, with the first and last years named.
 * It says two things at once: how far through this country's history the
 * screen is, and therefore how much of the task is left — without ever
 * putting a number on the second.
 */
function timeline(ctx, w, h, U, events, cl, q, ink, dim, col, F, fade) {
  const n = events.length;
  const x0 = w * 0.08, x1 = w * 0.92, y = h * 0.945;
  const step = (x1 - x0) / Math.max(1, n - 1);

  ctx.globalAlpha = fade;
  ctx.lineCap = 'round';
  ctx.strokeStyle = css(dim, 1, 6);
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();

  const thin = step < 4;
  for (let i = 0; i < n; i++) {
    if (thin && i % 2 && i !== cl.index) continue;
    const x = x0 + step * i, on = i <= cl.index;
    ctx.strokeStyle = on ? css(ink, 0.5) : css(ink, 0.16);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y - (on ? 5 : 3)); ctx.lineTo(x, y + (on ? 5 : 3));
    ctx.stroke();
  }
  const hx = x0 + step * (cl.index + Math.min(1, cl.travel));
  ctx.fillStyle = css(col, 1, 16);
  ctx.beginPath(); ctx.arc(hx, y, 4, 0, TAU); ctx.fill();

  ctx.font = F(400, U * 0.024, true);
  ctx.fillStyle = css(ink, 0.30);
  ctx.textAlign = 'left';
  ctx.fillText(yearOf(events[0].t), x0, y + U * 0.055);
  ctx.textAlign = 'right';
  ctx.fillText(yearOf(events[n - 1].t), x1, y + U * 0.055);
  ctx.globalAlpha = 1;
}

/** Wrap on width, character by character: Japanese has no spaces. */
function wrap(ctx, text, x, y, maxW, lh) {
  let line = '', ly = y;
  const put = () => { ctx.fillText(line, x, ly); line = ''; ly += lh; };
  for (const ch of String(text)) {
    if (ctx.measureText(line + ch).width > maxW && line && !'、。」）'.includes(ch)) put();
    line += ch;
  }
  if (line) ctx.fillText(line, x, ly);
}
