// ─────────────────────────────────────────────────────────────
// A painting being painted.
//
// Time reads as the making of a picture: bare canvas, charcoal
// construction, block-in, modelling, colour, highlights, varnish. What
// is already painted stays painted; the brush is the one thing moving;
// what is left is still only a line on raw ground.
//
// The picture is rendered into an offscreen layer and only redrawn when
// the progress has actually moved, so a two-hour task costs almost
// nothing per frame.
// ─────────────────────────────────────────────────────────────

import { clamp, lerp, css, glow, TAU, makeRng, breathe, smooth } from './util.js';

/* ── stage windows: where in the sitting each pass happens ────── */
export const STAGES = [
  ['ground',    0.00, 0.10],   // raw canvas, then a thin wash over it
  ['sketch',    0.09, 0.27],   // charcoal construction, searching lines
  ['blockIn',   0.26, 0.46],   // flat masses, dark to light
  ['modelling', 0.45, 0.69],   // form shadows, cast shadows, turning edges
  ['colour',    0.67, 0.86],   // the picture finds its colour
  ['highlight', 0.85, 0.96],   // rim light, speculars, sharpened edges
  ['varnish',   0.95, 1.00]    // the sheen that says it is finished
];

const at = (p, i) => clamp((p - STAGES[i][1]) / (STAGES[i][2] - STAGES[i][1]));


/* ── brush marks ─────────────────────────────────────────────── */

/** One tapered stroke. Small, slightly uneven, never a smudge. */
function stroke(ctx, x, y, len, ang, wide, color, alpha) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  ctx.beginPath();
  ctx.moveTo(x - dx * len / 2, y - dy * len / 2);
  ctx.quadraticCurveTo(x + dy * wide * 0.3, y - dx * wide * 0.3, x + dx * len / 2, y + dy * len / 2);
  ctx.strokeStyle = css(color, alpha);
  ctx.lineWidth = wide;
  ctx.lineCap = 'round';
  ctx.stroke();
}

/**
 * Texture over an area: many small marks, revealed in order, so paint
 * builds up rather than appearing. `angleFn` lets strokes follow a form.
 */
function texture(ctx, area, t, color, opts = {}) {
  const { rng, n = 120, alpha = 0.22, ang = -0.12, spread = 0.4, wide = 6, len = 3, angleFn = null } = opts;
  const shown = Math.floor(clamp(t) * n);
  for (let i = 0; i < shown; i++) {
    const x = area.x + area.w * rng();
    const y = area.y + area.h * rng();
    const a = angleFn ? angleFn(x, y) + (rng() - 0.5) * spread : ang + (rng() - 0.5) * spread;
    const w = wide * (0.55 + rng() * 0.9);
    const L = w * len * (0.6 + rng() * 0.8);
    const shade = [color[0] + (rng() - 0.5) * 12, color[1] * (0.82 + rng() * 0.36), color[2] + (rng() - 0.5) * 11];
    stroke(ctx, x, y, L, a, w, shade, alpha * (0.55 + rng() * 0.7));
  }
}

/** A charcoal line, drawn as far as `t`. */
function sketch(ctx, pts, t, color, opts = {}) {
  const { alpha = 0.5, width = 1.3, double = true } = opts;
  if (alpha <= 0.004) return;
  const n = pts.length;
  const lim = clamp(t) * (n - 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const pass of double ? [1, 0] : [0]) {
    ctx.beginPath();
    for (let i = 0; i <= lim; i++) {
      const q = pts[Math.min(n - 1, Math.floor(i))];
      const j = pass ? 1.5 : 0;                        // the searching second line
      ctx[i ? 'lineTo' : 'moveTo'](
        q.x + (pass ? Math.sin(i * 1.7) * j : 0),
        q.y + (pass ? Math.cos(i * 2.1) * j : 0)
      );
    }
    ctx.strokeStyle = css(color, alpha * (pass ? 0.35 : 1));
    ctx.lineWidth = width * (pass ? 0.7 : 1);
    ctx.stroke();
  }
}

const ellipsePts = (cx, cy, rx, ry, n = 44, from = 0, to = TAU) => {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = from + (to - from) * (i / n);
    out.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return out;
};

