// ─────────────────────────────────────────────────────────────
// Vincent van Gogh — The Starry Night (1889), public domain.
//
// Painted the way an oil painting is actually made, in order and in
// layers: a charcoal construction first, drawn carefully enough to
// stand on its own, then a thin dark underpainting, then body colour
// over it, then a second and a third working over the same ground
// until the surface is dense. Roughly twenty thousand loaded strokes,
// each with a shadow side and a lit ridge, laid along a flow field
// that drifts across the sky and turns around two vortices.
//
// Nothing is repainted: the engine hands each frame only the sliver of
// the sitting that has happened since the last one, and those marks go
// on top of everything already there — which is also why the layers
// read as layers.
// ─────────────────────────────────────────────────────────────

import { clamp, css, TAU, lerp, makeRng } from '../util.js';
import { impasto, charcoal, hatchSegs, segPts, ellipsePts, pathOf, poly } from '../brush.js';

/* ── composition ─────────────────────────────────────────────── */
function scene(F) {
  const px = (u) => F.x + F.w * u, py = (v) => F.y + F.h * v;
  const m = Math.min(F.w, F.h);
  return {
    px, py, m, F,
    horizon: py(0.70),
    moon:   { x: px(0.855), y: py(0.135), r: m * 0.062 },
    vortA:  { x: px(0.46), y: py(0.335), r: m * 0.30, spin: 1 },
    vortB:  { x: px(0.66), y: py(0.30), r: m * 0.17, spin: -1 },
    cypress:{ x: px(0.155), base: py(1.02), top: py(0.045), w: m * 0.072 },
    spire:  { x: px(0.52), base: py(0.712), h: F.h * 0.145, w: m * 0.024 },
    stars: [
      [0.085, 0.085, 1.0], [0.225, 0.20, 0.62], [0.325, 0.065, 0.72],
      [0.615, 0.10, 0.66], [0.70, 0.225, 0.78], [0.925, 0.335, 0.6],
      [0.79, 0.44, 0.56], [0.10, 0.345, 0.54], [0.285, 0.50, 0.5],
      [0.565, 0.565, 0.46], [0.945, 0.585, 0.44]
    ]
  };
}

const HOUSES = [
  [0.055, 0.075, 0.048], [0.125, 0.055, 0.038], [0.195, 0.085, 0.052],
  [0.275, 0.058, 0.040], [0.345, 0.078, 0.048], [0.425, 0.052, 0.036],
  [0.600, 0.070, 0.046], [0.672, 0.052, 0.036], [0.745, 0.082, 0.052],
  [0.822, 0.056, 0.038], [0.892, 0.074, 0.046], [0.958, 0.058, 0.040]
];

/**
 * Direction of the paint at a point: a slow drift across the canvas,
 * bent around each vortex by how close it is.
 */
