// ─────────────────────────────────────────────────────────────
// Vincent van Gogh — The Starry Night (1889), public domain.
//
// Three things decide whether a painted sky reads as paint.
//
// The mark. A loaded flat brush lands blunt, drags at close to full
// width while the paint lasts and thins out at the end; its bristles
// comb the paint into streaks; the ridge it pushes up catches light on
// one edge and shadows the other. That is `oil()` in the brush kit, and
// every mark here is one.
//
// The design. Before any colour there is a pattern of light and dark:
// a dark band across the top, a dark left side, a luminous S running
// through the middle where the two swirls turn, and the corner where
// the moon burns. `lumAt` is that pattern, and it decides the colour,
// the size and the weight of every stroke on the canvas.
//
// The colour. Van Gogh's sky is not blue and white. It runs from
// prussian through ultramarine and cobalt to cerulean, and then — this
// is the part that gets left out — through blue-green and pale green
// before it reaches a cream that is warm, never neutral; and the yellow
// of the stars leaks into the sky around them.
//
// Around a hundred thousand marks, in three workings of the sky, four
// of the cypress, and the land.
// ─────────────────────────────────────────────────────────────

import { clamp, css, TAU, lerp, makeRng } from '../util.js';
import { oil, charcoal, hatchSegs, segPts, ellipsePts, pathOf, poly } from '../brush.js';

/* ── composition ─────────────────────────────────────────────── */
function scene(F) {
  const px = (u) => F.x + F.w * u, py = (v) => F.y + F.h * v;
  const m = Math.min(F.w, F.h);
  const S = {
    px, py, m, F,
    horizon: py(0.735),
    moon:   { x: px(0.845), y: py(0.115), r: m * 0.058 },
    // the two eyes of the great swirl, and the smaller turns around them
    vorts: [
      { x: px(0.40), y: py(0.345), r: m * 0.185, a: 1.75, spin: 1 },
      { x: px(0.655), y: py(0.295), r: m * 0.125, a: -1.15, spin: -1 },
      { x: px(0.155), y: py(0.60), r: m * 0.13, a: -0.24, spin: -1 },
      { x: px(0.87), y: py(0.48), r: m * 0.12, a: 0.2, spin: 1 },
      { x: px(0.70), y: py(0.62), r: m * 0.11, a: -0.18, spin: -1 }
    ],
    cypress:  { x: px(0.205), base: py(1.06), top: py(0.055), w: m * 0.088 },
    cypress2: { x: px(0.325), base: py(1.06), top: py(0.415), w: m * 0.05 },
    spire:  { x: px(0.545), base: py(0.75), h: F.h * 0.205, w: m * 0.0105 },
    stars: [
      [0.075, 0.075, 1.0], [0.215, 0.185, 0.72], [0.325, 0.055, 0.66],
      [0.45, 0.095, 0.58], [0.60, 0.115, 0.52], [0.685, 0.215, 0.76],
      [0.06, 0.345, 0.60], [0.135, 0.435, 0.78], [0.335, 0.465, 1.05],
      [0.83, 0.335, 0.62], [0.925, 0.545, 0.5]
    ]
  };
  S.starPts = S.stars.map(([u, v, k]) => ({ x: px(u), y: py(v), r: m * 0.036 * k }));
  return S;
}

const HOUSES = [
  [0.330, 0.038, 0.030], [0.378, 0.030, 0.024], [0.424, 0.044, 0.034],
  [0.478, 0.032, 0.026], [0.612, 0.046, 0.036], [0.662, 0.032, 0.026],
  [0.706, 0.040, 0.032], [0.760, 0.030, 0.024], [0.806, 0.048, 0.038],
  [0.862, 0.034, 0.028], [0.910, 0.042, 0.032], [0.962, 0.030, 0.026]
];

/* ── the colours on the palette ──────────────────────────────── */

// The sky is a luminous night, not a black one: cobalt through the whole
// middle of the ramp, deep ultramarine in the troughs, and a cream that is
// warm at the top.
const SKY_RAMP = [
  [232, 60, 20], [229, 60, 26], [226, 58, 32], [222, 56, 39],
  [218, 52, 46], [212, 46, 54], [206, 40, 62], [199, 33, 70],
  [190, 25, 78], [104, 16, 85], [54, 24, 90]
];
const GREENS = [[186, 30, 60], [170, 26, 68], [150, 20, 75], [120, 16, 80]];
const GOLDS = [[52, 72, 74], [50, 60, 82], [48, 46, 88], [46, 84, 66]];

/**
 * The sky as a stream function. Its contour lines are the lines the brush
 * follows, and the value runs light-dark-light along the gradient — which
 * is what makes the picture's sky a set of banded waves rather than a
 * smooth field. Each vortex is a hill in the function, so the contours
 * close around it and the brush turns.
 */
function psi(S, x, y) {
  const F = S.F, m = S.m;
  const u = (x - F.x) / m, v = (y - F.y) / m;
  let p = v * 2.55
    + Math.sin(u * 1.65 + 0.6) * 0.62
    + Math.sin(u * 3.2 - 0.4) * 0.26
    + Math.sin(u * 0.9 + 2.1) * 0.5
    + Math.sin(v * 2.4 + 1.3) * 0.14;
  for (const vt of S.vorts) {
    const dx = (x - vt.x) / vt.r, dy = (y - vt.y) / (vt.r * 0.86);
    p += vt.a * Math.exp(-(dx * dx + dy * dy) * 0.5);
  }
  return p;
}

const BANDS = 11.5;     // how many light-dark waves cross the sky

/**
 * The brush runs along the contours: perpendicular to the gradient. At the
 * very eye of a vortex the gradient vanishes and the direction would be
 * meaningless, so there the brush is simply told to go round.
 */
function flowAt(S, x, y) {
  const h = S.m * 0.005;
  const dpx = (psi(S, x + h, y) - psi(S, x - h, y)) / (2 * h);
  const dpy = (psi(S, x, y + h) - psi(S, x, y - h)) / (2 * h);
  const g = Math.hypot(dpx, dpy);
  if (g > 0.35) return Math.atan2(-dpx, dpy);
  let best = null, bestD = Infinity;
  for (const vt of S.vorts) {
    const d = Math.hypot(x - vt.x, y - vt.y);
    if (d < bestD) { bestD = d; best = vt; }
  }
  const round = Math.atan2(y - best.y, x - best.x) + Math.PI / 2 * best.spin;
  if (g < 0.08) return round;
  const t = (g - 0.08) / 0.27;
  const a = Math.atan2(-dpx, dpy);
  return Math.atan2(Math.sin(a) * t + Math.sin(round) * (1 - t),
                    Math.cos(a) * t + Math.cos(round) * (1 - t));
}

/** Where a point sits in the light-dark wave: -1 trough, +1 crest. */
const bandAt = (S, x, y) => Math.sin(psi(S, x, y) * BANDS);

/** How much the sky is turning here — the swirls carry the brightest paint. */
function nearness(S, x, y) {
  let n = 0;
  for (const vt of S.vorts) {
    const dx = (x - vt.x) / (vt.r * 2.1), dy = (y - vt.y) / (vt.r * 1.8);
    n = Math.max(n, clamp(1 - Math.hypot(dx, dy)) * Math.min(1, Math.abs(vt.a) / 1.6));
  }
  return n;
}