/* ── the canvas itself ───────────────────────────────────────── */

let weave = null;
function weavePattern(ctx) {
  if (weave !== null) return weave;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const img = g.createImageData(64, 64);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const i = (y * 64 + x) * 4;
        const wv = (Math.sin(x * 1.55) + Math.sin(y * 1.55)) * 8;
        const v = 128 + wv + (Math.random() - 0.5) * 30;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    weave = ctx.createPattern(c, 'repeat');
  } catch { weave = false; }
  return weave;
}

/* ── the subject ─────────────────────────────────────────────── */

/** Still life: jug, bowl, two fruit, cloth, table edge, wall. */
function stillLife(F) {
  const { x, y, w, h } = F;
  const px = (u) => x + w * u, py = (v) => y + h * v;
  const m = Math.min(w, h);
  const tableV = 0.70;
  return {
    px, py, m,
    tableY: py(tableV),
    wall:  { x, y, w, h: h * tableV },
    table: { x, y: py(tableV), w, h: h * (1 - tableV) },
    cloth: { x: px(0.02), y: py(0.655), w: w * 0.62, h: h * 0.16 },
    jug:   { cx: px(0.38), base: py(tableV) - h * 0.005, hw: m * 0.135, hh: h * 0.27, neck: m * 0.05 },
    bowl:  { cx: px(0.70), cy: py(0.672), rx: m * 0.135, ry: m * 0.042, depth: m * 0.075 },
    fruitA:{ cx: px(0.545), cy: py(0.735), r: m * 0.062 },
    fruitB:{ cx: px(0.665), cy: py(0.762), r: m * 0.052 }
  };
}

/** Where the brush works, stage by stage. */
function focusOrder(S) {
  return [
    { x: S.px(0.5),   y: S.py(0.30) },
    { x: S.jug.cx,    y: S.py(0.52) },
    { x: S.px(0.52),  y: S.py(0.40) },
    { x: S.jug.cx,    y: S.py(0.56) },
    { x: S.fruitA.cx, y: S.fruitA.cy },
    { x: S.bowl.cx,   y: S.bowl.cy },
    { x: S.px(0.5),   y: S.py(0.52) }
  ];
}

/* ── the engine ──────────────────────────────────────────────── */

export const painting = {
  init(env) {
    return { layer: null, lastP: -1, lastW: 0, lastH: 0 };
  },

  draw(env) {
    const { ctx, w, h, p, pal, prm, st, time, reduced } = env;

    if (!st.layer) st.layer = document.createElement('canvas');
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (st.lastW !== w || st.lastH !== h || st.layer.width !== Math.round(w * dpr)) {
      st.layer.width = Math.round(w * dpr);
      st.layer.height = Math.round(h * dpr);
      st.lastW = w; st.lastH = h; st.lastP = -1;
    }

    // repaint only when the work has actually moved on
    if (Math.abs(p - st.lastP) > 0.0012) {
      const lc = st.layer.getContext('2d');
      lc.setTransform(dpr, 0, 0, dpr, 0, 0);
      lc.clearRect(0, 0, w, h);
      paint(lc, env);
      st.lastP = p;
    }
    // the wall the canvas hangs on, behind the painting
    const C0 = paintOf(prm);
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, css(C0.shadow, 1, 4));
    bg.addColorStop(1, css(C0.shadow, 1, -2));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(st.layer, 0, 0, w, h);

    const S = stillLife(frameOf(w, h));
    const spot = brushSpot(S, p, time, reduced);
    if (p > 0.003 && p < 0.999) {
      const C = paintOf(prm);
      glow(ctx, spot.x, spot.y, S.m * 0.22, pal[4], 0.13);
      drawBrush(ctx, spot.x, spot.y, spot.a, S.m * 0.16, C[spot.tint] || C.jug);
    }
  },

  anchors(env) {
    const { w, h, p, time, reduced } = env;
    const F = frameOf(w, h);
    const S = stillLife(F);
    const spot = brushSpot(S, p, time, reduced);
    const sx = F.x + F.w * 0.70, sy = F.y + F.h * 0.945;
    const path = [];
    for (let i = 0; i <= 7; i++) {
      const u = i / 7;
      path.push({ x: sx + u * F.w * 0.2, y: sy + Math.sin(u * Math.PI * 2.2) * F.h * 0.016 - u * F.h * 0.005 });
    }
    return { head: { x: spot.x, y: spot.y }, rest: path[path.length - 1], path };
  }
};

