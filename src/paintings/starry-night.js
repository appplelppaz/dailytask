// ─────────────────────────────────────────────────────────────
// Vincent van Gogh — The Starry Night (1889), public domain.
//
// Painted the way he painted it: a ground, the drawing, the dark
// masses, then the sky set moving with short curved strokes, then the
// stars and the moon, then the impasto that sits proud of the surface.
// ─────────────────────────────────────────────────────────────

import { clamp, css, TAU, lerp } from '../util.js';
import { texture, sketch, ellipsePts, pathOf } from '../painting.js';

/* ── composition, in fractions of the canvas ─────────────────── */
function scene(F) {
  const px = (u) => F.x + F.w * u, py = (v) => F.y + F.h * v;
  const m = Math.min(F.w, F.h);
  return {
    px, py, m,
    horizon: py(0.735),
    moon:    { x: px(0.845), y: py(0.145), r: m * 0.075 },
    swirl:   { x: px(0.47), y: py(0.345), r: m * 0.29 },
    cypress: { x: px(0.145), base: py(1.0), top: py(0.035), w: m * 0.062 },
    spire:   { x: px(0.545), base: py(0.735), h: F.h * 0.165, w: m * 0.038 },
    stars: [
      [0.10, 0.10, 1.0], [0.235, 0.215, 0.7], [0.335, 0.075, 0.85],
      [0.60, 0.115, 0.75], [0.685, 0.255, 0.9], [0.90, 0.36, 0.8],
      [0.775, 0.47, 0.7], [0.115, 0.375, 0.65], [0.30, 0.525, 0.6],
      [0.545, 0.60, 0.55], [0.955, 0.60, 0.5]
    ]
  };
}

/** The long sinuous currents the sky is built from. */
function currents(S, F) {
  // long, mostly level bands with a slow S in them — they flow across the
  // sky rather than weaving a net through it
  const rows = [0.045, 0.125, 0.205, 0.30, 0.44, 0.545, 0.635, 0.70];
  return rows.map((v, i) => {
    const amp = F.h * (0.018 + (i % 3) * 0.012);
    const freq = 1.1 + (i % 2) * 0.35;
    const pts = [];
    for (let k = 0; k <= 30; k++) {
      const u = k / 30;
      pts.push({
        x: F.x + F.w * (u * 1.08 - 0.04),
        y: S.py(v) + Math.sin(u * Math.PI * freq + i * 0.9) * amp + u * F.h * 0.012
      });
    }
    return pts;
  });
}

/** The great double spiral at the centre of the sky. */
function spiralPts(c, turns, from, to, flip) {
  const pts = [];
  for (let i = 0; i <= 120; i++) {
    const u = i / 120;
    const a = (from + (to - from) * u) * (flip ? -1 : 1);
    const r = c.r * (0.1 + u * 0.9);
    pts.push({ x: c.x + Math.cos(a + u * turns * TAU * (flip ? -1 : 1)) * r, y: c.y + Math.sin(a + u * turns * TAU * (flip ? -1 : 1)) * r * 0.62 });
  }
  return pts;
}

function cypressOutline(C4) {
  const pts = [], n = 56, right = [], left = [];
  for (let i = 0; i <= n; i++) {
    const v = i / n;                                   // 0 root → 1 tip
    const y = lerp(C4.base, C4.top, v);
    // widest low down, then a long taper to a point — and a ragged edge,
    // because a cypress is made of dozens of little upward tufts
    const body = Math.pow(1 - v, 1.15) * (0.28 + Math.sin(Math.min(1, v / 0.16) * Math.PI * 0.5) * 0.82);
    const tuftR = (Math.sin(v * 53) * 0.2 + Math.sin(v * 23 + 1.1) * 0.13) * (1 - v * 0.5);
    const tuftL = (Math.sin(v * 47 + 2.3) * 0.2 + Math.sin(v * 27 + 0.4) * 0.13) * (1 - v * 0.5);
    right.push({ x: C4.x + C4.w * Math.max(0.02, body + tuftR), y });
    left.push({ x: C4.x - C4.w * Math.max(0.02, body + tuftL), y });
  }
  for (const q of right) pts.push(q);
  for (let i = left.length - 1; i >= 0; i--) pts.push(left[i]);
  pts.push(pts[0]);
  return pts;
}