/** How near the light of a star or the moon — this is what carries yellow. */
function glowAt(S, x, y) {
  let g = clamp(1 - Math.hypot(x - S.moon.x, y - S.moon.y) / (S.moon.r * 4.6));
  for (const p of S.starPts) g = Math.max(g, clamp(1 - Math.hypot(x - p.x, y - p.y) / (p.r * 3.4)));
  return g;
}

/**
 * The design. A luminous night: cobalt almost everywhere, running lighter
 * along the crest of each wave and darker in its trough, opening to cream
 * where the sky turns and where a light burns.
 */
function lumAt(S, F, x, y) {
  const v = clamp((y - F.y) / (S.horizon - F.y));
  const base = 0.34 - 0.06 * Math.pow(v, 1.6);
  // the crests are much narrower than the troughs: the sky stays blue, and
  // only the top of each wave comes up to cream
  const b = bandAt(S, x, y);
  const band = (b > 0 ? Math.pow(b, 1.7) : -Math.pow(-b, 1.1) * 0.8) * 0.26;
  const swirl = Math.pow(nearness(S, x, y), 1.4) * 0.17;
  const glow = Math.pow(glowAt(S, x, y), 1.5) * 0.36;
  return clamp(base + band + swirl + glow, 0.03, 0.97);
}

/* ── the shapes ──────────────────────────────────────────────── */

const cypAxis = (C4, v) => C4.x + C4.w * (Math.sin(v * 2.4) * 0.15 - v * 0.2);
const cypSpan = (C4, v) => {
  const taper = Math.pow(1 - Math.pow(v, 2.8), 0.5);
  const lobes = 1 + 0.15 * Math.sin(v * 6.2 + 0.6) + 0.09 * Math.sin(v * 3.1 + 2.2);
  return C4.w * taper * lobes;
};

function cypressOutline(C4) {
  const right = [], left = [], n = 140;
  for (let i = 0; i <= n; i++) {
    const v = i / n;
    const y = lerp(C4.base, C4.top, v);
    const ax = cypAxis(C4, v), sp = cypSpan(C4, v);
    const lick = 1 + v * 0.9;
    const tR = (Math.sin(v * 12.3) * 0.3 + Math.sin(v * 5.1 + 1.1) * 0.24 + Math.sin(v * 27) * 0.17
                + Math.sin(v * 43 + 0.6) * 0.11 + Math.sin(v * 71 + 2.1) * 0.06) * lick;
    const tL = (Math.sin(v * 9.7 + 2.3) * 0.3 + Math.sin(v * 6.4 + 0.4) * 0.24 + Math.sin(v * 21) * 0.17
                + Math.sin(v * 37 + 1.7) * 0.11 + Math.sin(v * 63 + 0.9) * 0.06) * lick;
    right.push({ x: ax + Math.max(C4.w * 0.02, sp * (1 + tR)), y });
    left.push({ x: ax - Math.max(C4.w * 0.02, sp * (1 + tL)), y });
  }
  const pts = right.concat(left.reverse());
  pts.push(pts[0]);
  return pts;
}

/** Inside the tree the paint climbs and curls outward. */
const cypFlow = (v, off) => -Math.PI / 2 + off * 0.72 + Math.sin(v * 8.5 + off * 2.4) * 0.42;

function hillsPts(S, F) {
  const pts = [];
  for (let k = 0; k <= 70; k++) {
    const u = k / 70;
    pts.push({
      x: F.x + F.w * u,
      y: S.horizon - F.h * (0.06 * Math.sin(u * Math.PI * 1.35 + 0.5)
                            + 0.026 * Math.sin(u * Math.PI * 3.9 + 1.2)
                            + 0.013 * Math.sin(u * Math.PI * 8.1)
                            + 0.006 * Math.sin(u * Math.PI * 15.3))
    });
  }
  pts.push({ x: F.x + F.w, y: S.horizon + F.h * 0.05 }, { x: F.x, y: S.horizon + F.h * 0.05 });
  return pts;
}

const furrowY = (S, F, u, d) =>
  S.horizon + F.h * (0.04 + d * 0.23)
  + F.h * (0.013 * Math.sin(u * Math.PI * 2.1 + 0.4) + 0.007 * Math.sin(u * Math.PI * 5.3));

function housePts(S, F, i) {
  const [u, hh, ww] = HOUSES[i];
  const x = F.x + F.w * u, hpx = F.h * hh, wpx = S.m * ww;
  const lean = Math.sin(i * 2.3) * wpx * 0.12;
  return [
    { x: x - wpx, y: S.horizon + hpx * 0.4 },
    { x: x - wpx + lean, y: S.horizon - hpx * 0.72 },
    { x: x + lean * 0.5, y: S.horizon - hpx },
    { x: x + wpx + lean, y: S.horizon - hpx * 0.72 },
    { x: x + wpx, y: S.horizon + hpx * 0.4 }
  ];
}

/** The church: a thin steeple that goes up into the sky, as it does. */
/**
 * The church tower and its steeple as one silhouette, from the horizon to
 * the tip. The sky is cut around this, so it has to reach all the way down
 * or a strip of bare canvas is left standing under the steeple.
 */
function spirePts(S, F) {
  const sp = S.spire;
  const shoulder = sp.base - sp.h * 0.42;
  return [
    { x: sp.x - sp.w * 1.5, y: S.horizon + F.h * 0.012 },
    { x: sp.x - sp.w * 1.5, y: shoulder },
    { x: sp.x, y: sp.base - sp.h },
    { x: sp.x + sp.w * 1.5, y: shoulder },
    { x: sp.x + sp.w * 1.5, y: S.horizon + F.h * 0.012 }
  ];
}

function topYAt(polys, x) {
  let best = Infinity;
  for (const pl of polys) {
    for (let i = 0; i < pl.length; i++) {
      const a = pl[i], b = pl[(i + 1) % pl.length];
      if ((a.x <= x && b.x >= x) || (b.x <= x && a.x >= x)) {
        const t = (x - a.x) / ((b.x - a.x) || 1e-6);
        const y = a.y + (b.y - a.y) * t;
        if (y < best) best = y;
      }
    }
  }
  return best;
}

function skyPts(S, F) {
  const polys = [hillsPts(S, F), spirePts(S, F)];
  for (let i = 0; i < HOUSES.length; i++) polys.push(housePts(S, F, i));
  const out = [{ x: F.x - 4, y: F.y - 4 }, { x: F.x + F.w + 4, y: F.y - 4 }];
  const n = 300;
  for (let i = n; i >= 0; i--) {
    const x = F.x + F.w * (i / n);
    const y = topYAt(polys, x);
    out.push({ x, y: isFinite(y) ? y : S.horizon });
  }
  return out;
}

/* ── laying the sky ──────────────────────────────────────────── */

/**
 * One loading of the brush: a line traced through the flow field with a
 * run of marks along it, all of one colour. The value design decides
 * that colour, how long the marks are and how much paint they carry.
 */