/** The canvas: the whole screen, with a margin of bare edge. */
function frameOf(w, h) {
  const m = Math.min(w, h) * 0.05;
  return { x: m, y: m, w: w - m * 2, h: h - m * 2 };
}

function brushSpot(S, p, time, reduced) {
  const order = focusOrder(S);
  let i = STAGES.findIndex(([, a, b]) => p >= a && p < b);
  if (i < 0) i = p >= 1 ? STAGES.length - 1 : 0;
  const [, a0, b0] = STAGES[i];
  const local = clamp((p - a0) / (b0 - a0));
  const from = order[i], to = order[Math.min(order.length - 1, i + 1)];
  return {
    x: lerp(from.x, to.x, smooth(local)) + (reduced ? 0 : breathe(time, 3.1, 0.3) * S.m * 0.02),
    y: lerp(from.y, to.y, smooth(local)) + (reduced ? 0 : breathe(time, 4.7) * S.m * 0.022),
    a: -0.75 + (reduced ? 0 : breathe(time, 6.2) * 0.22),
    tint: ['ground', 'sketchInk', 'wall', 'shadow', 'fruitA', 'light', 'light'][i]
  };
}

function drawBrush(ctx, x, y, a, len, tip) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.lineCap = 'round';
  ctx.strokeStyle = css([26, 20, 22], 0.9);          // handle
  ctx.lineWidth = len * 0.075;
  ctx.beginPath(); ctx.moveTo(len * 0.26, 0); ctx.lineTo(len, 0); ctx.stroke();
  ctx.strokeStyle = css([40, 6, 58], 0.85);          // ferrule
  ctx.lineWidth = len * 0.095;
  ctx.beginPath(); ctx.moveTo(len * 0.13, 0); ctx.lineTo(len * 0.3, 0); ctx.stroke();
  ctx.fillStyle = css(tip, 0.95, 6);                 // loaded tip
  ctx.beginPath();
  ctx.moveTo(-len * 0.09, 0);
  ctx.quadraticCurveTo(len * 0.05, -len * 0.05, len * 0.15, 0);
  ctx.quadraticCurveTo(len * 0.05, len * 0.05, -len * 0.09, 0);
  ctx.fill();
  ctx.restore();
}

/* ── the palette on the palette ──────────────────────────────── */

export const DEFAULT_PAINT = {
  canvas:    [38, 24, 80],   ground:     [28, 30, 58],
  sketchInk: [22, 12, 30],
  wall:      [44, 16, 44],   wallLight:  [42, 26, 63],  wallDark: [30, 14, 26],
  table:     [22, 34, 20],   tableLight: [26, 40, 32],
  cloth:     [44, 14, 78],   clothShade: [218, 16, 54],
  jug:       [16, 44, 44],   jugLight:   [24, 52, 62],
  bowl:      [200, 16, 52],  bowlLight:  [200, 20, 68],
  fruitA:    [4, 62, 42],    fruitALight:[16, 70, 58],
  fruitB:    [40, 66, 52],   fruitBLight:[46, 74, 66],
  shadow:    [250, 26, 16],  light:      [46, 44, 90]
};

/**
 * A design may name only the colours it cares about; the rest come from
 * the default palette, so a missing key can never blank out a pass.
 */
const paintCache = new WeakMap();
function paintOf(prm) {
  if (!prm.paint) return DEFAULT_PAINT;
  let merged = paintCache.get(prm.paint);
  if (!merged) {
    merged = { ...DEFAULT_PAINT, ...prm.paint };
    paintCache.set(prm.paint, merged);
  }
  return merged;
}

/* ── shapes ──────────────────────────────────────────────────── */

