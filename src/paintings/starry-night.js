// ─────────────────────────────────────────────────────────────
// Vincent van Gogh — The Starry Night (1889), public domain.
//
// Painted the way the surface actually is. The sky is not a field of
// scattered marks: it is ribbons. Van Gogh loaded the brush and pulled
// it along a line, laying ten or twenty strokes of one colour end to
// end, then loaded it again and pulled the next ribbon alongside. So
// that is how this is built — streamlines traced through a flow field,
// each one carrying its own colour, with the dark underpainting left
// showing between them.
//
// About eighty thousand loaded strokes over three workings of the sky,
// two of the cypress, and the land. Each stroke is laid three times: a
// shadow on the side away from the light, the colour, and a lit ridge
// where the paint stands proud.
//
// Nothing is ever repainted. The engine hands each frame only the sliver
// of the sitting since the last one, and those marks go on top of what
// is already there — which is why the layers read as layers.
// ─────────────────────────────────────────────────────────────

import { clamp, css, TAU, lerp, makeRng } from '../util.js';
import { impasto, charcoal, hatchSegs, segPts, ellipsePts, pathOf, poly } from '../brush.js';

/* ── composition ─────────────────────────────────────────────── */
function scene(F) {
  const px = (u) => F.x + F.w * u, py = (v) => F.y + F.h * v;
  const m = Math.min(F.w, F.h);
  return {
    px, py, m, F,
    horizon: py(0.772),
    moon:   { x: px(0.86), y: py(0.133), r: m * 0.059 },
    vortA:  { x: px(0.47), y: py(0.345), r: m * 0.31, spin: 1 },
    vortB:  { x: px(0.665), y: py(0.305), r: m * 0.175, spin: -1 },
    cypress:{ x: px(0.155), base: py(1.05), top: py(0.105), w: m * 0.098 },
    spire:  { x: px(0.515), base: py(0.782), h: F.h * 0.135, w: m * 0.02 },
    stars: [
      [0.085, 0.085, 1.0], [0.225, 0.20, 0.62], [0.325, 0.065, 0.72],
      [0.615, 0.10, 0.66], [0.70, 0.225, 0.78], [0.925, 0.335, 0.6],
      [0.79, 0.44, 0.56], [0.10, 0.345, 0.54], [0.285, 0.50, 0.5],
      [0.565, 0.565, 0.46], [0.945, 0.585, 0.44]
    ]
  };
}

const HOUSES = [
  [0.040, 0.062, 0.040], [0.092, 0.048, 0.032], [0.140, 0.078, 0.044],
  [0.196, 0.052, 0.034], [0.246, 0.070, 0.042], [0.300, 0.046, 0.030],
  [0.350, 0.082, 0.046], [0.408, 0.054, 0.034], [0.462, 0.064, 0.038],
  [0.575, 0.070, 0.042], [0.628, 0.048, 0.030], [0.676, 0.086, 0.048],
  [0.736, 0.052, 0.034], [0.788, 0.074, 0.044], [0.844, 0.050, 0.032],
  [0.892, 0.080, 0.046], [0.948, 0.056, 0.036], [0.990, 0.066, 0.038]
];

/* ── the paint ───────────────────────────────────────────────── */

// the sky runs from deep ultramarine through cobalt to cerulean and cream;
// a ribbon takes one of these and holds it for its whole length
const SKY_DARK = [[230, 66, 13], [227, 62, 17], [232, 58, 11], [224, 64, 20]];
const SKY_MID  = [[221, 56, 27], [216, 52, 33], [226, 54, 23], [211, 46, 38]];
const SKY_PALE = [[204, 44, 52], [199, 40, 63], [196, 34, 74], [192, 30, 84], [46, 22, 88]];

/**
 * Direction of the paint at a point: a slow drift across the canvas,
 * bent around each vortex by how close it is.
 */
function flowAt(S, x, y) {
  const base = 0.12
    + Math.sin(x * 0.0045 + y * 0.0022) * 0.46
    + Math.sin(y * 0.0092 - x * 0.0012) * 0.4
    + Math.sin(x * 0.0115 + 1.7) * 0.17
    + Math.sin(y * 0.019 + 0.6) * 0.1;
  let ax = Math.cos(base), ay = Math.sin(base);
  for (const v of [S.vortA, S.vortB]) {
    const dx = x - v.x, dy = (y - v.y) / 0.66;
    const d = Math.hypot(dx, dy);
    if (d > v.r * 1.9) continue;
    const pull = Math.pow(clamp(1 - d / (v.r * 1.9)), 1.4) * 2.6;
    const t = Math.atan2(dy, dx) + Math.PI / 2 * v.spin;
    ax += Math.cos(t) * pull;
    ay += Math.sin(t) * pull * 0.66;
  }
  return Math.atan2(ay, ax);
}