function hillsPts(S, F) {
  const pts = [{ x: F.x, y: S.horizon }];
  for (let k = 0; k <= 24; k++) {
    const u = k / 24;
    pts.push({
      x: F.x + F.w * u,
      y: S.horizon - F.h * (0.055 * Math.sin(u * Math.PI * 1.7 + 0.6) + 0.03 * Math.sin(u * Math.PI * 4.1))
    });
  }
  pts.push({ x: F.x + F.w, y: S.horizon + F.h * 0.02 }, { x: F.x, y: S.horizon + F.h * 0.02 });
  return pts;
}

/** Van Gogh's mark: a short curved stroke, thick then thin. */
function comma(ctx, x, y, len, ang, wide, color, alpha) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const nx = -dy, ny = dx;
  const bend = len * 0.3;
  ctx.strokeStyle = css(color, alpha);
  ctx.lineWidth = wide;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + dx * len * 0.5 + nx * bend * 0.4, y + dy * len * 0.5 + ny * bend * 0.4,
                       x + dx * len, y + dy * len);
  ctx.stroke();
  ctx.lineWidth = wide * 0.45;                         // the tail thins out
  ctx.beginPath();
  ctx.moveTo(x + dx * len * 0.6, y + dy * len * 0.6);
  ctx.lineTo(x + dx * len * 1.3, y + dy * len * 1.3);
  ctx.stroke();
}

/* ── the village ─────────────────────────────────────────────── */
const HOUSES = [
  [0.09, 0.055, 0.035], [0.16, 0.042, 0.028], [0.235, 0.06, 0.04],
  [0.33, 0.045, 0.03], [0.40, 0.058, 0.036], [0.48, 0.04, 0.026],
  [0.62, 0.052, 0.034], [0.70, 0.038, 0.026], [0.78, 0.055, 0.038],
  [0.87, 0.042, 0.03], [0.94, 0.05, 0.032]
];