function jugOutline(J) {
  const pts = [], n = 36, right = [];
  for (let i = 0; i <= n; i++) {
    const v = i / n;                                   // 0 foot → 1 lip
    const y = J.base - J.hh * v;
    const belly = Math.sin(Math.min(1, v / 0.52) * Math.PI * 0.92) * 0.66;
    const taper = v > 0.55 ? (v - 0.55) * 0.5 : 0;
    const lip = v > 0.88 ? (v - 0.88) * 3.2 : 0;
    right.push({ x: J.cx + J.hw * (0.5 + belly - taper + lip), y });
  }
  for (const q of right) pts.push(q);
  for (let i = right.length - 1; i >= 0; i--) pts.push({ x: J.cx * 2 - right[i].x, y: right[i].y });
  pts.push(pts[0]);
  return pts;
}

function bowlOutline(B) {
  const pts = ellipsePts(B.cx, B.cy, B.rx, B.ry, 28, Math.PI, TAU);   // the rim, seen from above
  const n = 24;
  for (let i = 0; i <= n; i++) {                                      // and the bowl hanging below it
    const u = i / n;
    const a = Math.PI * u;
    pts.push({ x: B.cx + Math.cos(a) * B.rx, y: B.cy + Math.sin(a) * B.depth });
  }
  pts.push(pts[0]);
  return pts;
}

function clothOutline(cl) {
  // a draped edge: sampled from a few curves so it never reads as cut paper
  const key = [
    [0.00, 0.54], [0.09, 0.22], [0.22, 0.10], [0.38, 0.20],
    [0.55, 0.15], [0.72, 0.30], [0.88, 0.44], [1.00, 0.72],
    [0.94, 0.96], [0.66, 1.02], [0.30, 1.00], [0.00, 0.98]
  ];
  const pts = [];
  const n = key.length;
  for (let i = 0; i < n; i++) {
    const a = key[i], b = key[(i + 1) % n];
    for (let k = 0; k < 6; k++) {
      const u = k / 6;
      const ux = a[0] + (b[0] - a[0]) * u;
      const uy = a[1] + (b[1] - a[1]) * u + Math.sin(u * Math.PI) * 0.018 * (i % 2 ? 1 : -1);
      pts.push({ x: cl.x + cl.w * ux, y: cl.y + cl.h * uy });
    }
  }
  pts.push(pts[0]);
  return pts;
}

function pathOf(ctx, pts) {
  ctx.beginPath();
  pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  ctx.closePath();
}

function boundsOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of pts) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Paint laid into a shape: an even body of colour that builds up, with
 * brush texture over it. This is what stops a mass reading as a blob.
 */
function massFill(ctx, pts, t, color, opts) {
  if (t <= 0) return;
  const { rng, wide, angleFn = null, n = 90, alpha = 0.26 } = opts;
  const b = boundsOf(pts);
  ctx.save();
  pathOf(ctx, pts); ctx.clip();
  ctx.globalAlpha = Math.min(1, t * 1.15);
  ctx.fillStyle = css(color, 0.9);
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.globalAlpha = 1;
  texture(ctx, b, t, color, { rng, n, alpha, wide, len: 2.6, spread: 0.5, angleFn });
  ctx.restore();
}

/** Light and shadow across a form, clipped to it. */
function model(ctx, pts, t, dark, lightCol, opts = {}) {
  if (t <= 0) return;
  const b = boundsOf(pts);
  const { from = 'left', darkA = 0.5, lightA = 0.3 } = opts;
  ctx.save();
  pathOf(ctx, pts); ctx.clip();
  ctx.globalAlpha = clamp(t);
  const g = from === 'left'
    ? ctx.createLinearGradient(b.x, 0, b.x + b.w, 0)
    : ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
  g.addColorStop(0, css(lightCol, lightA));
  g.addColorStop(0.42, css(lightCol, 0));
  g.addColorStop(0.62, css(dark, 0));
  g.addColorStop(1, css(dark, darkA));
  ctx.fillStyle = g;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.restore();
}

