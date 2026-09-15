// ─────────────────────────────────────────────────────────────
// Vincent van Gogh — The Starry Night (1889), public domain.
//
// Built the way the surface actually is: a few thousand loaded strokes,
// each with a shadow side and a lit ridge, laid along a flow field that
// drifts across the sky and turns around two vortices. Nothing here is a
// gradient pretending to be paint.
//
// The stroke order is fixed and seeded, so the picture fills in the same
// way every time and a reload lands exactly where it left off.
// ─────────────────────────────────────────────────────────────

import { clamp, css, TAU, lerp, makeRng } from '../util.js';
import { impasto, sketch, ellipsePts, pathOf } from '../brush.js';

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
    cypress:{ x: px(0.16), base: py(1.02), top: py(0.06), w: m * 0.105 },
    spire:  { x: px(0.52), base: py(0.712), h: F.h * 0.145, w: m * 0.024 },
    stars: [
      [0.085, 0.085, 1.0], [0.225, 0.20, 0.62], [0.325, 0.065, 0.72],
      [0.615, 0.10, 0.66], [0.70, 0.225, 0.78], [0.925, 0.335, 0.6],
      [0.79, 0.44, 0.56], [0.10, 0.345, 0.54], [0.285, 0.50, 0.5],
      [0.565, 0.565, 0.46], [0.945, 0.585, 0.44]
    ]
  };
}

/**
 * Direction of the paint at a point: a slow drift across the canvas,
 * bent around each vortex by how close it is.
 */
function flowAt(S, x, y) {
  let ax = Math.cos(0.1 + Math.sin(x * 0.004) * 0.22 + Math.sin(y * 0.007) * 0.3);
  let ay = Math.sin(0.1 + Math.sin(x * 0.004) * 0.22 + Math.sin(y * 0.007) * 0.3);
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

/** Every mark in the sky, in the order it goes on. */
function skyStrokes(S, F, rng) {
  const out = [];
  const m = S.m;
  const rows = Math.round((S.horizon - F.y) / (m * 0.028));
  const cols = Math.round(F.w / (m * 0.026));
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = F.x + (i + 0.5 + (rng() - 0.5) * 0.9) * (F.w / cols);
      const y = F.y + (j + 0.5 + (rng() - 0.5) * 0.9) * ((S.horizon - F.y) / rows);
      if (y > S.horizon) continue;
      const a = flowAt(S, x, y);
      // near a vortex the paint is paler and the marks run longer
      const near = Math.max(
        clamp(1 - Math.hypot(x - S.vortA.x, (y - S.vortA.y) / 0.66) / (S.vortA.r * 1.5)),
        clamp(1 - Math.hypot(x - S.vortB.x, (y - S.vortB.y) / 0.66) / (S.vortB.r * 1.5))
      );
      out.push({
        x, y, a,
        len: m * (0.03 + rng() * 0.028 + near * 0.022),
        wide: m * (0.0085 + rng() * 0.006),
        near, k: rng(),
        band: j
      });
    }
  }
  // painted in bands down the canvas, so the filling reads as progress
  out.sort((p, q) => (p.band - q.band) || (p.x - q.x));
  return out;
}

function cypressOutline(C4) {
  const right = [], left = [], n = 64;
  for (let i = 0; i <= n; i++) {
    const v = i / n;
    const y = lerp(C4.base, C4.top, v);
    const body = (0.5 + Math.sin(Math.min(1, v / 0.1) * Math.PI * 0.5) * 0.5) * (1 - Math.pow(v, 1.9) * 0.93);
    const tR = (Math.sin(v * 11) * 0.13 + Math.sin(v * 5.3 + 1.1) * 0.1 + Math.sin(v * 23) * 0.05) * (1 - v * 0.35);
    const tL = (Math.sin(v * 9.4 + 2.3) * 0.13 + Math.sin(v * 6.1 + 0.4) * 0.1 + Math.sin(v * 19) * 0.05) * (1 - v * 0.35);
    right.push({ x: C4.x + C4.w * Math.max(0.03, body + tR), y });
    left.push({ x: C4.x - C4.w * Math.max(0.03, body + tL), y });
  }
  const pts = right.concat(left.reverse());
  pts.push(pts[0]);
  return pts;
}