function ribbons(S, F, opts) {
  const {
    seed, gap, step, run = [4, 12], len, wide, jitter = 1,
    lumShift = 0, greenChance = 0.16, weight = null, bandH, sizeByLum = 1
  } = opts;
  const rr = makeRng(seed);
  const out = [];
  const top = F.y - gap, bottom = S.horizon + gap;
  const rows = Math.ceil((bottom - top) / gap);
  const cols = Math.ceil((F.w + gap * 2) / gap);

  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const hx = F.x - gap + (i + (rr() - 0.5) * jitter) * gap;
      const hy = top + (j + (rr() - 0.5) * jitter) * gap;
      const k = rr(), r2 = rr(), r3 = rr(), r4 = rr();
      if (weight && weight(hx, hy) < r2) continue;

      const lum = clamp(lumAt(S, F, hx, hy) + lumShift + (k - 0.5) * 0.14);
      const glow = glowAt(S, hx, hy);
      let col;
      if (glow > 0.74 && r3 < (glow - 0.74) * 3) {
        col = GOLDS[Math.floor(r4 * GOLDS.length)];
      } else if (r3 < greenChance && lum > 0.42) {
        col = GREENS[Math.floor(clamp((lum - 0.42) / 0.45) * (GREENS.length - 1) + r4 * 0.6)];
      } else {
        const idx = Math.pow(clamp(lum), 1.25) * (SKY_RAMP.length - 1);
        col = SKY_RAMP[Math.max(0, Math.min(SKY_RAMP.length - 1, Math.round(idx + (r4 - 0.5) * 1.3)))];
      }
      col = [col[0] + (k - 0.5) * 7, col[1] * (0.9 + r2 * 0.2), col[2] + (r3 - 0.5) * 5];

      // the brush is fuller and travels further through the light passages
      const scale = 1 + (lum - 0.4) * 0.9 * sizeByLum;
      const n = run[0] + Math.floor(r2 * (run[1] - run[0]));
      const L = len * scale * (0.6 + k * 0.85);
      const W = wide * scale * (0.62 + r3 * 0.8);

      let x = hx, y = hy;
      const marks = [];
      for (let t = 0; t < n; t++) {
        const a = flowAt(S, x, y);
        const fade = 1 - Math.pow(t / n, 1.7) * 0.4;
        marks.push({
          x, y, a, col, k, lum,
          len: L * fade, wide: W * fade,
          alpha: 0.94 - (t / n) * 0.18,
          // the brush lifts every few marks, and lands blunt again
          tail: t === n - 1 ? 0.8 : 0.3 + (t / n) * 0.3
        });
        x += Math.cos(a) * step * scale;
        y += Math.sin(a) * step * scale;
        if (y > bottom || y < top || x < F.x - gap * 2 || x > F.x + F.w + gap * 2) break;
      }
      out.push({ y: hy, x: hx, marks });
    }
  }
  const band = bandH || gap * 3;
  out.sort((p, q) => Math.floor(p.y / band) - Math.floor(q.y / band) || p.x - q.x);
  const flat = [];
  for (const r of out) for (const mk of r.marks) flat.push(mk);
  return flat;
}

export const subject = {
  id: 'starry-night',
  title: 'The Starry Night',
  artist: 'Vincent van Gogh',
  year: 1889,
  layered: true,
  palette: {
    canvas:    [38, 22, 74],  ground:     [24, 30, 34],
    sketchInk: [224, 26, 28],
    skyUnder:  [232, 58, 10],
    skyDeep:   [228, 64, 14],  skyMid:    [221, 56, 24],  skyHigh: [212, 48, 34],
    swirl:     [204, 44, 54],  swirlPale: [168, 26, 71],  swirlMid: [196, 40, 58],
    star:      [46, 84, 62],   starCore:  [48, 72, 90],   starRim: [40, 80, 52],
    moon:      [45, 88, 60],   moonCore:  [48, 78, 88],   moonWarm: [34, 86, 52],
    hill:      [222, 48, 9],   hillLight: [206, 36, 16],  hillOlive: [104, 24, 13],
    village:   [228, 46, 7],   roof:      [226, 44, 6],   roofWarm: [14, 38, 9],
    villageLit:[44, 94, 64],  church: [206, 16, 50],   churchRoof: [222, 40, 11],
    bush:      [204, 28, 40],  bushPale:  [192, 20, 56],  bushDark: [220, 42, 20],
    wall:      [216, 32, 13],  wallPale:  [202, 22, 20],
    field:     [226, 48, 9],   fieldLight:[204, 32, 17],  fieldOlive: [92, 26, 11],
    cypress:   [24, 52, 4],    cypressMid:[30, 46, 7],    cypressLit: [36, 38, 12],
    cypressWarm:[16, 54, 8],   cypressAsh:[92, 20, 13],   cypressDeep: [108, 44, 3],
    shadow:    [228, 44, 6],   light:     [48, 55, 86],
    surround:  [226, 28, 7]
  },

  focus(F) { const S = scene(F); return [{ x: S.px(0.5), y: S.py(0.4) }]; },

  draw(g) {
    const { F, C, m } = g;
    const S = g.cache('scene', () => scene(F));
    const sky = g.cache('sky', () => skyPts(S, F));
    const cyp = g.cache('cypress', () => cypressOutline(S.cypress));
    const cyp2 = g.cache('cypress2', () => cypressOutline(S.cypress2));
    const hills = g.cache('hills', () => hillsPts(S, F));

    const shape = (pts) => (c) => poly(c, pts);
    const onCypress = (c) => { poly(c, cyp); poly(c, cyp2); };
    const k = {
      sky, cyp, cyp2, hills,
      inSky: (fn) => g.clipOut(shape(sky), onCypress, fn),
      inShape: (pts) => (fn) => g.clipOut(shape(pts), onCypress, fn),
      inCypress: (fn) => g.clip(shape(cyp), fn),
      inCypress2: (fn) => g.clip(shape(cyp2), fn),
      open: (build) => (fn) => g.clipOut(build, onCypress, fn)
    };

    drawing(g, S, F, C, m, k);
    underpaint(g, S, F, C, m, k);
    skyPaint(g, S, F, C, m, k);
    land(g, S, F, C, m, k);
    lights(g, S, F, C, m, k);
    finish(g, S, F, C, m, k);
  }
};