function flowAt(S, x, y) {
  const base = 0.1 + Math.sin(x * 0.004) * 0.22 + Math.sin(y * 0.007) * 0.3;
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

/* ── the shapes ──────────────────────────────────────────────── */

function cypressOutline(C4) {
  const right = [], left = [], n = 80;
  for (let i = 0; i <= n; i++) {
    const v = i / n;
    const y = lerp(C4.base, C4.top, v);
    const body = (0.42 + Math.sin(Math.min(1, v / 0.08) * Math.PI * 0.5) * 0.58) * (1 - Math.pow(v, 1.55) * 0.94);
    const tR = (Math.sin(v * 11) * 0.26 + Math.sin(v * 5.3 + 1.1) * 0.2 + Math.sin(v * 23) * 0.11
                + Math.sin(v * 37 + 0.6) * 0.06) * (1 - v * 0.1);
    const tL = (Math.sin(v * 9.4 + 2.3) * 0.26 + Math.sin(v * 6.1 + 0.4) * 0.2 + Math.sin(v * 19) * 0.11
                + Math.sin(v * 31 + 1.7) * 0.06) * (1 - v * 0.1);
    right.push({ x: C4.x + C4.w * Math.max(0.03, body + tR), y });
    left.push({ x: C4.x - C4.w * Math.max(0.03, body + tL), y });
  }
  const pts = right.concat(left.reverse());
  pts.push(pts[0]);
  return pts;
}

/** The span of the cypress at a height, for the strokes that fill it. */
function cypressSpan(C4, v) {
  return C4.w * (0.42 + Math.sin(Math.min(1, v / 0.08) * Math.PI * 0.5) * 0.58) * (1 - Math.pow(v, 1.55) * 0.94);
}

function hillsPts(S, F) {
  const pts = [];
  for (let k = 0; k <= 40; k++) {
    const u = k / 40;
    pts.push({
      x: F.x + F.w * u,
      y: S.horizon - F.h * (0.075 * Math.sin(u * Math.PI * 1.35 + 0.5)
                            + 0.028 * Math.sin(u * Math.PI * 3.9 + 1.2)
                            + 0.014 * Math.sin(u * Math.PI * 8.1))
    });
  }
  pts.push({ x: F.x + F.w, y: S.horizon + F.h * 0.04 }, { x: F.x, y: S.horizon + F.h * 0.04 });
  return pts;
}

function housePts(S, F, i) {
  const [u, hh, ww] = HOUSES[i];
  const x = F.x + F.w * u, hpx = F.h * hh, wpx = S.m * ww;
  const lean = Math.sin(i * 2.3) * wpx * 0.1;
  return [
    { x: x - wpx, y: S.horizon + hpx * 0.25 },
    { x: x - wpx + lean, y: S.horizon - hpx * 0.5 },
    { x: x + lean * 0.5, y: S.horizon - hpx },
    { x: x + wpx + lean, y: S.horizon - hpx * 0.5 },
    { x: x + wpx, y: S.horizon + hpx * 0.25 }
  ];
}

function spirePts(S, F) {
  const sp = S.spire;
  return [
    { x: sp.x - sp.w, y: S.horizon + F.h * 0.01 },
    { x: sp.x - sp.w, y: sp.base - sp.h * 0.45 },
    { x: sp.x, y: sp.base - sp.h },
    { x: sp.x + sp.w, y: sp.base - sp.h * 0.45 },
    { x: sp.x + sp.w, y: S.horizon + F.h * 0.01 }
  ];
}

/** The highest piece of land at a given x — where the sky has to stop. */
function topYAt(polys, x) {
  let best = Infinity;
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
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
 * The sky as a shape, cut around the hills, the rooftops and the spire.
 * Every sky pass is clipped to it, so a stroke can never land on a
 * roofline no matter which order the passes happen in.
 */
function skyPts(S, F) {
  const polys = [hillsPts(S, F), spirePts(S, F)];
  for (let i = 0; i < HOUSES.length; i++) polys.push(housePts(S, F, i));
  const out = [{ x: F.x - 4, y: F.y - 4 }, { x: F.x + F.w + 4, y: F.y - 4 }];
  const n = 200;
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
    skyUnder:  [230, 62, 11],
    skyDeep:   [226, 68, 15],  skyMid:    [221, 62, 24],  skyHigh: [214, 55, 34],
    swirl:     [206, 46, 56],  swirlPale: [199, 44, 78],  swirlMid: [204, 48, 64],
    star:      [45, 86, 60],   starCore:  [50, 96, 87],
    moon:      [44, 88, 62],   moonCore:  [48, 96, 88],
    hill:      [220, 46, 12],  hillLight: [210, 38, 19],  hillDeep: [228, 50, 8],
    village:   [228, 46, 8],   roof:      [232, 30, 14],  villageLit: [42, 92, 62],
    field:     [222, 34, 12],  fieldLight:[196, 22, 20],
    cypress:   [118, 54, 4],   cypressMid:[104, 46, 8],   cypressLit: [88, 40, 15],
    shadow:    [228, 44, 6],   light:     [48, 55, 86],
    surround:  [226, 28, 7]
  },

  focus(F) { const S = scene(F); return [{ x: S.px(0.5), y: S.py(0.4) }]; },

  draw(g) {
    const { ctx, F, C, m } = g;
    const S = g.cache('scene', () => scene(F));
    const sky = g.cache('sky', () => skyPts(S, F));
    const cyp = g.cache('cypress', () => cypressOutline(S.cypress));
    const hills = g.cache('hills', () => hillsPts(S, F));

    /* the sky, cut around everything in front of it */
    const clipShape = (pts) => (c) => poly(c, pts);
    const onCypress = (c) => poly(c, cyp);
    // the cypress stands in front of everything, sky and land alike
    const clipSky = (fn) => g.clipOut(clipShape(sky), onCypress, fn);
    const clipLand = (pts) => (fn) => g.clipOut(clipShape(pts), onCypress, fn);
    const clipOpen = (build) => (fn) => g.clipOut(build, onCypress, fn);

    drawing(g, S, F, C, m, { sky, cyp, hills });
    underpaint(g, S, F, C, m, { clipSky, clipShape, clipLand, clipOpen, cyp, hills });
    skyPaint(g, S, F, C, m, clipSky);
    land(g, S, F, C, m, { clipShape, clipLand, clipOpen, cyp, hills });
    lights(g, S, F, C, m, clipSky);
    finish(g, S, F, C, m, { clipSky, clipShape, clipLand, clipOpen, cyp, hills });
  }
};

/* ── 0.07–0.27 the drawing ───────────────────────────────────── */
function drawing(g, S, F, C, m, shapes) {
  const { ctx } = g;
  const ink = C.sketchInk;
  const line = (from, to, pts, opts = {}) =>
    g.line(from, to, pts, (part) => charcoal(ctx, part, ink, {
      alpha: 0.5, width: m * 0.0035, wobble: m * 0.0032, seed: opts.seed || 1, ...opts
    }));

  // the horizon, and the two lines a painter puts down to find it
  line(0.058, 0.076, [{ x: F.x, y: S.horizon }, { x: F.x + F.w, y: S.horizon - F.h * 0.005 }],
       { alpha: 0.5, width: m * 0.004 });
  line(0.072, 0.090, [{ x: F.x, y: S.horizon + F.h * 0.012 }, { x: F.x + F.w, y: S.horizon + F.h * 0.004 }],
       { alpha: 0.22, passes: 1 });

  // the hills: the ridge, then two contours following it down
  line(0.086, 0.114, shapes.hills.slice(0, 41), { alpha: 0.46, seed: 3 });
  for (let k = 0; k < 2; k++) {
    const off = F.h * (0.018 + k * 0.016);
    line(0.110 + k * 0.014, 0.132 + k * 0.014,
         shapes.hills.slice(0, 41).map((q) => ({ x: q.x, y: q.y + off })),
         { alpha: 0.2, passes: 1, seed: 5 + k });
  }

  // the cypress: contour first, then the flames inside it
  line(0.140, 0.172, shapes.cyp, { alpha: 0.55, width: m * 0.0042, seed: 9 });
  g.batch(0.168, 0.196, g.cache('cypDraw', () => {
    const rr = makeRng(0x0c9), out = [];
    for (let i = 0; i < 26; i++) {
      const u = 0.06 + rr() * 0.86, side = rr() < 0.5 ? -1 : 1;
      const pts = [];
      for (let j = 0; j <= 9; j++) {
        const v = u + (j / 9) * 0.1;
        const sp = cypressSpan(S.cypress, Math.min(0.99, v));
        pts.push({
          x: S.cypress.x + side * sp * (0.2 + 0.7 * Math.sin(j * 0.6 + i)),
          y: lerp(S.cypress.base, S.cypress.top, Math.min(0.99, v))
        });
      }
      out.push(pts);
    }
    return out;
  }), (pts) => charcoal(ctx, pts, ink, { alpha: 0.3, width: m * 0.003, wobble: m * 0.002, seed: 11 }));

  // the village: every house boxed, with its roofline and a wall line
  g.batch(0.192, 0.226, g.cache('vilDraw', () => {
    const out = [];
    for (let i = 0; i < HOUSES.length; i++) {
      const hp = housePts(S, F, i);
      out.push(hp.concat([hp[0]]));
      out.push([hp[1], hp[3]]);                                   // the eaves
      const mid = { x: (hp[0].x + hp[4].x) / 2, y: hp[0].y };
      out.push([{ x: mid.x, y: hp[2].y + (hp[0].y - hp[2].y) * 0.45 }, mid]);
    }
    out.push(spirePts(S, F).concat([spirePts(S, F)[0]]));
    const sp = S.spire;
    out.push([{ x: sp.x, y: sp.base - sp.h * 1.12 }, { x: sp.x, y: sp.base - sp.h * 0.4 }]);
    return out;
  }), (pts) => charcoal(ctx, pts, ink, { alpha: 0.36, width: m * 0.0028, wobble: m * 0.0016, seed: 13 }));

  // the lights, placed and circled the way a drawing places them
  g.batch(0.222, 0.242, g.cache('lightDraw', () => {
    const out = [ellipsePts(S.moon.x, S.moon.y, S.moon.r, S.moon.r, 36),
                 ellipsePts(S.moon.x + S.moon.r * 0.5, S.moon.y - S.moon.r * 0.2, S.moon.r * 0.94, S.moon.r * 0.94, 36)];
    const rr = makeRng(0x57a);
    S.stars.forEach(([u, v, size]) => {
      const r = S.m * 0.024 * size, x = S.px(u), y = S.py(v);
      // a light circled twice, roughly, the way a star gets marked
      for (let k = 0; k < 2; k++) {
        out.push(ellipsePts(x + (rr() - 0.5) * r * 0.3, y + (rr() - 0.5) * r * 0.3,
                            r * (0.8 + rr() * 0.5), r * (0.8 + rr() * 0.5), 18));
      }
      out.push(ellipsePts(x, y, r * 1.9, r * 1.9, 22));
    });
    return out;
  }), (pts) => charcoal(ctx, pts, ink, { alpha: 0.3, width: m * 0.0026, wobble: m * 0.0014, seed: 17 }));

  // the swirls, found as spirals and then as the lines of flow between them
  g.batch(0.238, 0.266, g.cache('swirlDraw', () => {
    const out = [];
    for (const [v, turns] of [[S.vortA, 1.35], [S.vortB, 1.0]]) {
      for (let k = 0; k < 2; k++) {
        const spiral = [];
        for (let i = 0; i <= 110; i++) {
          const u = i / 110, a = u * TAU * turns * v.spin + k * Math.PI;
          spiral.push({
            x: v.x + Math.cos(a) * v.r * (0.12 + u * 0.82),
            y: v.y + Math.sin(a) * v.r * (0.12 + u * 0.82) * 0.66
          });
        }
        out.push(spiral);
      }
    }
    const rr = makeRng(0x5f10);
    for (let i = 0; i < 16; i++) {
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
  }), (pts) => charcoal(ctx, pts, ink, { alpha: 0.2, width: m * 0.0024, wobble: m * 0.0012, passes: 1, seed: 19 }));

  // and the shading: hatching, which is what makes a drawing a drawing
  const hatchInto = (pts, segs, from, to, alpha) => {
    if (!g.span(from, to)) return;
    g.clip((c) => poly(c, pts), () => {
      g.batch(from, to, segs, (s) =>
        charcoal(ctx, segPts(s), ink, { alpha: alpha * (0.5 + s.k * 0.8), width: m * 0.0026, wobble: m * 0.0011, passes: 1, seed: 23 }));
    });
  };
  hatchInto(shapes.cyp, g.cache('cypHatch', () => {
    const rr = makeRng(0x0d1);
    const b = { x: S.cypress.x - S.cypress.w * 1.6, y: S.cypress.top, w: S.cypress.w * 3.2, h: S.cypress.base - S.cypress.top };
    return hatchSegs(b, -1.25, m * 0.011, { rng: rr }).concat(hatchSegs(b, -1.9, m * 0.016, { rng: rr }));
  }), 0.246, 0.272, 0.5);
  hatchInto(shapes.hills, g.cache('hillHatch', () => {
    const rr = makeRng(0x0d2);
    const b = { x: F.x, y: S.horizon - F.h * 0.11, w: F.w, h: F.h * 0.15 };
    return hatchSegs(b, -0.32, m * 0.014, { rng: rr });
  }), 0.268, 0.288, 0.34);
  // the sky is shaded only where it is dark: the corners and the far edges
  hatchInto(shapes.sky, g.cache('skyHatch', () => {
    const rr = makeRng(0x0d4);
    const b = { x: F.x, y: F.y, w: F.w, h: S.horizon - F.y };
    const dark = (x, y) => {
      const u = (x - F.x) / F.w, v = (y - F.y) / (S.horizon - F.y);
      return clamp(Math.max(Math.abs(u - 0.5) * 1.7, (1 - v) * 0.9) - 0.42) * 2.4;
    };
    return hatchSegs(b, -0.62, m * 0.026, { rng: rr, over: 1, pieces: 5, weight: dark })
      .concat(hatchSegs(b, 0.7, m * 0.04, { rng: rr, over: 1, pieces: 4, weight: dark }));
  }), 0.276, 0.300, 0.18);
  hatchInto([{ x: F.x, y: S.horizon }, { x: F.x + F.w, y: S.horizon },
             { x: F.x + F.w, y: F.y + F.h }, { x: F.x, y: F.y + F.h }],
    g.cache('vilHatch', () => {
      const rr = makeRng(0x0d3);
      const b = { x: F.x, y: S.horizon, w: F.w, h: F.y + F.h - S.horizon };
      return hatchSegs(b, 0.28, m * 0.012, { rng: rr, pieces: 3 })
        .concat(hatchSegs(b, -0.5, m * 0.03, { rng: rr, pieces: 4 }));
    }), 0.262, 0.286, 0.3);
}

/* ── 0.30–0.43 the underpainting: thin, dark, brushed all over ── */

/**
 * A lay-in: one thin wash of colour over the whole area, then scrubbed
 * strokes worked into it on a jittered grid, dense enough that no raw
 * canvas is left showing. Every passage of the picture starts this way.
 */
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
      ctx.globalAlpha = 0.72;
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
    ctx.lineTo(q.x + Math.cos(q.a) * m * 0.07, q.y + Math.sin(q.a) * m * 0.07);
    ctx.stroke();
    ctx.restore();
  };

  if (g.span(0.302, 0.372)) {
    k.clipSky(() => {
      g.batch(0.302, 0.372, g.cache('skyUnder', () => layIn(
        { x: F.x, y: F.y, w: F.w, h: S.horizon - F.y }, m * 0.042, 0x51,
        (x, y) => flowAt(S, x, y)
      )), scrub(C.skyUnder, 0.62, 0.05, null));
    });
  }

  if (g.span(0.338, 0.428)) {
    k.clipLand(k.hills)(() => {
      g.batch(0.338, 0.396, g.cache('hillUnder', () => layIn(
        { x: F.x, y: S.horizon - F.h * 0.13, w: F.w, h: F.h * 0.19 }, m * 0.04, 0x52,
        (x, y, rr) => -0.08 + (rr() - 0.5) * 0.4
      )), scrub(C.hill, 0.66, 0.042, k.hills));
    });
    k.clipOpen((c) => {
      c.rect(F.x, S.horizon - F.h * 0.02, F.w, F.y + F.h - S.horizon + F.h * 0.02);
      for (let i = 0; i < HOUSES.length; i++) poly(c, housePts(S, F, i));
      poly(c, spirePts(S, F));
    })(() => {
      g.batch(0.356, 0.418, g.cache('vilUnder', () => layIn(
        { x: F.x, y: S.horizon - F.h * 0.1, w: F.w, h: F.h * 0.42 }, m * 0.042, 0x53,
        (x, y, rr) => 0.04 + (rr() - 0.5) * 0.3
      )), scrub(C.village, 0.68, 0.045, [
        { x: F.x, y: S.horizon - F.h * 0.11 }, { x: F.x + F.w, y: S.horizon - F.h * 0.11 },
        { x: F.x + F.w, y: F.y + F.h }, { x: F.x, y: F.y + F.h }
      ]));
    });
    g.clip(k.clipShape(k.cyp), () => {
      g.batch(0.348, 0.408, g.cache('cypUnder', () => layIn(
        { x: S.cypress.x - S.cypress.w * 1.5, y: S.cypress.top,
          w: S.cypress.w * 3, h: S.cypress.base - S.cypress.top }, m * 0.03, 0x54,
        (x, y, rr) => -Math.PI / 2 + (rr() - 0.5) * 0.6
      )), scrub(C.cypress, 0.76, 0.045, k.cyp));
    });
  }
}