/** How near a point is to a swirl — paler paint, longer marks. */
const nearness = (S, x, y) => Math.max(
  clamp(1 - Math.hypot(x - S.vortA.x, (y - S.vortA.y) / 0.66) / (S.vortA.r * 1.5)),
  clamp(1 - Math.hypot(x - S.vortB.x, (y - S.vortB.y) / 0.66) / (S.vortB.r * 1.5))
);

/**
 * One loading of the brush: a line traced through the flow field with a
 * run of strokes laid along it, all of them the same colour. This is the
 * whole trick of the sky.
 */
function ribbons(S, F, opts) {
  const {
    seed, gap, step, run = [4, 11], len, wide, jitter = 1,
    palette, paleBias = 0, weight = null, bandH
  } = opts;
  const rr = makeRng(seed);
  const out = [];
  const top = F.y - gap, bottom = S.horizon + gap;
  const rows = Math.ceil((bottom - top) / gap);
  const cols = Math.ceil((F.w + gap * 2) / gap);
  const heads = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      heads.push({
        x: F.x - gap + (i + (rr() - 0.5) * jitter) * gap,
        y: top + (j + (rr() - 0.5) * jitter) * gap,
        k: rr(), r2: rr(), r3: rr()
      });
    }
  }
  for (const h of heads) {
    if (weight && weight(h.x, h.y) < h.r2) continue;
    const near = nearness(S, h.x, h.y);
    // paler paint where the sky turns, deeper where it lies still
    const t = clamp(near * 0.75 + h.k * 0.45 + paleBias);
    const bank = t > 0.78 ? SKY_PALE : t > 0.42 ? SKY_MID : SKY_DARK;
    const base = palette ? palette(t, h) : bank[Math.floor(h.r3 * bank.length)];
    const col = [
      base[0] + (h.k - 0.5) * 7,
      base[1] * (0.9 + h.r2 * 0.2),
      base[2] + (h.r3 - 0.5) * 6
    ];
    const n = run[0] + Math.floor(h.r2 * (run[1] - run[0]));
    const L = len * (0.75 + h.k * 0.55);
    const W = wide * (0.7 + h.r3 * 0.7);
    let x = h.x, y = h.y;
    const marks = [];
    for (let i = 0; i < n; i++) {
      const a = flowAt(S, x, y);
      marks.push({
        x, y, a, col, near,
        // a ribbon is heaviest where the brush first lands and thins out
        len: L * (1 - Math.pow(i / n, 2) * 0.35),
        wide: W * (1 - (i / n) * 0.3),
        alpha: 0.9 - (i / n) * 0.2
      });
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      if (y > bottom || y < top || x < F.x - gap * 2 || x > F.x + F.w + gap * 2) break;
    }
    out.push({ y: h.y, marks });
  }
  // the canvas is filled band by band, the way a wet passage is worked
  const band = bandH || gap * 3;
  out.sort((p, q) => Math.floor(p.y / band) - Math.floor(q.y / band) || p.marks[0].x - q.marks[0].x);
  const flat = [];
  for (const r of out) for (const mk of r.marks) flat.push(mk);
  return flat;
}

/* ── the shapes ──────────────────────────────────────────────── */

/** The cypress leans and curves: it is a flame, not a spindle. */
const cypAxis = (C4, v) => C4.x + C4.w * (Math.sin(v * 2.4) * 0.15 - v * 0.2);

const cypSpan = (C4, v) => {
  // a flame: full width where it leaves the bottom of the canvas, tapering
  // evenly, still with body near the tip so it does not end in a wire
  const taper = Math.pow(1 - Math.pow(v, 2.8), 0.5);
  const lobes = 1 + 0.15 * Math.sin(v * 6.2 + 0.6) + 0.09 * Math.sin(v * 3.1 + 2.2);
  return C4.w * taper * lobes;
};

