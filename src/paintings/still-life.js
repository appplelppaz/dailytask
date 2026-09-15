// ─────────────────────────────────────────────────────────────
// A studio still life — the plain one, kept as the baseline that
// every famous picture is built the same way as.
// ─────────────────────────────────────────────────────────────

import { clamp, css, TAU } from '../util.js';
import { texture, sketch, ellipsePts, pathOf, massFill, model, sphere } from '../painting.js';

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

export const subject = {
  id: 'still-life',
  title: 'Studio Still Life',
  artist: null,
  palette: {
    canvas:    [38, 24, 80],   ground:     [28, 30, 58],
    sketchInk: [22, 12, 30],
    wall:      [44, 16, 44],   wallLight:  [42, 26, 63],  wallDark: [30, 14, 26],
    table:     [22, 34, 20],   tableLight: [26, 40, 32],
    cloth:     [44, 14, 78],   clothShade: [218, 16, 54],
    jug:       [16, 44, 44],   jugLight:   [24, 52, 62],
    bowl:      [200, 16, 52],  bowlLight:  [200, 20, 68],
    fruitA:    [4, 62, 42],    fruitALight:[16, 70, 58],
    fruitB:    [40, 66, 52],   fruitBLight:[46, 74, 66],
    shadow:    [250, 26, 16],  light:      [46, 44, 90],
    surround:  [250, 20, 14]
  },
  tints: ['ground', 'sketchInk', 'wall', 'shadow', 'fruitA', 'light', 'light'],

  focus(F) {
    const S = stillLife(F);
    return [
      { x: S.px(0.5),   y: S.py(0.30) },
      { x: S.jug.cx,    y: S.py(0.52) },
      { x: S.px(0.52),  y: S.py(0.40) },
      { x: S.jug.cx,    y: S.py(0.56) },
      { x: S.fruitA.cx, y: S.fruitA.cy },
      { x: S.bowl.cx,   y: S.bowl.cy },
      { x: S.px(0.5),   y: S.py(0.52) }
    ];
  },

  draw(g) {
    const { ctx, F, C, m, at, rng } = g;
    const S = stillLife(F);

    const s2raw = at(2);
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

    /* the planes the things stand on */
    const r2 = rng(2);
    if (s2raw > 0) {
      if (cover.wall > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, cover.wall * 1.1);
        const wg = ctx.createLinearGradient(F.x, F.y, F.x + F.w * 0.85, S.tableY);
        wg.addColorStop(0, css(C.wallLight, 0.95));
        wg.addColorStop(0.55, css(C.wall, 0.95));
        wg.addColorStop(1, css(C.wallDark, 0.95));
        ctx.fillStyle = wg;
        ctx.fillRect(S.wall.x, S.wall.y, S.wall.w, S.wall.h);
        ctx.globalAlpha = 1;
        texture(ctx, S.wall, cover.wall, C.wall, { rng: r2, n: 130, alpha: 0.12, ang: -0.06, spread: 0.25, wide: m * 0.04, len: 4 });
        ctx.restore();
      }
      if (cover.table > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, cover.table * 1.1);
        const tg = ctx.createLinearGradient(0, S.tableY, 0, F.y + F.h);
        tg.addColorStop(0, css(C.tableLight, 0.95));
        tg.addColorStop(1, css(C.table, 0.98));
        ctx.fillStyle = tg;
        ctx.fillRect(S.table.x, S.table.y, S.table.w, S.table.h);
        ctx.globalAlpha = 1;
        texture(ctx, S.table, cover.table, C.table, { rng: r2, n: 80, alpha: 0.14, ang: 0.02, spread: 0.12, wide: m * 0.035, len: 5 });
        ctx.restore();
      }
    }

    /* charcoal construction — kept until each thing is painted over */
    const s1 = at(1);
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

    /* the things standing on it */
    if (s2raw > 0) {
      massFill(ctx, clothOutline(S.cloth), cover.cloth, C.cloth, { rng: r2, wide: m * 0.03, n: 70, alpha: 0.16 });
      massFill(ctx, jugOutline(S.jug), cover.jug, C.jug, { rng: r2, wide: m * 0.025, n: 80, alpha: 0.18, angleFn: () => Math.PI / 2 });
      massFill(ctx, bowlOutline(S.bowl), cover.bowl, C.bowl, { rng: r2, wide: m * 0.022, n: 50, alpha: 0.16 });
      for (const [f, col, t] of [[S.fruitA, C.fruitA, cover.fruitA], [S.fruitB, C.fruitB, cover.fruitB]]) {
        massFill(ctx, ellipsePts(f.cx, f.cy, f.r, f.r * 0.95), t, col, { rng: r2, wide: f.r * 0.3, n: 24, alpha: 0.18 });
      }
    }

    /* modelling */
    const s3 = at(3), r3 = rng(3);
    if (s3 > 0) {
      model(ctx, jugOutline(S.jug), clamp(s3 / 0.3), C.shadow, C.jugLight, { darkA: 0.5, lightA: 0.3 });
      const bowlT = clamp((s3 - 0.24) / 0.22);
      model(ctx, bowlOutline(S.bowl), bowlT, C.shadow, C.bowlLight, { darkA: 0.4, lightA: 0.26 });
      if (bowlT > 0) {
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
      sphere(ctx, S.fruitA, clamp((s3 - 0.4) / 0.22), C.fruitA, C.fruitALight, C.shadow, r3);
      sphere(ctx, S.fruitB, clamp((s3 - 0.5) / 0.22), C.fruitB, C.fruitBLight, C.shadow, r3);

      const cast = clamp((s3 - 0.6) / 0.4);
      if (cast > 0) {
        ctx.save();
        ctx.globalAlpha = 0.55 * cast;
        const shadowOf = (cx, cy, rx, ry) => {
          const gg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
          gg.addColorStop(0, css(C.shadow, 0.5));
          gg.addColorStop(1, css(C.shadow, 0));
          ctx.fillStyle = gg;
          ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.fill();
        };
        shadowOf(S.jug.cx + S.jug.hw * 1.25, S.jug.base + m * 0.012, S.jug.hw * 2.1, m * 0.028);
        shadowOf(S.fruitA.cx + S.fruitA.r * 0.8, S.fruitA.cy + S.fruitA.r * 0.82, S.fruitA.r * 1.7, S.fruitA.r * 0.42);
        shadowOf(S.fruitB.cx + S.fruitB.r * 0.8, S.fruitB.cy + S.fruitB.r * 0.82, S.fruitB.r * 1.7, S.fruitB.r * 0.42);
        ctx.restore();
      }

      const folds = clamp((s3 - 0.42) / 0.5);
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
          const gg = ctx.createLinearGradient(fx - wide, 0, fx + wide, 0);
          gg.addColorStop(0, css(C.light, 0.22));
          gg.addColorStop(0.45, css(C.clothShade, 0.34));
          gg.addColorStop(1, css(C.light, 0.1));
          ctx.fillStyle = gg;
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

    /* colour */
    const s4 = at(4), r4 = rng(4);
    if (s4 > 0) {
      const glaze = (pts, t, col, alpha, wide, angleFn) => {
        if (t <= 0) return;
        ctx.save();
        pathOf(ctx, pts); ctx.clip();
        const b = { x: F.x, y: F.y, w: F.w, h: F.h };
        texture(ctx, b, t, col, { rng: r4, n: 40, alpha, wide, len: 2.4, spread: 0.6, angleFn });
        ctx.restore();
      };
      glaze(jugOutline(S.jug), clamp(s4 / 0.32), C.jugLight, 0.13, m * 0.02, () => Math.PI / 2);
      glaze(bowlOutline(S.bowl), clamp((s4 - 0.26) / 0.3), C.bowlLight, 0.11, m * 0.018);
      glaze(clothOutline(S.cloth), clamp((s4 - 0.4) / 0.36), C.light, 0.1, m * 0.024, () => -0.25);
      const warm = clamp((s4 - 0.55) / 0.45);
      if (warm > 0) {
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

    /* the few marks that make it read */
    const s5 = at(5);
    if (s5 > 0) {
      const spec = (x, y, rx, ry, a, t, alpha = 0.9) => {
        if (t <= 0) return;
        ctx.save();
        ctx.globalAlpha = clamp(t);
        const gg = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
        gg.addColorStop(0, css(C.light, alpha));
        gg.addColorStop(1, css(C.light, 0));
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.ellipse(x, y, rx, ry, a, 0, TAU); ctx.fill();
        ctx.restore();
      };
      const J = S.jug;
      spec(J.cx - J.hw * 0.5, J.base - J.hh * 0.56, J.hw * 0.2, J.hh * 0.22, -0.1, clamp(s5 / 0.3));
      spec(J.cx, J.base - J.hh * 1.0, J.neck * 0.8, m * 0.008, 0, clamp((s5 - 0.18) / 0.24));
      spec(S.fruitA.cx - S.fruitA.r * 0.36, S.fruitA.cy - S.fruitA.r * 0.42, S.fruitA.r * 0.26, S.fruitA.r * 0.2, -0.5, clamp((s5 - 0.34) / 0.24));
      spec(S.fruitB.cx - S.fruitB.r * 0.34, S.fruitB.cy - S.fruitB.r * 0.44, S.fruitB.r * 0.22, S.fruitB.r * 0.17, -0.5, clamp((s5 - 0.46) / 0.24));
    }
  }
};