/* ── 0.06–0.30 the drawing ───────────────────────────────────── */
function drawing(g, S, F, C, m, k) {
  const { ctx } = g;
  const ink = C.sketchInk;
  const line = (from, to, pts, opts = {}) =>
    g.line(from, to, pts, (part) => charcoal(ctx, part, ink, {
      alpha: 0.5, width: m * 0.0035, wobble: m * 0.0032, seed: opts.seed || 1, ...opts
    }));

  line(0.058, 0.076, [{ x: F.x, y: S.horizon }, { x: F.x + F.w, y: S.horizon - F.h * 0.005 }],
       { alpha: 0.5, width: m * 0.004 });
  line(0.072, 0.090, [{ x: F.x, y: S.horizon + F.h * 0.012 }, { x: F.x + F.w, y: S.horizon + F.h * 0.004 }],
       { alpha: 0.22, passes: 1 });
  line(0.086, 0.114, k.hills.slice(0, 71), { alpha: 0.46, seed: 3 });
  for (let i = 0; i < 3; i++) {
    const off = F.h * (0.014 + i * 0.013);
    line(0.110 + i * 0.012, 0.130 + i * 0.012,
         k.hills.slice(0, 71).map((q) => ({ x: q.x, y: q.y + off })),
         { alpha: 0.2, passes: 1, seed: 5 + i });
  }
  line(0.140, 0.172, k.cyp, { alpha: 0.55, width: m * 0.0042, seed: 9 });

  g.batch(0.168, 0.196, 'cypDraw', () => {
    const rr = makeRng(0x0c9), out = [];
    for (let i = 0; i < 46; i++) {
      const u = 0.04 + rr() * 0.9, side = rr() < 0.5 ? -1 : 1;
      const pts = [];
      for (let j = 0; j <= 9; j++) {
        const v = Math.min(0.99, u + (j / 9) * 0.1);
        pts.push({
          x: cypAxis(S.cypress, v) + side * cypSpan(S.cypress, v) * (0.2 + 0.72 * Math.sin(j * 0.6 + i)),
          y: lerp(S.cypress.base, S.cypress.top, v)
        });
      }
      out.push(pts);
    }
    return out;
  }, (pts) => charcoal(ctx, pts, ink, { alpha: 0.3, width: m * 0.003, wobble: m * 0.002, seed: 11 }));

  g.batch(0.192, 0.226, 'vilDraw', () => {
    const out = [];
    for (let i = 0; i < HOUSES.length; i++) {
      const hp = housePts(S, F, i);
      out.push(hp.concat([hp[0]]));
      out.push([hp[1], hp[3]]);
      const mid = { x: (hp[0].x + hp[4].x) / 2, y: hp[0].y };
      out.push([{ x: mid.x, y: hp[2].y + (hp[0].y - hp[2].y) * 0.45 }, mid]);
    }
    const sp = spirePts(S, F);
    out.push(sp.concat([sp[0]]));
    out.push([{ x: S.spire.x, y: S.spire.base - S.spire.h * 1.1 }, { x: S.spire.x, y: S.spire.base - S.spire.h * 0.3 }]);
    return out;
  }, (pts) => charcoal(ctx, pts, ink, { alpha: 0.36, width: m * 0.0028, wobble: m * 0.0016, seed: 13 }));

  g.batch(0.222, 0.242, 'lightDraw', () => {
    const out = [
      ellipsePts(S.moon.x, S.moon.y, S.moon.r, S.moon.r, 36),
      ellipsePts(S.moon.x + S.moon.r * 0.55, S.moon.y - S.moon.r * 0.18, S.moon.r * 0.92, S.moon.r * 0.92, 36)
    ];
    const rr = makeRng(0x57a);
    S.starPts.forEach((p) => {
      for (let i = 0; i < 2; i++) {
        out.push(ellipsePts(p.x + (rr() - 0.5) * p.r * 0.3, p.y + (rr() - 0.5) * p.r * 0.3,
                            p.r * (0.8 + rr() * 0.5), p.r * (0.8 + rr() * 0.5), 18));
      }
      out.push(ellipsePts(p.x, p.y, p.r * 2.1, p.r * 2.1, 22));
    });
    return out;
  }, (pts) => charcoal(ctx, pts, ink, { alpha: 0.3, width: m * 0.0026, wobble: m * 0.0014, seed: 17 }));

  g.batch(0.238, 0.266, 'swirlDraw', () => {
    const out = [];
    for (const v of S.vorts) {
      const turns = 1.1 + Math.abs(v.a) * 0.2;
      for (let i = 0; i < 2; i++) {
        const spiral = [];
        for (let j = 0; j <= 110; j++) {
          const u = j / 110, a = u * TAU * turns * v.spin + i * Math.PI;
          spiral.push({
            x: v.x + Math.cos(a) * v.r * 1.7 * (0.12 + u * 0.82),
            y: v.y + Math.sin(a) * v.r * 1.5 * (0.12 + u * 0.82)
          });
        }
        out.push(spiral);
      }
    }
    const rr = makeRng(0x5f10);
    for (let i = 0; i < 30; i++) {
      const pts = [];
      let x = F.x + rr() * F.w, y = F.y + rr() * (S.horizon - F.y);
      for (let j = 0; j < 22; j++) {
        pts.push({ x, y });
        const a = flowAt(S, x, y);
        x += Math.cos(a) * S.m * 0.03; y += Math.sin(a) * S.m * 0.03;
      }
      out.push(pts);
    }
    return out;
  }, (pts) => charcoal(ctx, pts, ink, { alpha: 0.2, width: m * 0.0024, wobble: m * 0.0012, passes: 1, seed: 19 }));

  const hatchInto = (pts, key, make, from, to, alpha) => {
    if (!g.span(from, to)) return;
    g.clip((c) => poly(c, pts), () => {
      g.batch(from, to, key, make, (s) =>
        charcoal(ctx, segPts(s), ink, {
          alpha: alpha * (0.5 + s.k * 0.8), width: m * 0.0026, wobble: m * 0.0011, passes: 1, seed: 23
        }));
    });
  };
  hatchInto(k.cyp, 'cypHatch', () => {
    const rr = makeRng(0x0d1);
    const b = { x: S.cypress.x - S.cypress.w * 2, y: S.cypress.top, w: S.cypress.w * 4, h: S.cypress.base - S.cypress.top };
    return hatchSegs(b, -1.25, m * 0.0075, { rng: rr, pieces: 4 })
      .concat(hatchSegs(b, -1.9, m * 0.011, { rng: rr, pieces: 4 }))
      .concat(hatchSegs(b, -0.7, m * 0.02, { rng: rr, pieces: 3 }));
  }, 0.246, 0.272, 0.5);
  hatchInto(k.hills, 'hillHatch', () => {
    const rr = makeRng(0x0d2);
    const b = { x: F.x, y: S.horizon - F.h * 0.1, w: F.w, h: F.h * 0.15 };
    return hatchSegs(b, -0.32, m * 0.01, { rng: rr, pieces: 3 })
      .concat(hatchSegs(b, 0.5, m * 0.022, { rng: rr, pieces: 3 }));
  }, 0.268, 0.288, 0.34);
  hatchInto([{ x: F.x, y: S.horizon }, { x: F.x + F.w, y: S.horizon },
             { x: F.x + F.w, y: F.y + F.h }, { x: F.x, y: F.y + F.h }], 'vilHatch', () => {
    const rr = makeRng(0x0d3);
    const b = { x: F.x, y: S.horizon, w: F.w, h: F.y + F.h - S.horizon };
    return hatchSegs(b, 0.28, m * 0.0095, { rng: rr, pieces: 3 })
      .concat(hatchSegs(b, -0.5, m * 0.024, { rng: rr, pieces: 4 }));
  }, 0.262, 0.286, 0.3);
  hatchInto(k.sky, 'skyHatch', () => {
    const rr = makeRng(0x0d4);
    const b = { x: F.x, y: F.y, w: F.w, h: S.horizon - F.y };
    const dark = (x, y) => clamp(0.62 - lumAt(S, F, x, y)) * 3;
    return hatchSegs(b, -0.62, m * 0.02, { rng: rr, over: 1, pieces: 6, weight: dark })
      .concat(hatchSegs(b, 0.7, m * 0.03, { rng: rr, over: 1, pieces: 5, weight: dark }));
  }, 0.276, 0.300, 0.18);
}

/* ── 0.30–0.43 the underpainting ─────────────────────────────── */
function layIn(box, step, seed, angFn) {
  const rr = makeRng(seed);
  const out = [{ wash: true }];
  const dy = step * 0.6;
  for (let y = box.y - step; y < box.y + box.h + step; y += dy) {
    for (let x = box.x - step; x < box.x + box.w + step; x += step * 0.7) {
      const jx = x + (rr() - 0.5) * step, jy = y + (rr() - 0.5) * dy * 1.4;
      out.push({ x: jx, y: jy, k: rr(), a: angFn(jx, jy, rr) });
    }
  }
  out.sort((p, q) => (p.wash ? -1 : q.wash ? 1 : 0) || p.y - q.y || p.x - q.x);
  return out;
}

