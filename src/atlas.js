// ─────────────────────────────────────────────────────────────
// A country, and what happened in it.
//
// A country is drawn at random when the task begins. Its map fills the
// screen, and the events of its history land on it one by one, each on
// the spot where it actually happened — the bay the ships came into,
// the hill the battle was fought on, the room the thing was written in.
// The camera flies from one to the next, so the shape of a country's
// history is visible as movement across its own land.
//
// A long task gets more than one country: a chapter runs about ten
// minutes, so PIANO sees a dozen and a thirty-minute task sees three.
// The time left is never hidden — the bar and the strip at the foot of
// the screen are the same ones the plain timer used.
// ─────────────────────────────────────────────────────────────

import { clamp, lerp, css, TAU } from './util.js';
import { hms } from './timer.js';
import { SHAPES } from './atlas/shapes.js';
import { COUNTRIES } from './atlas/events.js';

const CHAPTER_SEC = 600;     // about ten minutes on one country
const HOLD = 0.34;           // of an event's slot spent sitting on it
const FADE = 0.014;          // of a chapter spent changing country

const RAD = Math.PI / 180;

/* ── the country ─────────────────────────────────────────────── */

/**
 * Rings come off disk as flat lon/lat arrays. Project them once, with a
 * cosine correction at the country's own latitude, so a map of Norway is
 * not four times too wide.
 */