/** A round form: the sphere trick that makes fruit read as fruit. */
function sphere(ctx, f, t, base, lightCol, dark, rng) {
  if (t <= 0) return;
  ctx.save();
  ctx.globalAlpha = clamp(t);
  const g = ctx.createRadialGradient(
    f.cx - f.r * 0.38, f.cy - f.r * 0.42, f.r * 0.05,
    f.cx, f.cy, f.r * 1.15
  );
  g.addColorStop(0, css(lightCol, 0.98));
  g.addColorStop(0.45, css(base, 0.98));
  g.addColorStop(1, css(dark, 0.9));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(f.cx, f.cy, f.r, f.r * 0.95, 0, 0, TAU); ctx.fill();
  ctx.clip();
  texture(ctx, { x: f.cx - f.r, y: f.cy - f.r, w: f.r * 2, h: f.r * 2 }, t, base,
          { rng, n: 26, alpha: 0.16, wide: f.r * 0.24, len: 2, spread: 0.8,
            angleFn: (x, y) => Math.atan2(y - f.cy, x - f.cx) + Math.PI / 2 });
  ctx.restore();
}

/* ── the sitting, pass by pass ───────────────────────────────── */

function paint(ctx, env) {
  const { w, h, p, prm } = env;
  const C = paintOf(prm);
  const F = frameOf(w, h);
  const S = stillLife(F);
  const m = S.m;
  const seed = (prm.seed || 1) >>> 0;
  const R = STAGES.map((_, i) => makeRng((seed * 2654435761 + i * 40503) >>> 0));

  /* raw canvas */
  ctx.fillStyle = css(C.canvas);
  ctx.fillRect(0, 0, w, h);
  const wv = weavePattern(ctx);
  if (wv) {
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = wv;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /* 0 — a thin ground wash, brushed on */
  const s0 = at(p, 0);
  if (s0 > 0) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    texture(ctx, { x: 0, y: 0, w, h }, s0, C.ground,
            { rng: R[0], n: 300, alpha: 0.11, ang: -0.22, spread: 0.3, wide: m * 0.035, len: 4.5 });
    ctx.restore();
  }

  /* how far the block-in has got with each thing — the sketch under a
     shape stays visible until that shape is painted, not before */
  const s2raw = at(p, 2);
  const cover = {
    wall:   clamp(s2raw / 0.3),
    table:  clamp((s2raw - 0.26) / 0.22),
    cloth:  clamp((s2raw - 0.44) / 0.2),
    jug:    clamp((s2raw - 0.58) / 0.22),
    bowl:   clamp((s2raw - 0.74) / 0.16),
    fruitA: clamp((s2raw - 0.84) / 0.1),
    fruitB: clamp((s2raw - 0.9) / 0.1)
  };
  const inkA = (base, key) => base * (1 - clamp(cover[key]) * 0.9);

  /* 2 — block-in: the big masses, flat, dark to light */
  const s2 = s2raw;
  const r2 = R[2];
  if (s2 > 0) {
    const r = r2;
    const wallT = cover.wall;
    if (wallT > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, wallT * 1.1);
      const wg = ctx.createLinearGradient(F.x, F.y, F.x + F.w * 0.85, S.tableY);
      wg.addColorStop(0, css(C.wallLight, 0.95));
      wg.addColorStop(0.55, css(C.wall, 0.95));
      wg.addColorStop(1, css(C.wallDark, 0.95));
      ctx.fillStyle = wg;
      ctx.fillRect(S.wall.x, S.wall.y, S.wall.w, S.wall.h);
      ctx.globalAlpha = 1;
      texture(ctx, S.wall, wallT, C.wall, { rng: r, n: 130, alpha: 0.12, ang: -0.06, spread: 0.25, wide: m * 0.04, len: 4 });
      ctx.restore();
    }
    const tableT = cover.table;
    if (tableT > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, tableT * 1.1);
      const tg = ctx.createLinearGradient(0, S.tableY, 0, F.y + F.h);
      tg.addColorStop(0, css(C.tableLight, 0.95));
      tg.addColorStop(1, css(C.table, 0.98));
      ctx.fillStyle = tg;
      ctx.fillRect(S.table.x, S.table.y, S.table.w, S.table.h);
      ctx.globalAlpha = 1;
      texture(ctx, S.table, tableT, C.table, { rng: r, n: 80, alpha: 0.14, ang: 0.02, spread: 0.12, wide: m * 0.035, len: 5 });
      ctx.restore();
    }
  }

  /* 1 — charcoal construction */
  const s1 = at(p, 1);
  if (s1 > 0) {
    const step = (from, span) => clamp((s1 - from) / span);
    const J = S.jug, B = S.bowl;
    sketch(ctx, [{ x: F.x, y: S.tableY }, { x: F.x + F.w, y: S.tableY - F.h * 0.006 }], step(0, 0.16), C.sketchInk, { alpha: inkA(0.5, 'table'), width: 1.4 });
    sketch(ctx, [{ x: J.cx, y: J.base + m * 0.02 }, { x: J.cx, y: J.base - J.hh * 1.08 }], step(0.1, 0.1), C.sketchInk, { alpha: inkA(0.3, 'jug'), width: 1, double: false });
    sketch(ctx, ellipsePts(J.cx, J.base, J.hw * 0.56, m * 0.016), step(0.16, 0.12), C.sketchInk, { alpha: inkA(0.4, 'jug'), width: 1.1 });
    sketch(ctx, jugOutline(J), step(0.24, 0.26), C.sketchInk, { alpha: inkA(0.62, 'jug'), width: 1.5 });
    sketch(ctx, ellipsePts(J.cx, J.base - J.hh, J.neck * 0.9, m * 0.012), step(0.44, 0.12), C.sketchInk, { alpha: inkA(0.45, 'jug'), width: 1.1 });
    sketch(ctx, bowlOutline(B), step(0.52, 0.16), C.sketchInk, { alpha: inkA(0.55, 'bowl'), width: 1.3 });
    sketch(ctx, ellipsePts(S.fruitA.cx, S.fruitA.cy, S.fruitA.r, S.fruitA.r * 0.95), step(0.66, 0.12), C.sketchInk, { alpha: inkA(0.55, 'fruitA'), width: 1.2 });
    sketch(ctx, ellipsePts(S.fruitB.cx, S.fruitB.cy, S.fruitB.r, S.fruitB.r * 0.95), step(0.74, 0.12), C.sketchInk, { alpha: inkA(0.55, 'fruitB'), width: 1.2 });
    sketch(ctx, clothOutline(S.cloth), step(0.82, 0.18), C.sketchInk, { alpha: inkA(0.4, 'cloth'), width: 1.2 });
  }

  /* 2b — and then the things standing on it */
  if (s2 > 0) {
    const r = r2;
    massFill(ctx, clothOutline(S.cloth), cover.cloth, C.cloth,
             { rng: r, wide: m * 0.03, n: 70, alpha: 0.16 });
    massFill(ctx, jugOutline(S.jug), cover.jug, C.jug,
             { rng: r, wide: m * 0.025, n: 80, alpha: 0.18, angleFn: () => Math.PI / 2 });
    massFill(ctx, bowlOutline(S.bowl), cover.bowl, C.bowl,
             { rng: r, wide: m * 0.022, n: 50, alpha: 0.16 });
    for (const [f, col, t] of [[S.fruitA, C.fruitA, cover.fruitA], [S.fruitB, C.fruitB, cover.fruitB]]) {
      massFill(ctx, ellipsePts(f.cx, f.cy, f.r, f.r * 0.95), t, col,
               { rng: r, wide: f.r * 0.3, n: 24, alpha: 0.18 });
    }
  }

  /* 3 — modelling: the forms turn */
  const s3 = at(p, 3);
  if (s3 > 0) {
    const r = R[3];
    model(ctx, jugOutline(S.jug), clamp(s3 / 0.3), C.shadow, C.jugLight, { darkA: 0.5, lightA: 0.3 });
    const bowlT = clamp((s3 - 0.24) / 0.22);
    model(ctx, bowlOutline(S.bowl), bowlT, C.shadow, C.bowlLight, { darkA: 0.4, lightA: 0.26 });
    if (bowlT > 0) {                                   // the hollow, and the rim above it
      const B = S.bowl;
      ctx.save();
      ctx.globalAlpha = clamp(bowlT);
      const ig = ctx.createLinearGradient(0, B.cy - B.ry, 0, B.cy + B.ry);
      ig.addColorStop(0, css(C.shadow, 0.42));
      ig.addColorStop(1, css(C.bowlLight, 0.32));
      ctx.fillStyle = ig;
      ctx.beginPath(); ctx.ellipse(B.cx, B.cy, B.rx * 0.88, B.ry * 0.82, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = css(C.bowlLight, 0.5);
      ctx.lineWidth = m * 0.006;
      ctx.beginPath(); ctx.ellipse(B.cx, B.cy, B.rx, B.ry, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    sphere(ctx, S.fruitA, clamp((s3 - 0.4) / 0.22), C.fruitA, C.fruitALight, C.shadow, r);
    sphere(ctx, S.fruitB, clamp((s3 - 0.5) / 0.22), C.fruitB, C.fruitBLight, C.shadow, r);

    const cast = clamp((s3 - 0.6) / 0.4);
    if (cast > 0) {                                    // what the light leaves behind
      ctx.save();
      ctx.globalAlpha = 0.55 * cast;
      const shadowOf = (cx, cy, rx, ry) => {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
        g.addColorStop(0, css(C.shadow, 0.5));
        g.addColorStop(1, css(C.shadow, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.fill();
      };
      shadowOf(S.jug.cx + S.jug.hw * 1.25, S.jug.base + m * 0.012, S.jug.hw * 2.1, m * 0.028);
      shadowOf(S.fruitA.cx + S.fruitA.r * 0.8, S.fruitA.cy + S.fruitA.r * 0.82, S.fruitA.r * 1.7, S.fruitA.r * 0.42);
      shadowOf(S.fruitB.cx + S.fruitB.r * 0.8, S.fruitB.cy + S.fruitB.r * 0.82, S.fruitB.r * 1.7, S.fruitB.r * 0.42);
      shadowOf(S.bowl.cx + S.bowl.rx * 0.5, S.bowl.cy + S.bowl.depth * 0.9, S.bowl.rx * 1.5, m * 0.022);
      ctx.restore();
    }

    const folds = clamp((s3 - 0.42) / 0.5);            // the cloth gathers
    if (folds > 0) {
      const cl = S.cloth;
      ctx.save();
      pathOf(ctx, clothOutline(cl)); ctx.clip();
      for (let i = 0; i < 5; i++) {
        const t = clamp((folds - i * 0.13) / 0.32); if (t <= 0) continue;
        const fx = cl.x + cl.w * (0.12 + i * 0.18);
        const wide = cl.w * 0.075;
        ctx.save();
        ctx.globalAlpha = 0.4 * t;
        // a soft trough with a lit ridge beside it — that is what a fold is
        const g = ctx.createLinearGradient(fx - wide, 0, fx + wide, 0);
        g.addColorStop(0, css(C.light, 0.22));
        g.addColorStop(0.45, css(C.clothShade, 0.34));
        g.addColorStop(1, css(C.light, 0.1));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(fx - wide, cl.y);
        ctx.quadraticCurveTo(fx + cl.w * 0.02, cl.y + cl.h * 0.5, fx - wide * 0.6, cl.y + cl.h * 1.1);
        ctx.lineTo(fx + wide * 0.6, cl.y + cl.h * 1.1);
        ctx.quadraticCurveTo(fx + cl.w * 0.02 + wide, cl.y + cl.h * 0.5, fx + wide, cl.y);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
  }

  /* 4 — colour: the picture warms and separates */
  const s4 = at(p, 4);
  if (s4 > 0) {
    const r = R[4];
    const glaze = (pts, t, col, alpha, wide, angleFn) => {
      if (t <= 0) return;
      ctx.save();
      pathOf(ctx, pts); ctx.clip();
      texture(ctx, boundsOf(pts), t, col, { rng: r, n: 40, alpha, wide, len: 2.4, spread: 0.6, angleFn });
      ctx.restore();
    };
    glaze(jugOutline(S.jug), clamp(s4 / 0.32), C.jugLight, 0.13, m * 0.02, () => Math.PI / 2);
    glaze(bowlOutline(S.bowl), clamp((s4 - 0.26) / 0.3), C.bowlLight, 0.11, m * 0.018);
    glaze(clothOutline(S.cloth), clamp((s4 - 0.4) / 0.36), C.light, 0.1, m * 0.024, () => -0.25);
    const warm = clamp((s4 - 0.55) / 0.45);
    if (warm > 0) {                                     // light spilling from the left
      ctx.save();
      ctx.globalAlpha = 0.34 * warm;
      const lg = ctx.createRadialGradient(F.x + F.w * 0.16, F.y + F.h * 0.2, m * 0.05, F.x + F.w * 0.16, F.y + F.h * 0.2, F.w * 0.95);
      lg.addColorStop(0, css(C.light, 0.5));
      lg.addColorStop(1, css(C.light, 0));
      ctx.fillStyle = lg;
      ctx.fillRect(F.x, F.y, F.w, F.h);
      ctx.restore();
    }
  }

  /* 5 — the few marks that make it read */
  const s5 = at(p, 5);
  if (s5 > 0) {
    const spec = (x, y, rx, ry, a, t, alpha = 0.9) => {
      if (t <= 0) return;
      ctx.save();
      ctx.globalAlpha = clamp(t);
      const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
      g.addColorStop(0, css(C.light, alpha));
      g.addColorStop(1, css(C.light, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, a, 0, TAU); ctx.fill();
      ctx.restore();
    };
    const J = S.jug;
    spec(J.cx - J.hw * 0.5, J.base - J.hh * 0.56, J.hw * 0.2, J.hh * 0.22, -0.1, clamp(s5 / 0.3));
    spec(J.cx, J.base - J.hh * 1.0, J.neck * 0.8, m * 0.008, 0, clamp((s5 - 0.18) / 0.24));
    spec(S.fruitA.cx - S.fruitA.r * 0.36, S.fruitA.cy - S.fruitA.r * 0.42, S.fruitA.r * 0.26, S.fruitA.r * 0.2, -0.5, clamp((s5 - 0.34) / 0.24));
    spec(S.fruitB.cx - S.fruitB.r * 0.34, S.fruitB.cy - S.fruitB.r * 0.44, S.fruitB.r * 0.22, S.fruitB.r * 0.17, -0.5, clamp((s5 - 0.46) / 0.24));
    const rim = clamp((s5 - 0.55) / 0.45);
    if (rim > 0) {
      ctx.save();
      ctx.globalAlpha = rim * 0.75;
      ctx.strokeStyle = css(C.light, 0.65);
      ctx.lineWidth = m * 0.005;
      ctx.lineCap = 'round';
      const B = S.bowl;
      ctx.beginPath(); ctx.ellipse(B.cx, B.cy, B.rx, B.ry, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(F.x, S.tableY); ctx.lineTo(F.x + F.w * 0.34, S.tableY - F.h * 0.002);
      ctx.strokeStyle = css(C.light, 0.3); ctx.stroke();
      ctx.restore();
    }
  }

  /* 6 — varnish */
  const s6 = at(p, 6);
  if (s6 > 0) {
    ctx.save();
    ctx.globalAlpha = 0.55 * s6;
    const vg = ctx.createLinearGradient(F.x, F.y, F.x + F.w * 0.8, F.y + F.h);
    vg.addColorStop(0, css(C.light, 0.13));
    vg.addColorStop(0.45, css(C.light, 0.02));
    vg.addColorStop(1, css(C.shadow, 0.14));
    ctx.fillStyle = vg;
    ctx.fillRect(F.x, F.y, F.w, F.h);
    ctx.restore();
  }

  /* the bare edge of the canvas, always */
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = '#000';
  const rr = Math.min(w, h) * 0.012;
  ctx.beginPath(); ctx.roundRect(F.x, F.y, F.w, F.h, rr); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,.28)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(F.x, F.y, F.w, F.h, rr); ctx.stroke();
  ctx.restore();
}
