// ─────────────────────────────────────────────────────────────
// The kit every picture is painted with: loaded strokes, charcoal
// lines, and the few shape helpers they share. Kept apart from the
// engine so that a subject can import it without importing the
// registry that lists the subject.
// ─────────────────────────────────────────────────────────────

import { clamp, css, TAU } from './util.js';

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

/* ── shared shape kit ────────────────────────────────────────── */

export function pathOf(ctx, pts) {
  ctx.beginPath();
  poly(ctx, pts);
}

/** The same shape added to the path already being built, not replacing it. */
export function poly(ctx, pts) {
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

export function frameOf(w, h) {
  const m = Math.min(w, h) * 0.05;
  return { x: m, y: m, w: w - m * 2, h: h - m * 2 };
}

/**
 * One loaded brush mark, with body. The same stroke is laid three times —
 * a shadow on the side away from the light, the colour itself, and a lit
 * ridge where the paint stands proud — which is what makes canvas 2D read
 * as thick oil rather than as flat vector.
 */
export function impasto(ctx, x, y, len, ang, wide, color, opts = {}) {
  const { alpha = 1, curve = 0.3, lightAng = -2.3, relief = 1 } = opts;
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const nx = -dy, ny = dx;
  const off = wide * 0.34 * relief;
  const lx = Math.cos(lightAng) * off, ly = Math.sin(lightAng) * off;

  const lay = (ox, oy) => {
    ctx.beginPath();
    ctx.moveTo(x + ox, y + oy);
    ctx.quadraticCurveTo(
      x + dx * len * 0.5 + nx * len * curve * 0.22 + ox,
      y + dy * len * 0.5 + ny * len * curve * 0.22 + oy,
      x + dx * len + ox, y + dy * len + oy
    );
    ctx.stroke();
  };

  ctx.lineCap = 'round';
  ctx.lineWidth = wide;
  ctx.strokeStyle = css([color[0], color[1], Math.max(2, color[2] - 13 * relief)], alpha * 0.7);
  lay(-lx, -ly);
  ctx.strokeStyle = css(color, alpha);
  lay(0, 0);
  ctx.lineWidth = wide * 0.42;
  ctx.strokeStyle = css([color[0], color[1] * 0.82, Math.min(97, color[2] + 15 * relief)], alpha * 0.8);
  lay(lx * 0.8, ly * 0.8);
}

/* ── charcoal ────────────────────────────────────────────────── */

/**
 * A drawn line, the way charcoal actually goes down: not one clean
 * curve but a few overlapping passes of varying pressure, wobbling a
 * little where the hand hesitated. `pts` is the piece of the line to
 * draw now — the caller decides how much of it exists yet.
 */
export function charcoal(ctx, pts, color, opts = {}) {
  if (!pts || pts.length < 2) return;
  const { alpha = 0.5, width = 1.3, wobble = 1.1, passes = 2, seed = 1 } = opts;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let pass = 0; pass < passes; pass++) {
    const k = pass / Math.max(1, passes - 1);
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const q = pts[i];
      const ph = (i + seed * 7.3) * (1.1 + pass * 0.7);
      const ox = pass ? Math.sin(ph) * wobble * (0.4 + k) : 0;
      const oy = pass ? Math.cos(ph * 1.3) * wobble * (0.4 + k) : 0;
      ctx[i ? 'lineTo' : 'moveTo'](q.x + ox, q.y + oy);
    }
    ctx.strokeStyle = css(color, alpha * (pass ? 0.3 : 1));
    ctx.lineWidth = width * (pass ? 0.65 : 1);
    ctx.stroke();
  }
}

/**
 * Parallel hatching across a shape's bounds — the shading a drawing is
 * built from. Returned as segments so they can be laid down one at a
 * time; clip to the shape before drawing them.
 */
export function hatchSegs(b, ang, step, opts = {}) {
  const { rng = null, jitter = 0.35, over = 1.1, pieces = 1, weight = null } = opts;
  const r = rng || (() => 0.5);
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const diag = Math.hypot(b.w, b.h) * over;
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const nx = -dy, ny = dx;
  const out = [];
  for (let d = -diag / 2; d <= diag / 2; d += step) {
    const j = (r() - 0.5) * step * jitter;
    const mx = cx + nx * (d + j), my = cy + ny * (d + j);
    const at = (u) => ({ x: mx + dx * (u - 0.5) * diag, y: my + dy * (u - 0.5) * diag });
    for (let i = 0; i < pieces; i++) {
      // each line breaks into strokes the length of a hand's movement
      const span = 1 / pieces;
      const u0 = i * span + r() * span * 0.22;
      const u1 = Math.min(1, u0 + span * (0.5 + r() * 0.45));
      const a = at(u0), c = at(u1);
      if (weight && weight((a.x + c.x) / 2, (a.y + c.y) / 2) < r()) continue;
      out.push({ a, b: c, k: r() });
    }
  }
  return out;
}