export const subject = {
  id: 'starry-night',
  title: 'The Starry Night',
  artist: 'Vincent van Gogh',
  year: 1889,
  palette: {
    canvas:    [40, 22, 78],   ground:    [220, 30, 30],
    sketchInk: [210, 30, 62],
    skyDeep:   [223, 62, 20],  skyMid:    [216, 58, 33],  skyPale: [200, 48, 52],
    swirl:     [205, 55, 62],  swirlPale: [190, 40, 78],
    star:      [48, 88, 62],   starCore:  [52, 95, 84],
    moon:      [44, 92, 60],   moonCore:  [50, 96, 86],
    hill:      [210, 45, 16],  hillLight: [196, 34, 30],
    village:   [222, 40, 13],  villageLit:[44, 88, 58],
    cypress:   [96, 34, 11],   cypressLit:[88, 40, 22],
    shadow:    [226, 40, 8],   light:     [50, 60, 88],
    surround:  [224, 26, 9]
  },
  tints: ['ground', 'sketchInk', 'skyDeep', 'swirl', 'star', 'starCore', 'light'],

  focus(F) {
    const S = scene(F);
    return [
      { x: S.px(0.5),  y: S.py(0.3) },
      { x: S.cypress.x, y: S.py(0.45) },
      { x: S.px(0.5),  y: S.py(0.2) },
      { x: S.swirl.x,  y: S.swirl.y },
      { x: S.moon.x,   y: S.moon.y },
      { x: S.px(0.45), y: S.py(0.66) },
      { x: S.px(0.5),  y: S.py(0.4) }
    ];
  },

  draw(g) {
    const { ctx, F, C, m, at, rng } = g;
    const S = scene(F);

    const s2 = at(2);
    const cover = {
      sky:     clamp(s2 / 0.34),
      hills:   clamp((s2 - 0.3) / 0.22),
      village: clamp((s2 - 0.5) / 0.24),
      cypress: clamp((s2 - 0.72) / 0.28)
    };
    const inkA = (base, key) => base * (1 - clamp(cover[key]) * 0.92);

    /* ── the dark sky, laid in first ── */
    const r2 = rng(2);
    if (cover.sky > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, cover.sky * 1.1);
      const sg = ctx.createLinearGradient(F.x, F.y, F.x + F.w * 0.4, S.horizon);
      sg.addColorStop(0, css(C.skyDeep, 0.97));
      sg.addColorStop(0.55, css(C.skyMid, 0.97));
      sg.addColorStop(1, css(C.skyDeep, 0.97));
      ctx.fillStyle = sg;
      ctx.fillRect(F.x, F.y, F.w, S.horizon - F.y);
      ctx.globalAlpha = 1;
      texture(ctx, { x: F.x, y: F.y, w: F.w, h: S.horizon - F.y }, cover.sky, C.skyMid,
              { rng: r2, n: 150, alpha: 0.1, ang: -0.1, spread: 0.5, wide: m * 0.03, len: 3.4 });
      ctx.restore();
    }

    /* ── the drawing: it stays until the paint reaches it ── */
    const s1 = at(1);
    if (s1 > 0) {
      const step = (from, span) => clamp((s1 - from) / span);
      sketch(ctx, [{ x: F.x, y: S.horizon }, { x: F.x + F.w, y: S.horizon - F.h * 0.004 }], step(0, 0.14), C.sketchInk, { alpha: inkA(0.5, 'village'), width: 1.4 });
      sketch(ctx, hillsPts(S, F).slice(1, 26), step(0.1, 0.16), C.sketchInk, { alpha: inkA(0.45, 'hills'), width: 1.3 });
      sketch(ctx, cypressOutline(S.cypress), step(0.22, 0.26), C.sketchInk, { alpha: inkA(0.6, 'cypress'), width: 1.5 });
      const sp = S.spire;
      sketch(ctx, [
        { x: sp.x - sp.w, y: sp.base }, { x: sp.x - sp.w, y: sp.base - sp.h * 0.55 },
        { x: sp.x, y: sp.base - sp.h }, { x: sp.x + sp.w, y: sp.base - sp.h * 0.55 },
        { x: sp.x + sp.w, y: sp.base }
      ], step(0.44, 0.16), C.sketchInk, { alpha: inkA(0.55, 'village'), width: 1.3 });
      sketch(ctx, ellipsePts(S.moon.x, S.moon.y, S.moon.r, S.moon.r), step(0.58, 0.14), C.sketchInk, { alpha: inkA(0.5, 'sky') * 0.8, width: 1.2 });
      // the spiral he laid in before he filled it
      sketch(ctx, spiralPts(S.swirl, 1.15, 0, Math.PI * 1.6, false), step(0.7, 0.3), C.sketchInk, { alpha: inkA(0.4, 'sky') * 0.8, width: 1.1, double: false });
    }

    /* ── hills, village, cypress ── */
    if (s2 > 0) {
      if (cover.hills > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, cover.hills * 1.15);
        pathOf(ctx, hillsPts(S, F));
        const hg = ctx.createLinearGradient(0, S.horizon - F.h * 0.1, 0, S.horizon + F.h * 0.02);
        hg.addColorStop(0, css(C.hillLight, 0.95));
        hg.addColorStop(1, css(C.hill, 0.98));
        ctx.fillStyle = hg; ctx.fill();
        ctx.restore();
      }
      if (cover.village > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, cover.village * 1.15);
        ctx.fillStyle = css(C.village, 0.97);
        ctx.fillRect(F.x, S.horizon, F.w, F.y + F.h - S.horizon);
        // roofs along the street
        const shown = Math.ceil(cover.village * HOUSES.length);
        for (let i = 0; i < shown; i++) {
          const [u, hh, ww] = HOUSES[i];
          const x = F.x + F.w * u, hpx = F.h * hh, wpx = m * ww;
          ctx.fillStyle = css(C.village, 0.98, -3);
          ctx.beginPath();
          ctx.moveTo(x - wpx, S.horizon + hpx * 0.2);
          ctx.lineTo(x - wpx, S.horizon - hpx * 0.55);
          ctx.lineTo(x, S.horizon - hpx);
          ctx.lineTo(x + wpx, S.horizon - hpx * 0.55);
          ctx.lineTo(x + wpx, S.horizon + hpx * 0.2);
          ctx.closePath(); ctx.fill();
        }
        // the church, holding the middle
        const sp = S.spire;
        ctx.fillStyle = css(C.village, 0.98, -5);
        ctx.beginPath();
        ctx.moveTo(sp.x - sp.w, S.horizon);
        ctx.lineTo(sp.x - sp.w, sp.base - sp.h * 0.5);
        ctx.lineTo(sp.x, sp.base - sp.h);
        ctx.lineTo(sp.x + sp.w, sp.base - sp.h * 0.5);
        ctx.lineTo(sp.x + sp.w, S.horizon);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      if (cover.cypress > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, cover.cypress * 1.15);
        pathOf(ctx, cypressOutline(S.cypress));
        ctx.fillStyle = css(C.cypress, 0.98);
        ctx.fill();
        ctx.restore();
      }
    }

    /* ── the sky starts to move ── */
    const s3 = at(3), r3 = rng(3);
    if (s3 > 0) {
      const flows = currents(S, F);
      ctx.save();
      ctx.beginPath();
      ctx.rect(F.x, F.y, F.w, S.horizon - F.y);
      ctx.clip();
      ctx.lineCap = 'round';
      const rr = rng(3);
      flows.forEach((pts, i) => {
        const t = clamp((s3 - i * 0.055) / 0.42);
        if (t <= 0) return;
        const lim = Math.floor(t * (pts.length - 1));
        for (let k = 0; k < lim; k++) {
          const a = pts[k], b = pts[k + 1];
          // the swirl owns its own patch of sky
          const d = Math.hypot(a.x - S.swirl.x, (a.y - S.swirl.y) / 0.62);
          if (d < S.swirl.r * 1.02) continue;
          const ang = Math.atan2(b.y - a.y, b.x - a.x);
          // three separate marks across the width of the current
          for (let j = 0; j < 3; j++) {
            const off = (j - 1) * m * 0.016 + (rr() - 0.5) * m * 0.01;
            comma(ctx, a.x + Math.sin(ang) * off, a.y - Math.cos(ang) * off,
                  m * (0.026 + rr() * 0.02), ang + (rr() - 0.5) * 0.3,
                  m * (0.006 + rr() * 0.005),
                  rr() < 0.3 ? C.swirlPale : C.swirl,
                  0.3 + rr() * 0.3);
          }
        }
      });
      // the great swirl, wound from the inside out
      const sw = clamp((s3 - 0.3) / 0.6);
      if (sw > 0) {
        for (const [flip, turns] of [[false, 1.25], [true, 0.95]]) {
          const pts = spiralPts(S.swirl, turns, 0.4, Math.PI * 1.7, flip);
          const lim = Math.floor(sw * (pts.length - 1));
          for (let k = 0; k < lim; k += 2) {
            const a = pts[k], b = pts[Math.min(pts.length - 1, k + 2)];
            const ang = Math.atan2(b.y - a.y, b.x - a.x);
            const u = k / pts.length;
            for (let j = 0; j < 2; j++) {
              const off = (j - 0.5) * m * 0.018;
              comma(ctx, a.x + Math.sin(ang) * off, a.y - Math.cos(ang) * off,
                    m * (0.03 + u * 0.03), ang + (rr() - 0.5) * 0.25,
                    m * (0.007 + u * 0.006),
                    rr() < 0.4 ? C.swirlPale : C.swirl,
                    0.34 + rr() * 0.3);
            }
          }
        }
      }
      ctx.restore();
    }

    /* ── the lights in the sky ── */
    const s4 = at(4);
    if (s4 > 0) {
      const halo = (x, y, r, t, core, ring) => {
        if (t <= 0) return;
        ctx.save();
        ctx.globalAlpha = clamp(t);
        for (let i = 3; i >= 1; i--) {                  // the rings he ringed them with
          const gg = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * (1 + i * 0.55));
          gg.addColorStop(0, css(ring, 0.3));
          gg.addColorStop(1, css(ring, 0));
          ctx.fillStyle = gg;
          ctx.beginPath(); ctx.arc(x, y, r * (1 + i * 0.55), 0, TAU); ctx.fill();
        }
        const cg = ctx.createRadialGradient(x, y, 0, x, y, r);
        cg.addColorStop(0, css(core, 0.98));
        cg.addColorStop(0.55, css(ring, 0.8));
        cg.addColorStop(1, css(ring, 0));
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        ctx.restore();
      };

      halo(S.moon.x, S.moon.y, S.moon.r, clamp(s4 / 0.26), C.moonCore, C.moon);
      if (s4 > 0.1) {                                   // the crescent inside the glow
        ctx.save();
        ctx.globalAlpha = clamp((s4 - 0.1) / 0.24);
        const r = S.moon.r * 0.74;
        ctx.fillStyle = css(C.moonCore, 0.96);
        ctx.beginPath();
        ctx.arc(S.moon.x, S.moon.y, r, 0, TAU);
        ctx.fill();
        // the bite is sky, painted back over it — never a hole in the canvas
        ctx.fillStyle = css(C.skyMid, 0.97);
        ctx.beginPath();
        ctx.arc(S.moon.x + r * 0.52, S.moon.y - r * 0.26, r * 0.92, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      S.stars.forEach(([u, v, size], i) => {
        const t = clamp((s4 - 0.16 - i * 0.055) / 0.3);
        halo(S.px(u), S.py(v), m * 0.026 * size, t, C.starCore, C.star);
      });
    }

    /* ── the village wakes, and the impasto goes on ── */
    const s5 = at(5);
    if (s5 > 0) {
      const lit = clamp(s5 / 0.4);
      if (lit > 0) {
        ctx.save();
        const shown = Math.ceil(lit * HOUSES.length);
        for (let i = 0; i < shown; i++) {
          const [u, hh] = HOUSES[i];
          const x = F.x + F.w * u, y = S.horizon - F.h * hh * 0.18;
          ctx.globalAlpha = 0.9;
          const gg = ctx.createRadialGradient(x, y, 0, x, y, m * 0.03);
          gg.addColorStop(0, css(C.villageLit, 0.9));
          gg.addColorStop(1, css(C.villageLit, 0));
          ctx.fillStyle = gg;
          ctx.beginPath(); ctx.arc(x, y, m * 0.03, 0, TAU); ctx.fill();
          ctx.fillStyle = css(C.villageLit, 0.95);
          ctx.fillRect(x - m * 0.006, y - m * 0.006, m * 0.012, m * 0.012);
        }
        ctx.restore();
      }
      // the cypress catches a little of the sky
      const edge = clamp((s5 - 0.3) / 0.5);
      if (edge > 0) {
        ctx.save();
        pathOf(ctx, cypressOutline(S.cypress)); ctx.clip();
        ctx.globalAlpha = edge;
        texture(ctx, { x: S.cypress.x - S.cypress.w * 1.4, y: S.cypress.top, w: S.cypress.w * 2.8, h: S.cypress.base - S.cypress.top },
                1, C.cypressLit, { rng: rng(5), n: 90, alpha: 0.3, ang: -1.45, spread: 0.5, wide: m * 0.011, len: 3.4 });
        ctx.restore();
      }
      // a last pass of light over the currents
      const last = clamp((s5 - 0.55) / 0.45);
      if (last > 0) {
        ctx.save();
        ctx.beginPath(); ctx.rect(F.x, F.y, F.w, S.horizon - F.y); ctx.clip();
        ctx.globalAlpha = last * 0.5;
        texture(ctx, { x: F.x, y: F.y, w: F.w, h: S.horizon - F.y }, 1, C.swirlPale,
                { rng: rng(5), n: 70, alpha: 0.24, ang: -0.15, spread: 0.9, wide: m * 0.012, len: 3 });
        ctx.restore();
      }
    }
  }
};