function hillsPts(S, F) {
  const pts = [];
  for (let k = 0; k <= 30; k++) {
    const u = k / 30;
    pts.push({
      x: F.x + F.w * u,
      y: S.horizon - F.h * (0.075 * Math.sin(u * Math.PI * 1.35 + 0.5)
                            + 0.028 * Math.sin(u * Math.PI * 3.9 + 1.2)
                            + 0.014 * Math.sin(u * Math.PI * 8.1))
    });
  }
  pts.push({ x: F.x + F.w, y: S.horizon + F.h * 0.03 }, { x: F.x, y: S.horizon + F.h * 0.03 });
  return pts;
}

const HOUSES = [
  [0.055, 0.075, 0.048], [0.125, 0.055, 0.038], [0.195, 0.085, 0.052],
  [0.275, 0.058, 0.040], [0.345, 0.078, 0.048], [0.425, 0.052, 0.036],
  [0.600, 0.070, 0.046], [0.672, 0.052, 0.036], [0.745, 0.082, 0.052],
  [0.822, 0.056, 0.038], [0.892, 0.074, 0.046], [0.958, 0.058, 0.040]
];

export const subject = {
  id: 'starry-night',
  title: 'The Starry Night',
  artist: 'Vincent van Gogh',
  year: 1889,
  palette: {
    canvas:    [40, 20, 76],  ground:     [222, 38, 26],
    sketchInk: [212, 26, 58],
    skyDeep:   [226, 68, 15],  skyMid:    [221, 62, 24],  skyHigh: [214, 55, 34],
    swirl:     [206, 46, 56],  swirlPale: [199, 44, 78],  swirlMid: [204, 48, 64],
    star:      [45, 86, 60],   starCore:  [50, 96, 87],
    moon:      [44, 88, 62],   moonCore:  [48, 96, 88],
    hill:      [218, 44, 13],  hillLight: [206, 32, 24],
    village:   [226, 44, 9],   roof:      [230, 26, 21],  villageLit: [42, 92, 62],
    cypress:   [110, 40, 8],   cypressMid:[100, 34, 15],  cypressLit: [84, 34, 26],
    shadow:    [228, 44, 6],   light:     [48, 55, 86],
    surround:  [226, 28, 7]
  },

  focus(F) { const S = scene(F); return [{ x: S.px(0.5), y: S.py(0.4) }]; },

  draw(g) {
    const { ctx, F, C, m, at, rng, p } = g;
    const S = scene(F);

    const s2 = at(2);
    const cover = {
      sky:     clamp(s2 / 0.34),
      hills:   clamp((s2 - 0.3) / 0.2),
      village: clamp((s2 - 0.48) / 0.24),
      cypress: clamp((s2 - 0.7) / 0.3)
    };
    const inkA = (base, key) => base * (1 - clamp(cover[key]) * 0.94);

    /* ── the sky, laid in dark and flat ── */
    if (cover.sky > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, cover.sky * 1.15);
      const sg = ctx.createLinearGradient(F.x, F.y, F.x + F.w * 0.5, S.horizon);
      sg.addColorStop(0, css(C.skyDeep, 0.98));
      sg.addColorStop(0.5, css(C.skyMid, 0.98));
      sg.addColorStop(1, css(C.skyDeep, 0.98, 3));
      ctx.fillStyle = sg;
      ctx.fillRect(F.x, F.y, F.w, S.horizon - F.y);
      ctx.restore();
    }

    /* ── the drawing, kept until the paint reaches it ── */
    const s1 = at(1);
    if (s1 > 0) {
      const step = (from, span) => clamp((s1 - from) / span);
      sketch(ctx, [{ x: F.x, y: S.horizon }, { x: F.x + F.w, y: S.horizon - F.h * 0.005 }], step(0, 0.14), C.sketchInk, { alpha: inkA(0.5, 'village'), width: 1.4 });
      sketch(ctx, hillsPts(S, F).slice(0, 31), step(0.1, 0.16), C.sketchInk, { alpha: inkA(0.45, 'hills'), width: 1.3 });
      sketch(ctx, cypressOutline(S.cypress), step(0.22, 0.26), C.sketchInk, { alpha: inkA(0.6, 'cypress'), width: 1.4 });
      const sp = S.spire;
      sketch(ctx, [
        { x: sp.x - sp.w, y: sp.base }, { x: sp.x - sp.w, y: sp.base - sp.h * 0.5 },
        { x: sp.x, y: sp.base - sp.h }, { x: sp.x + sp.w, y: sp.base - sp.h * 0.5 },
        { x: sp.x + sp.w, y: sp.base }
      ], step(0.44, 0.16), C.sketchInk, { alpha: inkA(0.55, 'village'), width: 1.3 });
      sketch(ctx, ellipsePts(S.moon.x, S.moon.y, S.moon.r, S.moon.r), step(0.58, 0.14), C.sketchInk, { alpha: inkA(0.45, 'sky'), width: 1.2 });
      for (const [v, turns] of [[S.vortA, 1.1], [S.vortB, 0.8]]) {
        const spiral = [];
        for (let i = 0; i <= 90; i++) {
          const u = i / 90, a = u * TAU * turns * v.spin;
          spiral.push({ x: v.x + Math.cos(a) * v.r * (0.15 + u * 0.8), y: v.y + Math.sin(a) * v.r * (0.15 + u * 0.8) * 0.66 });
        }
        sketch(ctx, spiral, step(0.68, 0.32), C.sketchInk, { alpha: inkA(0.38, 'sky'), width: 1.1, double: false });
      }
    }

    /* ── the sky is painted: thousands of loaded strokes ── */
    const s3 = at(3), s5 = at(5);
    const skyT = clamp(s3 * 0.78 + at(4) * 0.14 + s5 * 0.08);
    if (skyT > 0 && cover.sky > 0.2) {
      const strokes = skyStrokes(S, F, makeRng(0x5eed));
      ctx.save();
      ctx.beginPath(); ctx.rect(F.x, F.y, F.w, S.horizon - F.y); ctx.clip();
      const lim = Math.floor(clamp(skyT) * strokes.length);
      for (let i = 0; i < lim; i++) {
        const st = strokes[i];
        const pale = st.k < 0.16 + st.near * 0.4;
        const base = pale ? C.swirlPale : (st.k < 0.5 ? C.swirlMid : C.swirl);
        const col = [
          base[0] + (st.k - 0.5) * 9,
          base[1] * (0.82 + st.k * 0.34),
          base[2] * (0.72 + st.near * 0.3) + (st.k - 0.5) * 9 - (1 - st.near) * 8
        ];
        impasto(ctx, st.x, st.y, st.len, st.a, st.wide, col,
                { alpha: 0.62 + st.k * 0.3, curve: 0.5, relief: 0.9 + st.near * 0.5 });
      }
      ctx.restore();
    }

    /* ── hills, village, cypress: in front of the sky, so the sky's
       strokes cannot paint over a roofline ── */
    if (cover.hills > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, cover.hills * 1.2);
      pathOf(ctx, hillsPts(S, F));
      const hg = ctx.createLinearGradient(0, S.horizon - F.h * 0.14, 0, S.horizon + F.h * 0.03);
      hg.addColorStop(0, css(C.hillLight, 0.96));
      hg.addColorStop(1, css(C.hill, 0.98));
      ctx.fillStyle = hg; ctx.fill();
      ctx.restore();
    }
    if (cover.village > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, cover.village * 1.2);
      const vg = ctx.createLinearGradient(0, S.horizon, 0, F.y + F.h);
      vg.addColorStop(0, css(C.village, 0.99, 4));
      vg.addColorStop(0.35, css(C.village, 0.99));
      vg.addColorStop(1, css(C.village, 0.99, -4));
      ctx.fillStyle = vg;
      ctx.fillRect(F.x, S.horizon, F.w, F.y + F.h - S.horizon);
      const shown = Math.ceil(cover.village * HOUSES.length);
      for (let i = 0; i < shown; i++) {
        const [u, hh, ww] = HOUSES[i];
        const x = F.x + F.w * u, hpx = F.h * hh, wpx = m * ww;
        const lean = Math.sin(i * 2.3) * wpx * 0.1;
        ctx.fillStyle = css(C.roof, 0.99, (i % 3) * 2);
        ctx.beginPath();
        ctx.moveTo(x - wpx, S.horizon + hpx * 0.25);
        ctx.lineTo(x - wpx + lean, S.horizon - hpx * 0.5);
        ctx.lineTo(x + lean * 0.5, S.horizon - hpx);
        ctx.lineTo(x + wpx + lean, S.horizon - hpx * 0.5);
        ctx.lineTo(x + wpx, S.horizon + hpx * 0.25);
        ctx.closePath(); ctx.fill();
      }
      const sp = S.spire;
      ctx.fillStyle = css(C.village, 0.99, -3);
      ctx.beginPath();
      ctx.moveTo(sp.x - sp.w, S.horizon + F.h * 0.01);
      ctx.lineTo(sp.x - sp.w, sp.base - sp.h * 0.45);
      ctx.lineTo(sp.x, sp.base - sp.h);
      ctx.lineTo(sp.x + sp.w, sp.base - sp.h * 0.45);
      ctx.lineTo(sp.x + sp.w, S.horizon + F.h * 0.01);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    if (cover.cypress > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, cover.cypress * 1.2);
      pathOf(ctx, cypressOutline(S.cypress));
      ctx.fillStyle = css(C.cypress, 0.99);
      ctx.fill();
      ctx.restore();
    }

    /* ── the lights ── */
    const s4 = at(4);
    if (s4 > 0) {
      const halo = (x, y, r, t, core, ring, seed) => {
        if (t <= 0) return;
        const rr = makeRng(seed);
        ctx.save();
        ctx.globalAlpha = clamp(t);
        // the light in the sky around it, soft and wide
        const bloom = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 3.4);
        bloom.addColorStop(0, css(ring, 0.5));
        bloom.addColorStop(0.35, css(ring, 0.2));
        bloom.addColorStop(1, css(ring, 0));
        ctx.fillStyle = bloom;
        ctx.beginPath(); ctx.arc(x, y, r * 3.4, 0, TAU); ctx.fill();
        // then strokes worked outward from the middle, thinning as they go
        const n = Math.round(74 + r * 0.6);
        for (let i = 0; i < n; i++) {
          const u = Math.pow(rr(), 0.55);               // crowded at the centre
          const a = rr() * TAU;
          const rad = u * r * 2.5;
          const col = u < 0.3 ? core : ring;
          impasto(ctx, x + Math.cos(a) * rad, y + Math.sin(a) * rad,
                  r * (0.3 + rr() * 0.34) * (1 - u * 0.4),
                  a + Math.PI / 2 + (rr() - 0.5) * 0.6,
                  r * (0.2 - u * 0.1),
                  [col[0] + (rr() - 0.5) * 8, col[1], col[2] - u * 12],
                  { alpha: 0.9 - u * 0.55, curve: 0.6, relief: 1.2 - u * 0.6 });
        }
        ctx.restore();
      };

      halo(S.moon.x, S.moon.y, S.moon.r, clamp(s4 / 0.26), C.moonCore, C.moon, 77);
      if (s4 > 0.1) {                                  // the crescent itself
        ctx.save();
        ctx.globalAlpha = clamp((s4 - 0.1) / 0.24);
        const R = S.moon.r * 1.05, rr = makeRng(91);
        const cx = S.moon.x, cy = S.moon.y;
        const inR = R * 0.96, inX = cx + R * 0.52, inY = cy - R * 0.2;
        // outer edge round the left, inner edge back — a real crescent, not a
        // disc with a hole punched through the canvas
        const pts = [];
        for (let a = -Math.PI * 0.44; a <= Math.PI * 0.44; a += 0.06) {
          pts.push({ x: cx + Math.cos(Math.PI - a) * R, y: cy + Math.sin(Math.PI - a) * R });
        }
        for (let a = Math.PI * 0.62; a >= -Math.PI * 0.62; a -= 0.06) {
          pts.push({ x: inX + Math.cos(Math.PI - a) * inR, y: inY + Math.sin(Math.PI - a) * inR });
        }
        pathOf(ctx, pts);
        ctx.fillStyle = css(C.moon, 0.9);
        ctx.fill();
        ctx.clip();
        for (let i = 0; i < 70; i++) {
          const a = rr() * TAU, rad = Math.sqrt(rr()) * R;
          impasto(ctx, cx + Math.cos(a) * rad, cy + Math.sin(a) * rad,
                  R * 0.3, a + 1.4, R * 0.2, i % 3 ? C.moonCore : C.moon,
                  { alpha: 0.92, relief: 1.3 });
        }
        ctx.restore();
      }
      S.stars.forEach(([u, v, size], i) => {
        const t = clamp((s4 - 0.14 - i * 0.052) / 0.3);
        halo(S.px(u), S.py(v), m * 0.024 * size, t, C.starCore, C.star, 200 + i * 37);
      });
    }

    /* ── the cypress worked up, and the windows lit ── */
    if (s5 > 0) {
      const cyT = clamp(s5 / 0.55);
      if (cyT > 0) {
        const rr = makeRng(303);
        ctx.save();
        pathOf(ctx, cypressOutline(S.cypress)); ctx.clip();
        const n = Math.floor(cyT * 900);
        for (let i = 0; i < n; i++) {
          const v = rr();
          const y = lerp(S.cypress.base, S.cypress.top, v);
          const span = S.cypress.w * (0.5 + Math.sin(Math.min(1, v / 0.1) * Math.PI * 0.5) * 0.5) * (1 - Math.pow(v, 1.9) * 0.93);
          const x = S.cypress.x + (rr() - 0.5) * 2.2 * Math.max(span, S.cypress.w * 0.06);
          const col = rr() < 0.25 ? C.cypressLit : C.cypressMid;
          impasto(ctx, x, y, m * (0.02 + rr() * 0.022), -Math.PI / 2 + (rr() - 0.5) * 0.7,
                  m * (0.006 + rr() * 0.005),
                  [col[0] + (rr() - 0.5) * 10, col[1], col[2] + (rr() - 0.5) * 8],
                  { alpha: 0.7, curve: 0.4, relief: 1.1 });
        }
        ctx.restore();
      }
      const lit = clamp((s5 - 0.2) / 0.45);
      if (lit > 0) {
        ctx.save();
        const shown = Math.ceil(lit * HOUSES.length);
        for (let i = 0; i < shown; i++) {
          const [u, hh] = HOUSES[i];
          const x = F.x + F.w * u, y = S.horizon - F.h * hh * 0.15;
          const gg = ctx.createRadialGradient(x, y, 0, x, y, m * 0.028);
          gg.addColorStop(0, css(C.villageLit, 0.55));
          gg.addColorStop(1, css(C.villageLit, 0));
          ctx.fillStyle = gg;
          ctx.beginPath(); ctx.arc(x, y, m * 0.028, 0, TAU); ctx.fill();
          impasto(ctx, x - m * 0.005, y, m * 0.01, 0, m * 0.009, C.villageLit, { alpha: 0.95, relief: 1.2 });
        }
        ctx.restore();
      }
      // the field in front of the village, painted in long low strokes
      const fieldT = clamp((s5 - 0.25) / 0.6);
      if (fieldT > 0) {
        const rr = makeRng(515);
        ctx.save();
        ctx.beginPath();
        ctx.rect(F.x, S.horizon + F.h * 0.06, F.w, F.y + F.h - S.horizon);
        ctx.clip();
        for (let i = 0; i < Math.floor(fieldT * 320); i++) {
          const y = S.horizon + F.h * (0.06 + Math.pow(rr(), 0.7) * 0.26);
          const x = F.x + rr() * F.w;
          const deep = (y - S.horizon) / (F.h * 0.3);
          const col = rr() < 0.22 ? C.hillLight : C.village;
          impasto(ctx, x, y, m * (0.035 + rr() * 0.04), 0.03 + (rr() - 0.5) * 0.22,
                  m * (0.008 + rr() * 0.008),
                  [col[0] + (rr() - 0.5) * 8, col[1], col[2] + 4 - deep * 5 + (rr() - 0.5) * 5],
                  { alpha: 0.5, relief: 0.8 });
        }
        ctx.restore();
      }

      // hills and roofs catch a little of the sky
      const catchT = clamp((s5 - 0.4) / 0.6);
      if (catchT > 0) {
        const rr = makeRng(414);
        ctx.save();
        pathOf(ctx, hillsPts(S, F)); ctx.clip();
        for (let i = 0; i < Math.floor(catchT * 160); i++) {
          const x = F.x + rr() * F.w, y = S.horizon - rr() * F.h * 0.1;
          impasto(ctx, x, y, m * (0.025 + rr() * 0.02), 0.05 + (rr() - 0.5) * 0.3, m * 0.007,
                  rr() < 0.3 ? C.swirl : C.hillLight, { alpha: 0.4, relief: 0.8 });
        }
        ctx.restore();
      }
    }

    /* ── raking light, so the thick paint catches it ── */
    if (p > 0.96) {
      const t = clamp((p - 0.96) / 0.04);
      ctx.save();
      ctx.globalAlpha = 0.2 * t;
      const rg = ctx.createLinearGradient(F.x, F.y, F.x + F.w * 0.6, F.y + F.h);
      rg.addColorStop(0, css(C.light, 0.3));
      rg.addColorStop(0.5, css(C.light, 0));
      rg.addColorStop(1, css(C.shadow, 0.25));
      ctx.fillStyle = rg;
      ctx.fillRect(F.x, F.y, F.w, F.h);
      ctx.restore();
    }
  }
};
