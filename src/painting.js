// ─────────────────────────────────────────────────────────────
// A painting being painted.
//
// Time reads as the making of a picture: bare canvas, charcoal
// construction, block-in, and then layer over layer of paint until the
// picture is there. What is already painted stays painted.
//
// The picture accumulates in an offscreen layer: each frame only adds
// the marks that belong to the sliver of progress since the last one,
// so a canvas can carry twenty thousand strokes and still cost nothing
// per frame. The layer is only ever rebuilt from nothing when the size
// changes or the progress runs backwards.
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

const CATCHUP = 0.04;      // most of a sitting a frame can take on at once

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
    return { layer: null, doneP: -1, lastW: 0, lastH: 0, cache: new Map() };
  },

  draw(env) {
    const { ctx, w, h, p, prm, st } = env;
    const subject = subjectOf(prm);
    const C = paintOf(subject, prm);
    const F = frameOf(w, h);

    if (!st.layer) st.layer = document.createElement('canvas');
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (st.lastW !== w || st.lastH !== h || st.layer.width !== Math.round(w * dpr)) {
      st.layer.width = Math.round(w * dpr);
      st.layer.height = Math.round(h * dpr);
      st.lastW = w; st.lastH = h; st.doneP = -1; st.masked = false;
      st.cache.clear();
    }

    const lc = st.layer.getContext('2d');
    lc.setTransform(dpr, 0, 0, dpr, 0, 0);

    // The bare edge of the canvas is cut into the layer once and then simply
    // stays: clipping it on every composite instead costs more than all the
    // painting does, because each restore makes the renderer flush the whole
    // picture again.
    const rr = Math.min(w, h) * 0.012;
    if (!st.masked) {
      lc.restore();
      lc.save();
      lc.beginPath(); lc.roundRect(F.x, F.y, F.w, F.h, rr); lc.clip();
      st.masked = true;
    }

    if (subject.layered) {
      // paint only what has happened since last time; scrubbing backwards
      // (or a first frame) starts the canvas over and works forward
      if (p < st.doneP) { st.doneP = -1; }
      if (st.doneP < 0) { lc.clearRect(0, 0, w, h); ground(lc, env, C, F); st.doneP = 0; }
      if (p > st.doneP) {
        // Opening the page an hour into a task means catching up on an hour
        // of painting. Do it a slice at a time instead of in one long freeze:
        // the picture paints itself quickly onto the screen, which is a
        // better thing to watch than a stalled frame anyway.
        const to = Math.min(p, st.doneP + CATCHUP);
        paintRange(lc, env, subject, C, F, st.doneP, to);
        st.doneP = to;
      }
    } else if (Math.abs(p - st.doneP) > 0.0012) {
      lc.clearRect(0, 0, w, h);
      ground(lc, env, C, F);
      paintRange(lc, env, subject, C, F, 0, p);
      st.doneP = p;
    }

    // the wall the canvas hangs on
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, css(C.surround || C.shadow, 1, 4));
    bg.addColorStop(1, css(C.surround || C.shadow, 1, -3));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.drawImage(st.layer, 0, 0, w, h);

    // varnish and raking light sit on the surface, not in the paint
    const s6 = at(p, 6);
    if (s6 > 0) {
      ctx.globalAlpha = 0.55 * s6;
      const vg = ctx.createLinearGradient(F.x, F.y, F.x + F.w * 0.8, F.y + F.h);
      vg.addColorStop(0, css(C.light, 0.12));
      vg.addColorStop(0.45, css(C.light, 0.02));
      vg.addColorStop(1, css(C.shadow, 0.14));
      ctx.fillStyle = vg;
      ctx.fillRect(F.x, F.y, F.w, F.h);
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = 'rgba(0,0,0,.3)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(F.x, F.y, F.w, F.h, rr); ctx.stroke();
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

/** Bare canvas and its weave — laid once, underneath everything. */
function ground(ctx, env, C, F) {
  ctx.fillStyle = css(C.canvas);
  ctx.fillRect(F.x, F.y, F.w, F.h);
  const wv = weavePattern(ctx);
  if (wv) {
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = wv;
    ctx.fillRect(F.x, F.y, F.w, F.h);
    ctx.restore();
  }
}

/** Everything that happens to the picture between two points in the sitting. */
function paintRange(ctx, env, subject, C, F, p0, p1) {
  const { w, h, prm, st } = env;
  const m = Math.min(F.w, F.h);
  const seed = (prm.seed || 1) >>> 0;
  const streams = STAGES.map((_, i) => makeRng((seed * 2654435761 + i * 40503) >>> 0));
  const cache = st && st.cache ? st.cache : new Map();

  const g = {
    ctx, F, C, m, w, h, p: p1, p0, p1, seed,
    at: (i) => at(p1, i),
    rng: (i) => streams[i],
    px: (u) => F.x + F.w * u,
    py: (v) => F.y + F.h * v,

    /**
     * How much of a pass scheduled over [from, to] happened in this step,
     * as a 0..1 sub-range — or null when none of it did. Every pass in a
     * layered subject starts here.
     */
    span(from, to) {
      const a = clamp((p0 - from) / (to - from));
      const b = clamp((p1 - from) / (to - from));
      return b > a ? [a, b] : null;
    },

    /** The marks of an ordered list that land in this step. */
    batch(from, to, list, fn) {
      const s = g.span(from, to);
      if (!s) return;
      const n = list.length;
      const i0 = Math.floor(s[0] * n), i1 = Math.floor(s[1] * n);
      for (let i = i0; i < i1 && i < n; i++) fn(list[i], i, n);
    },

    /** The piece of a drawn line that gets drawn in this step. */
    line(from, to, pts, fn) {
      const s = g.span(from, to);
      if (!s) return;
      const n = pts.length - 1;
      const i0 = Math.max(0, Math.floor(s[0] * n) - 1), i1 = Math.ceil(s[1] * n);
      if (i1 <= i0) return;
      fn(pts.slice(i0, i1 + 1));
    },

    /** Geometry worked out once per canvas size, not per frame. */
    cache(key, make) {
      if (!cache.has(key)) cache.set(key, make());
      return cache.get(key);
    },

    /**
     * Paint inside a shape, the way a brush is cut around one. `rule` is
     * 'nonzero' to add shapes together and 'evenodd' to punch one out of
     * another — a cypress standing in front of the sky, say.
     */
    clip(build, fn, rule = 'nonzero') {
      ctx.save();
      ctx.beginPath();
      build(ctx);
      ctx.clip(rule);
      fn(ctx);
      ctx.restore();
    },

    /**
     * Paint inside one shape but never inside another — what a painter does
     * when something stands in front of the passage being worked on. Two
     * clips in a row, because a single even-odd path would also take in the
     * part of the hole that falls outside the region.
     */
    clipOut(build, hole, fn) {
      ctx.save();
      ctx.beginPath(); build(ctx); ctx.clip();
      ctx.beginPath(); ctx.rect(0, 0, w, h); hole(ctx); ctx.clip('evenodd');
      fn(ctx);
      ctx.restore();
    }
  };

  // the thin ground the picture is drawn on: a tone rubbed over the whole
  // canvas, then fine brush marks worked into it — quiet enough that the
  // charcoal still reads over the top
  g.batch(0.0, 0.055, g.cache('wash', () => {
    const rr = makeRng((seed ^ 0x9e37) >>> 0);
    const out = [{ tone: true }];
    for (let i = 0; i < 2400; i++) {
      out.push({ x: F.x + rr() * F.w, y: F.y + rr() * F.h, k: rr(), a: -0.2 + (rr() - 0.5) * 0.42 });
    }
    return out;
  }), (q) => {
    ctx.save();
    if (q.tone) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = css(C.ground, 1, 6);
      ctx.fillRect(F.x, F.y, F.w, F.h);
      ctx.restore();
      return;
    }
    const wide = m * (0.005 + q.k * 0.013);
    ctx.globalAlpha = 0.055 + q.k * 0.05;
    ctx.strokeStyle = css([C.ground[0], C.ground[1], C.ground[2] + (q.k - 0.5) * 10]);
    ctx.lineWidth = wide;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(q.x, q.y);
    ctx.lineTo(q.x + Math.cos(q.a) * wide * 5.5, q.y + Math.sin(q.a) * wide * 5.5);
    ctx.stroke();
    ctx.restore();
  });

  if (!subject.layered) {
    // older subjects redraw themselves whole; the wash above stands in for
    // the one they used to ask for
    const s0 = at(p1, 0);
    if (s0 > 0) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      texture(ctx, { x: F.x, y: F.y, w: F.w, h: F.h }, s0, C.ground,
              { rng: streams[0], n: 300, alpha: 0.12, ang: -0.22, spread: 0.3, wide: m * 0.035, len: 4.5 });
      ctx.restore();
    }
  }

  subject.draw(g);
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