/** The straight-line form of a hatch segment, ready for `charcoal`. */
export const segPts = (s, n = 5) => {
  const out = [];
  for (let i = 0; i <= n; i++) out.push({ x: lerpN(s.a.x, s.b.x, i / n), y: lerpN(s.a.y, s.b.y, i / n) });
  return out;
};
const lerpN = (a, b, t) => a + (b - a) * t;

/* ── a loaded brush ──────────────────────────────────────────── */

/**
 * One mark of a brush carrying oil paint, built the way the real thing
 * behaves rather than as a line with a highlight down the middle.
 *
 * A loaded flat brush lands blunt, drags at close to full width while
 * the paint lasts, and thins out at the end. The bristles comb the paint
 * into streaks along the direction of travel. Where the brush pushes the
 * paint aside a ridge stands up along the edges, so the light catches one
 * edge and the other throws a shadow — the light is never a line down the
 * centre of the stroke, which is what makes a rendered stroke look like a
 * plastic tube.
 *
 * `len` is how far the brush travelled, `wide` the width of the ferrule.
 */
export function oil(ctx, x, y, len, ang, wide, color, opts = {}) {
  const {
    alpha = 1, curve = 0.3, light = -2.35, bristle = 3,
    tail = 0.55, relief = 1, k = 0.5, body = 1
  } = opts;

  const dx = Math.cos(ang), dy = Math.sin(ang);
  const nx = -dy, ny = dx;
  const bow = len * curve * 0.17;
  const N = 7;

  const at = (t) => {
    const s = Math.sin(t * Math.PI);
    return { x: x + dx * len * t + nx * bow * s, y: y + dy * len * t + ny * bow * s };
  };
  // blunt where it lands, full while the paint lasts, dragging out at the end
  const half = (t) =>
    wide * 0.5 * body * (0.58 + 0.42 * Math.sin(Math.PI * Math.min(1, t * 2.6))) * (1 - Math.pow(t, 2.6) * tail);

  const L = [], R = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, p = at(t), h = half(t);
    L.push({ x: p.x + nx * h, y: p.y + ny * h });
    R.push({ x: p.x - nx * h, y: p.y - ny * h });
  }

  // the body of paint
  ctx.beginPath();
  ctx.moveTo(L[0].x, L[0].y);
  for (let i = 1; i <= N; i++) ctx.lineTo(L[i].x, L[i].y);
  for (let i = N; i >= 0; i--) ctx.lineTo(R[i].x, R[i].y);
  ctx.closePath();
  ctx.fillStyle = css(color, alpha);
  ctx.fill();

  // the comb of the bristles, along the travel
  if (bristle > 0 && wide > 1.2) {
    ctx.lineCap = 'butt';
    for (let i = 0; i < bristle; i++) {
      const u = (i + 0.5) / bristle - 0.5;
      const shade = ((i * 37 + k * 91) % 1) - 0.5;
      ctx.beginPath();
      for (let j = 0; j <= N; j++) {
        const t = j / N, p = at(t), h = half(t) * u * 1.5;
        const px = p.x + nx * h, py = p.y + ny * h;
        ctx[j ? 'lineTo' : 'moveTo'](px, py);
      }
      ctx.strokeStyle = css([color[0], color[1], color[2] + shade * 9 * relief], alpha * 0.55);
      ctx.lineWidth = Math.max(0.5, wide / bristle * 0.55);
      ctx.stroke();
    }
  }

  // the ridge the brush pushes up, lit on one side and shadowed on the other
  const lit = Math.cos(light) * nx + Math.sin(light) * ny > 0 ? 1 : -1;
  const edge = (side, col, a, wk) => {
    ctx.beginPath();
    for (let j = 0; j <= N; j++) {
      const t = j / N, p = at(t), h = half(t) * side * 0.86;
      ctx[j ? 'lineTo' : 'moveTo'](p.x + nx * h, p.y + ny * h);
    }
    ctx.strokeStyle = css(col, a);
    ctx.lineWidth = Math.max(0.4, wide * wk);
    ctx.lineCap = 'round';
    ctx.stroke();
  };
  edge(lit, [color[0], color[1] * 0.78, Math.min(96, color[2] + 13 * relief)], alpha * 0.85, 0.15);
  edge(-lit, [color[0], Math.min(100, color[1] * 1.06), Math.max(2, color[2] - 11 * relief)], alpha * 0.7, 0.17);
}
