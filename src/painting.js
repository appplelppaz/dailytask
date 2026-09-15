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

import { clamp, css, makeRng } from './util.js';
import { texture, frameOf } from './brush.js';
export * from './brush.js';
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

  },

  anchors(env) {
    const { w, h } = env;
    const F = frameOf(w, h);
    // a painting is finished by signing it
    const sx = F.x + F.w * 0.68, sy = F.y + F.h * 0.945;
    const path = [];
    for (let i = 0; i <= 7; i++) {
      const u = i / 7;
      path.push({ x: sx + u * F.w * 0.22, y: sy + Math.sin(u * Math.PI * 2.2) * F.h * 0.016 - u * F.h * 0.005 });
    }
    return { head: path[0], rest: path[path.length - 1], path };
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