/* ── 0.35–0.72 the sky, painted twice over ───────────────────── */
function skyField(S, F, seed, step, lenK, wideK) {
  const rr = makeRng(seed);
  const out = [];
  const dy = step * 0.86;
  for (let y = F.y - step; y < S.horizon + step; y += dy) {
    for (let x = F.x - step; x < F.x + F.w + step; x += step) {
      const jx = x + (rr() - 0.5) * step * 1.1;
      const jy = y + (rr() - 0.5) * dy * 1.1;
      const near = nearness(S, jx, jy);
      out.push({
        x: jx, y: jy, a: flowAt(S, jx, jy), near, k: rr(),
        len: lenK * (0.72 + rr() * 0.6 + near * 0.5),
        wide: wideK * (0.72 + rr() * 0.62)
      });
    }
  }
  // worked down the canvas, band by band, the way a wet passage is filled
  const band = step * 2.4;
  out.sort((p, q) => Math.floor(p.y / band) - Math.floor(q.y / band) || p.x - q.x);
  return out;
}

function skyPaint(g, S, F, C, m, clipSky) {
  const { ctx } = g;

  // first working: the body of the sky, every mark following the flow
  if (g.span(0.384, 0.582)) {
    clipSky(() => {
      g.batch(0.384, 0.582, g.cache('skyA', () => skyField(S, F, 0x5eed, m * 0.019, m * 0.042, m * 0.0115)), (q) => {
        const pale = q.k < 0.1 + q.near * 0.34;
        const base = pale ? C.swirlMid : (q.k < 0.55 ? C.skyMid : C.skyDeep);
        impasto(ctx, q.x, q.y, q.len, q.a, q.wide, [
          base[0] + (q.k - 0.5) * 10,
          base[1] * (0.86 + q.k * 0.26),
          base[2] * (0.84 + q.near * 0.34) + (q.k - 0.5) * 7
        ], { alpha: 0.7 + q.k * 0.24, curve: 0.5, relief: 0.85 + q.near * 0.4 });
      });
    });
  }

  // second working, over the first: shorter, lighter, crowding the swirls
  if (g.span(0.556, 0.742)) {
    clipSky(() => {
      g.batch(0.556, 0.742, g.cache('skyB', () => skyField(S, F, 0x7a1e, m * 0.0225, m * 0.033, m * 0.0085)), (q) => {
        const pale = q.k < 0.2 + q.near * 0.5;
        const base = pale ? C.swirlPale : (q.k < 0.6 ? C.swirl : C.skyHigh);
        impasto(ctx, q.x, q.y, q.len, q.a, q.wide, [
          base[0] + (q.k - 0.5) * 9,
          base[1] * (0.8 + q.k * 0.34),
          base[2] * (0.72 + q.near * 0.42) + (q.k - 0.5) * 8 - (1 - q.near) * 6
        ], { alpha: 0.6 + q.k * 0.3, curve: 0.62, relief: 1 + q.near * 0.5 });
      });
    });
  }
}

