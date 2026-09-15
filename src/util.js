// ─────────────────────────────────────────────────────────────
// Shared helpers: deterministic randomness, math, colour.
// Every design draws from a seed derived from taskSessionId, so a
// reload reproduces the exact same world, not a new arrangement.
// ─────────────────────────────────────────────────────────────

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, fully deterministic. */
export function makeRng(seed) {
  let a = seed >>> 0;
  const rng = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (lo, hi) => lo + rng() * (hi - lo);
  rng.int = (lo, hi) => Math.floor(rng.range(lo, hi + 1));
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.sign = () => (rng() < 0.5 ? -1 : 1);
  return rng;
}

export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, v) => (b === a ? 0 : clamp((v - a) / (b - a)));
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const TAU = Math.PI * 2;

/** Ring distance helper — how close v sits to centre c within half-width w. */
export const band = (v, c, w) => clamp(1 - Math.abs(v - c) / w);

/** hsl string builder; l and a accept 0..100 / 0..1 */
export const hsl = (h, s, l, a = 1) =>
  a >= 1 ? `hsl(${h} ${s}% ${l}%)` : `hsl(${h} ${s}% ${l}% / ${a})`;

/** Mix two [h,s,l] triples. */
export function mixHsl(a, b, t) {
  let dh = ((b[0] - a[0] + 540) % 360) - 180;
  return [(a[0] + dh * t + 360) % 360, lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/** Catmull–Rom through points -> smooth polyline sampler. */
export function makeSpline(points, samples = 600) {
  const pts = points.length < 4
    ? [points[0], ...points, points[points.length - 1]]
    : points;
  const out = [];
  const seg = pts.length - 3;
  for (let i = 0; i <= samples; i++) {
    const u = (i / samples) * seg;
    const k = Math.min(Math.floor(u), seg - 1);
    const t = u - k;
    const [p0, p1, p2, p3] = [pts[k], pts[k + 1], pts[k + 2], pts[k + 3]];
    const t2 = t * t, t3 = t2 * t;
    out.push({
      x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
    });
  }
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)];
    out[i].a = Math.atan2(b.y - a.y, b.x - a.x);
  }
  return out;
}

/** Sample a polyline at 0..1 of its length. */
export function atT(path, t) {
  const i = clamp(t) * (path.length - 1);
  const k = Math.floor(i), f = i - k;
  const a = path[k], b = path[Math.min(path.length - 1, k + 1)];
  return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), a: a.a ?? 0 };
}

/** Very slow ambient oscillation — “breathing”, never flicker. */
export const breathe = (time, period, phase = 0) =>
  Math.sin((time / period + phase) * TAU);

/** Palette colour: triple [h,s,l] -> css, with optional lightness/sat deltas. */
export function css(c, a = 1, dl = 0, ds = 0) {
  const h = c[0], s = clamp(c[1] + ds, 0, 100), l = clamp(c[2] + dl, 0, 100);
  return a >= 1 ? `hsl(${h} ${s}% ${l}%)` : `hsl(${h} ${s}% ${l}% / ${a})`;
}

/** Soft radial wash — used for every “light head” in the app. */
export function glow(ctx, x, y, r, color, alpha = 0.5) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
  g.addColorStop(0, css(color, alpha, 12));
  g.addColorStop(0.45, css(color, alpha * 0.4, 4));
  g.addColorStop(1, css(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

/** Position of an element along the sweep, 0 = first revealed, 1 = last. */
export function sweepCoord(kind, x, y, w, h) {
  switch (kind) {
    case 'band':     return y / h;
    case 'columns':  return x / w;
    case 'diagonal': return (x / w * 0.62 + y / h * 0.38);
    case 'radial':   return Math.hypot(x - w / 2, y - h * 0.52) / (Math.hypot(w, h) * 0.52);
    case 'wedge': {
      const a = Math.atan2(y - h * 0.5, x - w * 0.5);
      return ((a + Math.PI) / (Math.PI * 2));
    }
    case 'rise':     return 1 - y / h;
    default:         return x / w;
  }
}
