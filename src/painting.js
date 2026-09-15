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
import { SUBJECTS } from './paintings/index.js';

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
export function stroke(ctx, x, y, len, ang, wide, color, alpha) {
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
export function texture(ctx, area, t, color, opts = {}) {
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
export function sketch(ctx, pts, t, color, opts = {}) {
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

export const ellipsePts = (cx, cy, rx, ry, n = 44, from = 0, to = TAU) => {
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

/* ── the engine ──────────────────────────────────────────────── */

export const painting = {
  init(env) {
    return { layer: null, lastP: -1, lastW: 0, lastH: 0 };
  },

  draw(env) {
    const { ctx, w, h, p, pal, prm, st, time, reduced } = env;
    const subject = subjectOf(prm);

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
      paint(lc, env, subject);
      st.lastP = p;
    }

    // the wall the canvas hangs on
    const C = paintOf(subject, prm);
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, css(C.surround || C.shadow, 1, 4));
    bg.addColorStop(1, css(C.surround || C.shadow, 1, -3));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(st.layer, 0, 0, w, h);

    const spot = brushSpot(subject, frameOf(w, h), p, time, reduced);
    if (p > 0.003 && p < 0.999) {
      glow(ctx, spot.x, spot.y, Math.min(w, h) * 0.2, pal[4], 0.12);
      drawBrush(ctx, spot.x, spot.y, spot.a, Math.min(w, h) * 0.15, C[spot.tint] || C.light);
    }
  },

  anchors(env) {
    const { w, h, p, prm, time, reduced } = env;
    const F = frameOf(w, h);
    const spot = brushSpot(subjectOf(prm), F, p, time, reduced);
    // a painting is finished by signing it
    const sx = F.x + F.w * 0.68, sy = F.y + F.h * 0.945;
    const path = [];
    for (let i = 0; i <= 7; i++) {
      const u = i / 7;
      path.push({ x: sx + u * F.w * 0.22, y: sy + Math.sin(u * Math.PI * 2.2) * F.h * 0.016 - u * F.h * 0.005 });
    }
    return { head: { x: spot.x, y: spot.y }, rest: path[path.length - 1], path };
  }
};

function subjectOf(prm) {
  return SUBJECTS[prm.subject] || SUBJECTS['still-life'];
}

/** A subject names only the colours it cares about; the rest are standard. */
const paintCache = new WeakMap();
export function paintOf(subject, prm) {
  const own = (prm && prm.paint) || subject.palette;
  if (!own) return DEFAULT_PAINT;
  let merged = paintCache.get(own);
  if (!merged) { merged = { ...DEFAULT_PAINT, ...own }; paintCache.set(own, merged); }
  return merged;
}

function brushSpot(subject, F, p, time, reduced) {
  const order = subject.focus(F);
  const m = Math.min(F.w, F.h);
  let i = STAGES.findIndex(([, a, b]) => p >= a && p < b);
  if (i < 0) i = p >= 1 ? STAGES.length - 1 : 0;
  const [, a0, b0] = STAGES[i];
  const local = clamp((p - a0) / (b0 - a0));
  const from = order[Math.min(order.length - 1, i)];
  const to = order[Math.min(order.length - 1, i + 1)];
  return {
    x: lerp(from.x, to.x, smooth(local)) + (reduced ? 0 : breathe(time, 3.1, 0.3) * m * 0.02),
    y: lerp(from.y, to.y, smooth(local)) + (reduced ? 0 : breathe(time, 4.7) * m * 0.022),
    a: -0.75 + (reduced ? 0 : breathe(time, 6.2) * 0.22),
    tint: (subject.tints || ['ground', 'sketchInk', 'wall', 'shadow', 'fruitA', 'light', 'light'])[i]
  };
}

/** Canvas, ground, the subject's own passes, then varnish and the edge. */
function paint(ctx, env, subject) {
  const { w, h, p, prm } = env;
  const C = paintOf(subject, prm);
  const F = frameOf(w, h);
  const m = Math.min(F.w, F.h);
  const seed = (prm.seed || 1) >>> 0;
  const streams = STAGES.map((_, i) => makeRng((seed * 2654435761 + i * 40503) >>> 0));

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

  const g = {
    ctx, F, C, m, p, w, h,
    at: (i) => at(p, i),
    rng: (i) => streams[i],
    px: (u) => F.x + F.w * u,
    py: (v) => F.y + F.h * v
  };

  /* a thin ground wash, brushed on — every picture starts this way */
  const s0 = g.at(0);
  if (s0 > 0) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    texture(ctx, { x: 0, y: 0, w, h }, s0, C.ground,
            { rng: streams[0], n: 300, alpha: 0.12, ang: -0.22, spread: 0.3, wide: m * 0.035, len: 4.5 });
    ctx.restore();
  }

  subject.draw(g);

  /* varnish */
  const s6 = g.at(6);
  if (s6 > 0) {
    ctx.save();
    ctx.globalAlpha = 0.55 * s6;
    const vg = ctx.createLinearGradient(F.x, F.y, F.x + F.w * 0.8, F.y + F.h);
    vg.addColorStop(0, css(C.light, 0.12));
    vg.addColorStop(0.45, css(C.light, 0.02));
    vg.addColorStop(1, css(C.shadow, 0.14));
    ctx.fillStyle = vg;
    ctx.fillRect(F.x, F.y, F.w, F.h);
    ctx.restore();
  }

  /* the bare edge of the canvas, always */
  const rr = Math.min(w, h) * 0.012;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.roundRect(F.x, F.y, F.w, F.h, rr); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,.3)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(F.x, F.y, F.w, F.h, rr); ctx.stroke();
  ctx.restore();
}

/** The canvas: the whole screen, with a margin of bare edge. */
export function frameOf(w, h) {
  const m = Math.min(w, h) * 0.05;
  return { x: m, y: m, w: w - m * 2, h: h - m * 2 };
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

/* ── shared shape kit ────────────────────────────────────────── */

export function pathOf(ctx, pts) {
  ctx.beginPath();
  pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  ctx.closePath();
}

export function boundsOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of pts) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Paint laid into a shape: an even body of colour that builds up, with
 * brush texture over it. This is what stops a mass reading as a blob.
 */
export function massFill(ctx, pts, t, color, opts) {
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
export function model(ctx, pts, t, dark, lightCol, opts = {}) {
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
export function sphere(ctx, f, t, base, lightCol, dark, rng) {
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