/* ── 0.50–0.90 the land ──────────────────────────────────────── */
function land(g, S, F, C, m, k) {
  const { ctx } = g;

  // the hills, worked up over their underpainting
  if (g.span(0.540, 0.646)) {
    k.clipLand(k.hills)(() => {
      g.batch(0.540, 0.646, g.cache('hillPaint', () => {
        const rr = makeRng(0x61), out = [];
        for (let i = 0; i < 1500; i++) {
          const x = F.x + rr() * F.w;
          const y = S.horizon - F.h * 0.115 + Math.pow(rr(), 0.8) * F.h * 0.18;
          out.push({ x, y, k: rr(), depth: rr() });
        }
        return out.sort((p, q) => p.y - q.y);
      }), (q) => {
        const col = q.k < 0.24 ? C.hillLight : C.hill;
        impasto(ctx, q.x, q.y, m * (0.028 + q.k * 0.03), 0.04 + (q.k - 0.5) * 0.46,
                m * (0.007 + q.k * 0.006),
                [col[0] + (q.k - 0.5) * 10, col[1], col[2] + (q.k - 0.5) * 6],
                { alpha: 0.55 + q.k * 0.3, curve: 0.35, relief: 0.75 });
      });
    });
  }

  // the village: the walls first, then the roofs down over them, then paint
  if (g.span(0.574, 0.706)) {
    k.clipOpen((c) => c.rect(F.x, F.y, F.w, F.h))(() => {
    g.batch(0.574, 0.630, g.cache('houses', () => {
      const rr = makeRng(0x60), out = [];
      for (let i = 0; i < HOUSES.length; i++) {
        const h = housePts(S, F, i);
        out.push({ wall: [h[0], h[1], h[3], h[4]], roof: [h[1], h[2], h[3]], k: rr() });
      }
      out.push({ wall: spirePts(S, F), k: rr(), spire: true });
      return out;
    }), (q) => {
      ctx.save();
      // the walls carry a little of the lamplight, the roofs none at all
      ctx.fillStyle = css(C.village, 0.99, q.spire ? -2 : 4 + q.k * 5);
      pathOf(ctx, q.wall); ctx.fill();
      if (q.roof) {
        ctx.fillStyle = css(C.roof, 0.99, -1 - q.k * 3);
        pathOf(ctx, q.roof); ctx.fill();
        ctx.strokeStyle = css(C.roof, 0.6, -8);
        ctx.lineWidth = Math.max(0.7, m * 0.0022);
        ctx.beginPath(); ctx.moveTo(q.roof[0].x, q.roof[0].y); ctx.lineTo(q.roof[2].x, q.roof[2].y); ctx.stroke();
      }
      ctx.restore();
    });
    });
    k.clipOpen((c) => {
      for (let i = 0; i < HOUSES.length; i++) poly(c, housePts(S, F, i));
      poly(c, spirePts(S, F));
    })(() => {
      g.batch(0.626, 0.706, g.cache('housePaint', () => {
        const rr = makeRng(0x62), out = [];
        for (let i = 0; i < 900; i++) {
          out.push({
            x: F.x + rr() * F.w,
            y: S.horizon - F.h * 0.1 + rr() * F.h * 0.14,
            k: rr(), a: (rr() < 0.5 ? 0.0 : -0.9) + (rr() - 0.5) * 0.3
          });
        }
        return out;
      }), (q) => {
        const col = q.k < 0.3 ? C.roof : C.village;
        impasto(ctx, q.x, q.y, m * (0.014 + q.k * 0.016), q.a, m * (0.005 + q.k * 0.004),
                [col[0] + (q.k - 0.5) * 8, col[1], col[2] + (q.k - 0.5) * 7],
                { alpha: 0.6, curve: 0.2, relief: 0.7 });
      });
    });
  }

  // the cypress, flame by flame — the densest passage in the picture
  if (g.span(0.596, 0.818)) {
    g.clip(k.clipShape(k.cyp), () => {
      const make = (seed, n, lenK, wideK) => () => {
        const rr = makeRng(seed), out = [];
        for (let i = 0; i < n; i++) {
          const v = rr();
          const sp = Math.max(cypressSpan(S.cypress, v), S.cypress.w * 0.07);
          out.push({
            x: S.cypress.x + (rr() - 0.5) * 2.2 * sp,
            y: lerp(S.cypress.base, S.cypress.top, v),
            v, k: rr(), len: lenK * (0.6 + rr() * 0.9), wide: wideK * (0.6 + rr() * 0.9),
            a: -Math.PI / 2 + (rr() - 0.5) * 0.8
          });
        }
        return out.sort((p, q) => q.y - p.y);
      };
      g.batch(0.596, 0.704, g.cache('cypA', make(0x303, 1600, m * 0.03, m * 0.0085)), (q) => {
        const col = q.k < 0.16 ? C.cypressMid : C.cypress;
        const lit = (q.x - S.cypress.x) / S.cypress.w;       // the moon is to the right
        impasto(ctx, q.x, q.y, q.len, q.a, q.wide,
                [col[0] + (q.k - 0.5) * 12, col[1], col[2] + (q.k - 0.5) * 6 + lit * 2.4],
                { alpha: 0.74, curve: 0.55, relief: 1 });
      });
      g.batch(0.696, 0.818, g.cache('cypB', make(0x304, 1400, m * 0.024, m * 0.0062)), (q) => {
        const col = q.k < 0.17 ? C.cypressLit : (q.k < 0.55 ? C.cypressMid : C.cypress);
        const lit = (q.x - S.cypress.x) / S.cypress.w;
        impasto(ctx, q.x, q.y, q.len, q.a + (q.k - 0.5) * 0.5, q.wide,
                [col[0] + (q.k - 0.5) * 12, col[1], col[2] + (q.k - 0.5) * 8 + lit * 3 - q.v * 2],
                { alpha: 0.6 + q.k * 0.3, curve: 0.75, relief: 1.2 });
      });
    });
  }

  // the field in front of the village, in long low strokes
  if (g.span(0.764, 0.868)) {
    k.clipOpen((c) => c.rect(F.x, S.horizon + F.h * 0.055, F.w, F.y + F.h - S.horizon))(() => {
      g.batch(0.764, 0.868, g.cache('field', () => {
        const rr = makeRng(0x515), out = [];
        for (let i = 0; i < 900; i++) {
          out.push({
            x: F.x + rr() * F.w,
            y: S.horizon + F.h * (0.055 + Math.pow(rr(), 0.7) * 0.27),
            k: rr()
          });
        }
        return out.sort((p, q) => p.y - q.y);
      }), (q) => {
        const deep = (q.y - S.horizon) / (F.h * 0.3);
        const col = q.k < 0.18 ? C.fieldLight : C.field;
        impasto(ctx, q.x, q.y, m * (0.04 + q.k * 0.05), 0.03 + (q.k - 0.5) * 0.24,
                m * (0.008 + q.k * 0.008),
                [col[0] + (q.k - 0.5) * 9, col[1], col[2] + 2 - deep * 5 + (q.k - 0.5) * 4],
                { alpha: 0.5, relief: 0.7 });
      });
    });
  }
}