function underpaint(g, S, F, C, m, k) {
  const { ctx } = g;
  const scrub = (col, alpha, wideK, shape, lumK = 0) => (q) => {
    if (q.wash) {
      ctx.save();
      ctx.globalAlpha = 0.76;
      ctx.fillStyle = css(col, 1, -3);
      if (shape) { pathOf(ctx, shape); ctx.fill(); }
      else ctx.fillRect(F.x, F.y, F.w, F.h);
      ctx.restore();
      return;
    }
    // even the underpainting carries the design: darker where the picture
    // will be dark, so the dark passages never have to be dug back out
    const l = lumK ? (lumAt(S, F, q.x, q.y) - 0.35) * lumK : 0;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = css([col[0] + (q.k - 0.5) * 10, col[1] * (0.88 + q.k * 0.24), col[2] + (q.k - 0.5) * 8 + l]);
    ctx.lineWidth = m * wideK * (0.7 + q.k * 0.7);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(q.x, q.y);
    ctx.lineTo(q.x + Math.cos(q.a) * m * 0.06, q.y + Math.sin(q.a) * m * 0.06);
    ctx.stroke();
    ctx.restore();
  };

  if (g.span(0.302, 0.372)) {
    k.inSky(() => {
      g.batch(0.302, 0.372, 'skyUnder',
        () => layIn({ x: F.x, y: F.y, w: F.w, h: S.horizon - F.y }, m * 0.028, 0x51, (x, y) => flowAt(S, x, y)),
        scrub(C.skyUnder, 0.6, 0.036, null, 14));
    });
  }
  if (g.span(0.338, 0.428)) {
    k.inShape(k.hills)(() => {
      g.batch(0.338, 0.396, 'hillUnder',
        () => layIn({ x: F.x, y: S.horizon - F.h * 0.12, w: F.w, h: F.h * 0.19 }, m * 0.028, 0x52,
                    (x, y, rr) => -0.08 + (rr() - 0.5) * 0.4),
        scrub(C.hill, 0.64, 0.032, k.hills));
    });
    k.open((c) => {
      c.rect(F.x, S.horizon - F.h * 0.02, F.w, F.y + F.h - S.horizon + F.h * 0.02);
      for (let i = 0; i < HOUSES.length; i++) poly(c, housePts(S, F, i));
      poly(c, spirePts(S, F));
    })(() => {
      g.batch(0.356, 0.418, 'vilUnder',
        () => layIn({ x: F.x, y: S.horizon - F.h * 0.1, w: F.w, h: F.h * 0.4 }, m * 0.028, 0x53,
                    (x, y, rr) => 0.04 + (rr() - 0.5) * 0.3),
        scrub(C.village, 0.66, 0.034, [
          { x: F.x, y: S.horizon - F.h * 0.11 }, { x: F.x + F.w, y: S.horizon - F.h * 0.11 },
          { x: F.x + F.w, y: F.y + F.h }, { x: F.x, y: F.y + F.h }
        ]));
    });
    for (const [tree, key, sd] of [[S.cypress, 'cypUnder', 0x54], [S.cypress2, 'cyp2Under', 0x55]]) {
    (tree === S.cypress ? k.inCypress : k.inCypress2)(() => {
      g.batch(0.348, 0.408, key,
        () => layIn({ x: tree.x - tree.w * 1.8, y: tree.top,
                      w: tree.w * 3.6, h: tree.base - tree.top }, m * 0.02, sd,
                    (x, y, rr) => -Math.PI / 2 + (rr() - 0.5) * 0.6),
        scrub(C.cypress, 0.86, 0.032, tree === S.cypress ? k.cyp : k.cyp2));
    });
    }
  }
}

/* ── 0.38–0.76 the sky ───────────────────────────────────────── */
function skyPaint(g, S, F, C, m, k) {
  const { ctx } = g;
  const lay = (q) => oil(ctx, q.x, q.y, q.len, q.a, q.wide, q.col, {
    alpha: q.alpha, curve: 0.5, tail: q.tail, k: q.k,
    bristle: q.wide > m * 0.008 ? 3 : 2,
    relief: 0.8 + q.lum * 0.6
  });

  // first working: the body of the sky, ribbon beside ribbon
  if (g.span(0.382, 0.598)) {
    k.inSky(() => {
      g.batch(0.382, 0.598, 'skyA',
        () => ribbons(S, F, {
          seed: 0x5eed, gap: m * 0.0165, step: m * 0.0125, run: [5, 14],
          len: m * 0.030, wide: m * 0.0062, bandH: m * 0.055, greenChance: 0.1
        }), lay);
    });
  }

  // second working over the first: the light passages taken further
  if (g.span(0.556, 0.756)) {
    k.inSky(() => {
      g.batch(0.556, 0.756, 'skyB',
        () => ribbons(S, F, {
          seed: 0x7a1e, gap: m * 0.019, step: m * 0.0108, run: [4, 11],
          len: m * 0.026, wide: m * 0.0052, bandH: m * 0.06,
          lumShift: 0.12, greenChance: 0.22, sizeByLum: 1.3,
          weight: (x, y) => 0.32 + lumAt(S, F, x, y) * 1.1
        }), lay);
    });
  }
}