function build(country) {
  const s = SHAPES[country.code];
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
  const events = country.events.map(([t, lon, lat, title, note], i) => ({
    t, i, x: lon * k, y: -lat, title, note: note || ''
  }));
  return {
    country, land, near, events,
    box: { x: x0, y: ty0, w: x1 - x0, h: ty1 - ty0 },
    span: Math.max(x1 - x0, ty1 - ty0)
  };
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

/** Fit a box into a band of the screen, and say how to scale it. */
function frame(box, w, h, top, bottom) {
  const bh = (bottom - top) * h;
  const S = Math.min((w * 0.80) / Math.max(1e-6, box.w), (bh * 0.84) / Math.max(1e-6, box.h));
  return { x: box.x + box.w / 2, y: box.y + box.h / 2, S, cy: (top + bottom) / 2 * h };
}

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/* ── the engine ──────────────────────────────────────────────── */

export const atlas = {
  ownPaused: true,

  init(env) {
    // A seeded shuffle: the same night and task always draws the same
    // countries in the same order, so a reload does not start over.
    const order = COUNTRIES.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(env.rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return { order, built: new Map(), cam: null, was: -1 };
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
    const chapters = clamp(Math.round((clock.durSec || 1800) / CHAPTER_SEC), 1, st.order.length);
    const pp = clamp(clock.progress, 0, 0.999999);
    const ci = Math.min(chapters - 1, Math.floor(pp * chapters));
    const q = clamp(pp * chapters - ci);
    const country = st.order[ci % st.order.length];
    let m = st.built.get(country.code);
    if (!m) { m = build(country); st.built.set(country.code, m); }
    if (st.was !== ci) { st.cam = null; st.was = ci; }

    const cl = readClock(m.events, q);
    const e = cl.event, nx = cl.next;

    // ── the camera: in on the event, out to the whole country to travel ──
    // The whole country stays on screen the whole time — that is the
    // point of a map. Arriving at an event leans towards it and pushes in
    // a little; travelling pulls back square.
    // The corner buttons own the top right of the screen — about 64px of
    // it — so the header never rises above them, however short the window.
    const row1 = Math.max(h * 0.052, 32);
    const row2 = Math.max(h * 0.105, 78);
    const row3 = Math.max(h * 0.172, 112);
    const MAP_TOP = Math.max(0.205, (row3 + Math.min(h, w) * 0.035) / h), MAP_BOT = 0.615;
    const wide = frame(m.box, w, h, MAP_TOP, MAP_BOT);
    const out = Math.sin(clamp(cl.travel) * Math.PI);
    const intro = clamp(1 - q / 0.04);                 // establish the country first
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
    const wash = ctx.createRadialGradient(w / 2, h * 0.37, 0, w / 2, h * 0.37, Math.max(w, h) * 0.75);
    wash.addColorStop(0, css(col, 0.09));
    wash.addColorStop(1, css(col, 0));
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);

    // One country gives way to the next. Only between chapters: the start
    // and the end of the task itself are not transitions, and dimming them
    // made the last minute of a task look like a fault.
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
      const age = clamp((cl.index - i) / 10);
      ctx.fillStyle = css(coast, 0.95 - age * 0.55, 16);
      ctx.beginPath(); ctx.arc(ev.x, ev.y, px(2.4), 0, TAU); ctx.fill();
    }

    // and the one being read
    const live = clamp(1 - cl.travel * 1.3);
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

    // ── the name of the place, beside its mark ──
    const sp = screen(e.x, e.y);
    if (live > 0.04 && fade > 0.2 && sp.y > h * MAP_TOP && sp.y < h * MAP_BOT) {
      const size = Math.max(12, U * 0.034);
      ctx.font = F(600, size);
      ctx.textBaseline = 'middle';
      const right = sp.x > w * 0.58;
      ctx.textAlign = right ? 'right' : 'left';
      const dx = right ? -16 : 16;
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = css([214, 26, 8], 0.85 * live * fade);
      ctx.strokeText(e.title, sp.x + dx, sp.y);
      ctx.fillStyle = css(ink, 0.95 * live * fade);
      ctx.fillText(e.title, sp.x + dx, sp.y);
    }

    // ── which task, and how much of it is left ──
    // The right of the first line belongs to the corner buttons, so the
    // clock goes on the second one.
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.font = F(600, U * 0.032);
    ctx.letterSpacing = '0.16em';
    ctx.fillStyle = css(col, 0.95, 16);
    ctx.fillText(clock.taskName, w * 0.08, row1);
    ctx.letterSpacing = '0px';

    const dotY = row2 - Math.min(h, w) * 0.018, gap = U * 0.036;
    for (let i = 0; i < clock.tasks.length; i++) {
      const tk = clock.tasks[i];
      const x = w * 0.08 + U * 0.012 + i * gap;
      const here = i === clock.taskIndex;
      ctx.beginPath();
      ctx.arc(x, dotY, U * (here ? 0.012 : 0.008), 0, TAU);
      ctx.fillStyle = tk.done ? css(tk.color, 0.9) : here ? css(col, 0.95) : css(dim, 1, 12);
      ctx.fill();
    }

    const dormant = clock.state === 'dormant';
    ctx.textAlign = 'right';
    const left = hms(dormant ? clock.startsInSec : clock.remainingSec);
    ctx.font = F(400, U * 0.048, true);
    const leftW = ctx.measureText(left).width;
    ctx.fillStyle = css(ink, 0.92);
    ctx.fillText(left, w * 0.92, row2);
    ctx.font = F(400, U * 0.026);
    ctx.fillStyle = css(ink, 0.40);
    ctx.fillText(dormant ? '開始まで' : 'のこり', w * 0.92 - leftW - U * 0.022, row2);

    // ── which country ──
    ctx.globalAlpha = fade;
    ctx.textAlign = 'left';
    ctx.font = F(600, U * 0.058);
    ctx.fillStyle = css(ink, 0.95);
    ctx.fillText(country.ja, w * 0.08, row3);
    const nameW = ctx.measureText(country.ja).width;
    ctx.font = F(400, U * 0.025);
    ctx.letterSpacing = '0.20em';
    ctx.fillStyle = css(ink, 0.32);
    ctx.fillText(country.en, w * 0.08 + nameW + U * 0.026, row3);
    ctx.letterSpacing = '0px';
    if (chapters > 1) {
      ctx.textAlign = 'right';
      ctx.font = F(400, U * 0.026, true);
      ctx.fillStyle = css(ink, 0.26);
      ctx.fillText(`${ci + 1}/${chapters}`, w * 0.92, row3);
    }
    ctx.globalAlpha = 1;

    // ── the year, and what happened ──
    // Sized against the band it has to fit in, not the width: on a wide
    // screen U is large but the space under the map is not.
    const T = Math.min(U, h * 0.46);
    const yearY = h * MAP_BOT + T * 0.135;
    ctx.textAlign = 'left';
    ctx.font = F(300, T * 0.085, true);
    ctx.fillStyle = css(ink, 0.9 * fade);
    const year = e.t <= -100000
      ? `${Math.round(-e.t / 10000) / 100}百万年前`
      : e.t < 0 ? `前${-e.t}` : String(e.t);
    ctx.fillText(year, w * 0.08, yearY);
    // none of this reaches a screen reader from a canvas, so leave a line
    // for the page to read out
    st.said = `${country.ja}　${year}　${e.title}。${e.note}。`;

    const et = fade * (0.42 + 0.58 * clamp(1 - cl.travel * 1.6));
    if (et > 0.02) {
      ctx.globalAlpha = Math.min(1, et);
      ctx.font = F(600, T * 0.046);
      ctx.fillStyle = css(ink, 0.95);
      ctx.fillText(e.title, w * 0.08, yearY + T * 0.125);
      ctx.font = F(400, T * 0.033);
      ctx.fillStyle = css(ink, 0.56);
      wrap(ctx, e.note, w * 0.08, yearY + T * 0.225, w * 0.84, T * 0.047);
    }
    ctx.globalAlpha = 1;

    // ── the time, plainly, at the foot of the screen ──
    foot(ctx, w, h, U, clock, col, ink, dim, F);

    // ── held, and done ──
    if (clock.state === 'paused') {
      ctx.textAlign = 'center';
      const gy = h * 0.565, s = U * 0.024;
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
      const veil = ctx.createRadialGradient(w / 2, h * 0.37, 0, w / 2, h * 0.37, Math.max(w, h) * 0.6);
      veil.addColorStop(0, css([214, 26, 8], 0.86));
      veil.addColorStop(1, css([214, 26, 8], 0.55));
      ctx.fillStyle = veil;
      ctx.fillRect(0, h * MAP_TOP, w, h * (MAP_BOT - MAP_TOP));
      ctx.textAlign = 'center';
      ctx.font = F(500, U * 0.052);
      ctx.fillStyle = css(col, 0.95, 18);
      ctx.fillText('おつかれさま', w / 2, h * 0.30);
      ctx.font = F(400, U * 0.032);
      ctx.fillStyle = css(ink, 0.5);
      ctx.fillText(`${clock.taskName}　${hms(clock.durSec)}`, w / 2, h * 0.345);
    }
  },

  /** The completion mark sits in the middle of the map, which is cleared for it. */
  tapSpot(env) {
    const { w, h } = env;
    return { x: w / 2, y: h * 0.44, r: Math.max(30, Math.min(44, Math.min(w, h) * 0.078)) };
  },

  anchors(env) {
    const { w, h } = env;
    const y = h * 0.44, x = w / 2;
    const path = [];
    for (let i = 0; i <= 6; i++) path.push({ x: x - w * 0.16 + (i / 6) * w * 0.16, y });
    return { head: path[0], rest: { x, y }, path };
  }
};