/* ── 0.66–0.80 the lights ────────────────────────────────────── */
function halo(g, ctx, x, y, r, ring, core, seed, from, to, n, hollow = 0.55) {
  g.batch(from, to, g.cache('halo' + seed, () => {
    const rr = makeRng(seed), out = [];
    out.push({ bloom: true });
    for (let i = 0; i < n; i++) {
      const u = Math.pow(rr(), hollow);
      out.push({ u, a: rr() * TAU, k: rr(), j: rr() });
    }
    return out;
  }), (q) => {
    if (q.bloom) {
      ctx.save();
      const bloom = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 3.4);
      bloom.addColorStop(0, css(ring, 0.5));
      bloom.addColorStop(0.35, css(ring, 0.2));
      bloom.addColorStop(1, css(ring, 0));
      ctx.fillStyle = bloom;
      ctx.beginPath(); ctx.arc(x, y, r * 3.4, 0, TAU); ctx.fill();
      ctx.restore();
      return;
    }
    const rad = q.u * r * 2.5;
    const col = q.u < 0.3 ? core : ring;
    impasto(ctx, x + Math.cos(q.a) * rad, y + Math.sin(q.a) * rad,
            r * (0.3 + q.k * 0.34) * (1 - q.u * 0.4),
            q.a + Math.PI / 2 + (q.j - 0.5) * 0.6,
            r * (0.2 - q.u * 0.1),
            [col[0] + (q.k - 0.5) * 8, col[1], col[2] - q.u * 12],
            { alpha: 0.9 - q.u * 0.55, curve: 0.6, relief: 1.2 - q.u * 0.6 });
  });
}