/* ── 0.50–0.90 the land ──────────────────────────────────────── */
function land(g, S, F, C, m, k) {
  const { ctx } = g;

  if (g.span(0.500, 0.648)) {
    k.inShape(k.hills)(() => {
      g.batch(0.500, 0.648, 'hillPaint', () => {
        const rr = makeRng(0x61), out = [];
        for (let i = 0; i < 5600; i++) {
          const u = rr(), d = Math.pow(rr(), 0.75);
          const ridge = S.horizon - F.h * (0.06 * Math.sin(u * Math.PI * 1.35 + 0.5)
                                           + 0.026 * Math.sin(u * Math.PI * 3.9 + 1.2)
                                           + 0.013 * Math.sin(u * Math.PI * 8.1));
          out.push({ x: F.x + u * F.w, y: ridge + d * F.h * 0.18, u, d, k: rr(), r2: rr() });
        }
        return out.sort((p, q) => p.y - q.y);
      }, (q) => {
        const col = q.k < 0.12 ? C.hillOlive : q.k < 0.34 ? C.hillLight : C.hill;
        const slope = Math.cos(q.u * Math.PI * 1.35 + 0.5) * 0.5;
        oil(ctx, q.x, q.y, m * (0.014 + q.k * 0.02), slope * 0.5 + (q.r2 - 0.5) * 0.4,
            m * (0.004 + q.k * 0.0038),
            [col[0] + (q.k - 0.5) * 10, col[1], col[2] + (q.r2 - 0.5) * 6 - q.d * 2],
            { alpha: 0.72, curve: 0.35, tail: 0.5, k: q.k, bristle: 2, relief: 0.7 });
      });
    });
  }

  if (g.span(0.574, 0.716)) {
    k.open((c) => c.rect(F.x, F.y, F.w, F.h))(() => {
      g.batch(0.574, 0.616, 'houses', () => {
        const rr = makeRng(0x60), out = [];
        for (let i = 0; i < HOUSES.length; i++) {
          const h = housePts(S, F, i);
          out.push({ wall: [h[0], h[1], h[3], h[4]], roof: [h[1], h[2], h[3]], k: rr(), pale: rr() < 0.3 });
        }
        // the church stands above the roofs: a pale body and a steeple
        const sp = S.spire, bw = sp.w * 2.6, bh = F.h * 0.042;
        out.push({
          church: true, k: rr(),
          wall: [{ x: sp.x - bw, y: S.horizon + F.h * 0.012 }, { x: sp.x - bw, y: S.horizon - bh },
                 { x: sp.x + bw, y: S.horizon - bh }, { x: sp.x + bw, y: S.horizon + F.h * 0.012 }],
          roof: [{ x: sp.x - bw * 1.12, y: S.horizon - bh },
                 { x: sp.x, y: S.horizon - bh - F.h * 0.016 },
                 { x: sp.x + bw * 1.12, y: S.horizon - bh }],
          // the tower carries the steeple up out of the village
          steeple: spirePts(S, F)
        });
        return out;
      }, (q) => {
        ctx.save();
        if (q.church) {
          // the body and tower catch the light; the roof and steeple are the
          // darkest things in the village
          // the tower and steeple are the darkest thing in the village; the
          // body of the church catches what light there is
          ctx.fillStyle = css(C.churchRoof, 0.99, 4);
          pathOf(ctx, q.steeple); ctx.fill();
          ctx.fillStyle = css(C.church, 0.99, (q.k - 0.5) * 5);
          pathOf(ctx, q.wall); ctx.fill();
          ctx.fillStyle = css(C.churchRoof, 0.99);
          pathOf(ctx, q.roof); ctx.fill();
          ctx.restore();
          return;
        }
        ctx.fillStyle = css(q.pale ? C.wallPale : C.wall, 0.99, (q.k - 0.5) * 6);
        pathOf(ctx, q.wall); ctx.fill();
        if (q.roof) {
          ctx.fillStyle = css(q.k < 0.16 ? C.roofWarm : C.roof, 0.99, (q.k - 0.5) * 5);
          pathOf(ctx, q.roof); ctx.fill();
        }
        ctx.restore();
      });
    });
    k.open((c) => {
      for (let i = 0; i < HOUSES.length; i++) poly(c, housePts(S, F, i));
      poly(c, spirePts(S, F));
    })(() => {
      g.batch(0.600, 0.716, 'housePaint', () => {
        const rr = makeRng(0x62), out = [];
        for (let i = 0; i < 4200; i++) {
          out.push({
            x: F.x + rr() * F.w,
            y: S.horizon - F.h * 0.1 + rr() * F.h * 0.15,
            k: rr(), r2: rr(), roofy: rr() < 0.42
          });
        }
        return out.sort((p, q) => p.y - q.y);
      }, (q) => {
        const col = q.roofy ? (q.k < 0.16 ? C.roofWarm : C.roof) : (q.k < 0.32 ? C.wallPale : C.wall);
        oil(ctx, q.x, q.y, m * (0.007 + q.k * 0.009), q.roofy ? -0.85 + (q.r2 - 0.5) * 0.3 : (q.r2 - 0.5) * 0.24,
            m * (0.003 + q.k * 0.0024),
            [col[0] + (q.k - 0.5) * 8, col[1], col[2] + (q.r2 - 0.5) * 7],
            { alpha: 0.7, curve: 0.2, tail: 0.4, k: q.k, bristle: 0, relief: 0.7 });
      });
    });
  }

  // the cypress: long curling strokes that climb it, not a bristle texture
  if (g.span(0.580, 0.848)) {
    const trace = (C4, seed, count, run, lenK, wideK) => () => {
        const rr = makeRng(seed), out = [];
        for (let i = 0; i < count; i++) {
          let v = Math.pow(rr(), 0.8);
          let off = (rr() - 0.5) * 2.05;
          const k0 = rr(), r2 = rr();
          const n = run[0] + Math.floor(rr() * (run[1] - run[0]));
          const marks = [];
          for (let t = 0; t < n; t++) {
            const ax = cypAxis(C4, v), sp = Math.max(cypSpan(C4, v), C4.w * 0.05);
            const x = ax + off * sp, y = lerp(C4.base, C4.top, v);
            const a = cypFlow(v, off) + (r2 - 0.5) * 0.25;
            const fade = 1 - Math.pow(t / n, 1.8) * 0.45;
            marks.push({ x, y, a, v, off, k: k0, r2, len: lenK * (0.55 + k0 * 1.0) * fade, wide: wideK * (0.6 + r2 * 0.8) * fade });
            v += (lenK * 0.6) / (C4.base - C4.top);
            off += Math.sin(v * 7 + i) * 0.11;
            if (v >= 1) break;
          }
          out.push({ y: marks[0].y, marks });
        }
      out.sort((p, q) => q.y - p.y);
      const flat = [];
      for (const r of out) for (const mk of r.marks) flat.push(mk);
      return flat;
    };
    k.inCypress(() => {
      // the sky lights the outside of the tree; its middle stays black. On
      // top of that the foliage grows in clumps, so the light breaks up
      // rather than grading evenly from edge to edge.
      const clump = (q) => {
        const a = Math.sin(q.v * 23 + q.off * 4.1), b = Math.sin(q.v * 9.4 - q.off * 2.6);
        return clamp(0.5 + 0.62 * a * b);
      };
      const rim = (q) => clamp(Math.pow(Math.abs(q.off) / 1.05, 1.8) * 0.66 + Math.pow(clump(q), 1.6) * 0.62);
      g.batch(0.580, 0.700, 'cypA', trace(S.cypress, 0x303, 3000, [5, 14], m * 0.030, m * 0.0058), (q) => {
        const r = rim(q);
        const col = q.k < 0.14 ? C.cypressDeep : q.k < 0.34 ? C.cypressMid : C.cypress;
        oil(ctx, q.x, q.y, q.len, q.a, q.wide,
            [col[0] + r * 6, col[1] * (1 - r * 0.1), col[2] + (q.r2 - 0.5) * 2 + r * 3],
            { alpha: 0.9, curve: 0.6, tail: 0.5, k: q.k, bristle: 2, relief: 0.3 + r * 0.28 });
      });
      g.batch(0.688, 0.800, 'cypB', trace(S.cypress, 0x304, 2600, [5, 13], m * 0.025, m * 0.0045), (q) => {
        const r = rim(q);
        const col = q.k < 0.12 + r * 0.3 ? C.cypressLit : q.k < 0.42 ? C.cypressWarm : q.k < 0.7 ? C.cypressMid : C.cypressDeep;
        oil(ctx, q.x, q.y, q.len, q.a, q.wide,
            [col[0] + r * 8 + (q.k - 0.5) * 8, col[1] * (1 - r * 0.12),
             col[2] + (q.r2 - 0.5) * 3 + r * 5 - q.v * 1],
            { alpha: 0.82, curve: 0.75, tail: 0.6, k: q.k, bristle: 2, relief: 0.35 + r * 0.4 });
      });
      g.batch(0.790, 0.848, 'cypC', trace(S.cypress, 0x305, 1800, [4, 10], m * 0.017, m * 0.0030), (q) => {
        const r = rim(q);
        const col = q.k < 0.09 ? C.cypressAsh : q.k < 0.28 + r * 0.35 ? C.cypressLit : C.cypressMid;
        oil(ctx, q.x, q.y, q.len, q.a, q.wide,
            [col[0] + r * 5, col[1], col[2] + r * 6 + (q.r2 - 0.5) * 4],
            { alpha: 0.6 + q.k * 0.3, curve: 0.9, tail: 0.7, k: q.k, bristle: 0, relief: 0.45 + r * 0.35 });
      });
    });
    k.inCypress2(() => {
      const rim2 = (q) => clamp(Math.pow(Math.abs(q.off) / 1.05, 1.8) * 0.66
                                + Math.pow(clamp(0.5 + 0.62 * Math.sin(q.v * 23 + q.off * 4.1)
                                                 * Math.sin(q.v * 9.4 - q.off * 2.6)), 1.6) * 0.62);
      g.batch(0.596, 0.716, 'cyp2A', trace(S.cypress2, 0x313, 1500, [5, 13], m * 0.026, m * 0.0052), (q) => {
        const r = rim2(q);
        const col = q.k < 0.14 ? C.cypressDeep : q.k < 0.34 ? C.cypressMid : C.cypress;
        oil(ctx, q.x, q.y, q.len, q.a, q.wide,
            [col[0] + r * 6, col[1] * (1 - r * 0.1), col[2] + (q.r2 - 0.5) * 2 + r * 3],
            { alpha: 0.9, curve: 0.6, tail: 0.5, k: q.k, bristle: 2, relief: 0.3 + r * 0.28 });
      });
      g.batch(0.706, 0.816, 'cyp2B', trace(S.cypress2, 0x314, 1200, [5, 12], m * 0.021, m * 0.004), (q) => {
        const r = rim2(q);
        const col = q.k < 0.12 + r * 0.3 ? C.cypressLit : q.k < 0.42 ? C.cypressWarm : C.cypressMid;
        oil(ctx, q.x, q.y, q.len, q.a, q.wide,
            [col[0] + r * 8 + (q.k - 0.5) * 8, col[1] * (1 - r * 0.12), col[2] + (q.r2 - 0.5) * 3 + r * 5],
            { alpha: 0.82, curve: 0.8, tail: 0.6, k: q.k, bristle: 2, relief: 0.35 + r * 0.4 });
      });
    });
  }

  // the olive bushes along the front of the village, in curling commas
  if (g.span(0.726, 0.804)) {
    k.open((c) => c.rect(F.x, S.horizon - F.h * 0.01, F.w, F.h * 0.12))(() => {
      g.batch(0.726, 0.804, 'bushes', () => {
        const rr = makeRng(0xb05), out = [];
        for (let i = 0; i < 3200; i++) {
          const u = 0.30 + rr() * 0.72;
          if (u > 1) continue;
          // they clump into bushes rather than running as an even hedge
          const lump = 0.5 + 0.5 * Math.sin(u * 21 + Math.sin(u * 7) * 2);
          if (rr() > lump * 1.15 - 0.08) continue;
          const d = Math.pow(rr(), 0.7);
          const y = S.horizon + F.h * (0.004 + d * 0.072);
          const x = F.x + u * F.w;
          // each mark curls: that is what makes a bush read as a bush
          const a = Math.sin(u * 41 + d * 6) * 1.5 - 0.3;
          out.push({ x, y, u, d, a, k: rr(), r2: rr(), lump });
        }
        return out.sort((p, q) => p.y - q.y);
      }, (q) => {
        const col = q.k < 0.22 ? C.bushPale : q.k < 0.62 ? C.bush : C.bushDark;
        oil(ctx, q.x, q.y, m * (0.012 + q.k * 0.014), q.a, m * (0.004 + q.k * 0.004),
            [col[0] + (q.k - 0.5) * 10, col[1], col[2] + (q.r2 - 0.5) * 8 - q.d * 6],
            { alpha: 0.88, curve: 1.15, tail: 0.6, k: q.k, bristle: 2, relief: 0.5 });
      });
    });
  }

  if (g.span(0.756, 0.876)) {
    k.open((c) => c.rect(F.x, S.horizon + F.h * 0.08, F.w, F.y + F.h - S.horizon))(() => {
      g.batch(0.756, 0.876, 'field', () => {
        const rr = makeRng(0x515), out = [];
        for (let i = 0; i < 7600; i++) {
          const u = rr(), d = Math.pow(rr(), 0.75);
          out.push({ x: F.x + u * F.w, y: furrowY(S, F, u, d), u, d, k: rr(), r2: rr(), r3: rr() });
        }
        return out.sort((p, q) => p.y - q.y);
      }, (q) => {
        // the ground runs in long furrows, lighter where it rises to the
        // village and darkest at the very front of the picture
        const strip = Math.sin(q.d * 7.4 + Math.sin(q.u * 5.1) * 1.9);
        const col = strip > 0.58 + q.k * 0.34 ? C.fieldOlive : q.k < 0.24 ? C.fieldLight : C.field;
        const slope = Math.cos(q.u * Math.PI * 2.1 + 0.4) * 0.34 + (q.r3 - 0.5) * 0.12;
        oil(ctx, q.x, q.y, m * (0.02 + q.k * 0.05), slope + (q.r2 - 0.5) * 0.14,
            m * (0.0036 + q.k * 0.0042),
            [col[0] + (q.k - 0.5) * 12, col[1] * (0.88 + q.r3 * 0.3),
             col[2] + 4 - q.d * 7 + (q.r2 - 0.5) * 5],
            { alpha: 0.78, curve: 0.4, tail: 0.55, k: q.k, bristle: 2, relief: 0.45 });
      });
    });
  }
}