function cypressOutline(C4) {
  const right = [], left = [], n = 120;
  for (let i = 0; i <= n; i++) {
    const v = i / n;
    const y = lerp(C4.base, C4.top, v);
    const ax = cypAxis(C4, v), sp = cypSpan(C4, v);
    // the licks grow towards the tip, where the tree is thinnest
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

function hillsPts(S, F) {
  const pts = [];
  for (let k = 0; k <= 60; k++) {
    const u = k / 60;
    pts.push({
      x: F.x + F.w * u,
      y: S.horizon - F.h * (0.072 * Math.sin(u * Math.PI * 1.35 + 0.5)
                            + 0.03 * Math.sin(u * Math.PI * 3.9 + 1.2)
                            + 0.015 * Math.sin(u * Math.PI * 8.1)
                            + 0.007 * Math.sin(u * Math.PI * 15.3))
    });
  }
  pts.push({ x: F.x + F.w, y: S.horizon + F.h * 0.05 }, { x: F.x, y: S.horizon + F.h * 0.05 });
  return pts;
}

/** The land at the very bottom rolls too, in long dark furrows. */
const furrowY = (S, F, u, d) =>
  S.horizon + F.h * (0.055 + d * 0.3)
  + F.h * (0.016 * Math.sin(u * Math.PI * 2.1 + 0.4) + 0.008 * Math.sin(u * Math.PI * 5.3));

function housePts(S, F, i) {
  const [u, hh, ww] = HOUSES[i];
  const x = F.x + F.w * u, hpx = F.h * hh, wpx = S.m * ww;
  const lean = Math.sin(i * 2.3) * wpx * 0.12;
  return [
    { x: x - wpx, y: S.horizon + hpx * 0.3 },
    { x: x - wpx + lean, y: S.horizon - hpx * 0.52 },
    { x: x + lean * 0.5, y: S.horizon - hpx },
    { x: x + wpx + lean, y: S.horizon - hpx * 0.52 },
    { x: x + wpx, y: S.horizon + hpx * 0.3 }
  ];
}

function spirePts(S, F) {
  const sp = S.spire;
  return [
    { x: sp.x - sp.w, y: S.horizon + F.h * 0.012 },
    { x: sp.x - sp.w, y: sp.base - sp.h * 0.42 },
    { x: sp.x, y: sp.base - sp.h },
    { x: sp.x + sp.w, y: sp.base - sp.h * 0.42 },
    { x: sp.x + sp.w, y: S.horizon + F.h * 0.012 }
  ];
}

/** The highest piece of land at a given x — where the sky has to stop. */
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

/**
 * The sky as a shape, cut around the hills, the rooftops and the spire, so
 * that no stroke can land on a roofline whatever order the passes run in.
 */
function skyPts(S, F) {
  const polys = [hillsPts(S, F), spirePts(S, F)];
  for (let i = 0; i < HOUSES.length; i++) polys.push(housePts(S, F, i));
  const out = [{ x: F.x - 4, y: F.y - 4 }, { x: F.x + F.w + 4, y: F.y - 4 }];
  const n = 260;
  for (let i = n; i >= 0; i--) {
    const x = F.x + F.w * (i / n);
    const y = topYAt(polys, x);
    out.push({ x, y: isFinite(y) ? y : S.horizon });
  }
  return out;
}

export const subject = {
  id: 'starry-night',
  title: 'The Starry Night',
  artist: 'Vincent van Gogh',
  year: 1889,
  layered: true,
  palette: {
    canvas:    [40, 20, 76],  ground:     [222, 38, 26],
    sketchInk: [224, 26, 28],
    skyUnder:  [232, 60, 9],
    skyDeep:   [228, 64, 14],  skyMid:    [221, 56, 24],  skyHigh: [212, 48, 34],
    swirl:     [204, 44, 54],  swirlPale: [197, 36, 76],  swirlMid: [201, 42, 64],
    star:      [45, 86, 60],   starCore:  [50, 96, 88],   starRim: [38, 74, 48],
    moon:      [44, 88, 62],   moonCore:  [48, 96, 90],
    hill:      [222, 48, 9],   hillLight: [210, 40, 15],  hillOlive: [104, 24, 13],
    village:   [228, 46, 7],   roof:      [226, 44, 6],   villageLit: [44, 94, 64],
    roofWarm:  [14, 38, 9],
    wall:      [216, 32, 12],  wallPale:  [204, 22, 19],
    field:     [228, 50, 7],   fieldLight:[206, 34, 13],  fieldOlive: [94, 24, 8],
    cypress:   [128, 62, 3],   cypressMid:[112, 50, 7],   cypressLit: [82, 38, 13],
    cypressWarm:[26, 46, 8],
    shadow:    [228, 44, 6],   light:     [48, 55, 86],
    surround:  [226, 28, 7]
  },

  focus(F) { const S = scene(F); return [{ x: S.px(0.5), y: S.py(0.4) }]; },

  draw(g) {
    const { F, C, m } = g;
    const S = g.cache('scene', () => scene(F));
    const sky = g.cache('sky', () => skyPts(S, F));
    const cyp = g.cache('cypress', () => cypressOutline(S.cypress));
    const hills = g.cache('hills', () => hillsPts(S, F));

    const shape = (pts) => (c) => poly(c, pts);
    const onCypress = (c) => poly(c, cyp);
    // the cypress stands in front of everything, sky and land alike
    const k = {
      sky, cyp, hills,
      inSky: (fn) => g.clipOut(shape(sky), onCypress, fn),
      inShape: (pts) => (fn) => g.clipOut(shape(pts), onCypress, fn),
      inCypress: (fn) => g.clip(shape(cyp), fn),
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

  line(0.086, 0.114, k.hills.slice(0, 61), { alpha: 0.46, seed: 3 });
  for (let i = 0; i < 3; i++) {
    const off = F.h * (0.016 + i * 0.015);
    line(0.110 + i * 0.012, 0.130 + i * 0.012,
         k.hills.slice(0, 61).map((q) => ({ x: q.x, y: q.y + off })),
         { alpha: 0.2, passes: 1, seed: 5 + i });
  }

  line(0.140, 0.172, k.cyp, { alpha: 0.55, width: m * 0.0042, seed: 9 });
  g.batch(0.168, 0.196, 'cypDraw', () => {
    const rr = makeRng(0x0c9), out = [];
    for (let i = 0; i < 40; i++) {
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
    out.push([{ x: S.spire.x, y: S.spire.base - S.spire.h * 1.14 }, { x: S.spire.x, y: S.spire.base - S.spire.h * 0.4 }]);
    return out;
  }, (pts) => charcoal(ctx, pts, ink, { alpha: 0.36, width: m * 0.0028, wobble: m * 0.0016, seed: 13 }));

  g.batch(0.222, 0.242, 'lightDraw', () => {
    const out = [
      ellipsePts(S.moon.x, S.moon.y, S.moon.r, S.moon.r, 36),
      ellipsePts(S.moon.x + S.moon.r * 0.55, S.moon.y - S.moon.r * 0.18, S.moon.r * 0.92, S.moon.r * 0.92, 36)
    ];
    const rr = makeRng(0x57a);
    S.stars.forEach(([u, v, size]) => {
      const r = S.m * 0.024 * size, x = S.px(u), y = S.py(v);
      for (let i = 0; i < 2; i++) {
        out.push(ellipsePts(x + (rr() - 0.5) * r * 0.3, y + (rr() - 0.5) * r * 0.3,
                            r * (0.8 + rr() * 0.5), r * (0.8 + rr() * 0.5), 18));
      }
      out.push(ellipsePts(x, y, r * 1.9, r * 1.9, 22));
    });
    return out;
  }, (pts) => charcoal(ctx, pts, ink, { alpha: 0.3, width: m * 0.0026, wobble: m * 0.0014, seed: 17 }));

  g.batch(0.238, 0.266, 'swirlDraw', () => {
    const out = [];
    for (const [v, turns] of [[S.vortA, 1.35], [S.vortB, 1.0]]) {
      for (let i = 0; i < 2; i++) {
        const spiral = [];
        for (let j = 0; j <= 110; j++) {
          const u = j / 110, a = u * TAU * turns * v.spin + i * Math.PI;
          spiral.push({
            x: v.x + Math.cos(a) * v.r * (0.12 + u * 0.82),
            y: v.y + Math.sin(a) * v.r * (0.12 + u * 0.82) * 0.66
          });
        }
        out.push(spiral);
      }
    }
    const rr = makeRng(0x5f10);
    for (let i = 0; i < 26; i++) {
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

  // and the shading: hatching, which is what makes a drawing a drawing
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
    const b = { x: F.x, y: S.horizon - F.h * 0.11, w: F.w, h: F.h * 0.16 };
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
    const dark = (x, y) => {
      const u = (x - F.x) / F.w, v = (y - F.y) / (S.horizon - F.y);
      return clamp(Math.max(Math.abs(u - 0.5) * 1.7, (1 - v) * 0.9) - 0.42) * 2.4;
    };
    return hatchSegs(b, -0.62, m * 0.02, { rng: rr, over: 1, pieces: 6, weight: dark })
      .concat(hatchSegs(b, 0.7, m * 0.03, { rng: rr, over: 1, pieces: 5, weight: dark }));
  }, 0.276, 0.300, 0.18);
}

/* ── 0.30–0.43 the underpainting: thin, dark, brushed all over ── */
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
  const scrub = (col, alpha, wideK, shape) => (q) => {
    if (q.wash) {
      ctx.save();
      ctx.globalAlpha = 0.74;
      ctx.fillStyle = css(col, 1, -3);
      if (shape) { pathOf(ctx, shape); ctx.fill(); }
      else ctx.fillRect(F.x, F.y, F.w, F.h);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = css([col[0] + (q.k - 0.5) * 10, col[1] * (0.88 + q.k * 0.24), col[2] + (q.k - 0.5) * 8]);
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
        () => layIn({ x: F.x, y: F.y, w: F.w, h: S.horizon - F.y }, m * 0.03, 0x51, (x, y) => flowAt(S, x, y)),
        scrub(C.skyUnder, 0.6, 0.038, null));
    });
  }

  if (g.span(0.338, 0.428)) {
    k.inShape(k.hills)(() => {
      g.batch(0.338, 0.396, 'hillUnder',
        () => layIn({ x: F.x, y: S.horizon - F.h * 0.14, w: F.w, h: F.h * 0.21 }, m * 0.03, 0x52,
                    (x, y, rr) => -0.08 + (rr() - 0.5) * 0.4),
        scrub(C.hill, 0.64, 0.034, k.hills));
    });
    k.open((c) => {
      c.rect(F.x, S.horizon - F.h * 0.02, F.w, F.y + F.h - S.horizon + F.h * 0.02);
      for (let i = 0; i < HOUSES.length; i++) poly(c, housePts(S, F, i));
      poly(c, spirePts(S, F));
    })(() => {
      g.batch(0.356, 0.418, 'vilUnder',
        () => layIn({ x: F.x, y: S.horizon - F.h * 0.11, w: F.w, h: F.h * 0.44 }, m * 0.03, 0x53,
                    (x, y, rr) => 0.04 + (rr() - 0.5) * 0.3),
        scrub(C.village, 0.66, 0.036, [
          { x: F.x, y: S.horizon - F.h * 0.12 }, { x: F.x + F.w, y: S.horizon - F.h * 0.12 },
          { x: F.x + F.w, y: F.y + F.h }, { x: F.x, y: F.y + F.h }
        ]));
    });
    k.inCypress(() => {
      g.batch(0.348, 0.408, 'cypUnder',
        () => layIn({ x: S.cypress.x - S.cypress.w * 1.8, y: S.cypress.top,
                      w: S.cypress.w * 3.6, h: S.cypress.base - S.cypress.top }, m * 0.022, 0x54,
                    (x, y, rr) => -Math.PI / 2 + (rr() - 0.5) * 0.6),
        scrub(C.cypress, 0.74, 0.034, k.cyp));
    });
  }
}

/* ── 0.38–0.75 the sky, worked twice over ────────────────────── */
function skyPaint(g, S, F, C, m, k) {
  const { ctx } = g;
  const lay = (q) => impasto(ctx, q.x, q.y, q.len, q.a, q.wide, q.col,
                             { alpha: q.alpha, curve: 0.55, relief: 0.85 + q.near * 0.55 });

  // first working: the body of the sky, ribbon beside ribbon
  if (g.span(0.382, 0.596)) {
    k.inSky(() => {
      g.batch(0.382, 0.596, 'skyA',
        () => ribbons(S, F, {
          seed: 0x5eed, gap: m * 0.0175, step: m * 0.0105, run: [5, 13],
          len: m * 0.021, wide: m * 0.0072, bandH: m * 0.055
        }), lay);
    });
  }

  // second working over the first: shorter, lighter, crowding the swirls
  if (g.span(0.556, 0.752)) {
    k.inSky(() => {
      g.batch(0.556, 0.752, 'skyB',
        () => ribbons(S, F, {
          seed: 0x7a1e, gap: m * 0.021, step: m * 0.0092, run: [4, 10],
          len: m * 0.018, wide: m * 0.0058, paleBias: 0.16, bandH: m * 0.06
        }), lay);
    });
  }
}

/* ── 0.50–0.90 the land ──────────────────────────────────────── */
function land(g, S, F, C, m, k) {
  const { ctx } = g;

  // the hills, worked up over their underpainting in contour strokes
  if (g.span(0.500, 0.648)) {
    k.inShape(k.hills)(() => {
      g.batch(0.500, 0.648, 'hillPaint', () => {
        const rr = makeRng(0x61), out = [];
        for (let i = 0; i < 5200; i++) {
          const u = rr();
          const x = F.x + u * F.w;
          const d = Math.pow(rr(), 0.75);
          const ridge = S.horizon - F.h * (0.072 * Math.sin(u * Math.PI * 1.35 + 0.5)
                                           + 0.03 * Math.sin(u * Math.PI * 3.9 + 1.2)
                                           + 0.015 * Math.sin(u * Math.PI * 8.1));
          out.push({ x, y: ridge + d * F.h * 0.2, u, d, k: rr(), r2: rr() });
        }
        return out.sort((p, q) => p.y - q.y);
      }, (q) => {
        const col = q.k < 0.12 ? C.hillOlive : q.k < 0.34 ? C.hillLight : C.hill;
        const slope = Math.cos(q.u * Math.PI * 1.35 + 0.5) * 0.5;
        impasto(ctx, q.x, q.y, m * (0.016 + q.k * 0.02), slope * 0.5 + (q.r2 - 0.5) * 0.4,
                m * (0.0045 + q.k * 0.004),
                [col[0] + (q.k - 0.5) * 10, col[1], col[2] + (q.r2 - 0.5) * 6 - q.d * 2],
                { alpha: 0.6 + q.k * 0.3, curve: 0.4, relief: 0.8 });
      });
    });
  }

  // the village: walls, then roofs down over them, then paint over both
  if (g.span(0.574, 0.716)) {
    k.open((c) => c.rect(F.x, F.y, F.w, F.h))(() => {
      g.batch(0.574, 0.622, 'houses', () => {
        const rr = makeRng(0x60), out = [];
        for (let i = 0; i < HOUSES.length; i++) {
          const h = housePts(S, F, i);
          out.push({ wall: [h[0], h[1], h[3], h[4]], roof: [h[1], h[2], h[3]], k: rr(), pale: rr() < 0.3 });
        }
        out.push({ wall: spirePts(S, F), k: rr(), spire: true });
        return out;
      }, (q) => {
        ctx.save();
        ctx.fillStyle = css(q.spire ? C.village : (q.pale ? C.wallPale : C.wall), 0.99, (q.k - 0.5) * 6);
        pathOf(ctx, q.wall); ctx.fill();
        if (q.roof) {
          ctx.fillStyle = css(q.k < 0.3 ? C.roofWarm : C.roof, 0.99, (q.k - 0.5) * 5);
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
        for (let i = 0; i < 3800; i++) {
          out.push({
            x: F.x + rr() * F.w,
            y: S.horizon - F.h * 0.11 + rr() * F.h * 0.16,
            k: rr(), r2: rr(), roofy: rr() < 0.42
          });
        }
        return out.sort((p, q) => p.y - q.y);
      }, (q) => {
        const col = q.roofy ? (q.k < 0.28 ? C.roofWarm : C.roof) : (q.k < 0.32 ? C.wallPale : C.wall);
        impasto(ctx, q.x, q.y, m * (0.008 + q.k * 0.01), q.roofy ? -0.85 + (q.r2 - 0.5) * 0.3 : (q.r2 - 0.5) * 0.24,
                m * (0.0032 + q.k * 0.0028),
                [col[0] + (q.k - 0.5) * 8, col[1], col[2] + (q.r2 - 0.5) * 7],
                { alpha: 0.62, curve: 0.2, relief: 0.75 });
      });
    });
  }

  // the cypress, flame by flame: the densest passage in the picture
  if (g.span(0.580, 0.840)) {
    k.inCypress(() => {
      const make = (seed, n, lenK, wideK, lit) => () => {
        const rr = makeRng(seed), out = [];
        for (let i = 0; i < n; i++) {
          const v = Math.pow(rr(), 0.85);
          const ax = cypAxis(S.cypress, v), sp = Math.max(cypSpan(S.cypress, v), S.cypress.w * 0.05);
          const off = (rr() - 0.5) * 2.1;
          const x = ax + off * sp;
          // the paint climbs the tree and curls outward at its edges
          const a = -Math.PI / 2 + off * 0.62 + Math.sin(v * 13 + off * 3) * 0.3 + (rr() - 0.5) * 0.35;
          out.push({
            x, y: lerp(S.cypress.base, S.cypress.top, v), v, off, a, k: rr(), r2: rr(),
            len: lenK * (0.55 + rr() * 0.95), wide: wideK * (0.6 + rr() * 0.85)
          });
        }
        return out.sort((p, q) => q.y - p.y);
      };
      // the sky lights the outside of the tree; the middle of it stays black
      const rim = (q) => Math.pow(Math.abs(q.off) / 1.05, 2.2);
      g.batch(0.580, 0.700, 'cypA', make(0x303, 7400, m * 0.018, m * 0.0052), (q) => {
        const col = q.k < 0.07 ? C.cypressWarm : q.k < 0.26 ? C.cypressMid : C.cypress;
        const r = rim(q);
        impasto(ctx, q.x, q.y, q.len, q.a, q.wide,
                [col[0] - r * 16, col[1] * (1 - r * 0.2), col[2] + (q.r2 - 0.5) * 3 + r * 6],
                { alpha: 0.82, curve: 0.6, relief: 0.55 + r * 0.5 });
      });
      g.batch(0.688, 0.812, 'cypB', make(0x304, 6400, m * 0.014, m * 0.0038), (q) => {
        const r = rim(q);
        const col = q.k < 0.14 + r * 0.4 ? C.cypressLit : q.k < 0.48 ? C.cypressMid : C.cypress;
        impasto(ctx, q.x, q.y, q.len, q.a, q.wide,
                [col[0] - r * 18 + (q.k - 0.5) * 10, col[1] * (1 - r * 0.24),
                 col[2] + (q.r2 - 0.5) * 4 + r * 9 - q.v * 1.5],
                { alpha: 0.7 + q.k * 0.24, curve: 0.85, relief: 0.7 + r * 0.7 });
      });
      // and a last close working of short flicks, which is what gives a
      // cypress its bristle
      g.batch(0.800, 0.848, 'cypC', make(0x305, 4200, m * 0.009, m * 0.0026), (q) => {
        const r = rim(q);
        const col = q.k < 0.2 + r * 0.45 ? C.cypressLit : C.cypressMid;
        impasto(ctx, q.x, q.y, q.len, q.a, q.wide,
                [col[0] - r * 14, col[1], col[2] + r * 11 + (q.r2 - 0.5) * 5],
                { alpha: 0.55 + q.k * 0.3, curve: 0.9, relief: 0.9 + r * 0.6 });
      });
    });
  }

  // the fields at the foot of the picture, in long furrows
  if (g.span(0.756, 0.876)) {
    k.open((c) => c.rect(F.x, S.horizon + F.h * 0.05, F.w, F.y + F.h - S.horizon))(() => {
      g.batch(0.756, 0.876, 'field', () => {
        const rr = makeRng(0x515), out = [];
        for (let i = 0; i < 6400; i++) {
          const u = rr(), d = Math.pow(rr(), 0.75);
          out.push({ x: F.x + u * F.w, y: furrowY(S, F, u, d), u, d, k: rr(), r2: rr() });
        }
        return out.sort((p, q) => p.y - q.y);
      }, (q) => {
        // the land runs in uneven bands: a passage of olive here, dark blue
        // there, the edges between them broken rather than ruled
        const strip = Math.sin(q.d * 9.3 + Math.sin(q.u * 6.7) * 1.7);
        const col = strip > 0.72 + q.k * 0.3 ? C.fieldOlive : q.k < 0.2 ? C.fieldLight : C.field;
        const slope = Math.cos(q.u * Math.PI * 2.1 + 0.4) * 0.34;
        impasto(ctx, q.x, q.y, m * (0.022 + q.k * 0.036), slope + (q.r2 - 0.5) * 0.16,
                m * (0.0044 + q.k * 0.0048),
                [col[0] + (q.k - 0.5) * 10, col[1], col[2] + 1 - q.d * 4 + (q.r2 - 0.5) * 4],
                { alpha: 0.62, curve: 0.35, relief: 0.55 });
      });
    });
  }
}

/* ── 0.68–0.84 the lights ────────────────────────────────────── */
function halo(g, ctx, x, y, r, ring, core, seed, from, to, n, hollow = 0.55) {
  g.batch(from, to, 'halo' + seed, () => {
    const rr = makeRng(seed), out = [{ bloom: true }];
    for (let i = 0; i < n; i++) out.push({ u: Math.pow(rr(), hollow), a: rr() * TAU, k: rr(), j: rr() });
    return out;
  }, (q) => {
    if (q.bloom) {
      ctx.save();
      const bloom = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 3.4);
      bloom.addColorStop(0, css(ring, 0.46));
      bloom.addColorStop(0.35, css(ring, 0.18));
      bloom.addColorStop(1, css(ring, 0));
      ctx.fillStyle = bloom;
      ctx.beginPath(); ctx.arc(x, y, r * 3.4, 0, TAU); ctx.fill();
      ctx.restore();
      return;
    }
    const rad = q.u * r * 2.6;
    const col = q.u < 0.28 ? core : ring;
    impasto(ctx, x + Math.cos(q.a) * rad, y + Math.sin(q.a) * rad,
            r * (0.2 + q.k * 0.24) * (1 - q.u * 0.35),
            q.a + Math.PI / 2 + (q.j - 0.5) * 0.5,
            r * (0.12 - q.u * 0.055),
            [col[0] + (q.k - 0.5) * 8, col[1], col[2] - q.u * 14],
            { alpha: 0.92 - q.u * 0.5, curve: 0.7, relief: 1.25 - q.u * 0.6 });
  });
}

function lights(g, S, F, C, m, k) {
  const { ctx } = g;
  if (!g.span(0.676, 0.846)) return;
  k.inSky(() => {
    halo(g, ctx, S.moon.x, S.moon.y, S.moon.r, C.moon, C.moonCore, 77, 0.676, 0.720, 900, 1.2);

    g.batch(0.712, 0.748, 'crescent', () => {
      const R = S.moon.r * 1.05, rr = makeRng(91);
      const cx = S.moon.x, cy = S.moon.y;
      const inR = R * 0.94, inX = cx + R * 0.62, inY = cy - R * 0.16;
      const pts = [];
      for (let a = -Math.PI * 0.44; a <= Math.PI * 0.44; a += 0.04) {
        pts.push({ x: cx + Math.cos(Math.PI - a) * R, y: cy + Math.sin(Math.PI - a) * R });
      }
      for (let a = Math.PI * 0.62; a >= -Math.PI * 0.62; a -= 0.04) {
        pts.push({ x: inX + Math.cos(Math.PI - a) * inR, y: inY + Math.sin(Math.PI - a) * inR });
      }
      const out = [{ dim: { x: inX, y: inY, r: inR } }, { shape: pts }];
      for (let i = 0; i < 420; i++) {
        const a = rr() * TAU, rad = Math.sqrt(rr()) * R;
        out.push({ shape: pts, x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad, a: a + 1.4, k: rr(), R });
      }
      return out;
    }, (q) => {
      if (q.dim) {
        ctx.save();
        ctx.fillStyle = css([40, 62, 30], 0.88);
        ctx.beginPath(); ctx.arc(q.dim.x, q.dim.y, q.dim.r, 0, TAU); ctx.fill();
        ctx.restore();
        return;
      }
      if (q.x === undefined) {
        ctx.save(); pathOf(ctx, q.shape); ctx.fillStyle = css(C.moonCore, 0.96); ctx.fill(); ctx.restore();
        return;
      }
      ctx.save();
      pathOf(ctx, q.shape); ctx.clip();
      impasto(ctx, q.x, q.y, q.R * 0.17, q.a, q.R * 0.1,
              q.k < 0.55 ? C.moonCore : C.moon, { alpha: 0.95, relief: 1.35 });
      ctx.restore();
    });

    S.stars.forEach(([u, v, size], i) => {
      const a = 0.734 + i * 0.0085;
      halo(g, ctx, S.px(u), S.py(v), m * 0.024 * size, C.star, C.starCore, 200 + i * 37, a, a + 0.055, 380, 0.8);
    });
  });
}

/* ── 0.82–0.98 the last working ──────────────────────────────── */
function finish(g, S, F, C, m, k) {
  const { ctx } = g;

  g.batch(0.820, 0.868, 'windows', () => {
    const rr = makeRng(0x71), out = [];
    for (let i = 0; i < HOUSES.length; i++) {
      const [u, hh, ww] = HOUSES[i];
      const n = rr() < 0.5 ? 2 : 1;
      for (let j = 0; j < n; j++) {
        out.push({
          x: F.x + F.w * u + (j ? (rr() < 0.5 ? -1 : 1) * m * ww * 0.5 : 0) + (rr() - 0.5) * m * 0.012,
          y: S.horizon - F.h * hh * (0.06 + rr() * 0.32),
          s: 0.6 + rr() * 0.6
        });
      }
    }
    return out;
  }, (q) => {
    ctx.save();
    const gg = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, m * 0.024 * q.s);
    gg.addColorStop(0, css(C.villageLit, 0.5));
    gg.addColorStop(1, css(C.villageLit, 0));
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(q.x, q.y, m * 0.024 * q.s, 0, TAU); ctx.fill();
    impasto(ctx, q.x - m * 0.003 * q.s, q.y, m * 0.007 * q.s, 0, m * 0.006 * q.s, C.villageLit,
            { alpha: 0.95, relief: 1.2 });
    ctx.restore();
  });

  // the hills catch a little of the sky
  if (g.span(0.836, 0.884)) {
    k.inShape(k.hills)(() => {
      g.batch(0.836, 0.884, 'hillCatch', () => {
        const rr = makeRng(0x414), out = [];
        for (let i = 0; i < 1400; i++) out.push({ x: F.x + rr() * F.w, y: S.horizon - rr() * F.h * 0.1, k: rr() });
        return out;
      }, (q) => {
        impasto(ctx, q.x, q.y, m * (0.014 + q.k * 0.016), 0.05 + (q.k - 0.5) * 0.34, m * 0.0042,
                q.k < 0.25 ? C.swirlMid : C.hillLight, { alpha: 0.3, relief: 0.7 });
      });
    });
  }

  // third working of the sky: the pale ridges that sit on top of everything
  if (g.span(0.866, 0.954)) {
    k.inSky(() => {
      g.batch(0.866, 0.954, 'skyC',
        () => ribbons(S, F, {
          seed: 0x9c3, gap: m * 0.026, step: m * 0.0088, run: [4, 12],
          len: m * 0.016, wide: m * 0.0044, paleBias: 0.42, bandH: m * 0.07,
          weight: (x, y) => 0.04 + nearness(S, x, y) * 1.1,
          palette: (t, h) => SKY_PALE[Math.floor(h.r3 * SKY_PALE.length)]
        }),
        (q) => impasto(ctx, q.x, q.y, q.len, q.a, q.wide, q.col,
                       { alpha: q.alpha * 0.8, curve: 0.8, relief: 1.4 }));
    });
  }

  // and the last darks, put back where the edges got lost
  if (g.span(0.936, 0.982)) {
    k.inCypress(() => {
      g.batch(0.936, 0.982, 'cypLast', () => {
        const rr = makeRng(0x9d1), out = [];
        for (let i = 0; i < 1600; i++) {
          const v = Math.pow(rr(), 0.85);
          const ax = cypAxis(S.cypress, v), sp = Math.max(cypSpan(S.cypress, v), S.cypress.w * 0.05);
          const off = (rr() - 0.5) * 2.05;
          out.push({ x: ax + off * sp, y: lerp(S.cypress.base, S.cypress.top, v), off, k: rr(), r2: rr() });
        }
        return out.sort((p, q) => q.y - p.y);
      }, (q) => {
        impasto(ctx, q.x, q.y, m * (0.011 + q.k * 0.013),
                -Math.PI / 2 + q.off * 0.6 + (q.r2 - 0.5) * 0.5,
                m * (0.0028 + q.k * 0.003),
                q.k < 0.2 ? C.cypressLit : C.cypress, { alpha: 0.64, curve: 0.7, relief: 0.8 });
      });
    });
  }
}