function lights(g, S, F, C, m, clipSky) {
  const { ctx } = g;
  if (!g.span(0.678, 0.836)) return;
  clipSky(() => {
    halo(g, ctx, S.moon.x, S.moon.y, S.moon.r, C.moon, C.moonCore, 77, 0.678, 0.722, 260, 1.2);

    // the crescent: the shadowed disc first, then the lit sliver over it, so
    // the shape reads as a moon and not as one more blot of yellow
    g.batch(0.714, 0.748, g.cache('crescent', () => {
      const R = S.moon.r * 1.05, rr = makeRng(91);
      const cx = S.moon.x, cy = S.moon.y;
      const inR = R * 0.94, inX = cx + R * 0.62, inY = cy - R * 0.16;
      const pts = [];
      for (let a = -Math.PI * 0.44; a <= Math.PI * 0.44; a += 0.05) {
        pts.push({ x: cx + Math.cos(Math.PI - a) * R, y: cy + Math.sin(Math.PI - a) * R });
      }
      for (let a = Math.PI * 0.62; a >= -Math.PI * 0.62; a -= 0.05) {
        pts.push({ x: inX + Math.cos(Math.PI - a) * inR, y: inY + Math.sin(Math.PI - a) * inR });
      }
      const out = [{ dim: { x: inX, y: inY, r: inR } }, { shape: pts }];
      for (let i = 0; i < 190; i++) {
        const a = rr() * TAU, rad = Math.sqrt(rr()) * R;
        out.push({ shape: pts, x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad, a: a + 1.4, k: rr(), R });
      }
      return out;
    }), (q) => {
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
      impasto(ctx, q.x, q.y, q.R * 0.26, q.a, q.R * 0.16,
              q.k < 0.55 ? C.moonCore : C.moon, { alpha: 0.95, relief: 1.35 });
      ctx.restore();
    });

    S.stars.forEach(([u, v, size], i) => {
      const a = 0.736 + i * 0.008;
      halo(g, ctx, S.px(u), S.py(v), m * 0.024 * size, C.star, C.starCore, 200 + i * 37, a, a + 0.05, 110);
    });
  });
}