/* ── 0.68–0.85 the lights ────────────────────────────────────── */

/**
 * A star in this picture is not a dot with a glow. It is a core of
 * chrome yellow with rings of paler yellow worked around it in short
 * radial strokes, and then a ring of blue-green that turns with the
 * sky. Built as rings, because that is how it was painted.
 */
function lightBody(g, ctx, C, x, y, r, seed, from, to, opts = {}) {
  const { rings = 5, core = C.starCore, warm = C.star, rim = [176, 34, 52], per = 30 } = opts;
  g.batch(from, to, 'light' + seed, () => {
    const rr = makeRng(seed), out = [{ bloom: true }];
    for (let ring = 0; ring < rings; ring++) {
      const t = ring / (rings - 1);
      // the rings overlap and wander, so the light reads as a blob of paint
      const n = Math.round(per * (0.6 + t * 1.2));
      const a0 = rr() * TAU;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * TAU + (rr() - 0.5) * 0.5;
        const rad = r * (0.12 + t * 1.15) * (0.78 + rr() * 0.42);
        out.push({ t, rad, a, k: rr(), r2: rr(), ring });
      }
    }
    return out;
  }, (q) => {
    if (q.bloom) {
      ctx.save();
      const bloom = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 3.4);
      bloom.addColorStop(0, css(warm, 0.3));
      bloom.addColorStop(0.3, css(warm, 0.12));
      bloom.addColorStop(1, css(warm, 0));
      ctx.fillStyle = bloom;
      ctx.beginPath(); ctx.arc(x, y, r * 3.4, 0, TAU); ctx.fill();
      ctx.restore();
      return;
    }
    // inside: chrome yellow; outside: the sky's own green-blue
    // the outermost ring is the sky's own colour, so the light has no edge
    const col = q.t < 0.28 ? core : q.t < 0.68 ? warm : rim;
    const px = x + Math.cos(q.a) * q.rad, py = y + Math.sin(q.a) * q.rad;
    oil(ctx, px, py, r * (0.4 + q.k * 0.4), q.a + Math.PI / 2 + (q.r2 - 0.5) * 0.4,
        r * (0.3 - q.t * 0.12) * (0.75 + q.k * 0.5),
        [col[0] + (q.k - 0.5) * 9, col[1] * (0.9 + q.r2 * 0.2), col[2] + (q.r2 - 0.5) * 7 - q.t * 8],
        { alpha: 0.94 - q.t * 0.45, curve: 0.9, tail: 0.5, k: q.k, bristle: 0, relief: 1.3 - q.t * 0.7 });
  });
}