/**
 * The bar and the strip from the plain timer, kept because they answer
 * the only question the map cannot: how much of this task is left.
 */
function foot(ctx, w, h, U, clock, col, ink, dim, F) {
  const p = clamp(clock.progress);
  const bx = w * 0.08, bw = w * 0.84, by = h * 0.845, bh = Math.max(5, U * 0.015);
  ctx.fillStyle = css(dim, 1);
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, bh / 2); ctx.fill();
  if (p > 0.001) {
    ctx.fillStyle = css(col, 1);
    ctx.beginPath(); ctx.roundRect(bx, by, Math.max(bh, bw * p), bh, bh / 2); ctx.fill();
    ctx.fillStyle = css(col, 1, 26);
    ctx.beginPath(); ctx.arc(bx + bw * p, by + bh / 2, bh * 0.95, 0, TAU); ctx.fill();
  }
  ctx.font = F(400, U * 0.032, true);
  ctx.textAlign = 'left';
  ctx.fillStyle = css(ink, 0.55);
  ctx.fillText(hms(clock.elapsedSec), bx, by + bh * 3.4);
  ctx.textAlign = 'right';
  ctx.fillText('-' + hms(clock.remainingSec), bx + bw, by + bh * 3.4);

  // the whole night: six blocks, sized by how long each task runs
  const ny = h * 0.935, nh = Math.max(4, U * 0.012);
  let nx = bx;
  for (let i = 0; i < clock.tasks.length; i++) {
    const t = clock.tasks[i];
    const seg = bw * (t.durSec / clock.nightTotal);
    const pad = i ? 2 : 0;
    const done = i < clock.taskIndex || t.done;
    ctx.fillStyle = done ? css(t.color, 0.8) : i === clock.taskIndex ? css(dim, 1, 6) : css(dim, 1);
    ctx.beginPath(); ctx.roundRect(nx + pad, ny, Math.max(2, seg - pad), nh, nh / 2); ctx.fill();
    if (i === clock.taskIndex && clock.state !== 'dormant') {
      ctx.fillStyle = css(t.color, 0.9);
      ctx.beginPath(); ctx.roundRect(nx + pad, ny, Math.max(2, (seg - pad) * p), nh, nh / 2); ctx.fill();
    }
    nx += seg;
  }
  ctx.fillStyle = css(ink, 0.85);
  const mx = bx + bw * clamp(clock.nightProgress);
  ctx.beginPath();
  ctx.moveTo(mx, ny - nh * 0.5);
  ctx.lineTo(mx + nh * 0.42, ny - nh * 1.3);
  ctx.lineTo(mx - nh * 0.42, ny - nh * 1.3);
  ctx.closePath(); ctx.fill();
}

/** Wrap on Japanese punctuation as well as spaces. */
function wrap(ctx, text, x, y, maxW, lh) {
  let line = '', ly = y;
  const put = () => { ctx.fillText(line, x, ly); line = ''; ly += lh; };
  for (const ch of String(text)) {
    // Japanese has no spaces, so measure a character at a time, and never
    // start a line with a mark that may not begin one
    if (ctx.measureText(line + ch).width > maxW && line && !'、。」）'.includes(ch)) put();
    line += ch;
  }
  if (line) ctx.fillText(line, x, ly);
}