/* ── 0.80–0.97 the last working ──────────────────────────────── */
function finish(g, S, F, C, m, k) {
  const { ctx } = g;

  // the windows, lit one by one
  k.clipOpen((c) => c.rect(F.x, F.y, F.w, F.h))(() => {
  g.batch(0.820, 0.872, g.cache('windows', () => {
    const rr = makeRng(0x71), out = [];
    for (let i = 0; i < HOUSES.length; i++) {
      const [u, hh, ww] = HOUSES[i];
      const n = rr() < 0.45 ? 2 : 1;
      for (let j = 0; j < n; j++) {
        out.push({
          x: F.x + F.w * u + (j ? (rr() < 0.5 ? -1 : 1) * m * ww * 0.5 : 0) + (rr() - 0.5) * m * 0.012,
          y: S.horizon - F.h * hh * (0.06 + rr() * 0.34),
          s: 0.7 + rr() * 0.6
        });
      }
    }
    return out.sort(() => 0);
  }), (q) => {
    ctx.save();
    const gg = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, m * 0.026 * q.s);
    gg.addColorStop(0, css(C.villageLit, 0.55));
    gg.addColorStop(1, css(C.villageLit, 0));
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(q.x, q.y, m * 0.026 * q.s, 0, TAU); ctx.fill();
    impasto(ctx, q.x - m * 0.004 * q.s, q.y, m * 0.009 * q.s, 0, m * 0.0075 * q.s, C.villageLit,
            { alpha: 0.95, relief: 1.2 });
    ctx.restore();
  });
  });

  // the hills catch a little of the sky
  if (g.span(0.840, 0.886)) {
    k.clipLand(k.hills)(() => {
      g.batch(0.840, 0.886, g.cache('hillCatch', () => {
        const rr = makeRng(0x414), out = [];
        for (let i = 0; i < 420; i++) out.push({ x: F.x + rr() * F.w, y: S.horizon - rr() * F.h * 0.1, k: rr() });
        return out;
      }), (q) => {
        impasto(ctx, q.x, q.y, m * (0.022 + q.k * 0.022), 0.05 + (q.k - 0.5) * 0.34, m * 0.0065,
                q.k < 0.25 ? C.swirlMid : C.hillLight, { alpha: 0.3, relief: 0.7 });
      });
    });
  }

  // third working of the sky: the pale ridges that sit on top of everything
  if (g.span(0.872, 0.956)) {
    k.clipSky(() => {
      g.batch(0.872, 0.956, g.cache('skyC', () => {
        const rr = makeRng(0x9c3), out = [];
        for (let i = 0; i < 1900; i++) {
          const x = F.x + rr() * F.w;
          const y = F.y + rr() * (S.horizon - F.y);
          const near = nearness(S, x, y);
          if (rr() > 0.25 + near * 0.85) continue;      // where the swirls are
          out.push({ x, y, near, k: rr(), a: flowAt(S, x, y) });
        }
        return out.sort((p, q) => p.y - q.y);
      }), (q) => {
        const col = q.k < 0.55 ? C.swirlPale : C.swirlMid;
        impasto(ctx, q.x, q.y, m * (0.02 + q.k * 0.03), q.a, m * (0.004 + q.k * 0.004),
                [col[0] + (q.k - 0.5) * 8, col[1] * (0.8 + q.k * 0.3), col[2] + q.near * 6 + (q.k - 0.5) * 6],
                { alpha: 0.55 + q.k * 0.35, curve: 0.7, relief: 1.35 });
      });
    });
  }

  // and the last darks, put back where the edges got lost
  if (g.span(0.938, 0.982)) {
    g.clip((c) => poly(c, k.cyp), () => {
      g.batch(0.938, 0.982, g.cache('cypLast', () => {
        const rr = makeRng(0x9d1), out = [];
        for (let i = 0; i < 420; i++) {
          const v = rr();
          out.push({
            x: S.cypress.x + (rr() - 0.5) * 2.05 * Math.max(cypressSpan(S.cypress, v), S.cypress.w * 0.07),
            y: lerp(S.cypress.base, S.cypress.top, v), k: rr()
          });
        }
        return out.sort((p, q) => q.y - p.y);
      }), (q) => {
        impasto(ctx, q.x, q.y, m * (0.018 + q.k * 0.02), -Math.PI / 2 + (q.k - 0.5) * 0.7,
                m * (0.004 + q.k * 0.004),
                q.k < 0.22 ? C.cypressLit : C.cypress, { alpha: 0.62, curve: 0.5, relief: 1.2 });
      });
    });
  }
}