function lights(g, S, F, C, m, k) {
  const { ctx } = g;
  if (!g.span(0.676, 0.896)) return;
  k.inSky(() => {
    lightBody(g, ctx, C, S.moon.x, S.moon.y, S.moon.r, 77, 0.676, 0.716,
              { rings: 6, per: 38, core: C.moon, warm: C.moon, rim: C.moonWarm });

    g.batch(0.708, 0.744, 'crescent', () => {
      const R = S.moon.r * 1.02, rr = makeRng(91);
      const cx = S.moon.x, cy = S.moon.y;
      const inR = R * 0.94, inX = cx + R * 0.6, inY = cy - R * 0.16;
      const pts = [];
      for (let a = -Math.PI * 0.46; a <= Math.PI * 0.46; a += 0.04) {
        pts.push({ x: cx + Math.cos(Math.PI - a) * R, y: cy + Math.sin(Math.PI - a) * R });
      }
      for (let a = Math.PI * 0.62; a >= -Math.PI * 0.62; a -= 0.04) {
        pts.push({ x: inX + Math.cos(Math.PI - a) * inR, y: inY + Math.sin(Math.PI - a) * inR });
      }
      const out = [{ shape: pts }];
      for (let i = 0; i < 260; i++) {
        const a = rr() * TAU, rad = Math.sqrt(rr()) * R;
        out.push({ shape: pts, x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad, a: a + 1.5, k: rr(), r2: rr(), R });
      }
      return out;
    }, (q) => {
      if (q.x === undefined) {
        ctx.save(); pathOf(ctx, q.shape); ctx.fillStyle = css(C.moonCore, 0.98); ctx.fill(); ctx.restore();
        return;
      }
      ctx.save();
      pathOf(ctx, q.shape); ctx.clip();
      oil(ctx, q.x, q.y, q.R * 0.32, q.a, q.R * 0.14,
          q.k < 0.62 ? C.moonCore : C.moon,
          { alpha: 0.96, curve: 0.7, tail: 0.5, k: q.k, bristle: 2, relief: 1.4 });
      ctx.restore();
    });

    S.starPts.forEach((p, i) => {
      const a = 0.730 + i * 0.0092;
      lightBody(g, ctx, C, p.x, p.y, p.r, 200 + i * 37, a, a + 0.06,
                { rings: 6, per: 30, core: C.starCore, warm: C.star, rim: [198, 40, 40] });
    });
  });
}

/* ── 0.82–0.98 the last working ──────────────────────────────── */
function finish(g, S, F, C, m, k) {
  const { ctx } = g;

  k.open((c) => c.rect(F.x, F.y, F.w, F.h))(() => {
  g.batch(0.880, 0.918, 'windows', () => {
    const rr = makeRng(0x71), out = [];
    for (let i = 0; i < HOUSES.length; i++) {
      const [u, hh, ww] = HOUSES[i];
      // most houses show one window, a few two, some none at all
      const n = rr() < 0.18 ? 0 : rr() < 0.4 ? 2 : 1;
      for (let j = 0; j < n; j++) {
        out.push({
          x: F.x + F.w * u + (j ? (rr() < 0.5 ? -1 : 1) * m * ww * 0.55 : 0) + (rr() - 0.5) * m * 0.016,
          y: S.horizon - F.h * hh * (0.12 + rr() * 0.5),
          s: 0.45 + rr() * 0.7, k: rr()
        });
      }
    }
    return out;
  }, (q) => {
    ctx.save();
    const gg = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, m * 0.038 * q.s);
    gg.addColorStop(0, css(C.villageLit, 0.44));
    gg.addColorStop(0.4, css(C.villageLit, 0.15));
    gg.addColorStop(1, css(C.villageLit, 0));
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(q.x, q.y, m * 0.038 * q.s, 0, TAU); ctx.fill();
    oil(ctx, q.x - m * 0.005 * q.s, q.y, m * 0.011 * q.s, 0, m * 0.008 * q.s, C.villageLit,
        { alpha: 0.98, curve: 0.1, tail: 0.3, k: q.k, bristle: 0, relief: 1.35 });
    ctx.restore();
  });
  });

  if (g.span(0.836, 0.884)) {
    k.inShape(k.hills)(() => {
      g.batch(0.836, 0.884, 'hillCatch', () => {
        const rr = makeRng(0x414), out = [];
        for (let i = 0; i < 1500; i++) out.push({ x: F.x + rr() * F.w, y: S.horizon - rr() * F.h * 0.09, k: rr(), r2: rr() });
        return out;
      }, (q) => {
        oil(ctx, q.x, q.y, m * (0.012 + q.k * 0.014), 0.05 + (q.k - 0.5) * 0.34, m * 0.0038,
            q.k < 0.25 ? C.swirlMid : C.hillLight,
            { alpha: 0.42, curve: 0.3, tail: 0.5, k: q.k, bristle: 0, relief: 0.6 });
      });
    });
  }

  // the last working of the sky: where the light is strongest, taken to
  // cream, with the green-blue worked in beside it
  if (g.span(0.866, 0.956)) {
    k.inSky(() => {
      g.batch(0.866, 0.956, 'skyC',
        () => ribbons(S, F, {
          seed: 0x9c3, gap: m * 0.024, step: m * 0.0098, run: [4, 13],
          len: m * 0.023, wide: m * 0.0040, bandH: m * 0.07,
          lumShift: 0.26, greenChance: 0.3, sizeByLum: 1.5,
          weight: (x, y) => clamp(lumAt(S, F, x, y) - 0.42) * 2.6
        }),
        (q) => oil(ctx, q.x, q.y, q.len, q.a, q.wide, q.col, {
          alpha: q.alpha * 0.85, curve: 0.8, tail: q.tail, k: q.k, bristle: 0, relief: 1.45
        }));
    });
  }

  if (g.span(0.936, 0.982)) {
    k.inCypress(() => {
      g.batch(0.936, 0.982, 'cypLast', () => {
        const rr = makeRng(0x9d1), out = [];
        for (let i = 0; i < 1500; i++) {
          const v = Math.pow(rr(), 0.85);
          const ax = cypAxis(S.cypress, v), sp = Math.max(cypSpan(S.cypress, v), S.cypress.w * 0.05);
          const off = (rr() - 0.5) * 2.05;
          out.push({ x: ax + off * sp, y: lerp(S.cypress.base, S.cypress.top, v), v, off, k: rr(), r2: rr() });
        }
        return out.sort((p, q) => q.y - p.y);
      }, (q) => {
        oil(ctx, q.x, q.y, m * (0.009 + q.k * 0.011), cypFlow(q.v, q.off) + (q.r2 - 0.5) * 0.4,
            m * (0.0024 + q.k * 0.0024),
            q.k < 0.2 ? C.cypressLit : C.cypress,
            { alpha: 0.7, curve: 0.7, tail: 0.6, k: q.k, bristle: 0, relief: 0.8 });
      });
    });
  }
}
