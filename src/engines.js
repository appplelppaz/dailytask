// ─────────────────────────────────────────────────────────────
// Ten world engines. A design is a configuration of one of these:
// its substrate, its layout, what the moving head looks like, what
// it leaves behind, and its palette. Nothing here draws a bar, a
// ring, a gauge or a number — progress is legible as landscape.
//
// Every engine exposes:
//   init(env)      -> seeded geometry, stable across reloads
//   draw(env)      -> paint elapsed / current / remaining
//   anchors(env)   -> where the completion gesture lives
// ─────────────────────────────────────────────────────────────

import { clamp, lerp, css, glow, TAU, sweepCoord, smooth, easeOut, breathe, makeSpline, atT } from './util.js';
import { painting } from './painting.js';
import { chronicle } from './chronicle.js';
import { bar } from './bar.js';

// ── shared helpers ───────────────────────────────────────────

/** Amount an element at sweep-coordinate u is revealed by progress p. */
const reveal = (u, p, soft = 0.09) => clamp((p - u) / soft + 0.5);
/** How close an element sits to the moving head. */
const headNear = (u, p, w = 0.055) => clamp(1 - Math.abs(u - p) / w);

function veilGradient(ctx, env, kind) {
  const { w, h, p, pal } = env;
  let g;
  if (kind === 'columns' || kind === 'diagonal') g = ctx.createLinearGradient(0, 0, w, kind === 'diagonal' ? h : 0);
  else if (kind === 'band') g = ctx.createLinearGradient(0, 0, 0, h);
  else if (kind === 'rise') g = ctx.createLinearGradient(0, h, 0, 0);
  else return null;
  const f = clamp(p);
  g.addColorStop(0, css(pal[0], 0));
  g.addColorStop(Math.max(0, f - 0.04), css(pal[0], 0));
  g.addColorStop(Math.min(1, f + 0.10), css(pal[0], 0.62));
  g.addColorStop(1, css(pal[0], 0.86));
  return g;
}

function paintVeil(ctx, env) {
  const kind = env.prm.sweep || 'columns';
  const { w, h, p, pal } = env;
  if (kind === 'radial') {
    const r = Math.hypot(w, h) * 0.52;
    const g = ctx.createRadialGradient(w / 2, h * 0.52, r * clamp(p) * 0.92, w / 2, h * 0.52, r * clamp(p) + r * 0.34);
    g.addColorStop(0, css(pal[0], 0));
    g.addColorStop(1, css(pal[0], 0.84));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    return;
  }
  const g = veilGradient(ctx, env, kind);
  if (g) { ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
}

/** Positions for a layout. Deterministic. */
function layout(kind, n, w, h, rng) {
  const out = [];
  if (kind === 'grid' || kind === 'tiles') {
    const cols = Math.max(4, Math.round(Math.sqrt(n * (w / h))));
    const rows = Math.max(3, Math.ceil(n / cols));
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      out.push({ x: ((i + 0.5) / cols) * w, y: ((j + 0.5) / rows) * h, i, j, cols, rows,
                 cw: w / cols, ch: h / rows, k: rng() });
    }
  } else if (kind === 'rows') {
    const rows = Math.max(5, Math.round(n / 9));
    const per = Math.ceil(n / rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < per; i++) {
      const jitter = (rng() - 0.5) * (w / per) * 0.5;
      out.push({ x: ((i + 0.5) / per) * w + jitter, y: ((j + 0.6) / rows) * h, i, j, cols: per, rows,
                 cw: w / per, ch: h / rows, k: rng() });
    }
  } else if (kind === 'ring') {
    const rings = Math.max(2, Math.round(Math.sqrt(n / 5)));
    let idx = 0;
    for (let r = 0; r < rings; r++) {
      const cnt = Math.round((n / rings) * (0.5 + r / rings));
      for (let i = 0; i < cnt; i++, idx++) {
        const a = (i / cnt) * TAU + r * 0.4;
        const rad = (0.16 + (r / rings) * 0.44) * Math.min(w, h);
        out.push({ x: w / 2 + Math.cos(a) * rad, y: h * 0.52 + Math.sin(a) * rad * 0.82, i, j: r, a, rad, k: rng(),
                   cw: Math.min(w, h) / (rings * 3), ch: Math.min(w, h) / (rings * 3) });
      }
    }
  } else if (kind === 'columns') {
    for (let i = 0; i < n; i++) {
      out.push({ x: ((i + 0.5) / n) * w, y: h * 0.5, i, j: 0, cols: n, rows: 1, cw: w / n, ch: h, k: rng() });
    }
  } else {                                      // scatter, poisson-ish
    for (let i = 0; i < n; i++) {
      let best = null, bd = -1;
      for (let a = 0; a < 6; a++) {
        const c = { x: rng() * w, y: h * (0.08 + rng() * 0.84) };
        let d = Infinity;
        for (const o of out) d = Math.min(d, (o.x - c.x) ** 2 + (o.y - c.y) ** 2);
        if (d > bd) { bd = d; best = c; }
      }
      out.push({ ...best, i, j: 0, k: rng(), cw: w / 12, ch: h / 12 });
    }
  }
  return out;
}

// ═════════════════════════════════════════════════════════════
// 1. FOG — a landscape under a veil. The veil retreats; what it
//    passes keeps its detail. Everything ahead stays undefined.
// ═════════════════════════════════════════════════════════════
const fog = {
  init(env) {
    const { rng, w, h, prm } = env;
    const items = layout(prm.layout || 'scatter', prm.density || 90, w, h, rng);
    for (const it of items) {
      it.u = sweepCoord(prm.sweep || 'columns', it.x, it.y, w, h);
      it.s = 0.55 + rng() * 0.9;
      it.rot = (rng() - 0.5) * 1.4;
      it.hue = (rng() - 0.5) * 22;
      it.ph = rng() * TAU;
      it.sub = rng();
    }
    items.sort((a, b) => a.y - b.y);
    return { items, ridges: buildRidges(rng, w, h, prm) };
  },

  draw(env) {
    const { ctx, w, h, p, pal, prm, st, time, reduced } = env;
    ctx.fillStyle = css(pal[0]); ctx.fillRect(0, 0, w, h);

    // ground tone, warmer where the veil has already passed
    const gg = ctx.createLinearGradient(0, 0, prm.sweep === 'band' ? 0 : w, prm.sweep === 'band' ? h : 0);
    gg.addColorStop(0, css(pal[1], 0.55));
    gg.addColorStop(1, css(pal[0], 0.2));
    ctx.fillStyle = gg; ctx.fillRect(0, 0, w, h);

    if (st.ridges) drawRidges(ctx, st.ridges, env);

    for (const it of st.items) {
      const r = reveal(it.u, p, prm.soft || 0.1);
      const near = headNear(it.u, p, prm.headWidth || 0.06);
      if (r < 0.02 && near < 0.02) { drawGhost(ctx, it, env); continue; }
      drawSubstrate(ctx, it, r, near, env);
    }

    paintVeil(ctx, env);

    // the head: the only bright thing, and it moves
    const hp = headPoint(env);
    const amb = reduced ? 1 : 1 + breathe(time, 7, hp.x * 0.001) * 0.08;
    glow(ctx, hp.x, hp.y, Math.min(w, h) * (prm.headSize || 0.3) * amb, pal[4], 0.42);
    glow(ctx, hp.x, hp.y, Math.min(w, h) * 0.07 * amb, pal[4], 0.6);
    finish(ctx, env);
  },

  anchors(env) {
    const hp = headPoint(env);
    const { w, h } = env;
    return {
      head: hp,
      rest: { x: lerp(hp.x, w * 0.5, 0.55), y: lerp(hp.y, h * 0.62, 0.55) },
      path: arcPath(hp, { x: w * 0.5, y: h * 0.6 }, 7, env)
    };
  }
};

function headPoint(env) {
  const { w, h, p, prm, time, reduced } = env;
  const drift = reduced ? 0 : breathe(time, 23) * 0.02;
  switch (prm.sweep) {
    case 'band':     return { x: w * (0.5 + drift), y: h * clamp(p, 0.04, 0.96) };
    case 'rise':     return { x: w * (0.5 + drift), y: h * (1 - clamp(p, 0.04, 0.96)) };
    case 'diagonal': return { x: w * clamp(p, 0.05, 0.95), y: h * (0.18 + clamp(p) * 0.66) };
    case 'radial': {
      const a = p * TAU * 0.6 - 1.2;
      const r = Math.hypot(w, h) * 0.5 * clamp(p);
      return { x: w / 2 + Math.cos(a) * r * 0.75, y: h * 0.52 + Math.sin(a) * r * 0.6 };
    }
    default:         return { x: w * clamp(p, 0.04, 0.96), y: h * (0.5 + (reduced ? 0 : breathe(time, 31) * 0.05)) };
  }
}

function drawGhost(ctx, it, env) {
  const { ctx: _c, pal } = env;
  ctx.fillStyle = css(pal[1], 0.12);
  ctx.beginPath(); ctx.arc(it.x, it.y, 5 * it.s, 0, TAU); ctx.fill();
}

function buildRidges(rng, w, h, prm) {
  if (!prm.ridges) return null;
  const lines = [];
  for (let i = 0; i < prm.ridges; i++) {
    const base = h * (0.18 + (i / prm.ridges) * 0.7);
    const pts = [];
    for (let k = 0; k <= 9; k++) {
      pts.push({ x: (k / 9) * w, y: base + Math.sin(k * 1.3 + i * 2.1) * h * 0.06 * (0.4 + rng() * 0.9) });
    }
    lines.push({ path: makeSpline(pts, 160), u0: i / prm.ridges });
  }
  return lines;
}

function drawRidges(ctx, ridges, env) {
  const { pal, p, w } = env;
  ridges.forEach((r, i) => {
    ctx.beginPath();
    r.path.forEach((pt, k) => (k ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
    const vis = clamp((p - r.u0 * 0.25) * 2);
    ctx.strokeStyle = css(pal[2], 0.1 + vis * 0.24, vis * 8);
    ctx.lineWidth = 1 + vis;
    ctx.stroke();
  });
}

/** Vignette and a faint grain. Called last by every engine. */
function finish(ctx, env, strength = 1) {
  const { w, h, pal } = env;
  const g = ctx.createRadialGradient(w * 0.5, h * 0.46, Math.min(w, h) * 0.26, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.62);
  g.addColorStop(0, css(pal[0], 0));
  g.addColorStop(1, css(pal[0], 0.55 * strength));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  if (!grainPattern) grainPattern = buildGrain(ctx);
  if (grainPattern) {
    ctx.save();
    ctx.globalAlpha = 0.05 * strength;
    ctx.fillStyle = grainPattern;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

let grainPattern = null;
function buildGrain(ctx) {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d');
    const img = g.createImageData(96, 96);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 110;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return ctx.createPattern(c, 'repeat');
  } catch { return null; }
}

// substrate painters — the actual “what is this place”
function drawSubstrate(ctx, it, r, near, env) {
  const { pal, prm, time, reduced } = env;
  const kind = prm.substrate || 'contour';
  const sway = reduced ? 0 : breathe(time, 9 + it.k * 6, it.ph) * (prm.sway ?? 1);
  const size = (prm.scale || 1) * it.s;
  const lit = Math.min(1, r + near * 0.8);
  const col = [pal[2][0] + it.hue, pal[2][1], pal[2][2] + lit * 16];
  const acc = pal[3];

  ctx.save();
  ctx.translate(it.x, it.y);

  switch (kind) {
    case 'contour': {
      ctx.rotate(it.rot * 0.3);
      for (let i = 0; i < 3; i++) {
        const rr = size * (7 + i * 6);
        ctx.strokeStyle = css(col, 0.1 + r * (0.42 - i * 0.1));
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (let k = 0; k <= 22; k++) {
          const a = (k / 22) * TAU;
          const wob = 1 + Math.sin(a * 3 + it.ph) * 0.18 + Math.cos(a * 5) * 0.07;
          const px = Math.cos(a) * rr * wob, py = Math.sin(a) * rr * wob * 0.66;
          k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath(); ctx.stroke();
      }
      break;
    }
    case 'grove': {
      const th = size * 26 * (0.6 + it.k * 0.7);
      ctx.strokeStyle = css(pal[1], 0.2 + r * 0.4, -6);
      ctx.lineWidth = size * 2.4;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sway * 3, -th); ctx.stroke();
      ctx.fillStyle = css(col, 0.14 + r * 0.5);
      ctx.beginPath(); ctx.ellipse(sway * 4, -th, size * 13, size * 10, it.rot, 0, TAU); ctx.fill();
      if (r > 0.3) {                            // the shadow that the light has re-angled
        ctx.fillStyle = css(pal[0], 0.28 * r);
        ctx.beginPath(); ctx.ellipse(size * 10 * (1 - r) + 6, size * 3, size * 15, size * 4, 0, 0, TAU); ctx.fill();
      }
      break;
    }
    case 'city': {
      const bw = size * 17, bh = size * (26 + it.k * 60);
      ctx.fillStyle = css(pal[1], 0.3 + r * 0.42, -4);
      ctx.fillRect(-bw / 2, -bh, bw, bh);
      const cols = Math.max(1, Math.round(bw / 7));
      for (let i = 0; i < cols; i++) for (let j = 0; j < Math.round(bh / 12); j++) {
        if (((i * 7 + j * 13 + it.i) % 5) > (r > 0.4 ? 1 : 3)) continue;
        ctx.fillStyle = css(acc, 0.12 + r * 0.7, 6);
        ctx.fillRect(-bw / 2 + 2 + i * 6.4, -bh + 5 + j * 11, 2.6, 4);
      }
      if (r > 0.35) {                            // wet reflection under the rain front
        const g = ctx.createLinearGradient(0, 0, 0, size * 30);
        g.addColorStop(0, css(acc, 0.28 * r)); g.addColorStop(1, css(acc, 0));
        ctx.fillStyle = g; ctx.fillRect(-bw / 2, 0, bw, size * 30);
      }
      break;
    }
    case 'canopy': {
      ctx.rotate(it.rot + sway * 0.06);
      ctx.fillStyle = css(col, 0.18 + r * 0.55, r * 10);
      ctx.beginPath();
      ctx.moveTo(0, -size * 12);
      ctx.bezierCurveTo(size * 9, -size * 5, size * 8, size * 6, 0, size * 12);
      ctx.bezierCurveTo(-size * 8, size * 6, -size * 9, -size * 5, 0, -size * 12);
      ctx.fill();
      if (r > 0.4) {
        ctx.strokeStyle = css(acc, 0.35 * r, 14); ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(0, -size * 11); ctx.lineTo(0, size * 11); ctx.stroke();
      }
      break;
    }
    case 'ice': {
      ctx.rotate(it.rot);
      const n = 5 + Math.floor(it.k * 3);
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU, rr = size * (9 + Math.sin(k * 2.3 + it.ph) * 4);
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = css(col, 0.08 + r * 0.26, r * 12);
      ctx.fill();
      ctx.strokeStyle = css(acc, 0.12 + r * 0.5, 10); ctx.lineWidth = 0.7; ctx.stroke();
      break;
    }
    case 'tiles': {
      const cw = (it.cw || 40) * 0.88, ch = (it.ch || 40) * 0.88;
      ctx.fillStyle = css(col, 0.2 + r * 0.5, lit * 8);
      ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
      ctx.strokeStyle = css(pal[0], 0.5); ctx.lineWidth = 1.2;
      ctx.strokeRect(-cw / 2, -ch / 2, cw, ch);
      if (near > 0.15) { ctx.fillStyle = css(acc, near * 0.45, 16); ctx.fillRect(-cw / 2, -ch / 2, cw, ch); }
      break;
    }
    case 'shelves': {
      const bw = (it.cw || 40) * 0.9, bh = size * (14 + it.k * 26);
      ctx.fillStyle = css(col, 0.25 + r * 0.45, (it.k - 0.5) * 8);
      ctx.fillRect(-bw / 2, -bh, bw * 0.34, bh);
      ctx.fillStyle = css(pal[1], 0.3 + r * 0.4, (it.sub - 0.5) * 10);
      ctx.fillRect(-bw / 2 + bw * 0.38, -bh * 0.86, bw * 0.28, bh * 0.86);
      ctx.fillStyle = css(acc, 0.1 + r * 0.4, 4);
      ctx.fillRect(-bw / 2 + bw * 0.72, -bh * 0.7, bw * 0.24, bh * 0.7);
      break;
    }
    case 'hall': {
      const cw = size * 14, ch = size * (60 + it.k * 40);
      ctx.fillStyle = css(pal[1], 0.28 + r * 0.32, -4);
      ctx.fillRect(-cw / 2, -ch, cw, ch);
      ctx.fillStyle = css(acc, 0.06 + r * 0.42, 8);
      ctx.fillRect(-cw / 2, -ch * 0.2, cw, ch * 0.2);
      break;
    }
    case 'cavern': {
      ctx.rotate(it.rot * 0.5);
      ctx.strokeStyle = css(col, 0.14 + r * 0.4); ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let k = 0; k <= 14; k++) {
        const a = Math.PI + (k / 14) * Math.PI;
        const rr = size * (12 + Math.sin(k * 1.7 + it.ph) * 5);
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr * 0.6;
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
      if (r > 0.3) { ctx.fillStyle = css(acc, 0.22 * r, 12); ctx.beginPath(); ctx.arc(0, 0, size * 3, 0, TAU); ctx.fill(); }
      break;
    }
    case 'reeds': {
      const len = size * (26 + it.k * 40);
      ctx.strokeStyle = css(col, 0.2 + r * 0.45); ctx.lineWidth = size * 1.2;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(sway * 4, -len * 0.6, sway * 9, -len); ctx.stroke();
      if (r > 0.35) {
        ctx.strokeStyle = css(acc, 0.3 * r, 12); ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(-size * 8, size * 2); ctx.lineTo(size * 8, size * 2); ctx.stroke();
      }
      break;
    }
    case 'panes': {
      const cw = (it.cw || 50) * 0.82, ch = (it.ch || 50) * 0.82;
      ctx.fillStyle = css(col, 0.08 + r * 0.34, lit * 14, r * 20);
      ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
      ctx.strokeStyle = css(pal[1], 0.4 + r * 0.3, 6); ctx.lineWidth = 1.6;
      ctx.strokeRect(-cw / 2, -ch / 2, cw, ch);
      break;
    }
    default: {
      ctx.fillStyle = css(col, 0.15 + r * 0.5);
      ctx.beginPath(); ctx.arc(0, 0, size * 7, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}

function arcPath(from, to, n, env) {
  const pts = [];
  const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
  const dx = to.x - from.x, dy = to.y - from.y;
  const cx = mx - dy * 0.28, cy = my + dx * 0.28;
  for (let i = 0; i <= n; i++) {
    const t = i / n, it = 1 - t;
    pts.push({ x: it * it * from.x + 2 * it * t * cx + t * t * to.x,
               y: it * it * from.y + 2 * it * t * cy + t * t * to.y });
  }
  return pts;
}

// ═════════════════════════════════════════════════════════════
// 2. TRAIL — one traveller on a long route. Behind it the world is
//    marked; ahead it is only suggested.
// ═════════════════════════════════════════════════════════════
const trail = {
  init(env) {
    const { rng, w, h, prm } = env;
    const knots = prm.knots || 7;
    const pts = [];
    for (let i = 0; i <= knots; i++) {
      const t = i / knots;
      pts.push({
        x: w * (0.1 + t * 0.8) + (rng() - 0.5) * w * 0.12,
        y: h * (0.2 + rng() * 0.6)
      });
    }
    const path = makeSpline(pts, 700);
    const marks = [];
    for (let i = 0; i < (prm.marks || 46); i++) {
      const t = (i + 0.5) / (prm.marks || 46);
      const at = atT(path, t);
      marks.push({ t, x: at.x, y: at.y, a: at.a, s: 0.6 + rng() * 0.9, k: rng() });
    }
    const field = layout(prm.fieldLayout || 'scatter', Math.round((prm.field || 40) * 2.4), w, h, rng)
      .map((o) => ({ ...o, u: o.x / w, s: 0.5 + o.k }));
    // ground: a few slow bands so the route has something to cross
    const bands = [];
    for (let i = 0; i < 5; i++) {
      const pts = [];
      const y0 = h * (0.16 + i * 0.18);
      for (let k = 0; k <= 6; k++) pts.push({ x: (k / 6) * w, y: y0 + Math.sin(k * 1.4 + i * 2.3) * h * (0.03 + rng() * 0.05) });
      bands.push({ path: makeSpline(pts, 120), k: rng(), i });
    }
    return { path, marks, field, bands };
  },

  draw(env) {
    const { ctx, w, h, p, pal, prm, st, time, reduced } = env;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, css(pal[0])); g.addColorStop(1, css(pal[1], 0.9, -4));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    // ground bands: the terrain the route runs over
    for (const bnd of st.bands) {
      ctx.beginPath();
      bnd.path.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
      ctx.fillStyle = css(pal[1], 0.4 + bnd.i * 0.09, -5 + bnd.i * 3.4);
      ctx.fill();
      ctx.strokeStyle = css(pal[2], 0.16 + clamp(p) * 0.16, 6);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      bnd.path.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.stroke();
    }

    // the country already crossed keeps its colour
    const behind = ctx.createLinearGradient(0, 0, w * clamp(p, 0.05, 1), 0);
    behind.addColorStop(0, css(pal[2], 0.14));
    behind.addColorStop(1, css(pal[2], 0.02));
    ctx.fillStyle = behind; ctx.fillRect(0, 0, w * clamp(p), h);

    // static scenery, dim ahead of the traveller
    for (const o of st.field) {
      const r = clamp((p - o.u) * 3 + 0.35);
      drawSceneryDot(ctx, o, r, env);
    }

    // the route: drawn only where it has been travelled
    ctx.lineCap = 'round';
    ctx.beginPath();
    const lim = Math.floor(clamp(p) * (st.path.length - 1));
    for (let i = 0; i <= lim; i++) {
      const pt = st.path[i];
      i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y);
    }
    const rg = ctx.createLinearGradient(0, 0, Math.max(1, w * clamp(p)), 0);
    rg.addColorStop(0, css(pal[3], 0.22, 0));
    rg.addColorStop(1, css(pal[3], 0.6, 8));
    ctx.strokeStyle = rg; ctx.lineWidth = (prm.routeWidth || 1.6) * 1.6;
    ctx.stroke();
    ctx.strokeStyle = css(pal[4], 0.14, 14); ctx.lineWidth = (prm.routeWidth || 1.6) * 0.5;
    ctx.stroke();

    // marks left behind
    for (const m of st.marks) {
      if (m.t > p) continue;
      const age = clamp((p - m.t) / 0.4);
      drawMark(ctx, m, age, env);
    }

    // a faint promise of what is still ahead
    ctx.setLineDash([2, 10]);
    ctx.beginPath();
    for (let i = lim; i < st.path.length; i += 3) {
      const pt = st.path[i];
      i === lim ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y);
    }
    ctx.strokeStyle = css(pal[2], 0.13); ctx.lineWidth = 1; ctx.stroke();
    ctx.setLineDash([]);

    const at = atT(st.path, clamp(p, 0, 0.999));

    // everything ahead of the traveller is still under cover
    const ahead = ctx.createLinearGradient(at.x - w * 0.14, 0, w, 0);
    ahead.addColorStop(0, css(pal[0], 0));
    ahead.addColorStop(0.55, css(pal[0], 0.5));
    ahead.addColorStop(1, css(pal[0], 0.8));
    ctx.fillStyle = ahead; ctx.fillRect(Math.max(0, at.x - w * 0.14), 0, w, h);

    glow(ctx, at.x, at.y, Math.min(w, h) * (prm.headSize || 0.16), pal[4], 0.4);
    drawAgent(ctx, at, env);
    finish(ctx, env, 0.7);
  },

  anchors(env) {
    const { st, p, w, h } = env;
    const at = atT(st.path, clamp(p, 0, 0.999));
    const end = atT(st.path, 1);
    return {
      head: { x: at.x, y: at.y },
      rest: { x: lerp(end.x, w * 0.82, 0.2), y: lerp(end.y, h * 0.5, 0.2) },
      path: [0.86, 0.89, 0.92, 0.945, 0.97, 0.985, 1].map((t) => {
        const q = atT(st.path, t); return { x: q.x, y: q.y };
      })
    };
  }
};

function drawSceneryDot(ctx, o, r, env) {
  const { pal, prm, time, reduced } = env;
  const kind = prm.scenery || 'stone';
  const sway = reduced ? 0 : breathe(time, 11 + o.k * 5, o.k * 6) * 2;
  ctx.save(); ctx.translate(o.x, o.y);
  if (kind === 'stone') {
    ctx.fillStyle = css(pal[2], 0.16 + r * 0.4, -2);
    ctx.beginPath(); ctx.ellipse(0, 0, 12 * o.s, 8 * o.s, o.k * 3, 0, TAU); ctx.fill();
    ctx.strokeStyle = css(pal[2], 0.1 + r * 0.26, 14); ctx.lineWidth = 0.7; ctx.stroke();
  } else if (kind === 'reed') {
    ctx.strokeStyle = css(pal[2], 0.22 + r * 0.46, 4); ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(sway, -18 * o.s, sway * 2, -34 * o.s); ctx.stroke();
  } else if (kind === 'star') {
    glow(ctx, 0, 0, 9 * o.s, pal[4], 0.1 + r * 0.16);
    ctx.fillStyle = css(pal[4], 0.3 + r * 0.6, 14);
    ctx.beginPath(); ctx.arc(0, 0, 1.6 * o.s, 0, TAU); ctx.fill();
  } else if (kind === 'shelf') {
    ctx.fillStyle = css(pal[2], 0.16 + r * 0.34, -2);
    ctx.fillRect(-18 * o.s, -12 * o.s, 36 * o.s, 24 * o.s);
    ctx.strokeStyle = css(pal[1], 0.5, 8); ctx.lineWidth = 1.2; ctx.strokeRect(-18 * o.s, -12 * o.s, 36 * o.s, 24 * o.s);
    for (let i = 0; i < 4; i++) { ctx.fillStyle = css(pal[3], 0.1 + r * 0.3, (i - 2) * 4); ctx.fillRect(-15 * o.s + i * 8 * o.s, -10 * o.s, 5 * o.s, 20 * o.s); }
  } else if (kind === 'coral') {
    ctx.strokeStyle = css(pal[2], 0.2 + r * 0.5, 4); ctx.lineWidth = 2.6;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.quadraticCurveTo((i - 1) * 6 + sway, -10 * o.s, (i - 1) * 11 + sway, -20 * o.s); ctx.stroke();
    }
  } else {                                   // 'bloom'
    ctx.fillStyle = css(pal[2], 0.2 + r * 0.46, r * 10);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + o.k * 2;
      ctx.beginPath(); ctx.ellipse(Math.cos(a) * 6 * o.s, Math.sin(a) * 6 * o.s, 5 * o.s, 3 * o.s, a, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = css(pal[3], 0.2 + r * 0.5, 12);
    ctx.beginPath(); ctx.arc(0, 0, 2 * o.s, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawMark(ctx, m, age, env) {
  const { pal, prm, time, reduced } = env;
  const kind = prm.mark || 'dot';
  const fade = (prm.markFade === false ? 1 : 0.55 + 0.45 * (1 - age * 0.4)) * 1.5;
  ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.a);
  const a = fade;
  switch (kind) {
    case 'ripple':
      ctx.strokeStyle = css(pal[3], 0.32 * a, 4); ctx.lineWidth = 0.9;
      for (let i = 1; i <= 2; i++) { ctx.beginPath(); ctx.arc(0, 0, 4 + i * 5 * m.s * (0.6 + age), 0, TAU); ctx.stroke(); }
      break;
    case 'dash':
      ctx.strokeStyle = css(pal[3], 0.4 * a, 6); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-5 * m.s, 0); ctx.lineTo(5 * m.s, 0); ctx.stroke();
      break;
    case 'thread':
      ctx.strokeStyle = css(pal[4], 0.3 * a, 8); ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(0, -7 * m.s); ctx.quadraticCurveTo(4, 0, 0, 7 * m.s); ctx.stroke();
      break;
    case 'track':
      ctx.fillStyle = css(pal[2], 0.34 * a, 6);
      for (const s of [-1, 1]) ctx.fillRect(-2, s * 4 * m.s, 4, 1.6);
      break;
    case 'wake': {
      const g = ctx.createLinearGradient(-14 * m.s, 0, 6, 0);
      g.addColorStop(0, css(pal[4], 0)); g.addColorStop(1, css(pal[4], 0.3 * a, 8));
      ctx.strokeStyle = g; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(-14 * m.s, -3); ctx.lineTo(4, 0); ctx.moveTo(-14 * m.s, 3); ctx.lineTo(4, 0); ctx.stroke();
      break;
    }
    case 'stitch':
      ctx.strokeStyle = css(pal[4], 0.45 * a, 6); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-3, -3 * m.s); ctx.lineTo(3, 3 * m.s); ctx.stroke();
      break;
    case 'shimmer': {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 12 * m.s);
      g.addColorStop(0, `hsl(${(pal[4][0] + m.k * 120) % 360} 70% 66% / ${0.3 * a})`);
      g.addColorStop(1, 'hsl(0 0% 0% / 0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 12 * m.s, 0, TAU); ctx.fill();
      break;
    }
    default:
      ctx.fillStyle = css(pal[3], 0.4 * a, 6);
      ctx.beginPath(); ctx.arc(0, 0, 2.2 * m.s, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawAgent(ctx, at, env) {
  const { pal, prm, time, reduced } = env;
  const kind = prm.agent || 'dot';
  const bob = reduced ? 0 : breathe(time, 3.6) * 1.6;
  ctx.save(); ctx.translate(at.x, at.y + bob); ctx.rotate(at.a);
  ctx.fillStyle = css(pal[4], 0.95, 16);
  switch (kind) {
    case 'boat':
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.quadraticCurveTo(0, 5, 8, 0); ctx.quadraticCurveTo(0, -3, -7, 0); ctx.fill();
      break;
    case 'bird':
      ctx.strokeStyle = css(pal[4], 0.9, 14); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-6, -3); ctx.quadraticCurveTo(0, 2, 6, -3); ctx.stroke();
      break;
    case 'fish':
      ctx.beginPath(); ctx.ellipse(0, 0, 8, 3.4, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-12, -3.4); ctx.lineTo(-12, 3.4); ctx.fill();
      break;
    case 'rover':
      ctx.fillRect(-6, -4, 12, 7);
      ctx.fillStyle = css(pal[4], 0.5, 20); ctx.fillRect(6, -2, 5, 3);
      break;
    case 'snail':
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
      ctx.strokeStyle = css(pal[0], 0.6); ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0; k < 40; k++) { const a = k / 40 * 7, r = 0.6 + k / 40 * 4.2; k ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.stroke();
      break;
    case 'whale':
      ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.ellipse(0, 0, 22, 7, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(-30, -7); ctx.lineTo(-28, 0); ctx.lineTo(-30, 7); ctx.fill();
      ctx.globalAlpha = 1;
      break;
    case 'moth':
      ctx.globalAlpha = 0.85;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(0, s * 3, 5, 3, s * 0.5, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
      break;
    case 'shuttle':
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(0, -3); ctx.lineTo(9, 0); ctx.lineTo(0, 3); ctx.fill();
      break;
    case 'kite':
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 0); ctx.lineTo(0, 8); ctx.lineTo(-5, 0); ctx.fill();
      break;
    default:
      ctx.beginPath(); ctx.arc(0, 0, 4.2, 0, TAU); ctx.fill();
  }
  ctx.restore();
}


// ═════════════════════════════════════════════════════════════
// 3. FRONT — a field of objects that a moving front re-states:
//    tilt, sheen, length, bloom. Behind it, everything has settled
//    into its new attitude; ahead, nothing has moved yet.
// ═════════════════════════════════════════════════════════════
const front = {
  init(env) {
    const { rng, w, h, prm } = env;
    const items = layout(prm.layout || 'grid', prm.density || 90, w, h, rng);
    for (const it of items) {
      it.u = sweepCoord(prm.sweep || 'columns', it.x, it.y, w, h);
      it.k = it.k ?? rng();
      it.ph = rng() * TAU;
      it.len = 0.55 + rng() * 0.8;
      it.rot0 = (rng() - 0.5) * (prm.spread ?? 1.1);
      it.rot1 = it.rot0 + (prm.turn ?? 1.2) * (0.6 + rng() * 0.8) * (rng() < 0.5 ? -1 : 1);
      it.hue = (rng() - 0.5) * 26;
    }
    return { items };
  },

  draw(env) {
    const { ctx, w, h, p, pal, prm, st, time, reduced } = env;
    const bg = ctx.createLinearGradient(0, 0, w * 0.4, h);
    bg.addColorStop(0, css(pal[0])); bg.addColorStop(1, css(pal[1], 1, -6));
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

    for (const it of st.items) {
      const r = reveal(it.u, p, prm.soft || 0.11);
      const near = headNear(it.u, p, prm.headWidth || 0.07);
      drawFieldItem(ctx, it, r, near, env);
    }

    const hp = frontPoint(env);
    if (prm.frontLine !== false) {
      ctx.save();
      const kind = prm.sweep || 'columns';
      const g = ctx.createLinearGradient(
        kind === 'band' || kind === 'rise' ? 0 : hp.x - 70, kind === 'band' || kind === 'rise' ? hp.y - 70 : 0,
        kind === 'band' || kind === 'rise' ? 0 : hp.x + 70, kind === 'band' || kind === 'rise' ? hp.y + 70 : 0);
      g.addColorStop(0, css(pal[4], 0)); g.addColorStop(0.5, css(pal[4], 0.16, 10)); g.addColorStop(1, css(pal[4], 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    glow(ctx, hp.x, hp.y, Math.min(w, h) * (prm.headSize || 0.22), pal[4], 0.3);
    finish(ctx, env, 0.85);
  },

  anchors(env) {
    const { st, p, w, h } = env;
    const hp = frontPoint(env);
    // the last item the front has touched is the one you can act on
    let best = null, bd = Infinity;
    for (const it of st.items) {
      const d = Math.abs(it.u - clamp(p, 0, 0.995));
      if (d < bd) { bd = d; best = it; }
    }
    const head = best ? { x: best.x, y: best.y } : hp;
    return {
      head,
      rest: { x: w * 0.5, y: h * 0.55 },
      path: arcPath(head, { x: w * 0.5, y: h * 0.55 }, 7, env)
    };
  }
};

function frontPoint(env) {
  const { w, h, p, prm } = env;
  switch (prm.sweep) {
    case 'band': return { x: w * 0.5, y: h * clamp(p, 0.03, 0.97) };
    case 'rise': return { x: w * 0.5, y: h * (1 - clamp(p, 0.03, 0.97)) };
    case 'radial': { const r = Math.hypot(w, h) * 0.52 * clamp(p); return { x: w / 2 + r * 0.6, y: h * 0.52 }; }
    default: return { x: w * clamp(p, 0.03, 0.97), y: h * 0.5 };
  }
}

function drawFieldItem(ctx, it, r, near, env) {
  const { pal, prm, time, reduced } = env;
  const kind = prm.item || 'tile';
  const ease = smooth(r);
  const rot = lerp(it.rot0, it.rot1, ease);
  const amb = reduced ? 0 : breathe(time, (prm.period || 8) + it.k * 4, it.ph);
  const size = (prm.scale || 1);
  const lit = Math.min(1, r * 0.8 + near);
  const col = [pal[2][0] + it.hue, pal[2][1], pal[2][2] + lit * 14];
  ctx.save();
  ctx.translate(it.x, it.y + (reduced ? 0 : amb * (prm.bob ?? 1.2)));

  switch (kind) {
    case 'tile': {
      const cw = (it.cw || 40) * 0.86 * size, ch = (it.ch || 40) * 0.86 * size;
      ctx.rotate(rot * 0.12);
      ctx.fillStyle = css(col, 0.3 + r * 0.45, ease * 10);
      ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
      if (r > 0.25) {
        ctx.strokeStyle = css(pal[3], 0.18 + r * 0.3, 8); ctx.lineWidth = 0.8;
        ctx.strokeRect(-cw / 2 + 3, -ch / 2 + 3, cw - 6, ch - 6);
      }
      if (near > 0.1) { ctx.fillStyle = css(pal[4], near * 0.4, 18); ctx.fillRect(-cw / 2, -ch / 2, cw, ch); }
      break;
    }
    case 'fiber': {
      const len = Math.min((it.ch || 60) * 0.9, env.h * 0.3) * it.len * size;
      const lean = lerp(0.1, 1, ease) * (prm.turn ?? 1) * 14 + amb * 3 * (0.3 + r);
      ctx.strokeStyle = css(col, 0.22 + r * 0.5, ease * 8);
      ctx.lineWidth = 1.4 * size; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, len / 2);
      ctx.quadraticCurveTo(lean * 0.4, 0, lean, -len / 2); ctx.stroke();
      if (near > 0.2) { ctx.strokeStyle = css(pal[4], near * 0.5, 16); ctx.lineWidth = 2 * size; ctx.stroke(); }
      break;
    }
    case 'panel': {
      const cw = (it.cw || 50) * 0.8 * size, ch = (it.ch || 70) * 0.8 * size;
      const open = ease * (prm.turn ?? 1);
      ctx.transform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = css(col, 0.35 + r * 0.3, -ease * 6);
      ctx.beginPath();
      ctx.moveTo(-cw / 2, -ch / 2);
      ctx.lineTo(cw / 2 - open * cw * 0.5, -ch / 2 + open * ch * 0.08);
      ctx.lineTo(cw / 2 - open * cw * 0.5, ch / 2 - open * ch * 0.08);
      ctx.lineTo(-cw / 2, ch / 2);
      ctx.closePath(); ctx.fill();
      if (open > 0.15) {
        ctx.fillStyle = css(pal[4], 0.1 + open * 0.28, 10);
        ctx.fillRect(cw / 2 - open * cw * 0.5, -ch / 2 + 2, open * cw * 0.5, ch - 4);
      }
      break;
    }
    case 'cube': {
      const s2 = (it.cw || 44) * 0.42 * size;
      const flip = ease;
      ctx.rotate(rot * 0.2);
      ctx.fillStyle = css(col, 0.4 + r * 0.3, -4);
      ctx.fillRect(-s2, -s2, s2 * 2, s2 * 2);
      ctx.fillStyle = css(pal[3], 0.15 + flip * 0.5, 6);
      ctx.fillRect(-s2, -s2, s2 * 2, s2 * 2 * flip);
      ctx.strokeStyle = css(pal[0], 0.5); ctx.lineWidth = 1; ctx.strokeRect(-s2, -s2, s2 * 2, s2 * 2);
      break;
    }
    case 'bell': {
      const rr = 7 * size * (0.7 + it.k * 0.8);
      const swing = (reduced ? 0 : amb) * (0.25 + r * 0.9) * 5;
      ctx.translate(swing, 0);
      ctx.strokeStyle = css(pal[1], 0.3); ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(-swing * 0.6, -26 * size); ctx.lineTo(0, -rr); ctx.stroke();
      ctx.fillStyle = css(col, 0.3 + r * 0.45, ease * 12);
      ctx.beginPath(); ctx.moveTo(-rr, rr * 0.7); ctx.quadraticCurveTo(0, -rr * 1.5, rr, rr * 0.7); ctx.closePath(); ctx.fill();
      if (near > 0.2) { ctx.strokeStyle = css(pal[4], near * 0.6, 18); ctx.lineWidth = 1.2; ctx.stroke(); }
      break;
    }
    case 'lantern': {
      const rr = 9 * size * (0.6 + it.k);
      const pulse = 0.5 + 0.5 * Math.sin((time / (5 + it.k * 6) + it.ph) * TAU);
      const bright = lerp(0.1, 0.34 + pulse * 0.3, ease);
      glow(ctx, 0, 0, rr * 3.4, pal[4], bright * 0.6);
      ctx.fillStyle = css(pal[4], 0.3 + bright, 10);
      ctx.beginPath(); ctx.ellipse(0, 0, rr * 0.55, rr * 0.8, 0, 0, TAU); ctx.fill();
      break;
    }
    case 'pendulum': {
      const len = Math.min((it.ch || 80) * 0.7, env.h * 0.38) * it.len * size;
      const phase = (time / (3.4 + it.k * 2.2)) * TAU + it.ph;
      const sync = ease;                        // the front pulls them into phase
      const ang = Math.sin(lerp(phase, (time / 3.4) * TAU, sync)) * lerp(0.5, 0.2, sync);
      ctx.strokeStyle = css(pal[2], 0.2 + r * 0.3); ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(0, -len / 2);
      const bx = Math.sin(ang) * len, by = -len / 2 + Math.cos(ang) * len;
      ctx.lineTo(bx, by); ctx.stroke();
      ctx.fillStyle = css(col, 0.4 + r * 0.45, ease * 10);
      ctx.beginPath(); ctx.arc(bx, by, 4 * size, 0, TAU); ctx.fill();
      break;
    }
    case 'card': {
      const cw = (it.cw || 42) * 0.6 * size, ch = cw * 1.45;
      const flip = ease;
      ctx.rotate(lerp(it.rot0 * 0.3, 0, flip));
      ctx.fillStyle = css(flip > 0.5 ? pal[2] : pal[1], 0.5 + r * 0.3, flip > 0.5 ? 6 : -6);
      ctx.fillRect(-cw / 2 * Math.abs(Math.cos(flip * Math.PI)), -ch / 2, cw * Math.abs(Math.cos(flip * Math.PI)) || 1, ch);
      if (flip > 0.55) {
        ctx.strokeStyle = css(pal[3], 0.5, 6); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, cw * 0.22, it.k * 6, it.k * 6 + 4); ctx.stroke();
      }
      break;
    }
    case 'orb': {
      const rr = 6 * size * (0.6 + it.k * 0.9);
      const orbit = it.rad || 30;
      const speed = 1 / (3 + it.k * 5);
      const ang = (it.a || 0) + (reduced ? 0 : time * speed * lerp(1, 0.35, ease));
      const ox = Math.cos(ang) * orbit * 0.12, oy = Math.sin(ang) * orbit * 0.12;
      ctx.fillStyle = css(col, 0.35 + r * 0.5, ease * 14);
      ctx.beginPath(); ctx.arc(ox, oy, rr, 0, TAU); ctx.fill();
      if (r > 0.4) { ctx.strokeStyle = css(pal[3], 0.16 * r); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(0, 0, orbit * 0.12, 0, TAU); ctx.stroke(); }
      break;
    }
    case 'node': {
      const rr = 3.4 * size * (0.7 + it.k * 0.8);
      const pulse = 0.5 + 0.5 * Math.sin((time / 4 + (reduced ? 0 : it.ph * (1 - ease))) * TAU);
      ctx.fillStyle = css(col, 0.28 + r * 0.55, (0.3 + pulse * 0.7) * ease * 16);
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.fill();
      break;
    }
    case 'bowl': {
      const rr = 13 * size * (0.6 + it.k * 0.7);
      ctx.strokeStyle = css(col, 0.3 + r * 0.4, 2); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0, 0, rr, 0.15, Math.PI - 0.15); ctx.stroke();
      const rings = Math.round(1 + ease * 3);
      for (let i = 0; i < rings; i++) {
        ctx.strokeStyle = css(pal[4], (0.32 - i * 0.07) * ease, 8); ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.ellipse(0, rr * 0.12, rr * (0.3 + i * 0.22), rr * (0.1 + i * 0.07), 0, 0, TAU); ctx.stroke();
      }
      break;
    }
    case 'key': {
      const cw = (it.cw || 22) * 0.9 * size, ch = Math.min(it.ch || 70, env.h * 0.62) * 0.7 * size;
      const press = ease * 5;
      // the shadow the passing light throws, long and slanted
      if (r > 0.12) {
        const g = ctx.createLinearGradient(cw * 0.4, 0, cw * 2.6, ch * 0.7);
        g.addColorStop(0, css(pal[0], 0.55 * r));
        g.addColorStop(1, css(pal[0], 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(cw / 2 - 2, -ch / 2 + press);
        ctx.lineTo(cw / 2 - 2 + cw * 2.2, -ch / 2 + press + ch * 0.36);
        ctx.lineTo(cw / 2 - 2 + cw * 2.2, ch / 2 + press + ch * 0.36);
        ctx.lineTo(cw / 2 - 2, ch / 2 + press);
        ctx.closePath(); ctx.fill();
      }
      const kg = ctx.createLinearGradient(-cw / 2, 0, cw / 2, 0);
      kg.addColorStop(0, css(col, 0.5 + r * 0.32, -6 + ease * 6));
      kg.addColorStop(0.7, css(col, 0.42 + r * 0.4, 2 + ease * 12));
      kg.addColorStop(1, css(col, 0.5 + r * 0.3, -10));
      ctx.fillStyle = kg;
      ctx.fillRect(-cw / 2, -ch / 2 + press, cw - 2, ch);
      ctx.fillStyle = css(pal[0], 0.5);
      ctx.fillRect(cw / 2 - 2, -ch / 2 + press, 2, ch);
      if (near > 0.15) { ctx.fillStyle = css(pal[4], near * 0.3, 20); ctx.fillRect(-cw / 2, -ch / 2 + press, cw - 2, ch); }
      break;
    }
    default: {
      ctx.fillStyle = css(col, 0.3 + r * 0.45);
      ctx.beginPath(); ctx.arc(0, 0, 6 * size, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}

// ═════════════════════════════════════════════════════════════
// 4. LINES — a drawn field (contours, ripples, sand, strokes) that a
//    comb rewrites as it crosses.
// ═════════════════════════════════════════════════════════════
const lines = {
  init(env) {
    const { rng, w, h, prm } = env;
    const n = prm.density || 26;
    const rows = [];
    for (let i = 0; i < n; i++) {
      rows.push({
        i, u: i / n,
        y: h * (0.08 + (i / (n - 1)) * 0.84),
        amp0: 4 + rng() * 10, amp1: 10 + rng() * 26,
        f0: 1 + rng() * 2, f1: 2.4 + rng() * 3.4,
        ph: rng() * TAU, k: rng()
      });
    }
    return { rows };
  },

  draw(env) {
    const { ctx, w, h, p, pal, prm, st, time, reduced } = env;
    ctx.fillStyle = css(pal[0]); ctx.fillRect(0, 0, w, h);
    const grain = ctx.createLinearGradient(0, 0, w, h);
    grain.addColorStop(0, css(pal[1], 0.5)); grain.addColorStop(1, css(pal[0], 0.2));
    ctx.fillStyle = grain; ctx.fillRect(0, 0, w, h);

    const vertical = prm.axis === 'v';
    const front = clamp(p);
    ctx.lineCap = 'round';

    for (const row of st.rows) {
      ctx.beginPath();
      const steps = 74;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const along = vertical ? row.y : t;            // t runs along the sweep axis
        const passed = clamp(((vertical ? row.u : t) - front) * -14 + 0.5);
        const amp = lerp(row.amp0, row.amp1, passed);
        const f = lerp(row.f0, row.f1, passed);
        const drift = reduced ? 0 : breathe(time, 14 + row.k * 8, row.ph) * 1.6;
        let x, y;
        if (vertical) {
          x = t * w;
          y = row.y + Math.sin(t * f * 6 + row.ph + drift * 0.1) * amp;
        } else {
          x = row.y;                                   // rows are columns in this mode
          y = t * h;
          x = row.y + Math.sin(t * f * 6 + row.ph) * amp;
        }
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      const passedRow = clamp((front - (vertical ? row.u : row.u)) * 5 + 0.5);
      ctx.strokeStyle = css(pal[2], 0.12 + passedRow * 0.4, passedRow * 12);
      ctx.lineWidth = lerp(0.7, prm.weight || 1.5, passedRow);
      ctx.stroke();
    }

    // the comb itself
    const hx = vertical ? w * 0.5 : w * front;
    const hy = vertical ? h * front : h * 0.5;
    const g = vertical
      ? ctx.createLinearGradient(0, hy - 60, 0, hy + 60)
      : ctx.createLinearGradient(hx - 60, 0, hx + 60, 0);
    g.addColorStop(0, css(pal[4], 0)); g.addColorStop(0.5, css(pal[4], 0.2, 12)); g.addColorStop(1, css(pal[4], 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    glow(ctx, hx, hy, Math.min(w, h) * 0.2, pal[4], 0.26);
    finish(ctx, env, 0.8);
  },

  anchors(env) {
    const { w, h, p, prm, st } = env;
    const vertical = prm.axis === 'v';
    const hx = vertical ? w * 0.5 : w * clamp(p, 0.06, 0.94);
    const hy = vertical ? h * clamp(p, 0.06, 0.94) : h * 0.5;
    const row = st.rows[Math.min(st.rows.length - 1, Math.floor(clamp(p) * st.rows.length))];
    const cx = w * 0.5, cy = row ? row.y : h * 0.5;
    const pts = [];
    for (let i = 0; i <= 7; i++) {
      const t = i / 7, a = -Math.PI * 0.85 + t * Math.PI * 1.7;
      pts.push({ x: cx + Math.cos(a) * Math.min(w, h) * 0.17, y: cy + Math.sin(a) * Math.min(w, h) * 0.12 });
    }
    return { head: { x: hx, y: hy }, rest: { x: cx, y: cy }, path: pts };
  }
};

// ═════════════════════════════════════════════════════════════
// 5. STRAND — separate ribbons that braid, weave or fall into
//    alignment as the work goes on.
// ═════════════════════════════════════════════════════════════
const strand = {
  init(env) {
    const { rng, w, h, prm } = env;
    const n = prm.strands || 3;
    const arr = [];
    for (let i = 0; i < n; i++) {
      arr.push({
        i, off: (i - (n - 1) / 2), amp: 0.06 + rng() * 0.09, ph: rng() * TAU,
        f: 1.4 + rng() * 1.6, w: (prm.weight || 7) * (0.7 + rng() * 0.7), k: rng()
      });
    }
    return { arr };
  },

  draw(env) {
    const { ctx, w, h, p, pal, prm, st, time, reduced } = env;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, css(pal[0])); bg.addColorStop(1, css(pal[1], 1, -5));
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

    const mode = prm.mode || 'braid';
    const spanY = h * 0.66, midY = h * 0.5;
    ctx.lineCap = 'round';

    for (const s of st.arr) {
      ctx.beginPath();
      const steps = 120;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const woven = clamp((p - t) * 6 + 0.5);            // has the weave reached here?
        const drift = reduced ? 0 : breathe(time, 12 + s.k * 7, s.ph) * 0.006;
        let y;
        if (mode === 'braid') {
          const apart = lerp(0.34, 0.06, woven);
          const twist = Math.sin(t * 16 + s.i * (TAU / st.arr.length)) * lerp(0.0, 0.055, woven);
          y = midY + s.off * spanY * apart + twist * h + drift * h;
        } else if (mode === 'align') {
          const wob = Math.sin(t * s.f * 7 + s.ph) * s.amp * lerp(1, 0.14, woven);
          y = midY + s.off * spanY * lerp(0.32, 0.14, woven) + wob * h + drift * h;
        } else {                                           // weave: over/under
          const wob = Math.sin(t * 9 + s.i * 1.6) * lerp(0.02, 0.07, woven);
          y = midY + s.off * spanY * 0.24 + wob * h + drift * h;
        }
        const x = t * w;
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      const lit = clamp(p * 1.1);
      ctx.strokeStyle = css(s.i % 2 ? pal[3] : pal[2], 0.34 + lit * 0.34, lit * 8);
      ctx.lineWidth = s.w;
      ctx.stroke();
      ctx.strokeStyle = css(pal[4], 0.1 + lit * 0.14, 16);
      ctx.lineWidth = s.w * 0.3;
      ctx.stroke();
    }

    // the working point where they come together
    const hx = w * clamp(p, 0.03, 0.97);
    glow(ctx, hx, midY, Math.min(w, h) * (prm.headSize || 0.2), pal[4], 0.3);
    finish(ctx, env, 0.7);
  },

  anchors(env) {
    const { w, h, p } = env;
    return {
      head: { x: w * clamp(p, 0.06, 0.94), y: h * 0.5 },
      rest: { x: w * 0.84, y: h * 0.5 },
      path: arcPath({ x: w * clamp(p, 0.1, 0.8), y: h * 0.5 }, { x: w * 0.86, y: h * 0.5 }, 7, env)
    };
  }
};

// ═════════════════════════════════════════════════════════════
// 6. LIQUID — colour bands pulled about by a moving front:
//    marbling, ink in solvent, oil into grain, ferrofluid.
// ═════════════════════════════════════════════════════════════
const liquid = {
  init(env) {
    const { rng, w, h, prm } = env;
    const bands = [];
    const n = prm.bands || 9;
    for (let i = 0; i < n; i++) {
      bands.push({ i, y: (i + 0.5) / n, thick: (0.6 + rng() * 0.9) / n, ph: rng() * TAU, k: rng() });
    }
    const blobs = [];
    for (let i = 0; i < (prm.blobs || 0); i++) {
      blobs.push({ x: rng(), y: rng(), r: 0.05 + rng() * 0.12, k: rng() });
    }
    return { bands, blobs };
  },

  draw(env) {
    const { ctx, w, h, p, pal, prm, st, time, reduced } = env;
    ctx.fillStyle = css(pal[0]); ctx.fillRect(0, 0, w, h);
    const style = prm.style || 'marble';
    const front = clamp(p);

    if (style === 'ferro') {
      // still, black liquid in a shallow dish: only the spikes catch light
      const g0 = ctx.createRadialGradient(w * 0.5, h * 0.44, 0, w * 0.5, h * 0.5, Math.min(w, h) * 0.72);
      g0.addColorStop(0, css(pal[1], 1, 4));
      g0.addColorStop(1, css(pal[0]));
      ctx.fillStyle = g0; ctx.fillRect(0, 0, w, h);
      for (const b of st.bands) {                      // low ripples left behind
        const passed = clamp((front - b.y) * 3 + 0.4);
        ctx.strokeStyle = css(pal[2], 0.08 + passed * 0.22, passed * 10);
        ctx.lineWidth = 1 + passed;
        ctx.beginPath();
        for (let k = 0; k <= 60; k++) {
          const t = k / 60;
          const y = (b.y + Math.sin(t * 5 + b.ph) * 0.02 * (0.4 + passed)) * h;
          k ? ctx.lineTo(t * w, y) : ctx.moveTo(t * w, y);
        }
        ctx.stroke();
      }
    }

    for (const b of (style === 'ferro' ? [] : st.bands)) {
      ctx.beginPath();
      const steps = 90;
      const pts = [];
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const pulled = clamp((front - t) * 7 + 0.5);
        const drift = reduced ? 0 : breathe(time, 18 + b.k * 9, b.ph) * 0.004;
        // ahead: broad flat bands. behind: drawn out into fine filaments.
        const comb = Math.sin(t * lerp(2.2, 13, pulled) + b.ph) * lerp(0.012, 0.075, pulled);
        const squeeze = lerp(1, 0.45, pulled);
        const y = (b.y + comb + drift) * h;
        pts.push({ x: t * w, y, th: b.thick * h * squeeze * lerp(1, 1.5, pulled) });
      }
      ctx.beginPath();
      pts.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y - q.th / 2) : ctx.moveTo(q.x, q.y - q.th / 2)));
      for (let k = pts.length - 1; k >= 0; k--) ctx.lineTo(pts[k].x, pts[k].y + pts[k].th / 2);
      ctx.closePath();
      const hue = (pal[2][0] + b.i * (prm.hueStep ?? 12)) % 360;
      const lit = clamp((front - b.y) * 2 + 0.55);
      ctx.fillStyle = css([hue, pal[2][1], pal[2][2] + lit * 10], style === 'ink' ? 0.8 : 0.55 + lit * 0.2);
      ctx.fill();
    }

    if (style === 'ferro') {
      for (const bl of st.blobs) {
        const near = clamp(1 - Math.abs(bl.x - front) / 0.22);
        const spikes = 7 + Math.floor(bl.k * 5);
        ctx.beginPath();
        for (let k = 0; k <= spikes * 4; k++) {
          const a = (k / (spikes * 4)) * TAU;
          const spike = 1 + Math.cos(a * spikes) * 0.4 * near;
          const rr = bl.r * Math.min(w, h) * spike * (0.6 + near * 0.6);
          const px = bl.x * w + Math.cos(a) * rr, py = bl.y * h + Math.sin(a) * rr;
          k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath();
        const bg = ctx.createRadialGradient(bl.x * w, bl.y * h - 6, 2, bl.x * w, bl.y * h, bl.r * Math.min(w, h) * 1.6);
        bg.addColorStop(0, css(pal[2], 0.85, -14));
        bg.addColorStop(1, css(pal[0], 0.95, -2));
        ctx.fillStyle = bg; ctx.fill();
        ctx.strokeStyle = css(pal[4], 0.22 + near * 0.55, 14); ctx.lineWidth = 1.1; ctx.stroke();
      }
    }

    const hx = w * front;
    const g = ctx.createLinearGradient(hx - 50, 0, hx + 50, 0);
    g.addColorStop(0, css(pal[4], 0)); g.addColorStop(0.5, css(pal[4], 0.14, 14)); g.addColorStop(1, css(pal[4], 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    glow(ctx, hx, h * 0.5, Math.min(w, h) * 0.16, pal[4], 0.22);
    finish(ctx, env, 0.7);
  },

  anchors(env) {
    const { w, h, p } = env;
    const x = w * clamp(p, 0.06, 0.94);
    const pts = [];
    for (let i = 0; i <= 7; i++) {
      const t = i / 7;
      pts.push({ x: lerp(x, w * 0.8, t), y: h * (0.5 + Math.sin(t * Math.PI) * 0.1) });
    }
    return { head: { x, y: h * 0.5 }, rest: { x: w * 0.78, y: h * 0.5 }, path: pts };
  }
};

// ═════════════════════════════════════════════════════════════
// 7. CAUSTIC — a shape of light crossing a material. Where it has
//    been, the surface keeps a different finish.
// ═════════════════════════════════════════════════════════════
const caustic = {
  init(env) {
    const { rng, w, h, prm } = env;
    const flecks = [];
    for (let i = 0; i < (prm.flecks || 150); i++) {
      flecks.push({ x: rng(), y: rng(), s: 0.4 + rng() * 1.4, k: rng(), ph: rng() * TAU });
    }
    const seams = [];
    for (let i = 0; i < (prm.seams || 0); i++) {
      const pts = [];
      const y0 = rng();
      for (let k = 0; k <= 6; k++) pts.push({ x: (k / 6) * w, y: (y0 + Math.sin(k + i) * 0.08) * h });
      seams.push({ path: makeSpline(pts, 90), u: rng(), k: rng() });
    }
    return { flecks, seams };
  },

  draw(env) {
    const { ctx, w, h, p, pal, prm, st, time, reduced } = env;
    const mat = prm.material || 'stone';
    ctx.fillStyle = css(pal[1]); ctx.fillRect(0, 0, w, h);
    drawMaterialSurface(ctx, env, mat);

    // material grain, deepened where the light has passed
    ctx.save();
    for (const f of st.flecks) {
      const passed = clamp((p - f.x) * 4 + 0.5);
      const x = f.x * w, y = f.y * h;
      if (mat === 'wood') {
        ctx.strokeStyle = css(pal[2], 0.06 + passed * 0.26, passed * 8);
        ctx.lineWidth = f.s * 1.2;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(w * 0.33, y + Math.sin(f.k * 9) * 22, w * 0.66, y - Math.sin(f.k * 7) * 22, w, y);
        ctx.stroke();
      } else if (mat === 'paper') {
        ctx.fillStyle = css(pal[2], 0.05 + passed * 0.2, passed * 10);
        ctx.fillRect(x, y, f.s * 22, 0.7);
      } else if (mat === 'metal') {
        ctx.strokeStyle = css(pal[2], 0.04 + passed * 0.16, passed * 12);
        ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(x - 30, y); ctx.lineTo(x + 30, y + 6); ctx.stroke();
      } else {
        ctx.fillStyle = css(pal[2], 0.05 + passed * 0.3, passed * 12);
        ctx.beginPath(); ctx.arc(x, y, f.s * 1.8, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();

    for (const s of st.seams) {
      const on = clamp((p - s.u) * 4);
      ctx.beginPath();
      s.path.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.strokeStyle = css(pal[3], 0.08 + on * 0.5, on * 14);
      ctx.lineWidth = 0.8 + on * 1.4;
      ctx.stroke();
    }

    // the light itself
    const shape = prm.lightShape || 'spot';
    const hp = { x: w * clamp(p, 0.05, 0.95), y: h * (0.5 + (reduced ? 0 : breathe(time, 26) * 0.06)) };
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (shape === 'pane') {
      const pw = w * 0.16, ph = h * 0.44;
      const g = ctx.createLinearGradient(hp.x - pw, 0, hp.x + pw, 0);
      g.addColorStop(0, css(pal[4], 0)); g.addColorStop(0.5, css(pal[4], 0.3, 14)); g.addColorStop(1, css(pal[4], 0));
      ctx.fillStyle = g;
      ctx.save(); ctx.translate(hp.x, hp.y); ctx.rotate(-0.22);
      ctx.fillRect(-pw, -ph / 2, pw * 2, ph);
      ctx.strokeStyle = css(pal[4], 0.25, 20); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -ph / 2); ctx.lineTo(0, ph / 2);
      ctx.moveTo(-pw, 0); ctx.lineTo(pw, 0); ctx.stroke();
      ctx.restore();
    } else if (shape === 'slit') {
      const g = ctx.createLinearGradient(hp.x - 40, 0, hp.x + 40, 0);
      g.addColorStop(0, css(pal[4], 0)); g.addColorStop(0.5, css(pal[4], 0.34, 16)); g.addColorStop(1, css(pal[4], 0));
      ctx.fillStyle = g; ctx.fillRect(hp.x - 40, 0, 80, h);
    } else if (shape === 'prism') {
      for (let i = 0; i < 6; i++) {
        const hue = (pal[4][0] + i * 26) % 360;
        const off = (i - 2.5) * 16;
        const g = ctx.createRadialGradient(hp.x + off, hp.y, 0, hp.x + off, hp.y, Math.min(w, h) * 0.2);
        g.addColorStop(0, `hsl(${hue} 85% 66% / 0.24)`); g.addColorStop(1, `hsl(${hue} 85% 66% / 0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hp.x + off, hp.y, Math.min(w, h) * 0.2, 0, TAU); ctx.fill();
      }
    } else if (shape === 'bar') {
      const g = ctx.createLinearGradient(0, hp.y - 50, 0, hp.y + 50);
      g.addColorStop(0, css(pal[4], 0)); g.addColorStop(0.5, css(pal[4], 0.28, 16)); g.addColorStop(1, css(pal[4], 0));
      ctx.fillStyle = g; ctx.fillRect(0, hp.y - 50, w, 100);
    } else {
      glow(ctx, hp.x, hp.y, Math.min(w, h) * (prm.headSize || 0.3), pal[4], 0.42);
    }
    ctx.restore();

    // what is still untouched sits in shadow
    const g2 = ctx.createLinearGradient(hp.x, 0, w, 0);
    g2.addColorStop(0, css(pal[0], 0)); g2.addColorStop(1, css(pal[0], 0.58));
    ctx.fillStyle = g2; ctx.fillRect(hp.x, 0, w - hp.x, h);
    finish(ctx, env, 0.9);
  },

  anchors(env) {
    const { w, h, p } = env;
    const head = { x: w * clamp(p, 0.06, 0.94), y: h * 0.5 };
    return { head, rest: { x: w * 0.5, y: h * 0.72 }, path: arcPath(head, { x: w * 0.5, y: h * 0.72 }, 7, env) };
  }
};

/** The body the light plays over: floor, planks, sheets, vessel, panels. */
function drawMaterialSurface(ctx, env, mat) {
  const { w, h, p, pal, time, reduced } = env;
  const f = clamp(p);
  if (mat === 'stone') {
    const rows = 8, cols = 6;
    for (let j = 0; j < rows; j++) {
      const y0 = h * (0.42 + Math.pow(j / rows, 1.7) * 0.6);
      const y1 = h * (0.42 + Math.pow((j + 1) / rows, 1.7) * 0.6);
      for (let i = 0; i < cols; i++) {
        const spread = 0.5 + (j / rows) * 1.5;
        const x0 = w * 0.5 + (i - cols / 2) * (w / cols) * spread;
        const lit = clamp(1 - Math.abs((x0 / w) - f) / 0.4);
        ctx.fillStyle = css(pal[2], 0.05 + lit * 0.16, -6 + lit * 10);
        ctx.fillRect(x0, y0, (w / cols) * spread - 2, y1 - y0 - 2);
      }
    }
  } else if (mat === 'wood') {
    for (let i = 0; i < 7; i++) {
      const y = h * (0.1 + i * 0.13);
      const lit = clamp((f - i / 9) * 2.4 + 0.3);
      ctx.fillStyle = css(pal[2], 0.07 + lit * 0.14, -8 + lit * 8);
      ctx.fillRect(0, y, w, h * 0.115);
      ctx.strokeStyle = css(pal[0], 0.4); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  } else if (mat === 'paper') {
    for (let i = 5; i >= 0; i--) {
      const inset = i * Math.min(w, h) * 0.045;
      const lit = clamp((f - (5 - i) / 7) * 2 + 0.35);
      ctx.fillStyle = css(pal[2], 0.06 + lit * 0.13, -4 + lit * 10);
      ctx.beginPath();
      ctx.roundRect(inset + w * 0.06, inset + h * 0.12, w * 0.88 - inset * 2, h * 0.76 - inset * 2, 6);
      ctx.fill();
      ctx.strokeStyle = css(pal[0], 0.35); ctx.lineWidth = 0.8; ctx.stroke();
    }
  } else if (mat === 'ceramic') {
    const cx = w * 0.5, cy = h * 0.56, r = Math.min(w, h) * 0.38;
    const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r * 1.3);
    g.addColorStop(0, css(pal[2], 0.34, 8)); g.addColorStop(1, css(pal[1], 0.9, -4));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 1.05, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = css(pal[2], 0.3, 6); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(cx, cy - r * 0.86, r * 0.62, r * 0.14, 0, 0, TAU); ctx.stroke();
  } else if (mat === 'metal') {
    for (let i = 0; i < 5; i++) {
      const x = w * (i / 5), lit = clamp((f - i / 6) * 2.5 + 0.25);
      const g = ctx.createLinearGradient(x, 0, x + w / 5, 0);
      g.addColorStop(0, css(pal[2], 0.06 + lit * 0.1, -6));
      g.addColorStop(0.5, css(pal[2], 0.1 + lit * 0.2, 4 + lit * 8));
      g.addColorStop(1, css(pal[2], 0.06 + lit * 0.1, -6));
      ctx.fillStyle = g; ctx.fillRect(x, h * 0.12, w / 5 - 2, h * 0.76);
    }
  }
}

// ═════════════════════════════════════════════════════════════
// 8. SWARM — many small lives moving as one body, leaving some of
//    themselves settled behind.
// ═════════════════════════════════════════════════════════════
const swarm = {
  init(env) {
    const { rng, w, h, prm } = env;
    const n = prm.count || 90;
    const parts = [];
    for (let i = 0; i < n; i++) {
      parts.push({
        i, off: { x: (rng() - 0.5), y: (rng() - 0.5) },
        sp: 0.6 + rng() * 0.8, ph: rng() * TAU, k: rng(),
        drop: 0.06 + rng() * 0.9                 // where along the route it settles
      });
    }
    const pts = [];
    const knots = prm.knots || 6;
    for (let i = 0; i <= knots; i++) {
      pts.push({ x: w * (0.12 + (i / knots) * 0.76) + (rng() - 0.5) * w * 0.1, y: h * (0.25 + rng() * 0.5) });
    }
    return { parts, path: makeSpline(pts, 500) };
  },

  draw(env) {
    const { ctx, w, h, p, pal, prm, st, time, reduced } = env;
    const bg = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.6);
    bg.addColorStop(0, css(pal[1], 1, 3)); bg.addColorStop(1, css(pal[0]));
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

    const head = atT(st.path, clamp(p, 0, 0.999));
    const spread = Math.min(w, h) * (prm.spread || 0.18);
    const settleStyle = prm.settle || 'dot';

    for (const q of st.parts) {
      if (q.drop <= p) {                                  // settled: part of the record now
        const at = atT(st.path, q.drop);
        const x = at.x + q.off.x * spread * 0.9, y = at.y + q.off.y * spread * 0.9;
        const age = clamp((p - q.drop) / 0.5);
        ctx.fillStyle = css(pal[3], 0.3 + 0.4 * (1 - age * 0.35), 6);
        if (settleStyle === 'glowdot') {
          glow(ctx, x, y, 13 * q.sp, pal[3], 0.2);
          ctx.fillStyle = css(pal[3], 0.7, 14);
        }
        ctx.beginPath(); ctx.arc(x, y, 2.3 * q.sp, 0, TAU); ctx.fill();
      } else {                                            // still travelling
        const t = reduced ? 0 : time;
        const wob = { x: Math.sin(t * 0.5 * q.sp + q.ph) * spread * 0.4,
                      y: Math.cos(t * 0.42 * q.sp + q.ph * 1.7) * spread * 0.32 };
        const x = head.x + q.off.x * spread + wob.x;
        const y = head.y + q.off.y * spread + wob.y;
        ctx.fillStyle = css(pal[4], 0.7 + 0.3 * Math.sin(t + q.ph) * 0.4, 12);
        ctx.beginPath(); ctx.arc(x, y, 2.6 * q.sp, 0, TAU); ctx.fill();
      }
    }

    glow(ctx, head.x, head.y, spread * 2.4, pal[4], 0.3);
    finish(ctx, env, 0.75);
  },

  anchors(env) {
    const { st, p, w, h } = env;
    const head = atT(st.path, clamp(p, 0, 0.999));
    const end = atT(st.path, 1);
    return {
      head: { x: head.x, y: head.y },
      rest: { x: end.x, y: end.y },
      path: [0.8, 0.85, 0.89, 0.93, 0.96, 0.98, 1].map((t) => { const q = atT(st.path, t); return { x: q.x, y: q.y }; })
    };
  }
};

// ═════════════════════════════════════════════════════════════
// 9. DEPTH — receding layers: a corridor, a run of windows, islands
//    at different distances. You move through them.
// ═════════════════════════════════════════════════════════════
const depth = {
  init(env) {
    const { rng, w, h, prm } = env;
    const n = prm.layers || 9;
    const arr = [];
    for (let i = 0; i < n; i++) {
      arr.push({
        i, u: i / (n - 1),
        off: (rng() - 0.5) * 0.4, tilt: (rng() - 0.5) * 0.22,
        k: rng(), ph: rng() * TAU, hue: (rng() - 0.5) * 30
      });
    }
    return { arr };
  },

  draw(env) {
    const { ctx, w, h, p, pal, prm, st, time, reduced } = env;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, css(pal[0])); g.addColorStop(0.6, css(pal[1], 1, -3)); g.addColorStop(1, css(pal[0], 1, -4));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    const motif = prm.motif || 'corridor';
    const travel = clamp(p) * (st.arr.length - 1);

    if (motif === 'islands') {
      const sea = ctx.createLinearGradient(0, h * 0.46, 0, h);
      sea.addColorStop(0, css(pal[1], 0.9, 2));
      sea.addColorStop(1, css(pal[0], 1, -2));
      ctx.fillStyle = sea; ctx.fillRect(0, h * 0.46, w, h * 0.54);
      ctx.strokeStyle = css(pal[2], 0.22, 8); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, h * 0.46); ctx.lineTo(w, h * 0.46); ctx.stroke();
      for (let i = 1; i < 7; i++) {                     // slow water, always moving a little
        const y = h * (0.5 + i * 0.07);
        const off = reduced ? 0 : breathe(time, 22 + i * 3, i) * 6;
        ctx.strokeStyle = css(pal[2], 0.06 + clamp(p) * 0.06);
        ctx.beginPath(); ctx.moveTo(-10 + off, y); ctx.lineTo(w + 10 + off, y); ctx.stroke();
      }
    }

    for (let idx = st.arr.length - 1; idx >= 0; idx--) {
      const L = st.arr[idx];
      const rel = idx - travel;                  // <0 passed, ~0 here, >0 ahead
      const z = clamp(1 - rel / st.arr.length, 0, 1);
      if (rel < -1.6) continue;                  // behind the viewer
      const scale = Math.pow(1.34, -rel) * (prm.scale || 1);
      const cx = w * 0.5 + L.off * w * 0.22 * Math.min(1, scale);
      const cy = h * 0.5 + (reduced ? 0 : breathe(time, 20 + L.k * 8, L.ph) * 2);
      const near = clamp(1 - Math.abs(rel) / 1.1);
      const seen = clamp(1 - rel / 2.4);          // ahead of us it is still fogged

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(L.tilt * 0.2 * (1 - near));
      const col = [pal[2][0] + L.hue, pal[2][1], pal[2][2]];

      if (motif === 'corridor' || motif === 'arches') {
        const ww = w * 0.34 * scale, hh = h * 0.42 * scale;
        ctx.strokeStyle = css(col, 0.08 + seen * 0.4, near * 12);
        ctx.lineWidth = 1 + near * 1.6;
        ctx.beginPath();
        if (motif === 'arches') {
          ctx.moveTo(-ww, hh); ctx.lineTo(-ww, -hh * 0.3);
          ctx.quadraticCurveTo(0, -hh * 1.3, ww, -hh * 0.3); ctx.lineTo(ww, hh);
        } else ctx.rect(-ww, -hh, ww * 2, hh * 2);
        ctx.stroke();
        if (rel < 0.6) {
          ctx.fillStyle = css(pal[3], 0.05 + near * 0.16, 6);
          ctx.fillRect(-ww, -hh, ww * 2, hh * 2);
        }
      } else if (motif === 'window') {
        const ww = w * 0.2 * scale, hh = h * 0.28 * scale;
        ctx.fillStyle = css(col, 0.1 + seen * 0.35, (seen - 0.4) * 14);
        ctx.fillRect(-ww, -hh, ww * 2, hh * 2);
        ctx.strokeStyle = css(pal[1], 0.3 + near * 0.4, -6); ctx.lineWidth = 2.4 * Math.min(2, scale);
        ctx.strokeRect(-ww, -hh, ww * 2, hh * 2);
        ctx.beginPath(); ctx.moveTo(0, -hh); ctx.lineTo(0, hh); ctx.moveTo(-ww, 0); ctx.lineTo(ww, 0); ctx.stroke();
        if (near > 0.2) {                       // the pane that is level with you glows
          ctx.fillStyle = css(pal[4], near * 0.2, 16); ctx.fillRect(-ww, -hh, ww * 2, hh * 2);
        }
      } else if (motif === 'islands') {
        const ww = w * 0.2 * Math.min(2.2, scale);
        ctx.translate(L.off * w * 0.3, -rel * h * 0.035);
        ctx.fillStyle = css(col, 0.2 + seen * 0.42, near * 10);
        ctx.beginPath();
        ctx.moveTo(-ww, 0);
        ctx.quadraticCurveTo(-ww * 0.4, -ww * (0.4 + L.k * 0.4), ww * 0.2, -ww * 0.34);
        ctx.quadraticCurveTo(ww, -ww * 0.2, ww * 0.9, 0);
        ctx.quadraticCurveTo(ww * 0.3, ww * 0.6, -ww, 0);
        ctx.fill();
        // its reflection on the water below
        ctx.save();
        ctx.scale(1, -0.5); ctx.globalAlpha = 0.24 + seen * 0.2;
        ctx.fillStyle = css(col, 0.5, -6);
        ctx.beginPath();
        ctx.moveTo(-ww, -2);
        ctx.quadraticCurveTo(0, -ww * 0.5, ww * 0.9, -2);
        ctx.quadraticCurveTo(0, ww * 0.3, -ww, -2);
        ctx.fill();
        ctx.restore();
        if (near > 0.15) glow(ctx, 0, 0, ww * 1.8, pal[4], near * 0.26);
      } else {                                   // 'panels'
        const ww = w * 0.3 * scale, hh = h * 0.3 * scale;
        ctx.fillStyle = css(col, 0.1 + seen * 0.3, near * 10);
        ctx.fillRect(-ww, -hh, ww * 2, hh * 2);
      }
      ctx.restore();
    }

    // depth fog on everything not yet reached
    const f = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.05, w / 2, h / 2, Math.min(w, h) * 0.55);
    f.addColorStop(0, css(pal[0], 0.55)); f.addColorStop(1, css(pal[0], 0));
    ctx.fillStyle = f; ctx.fillRect(0, 0, w, h);
    finish(ctx, env, 0.7);
  },

  anchors(env) {
    const { w, h } = env;
    return {
      head: { x: w * 0.5, y: h * 0.5 },
      rest: { x: w * 0.72, y: h * 0.56 },
      path: arcPath({ x: w * 0.38, y: h * 0.46 }, { x: w * 0.68, y: h * 0.58 }, 7, env)
    };
  }
};

// ═════════════════════════════════════════════════════════════
// 10. RADIAL — a world built of wedges and rings that resolves from
//     blurred to exact, sector by sector.
// ═════════════════════════════════════════════════════════════
const radial = {
  init(env) {
    const { rng, prm } = env;
    const n = prm.wedges || 10;
    const arr = [];
    for (let i = 0; i < n; i++) {
      arr.push({ i, u: i / n, k: rng(), ph: rng() * TAU, hue: (rng() - 0.5) * 40,
                 shards: Array.from({ length: 4 }, () => ({ r: 0.2 + rng() * 0.7, a: rng(), s: 0.3 + rng() * 0.8 })) });
    }
    return { arr };
  },

  draw(env) {
    const { ctx, w, h, p, pal, prm, st, time, reduced } = env;
    ctx.fillStyle = css(pal[0]); ctx.fillRect(0, 0, w, h);
    const cx = w * 0.5, cy = h * (prm.cy ?? 0.5);
    const R = Math.min(w, h) * (prm.radius || 0.52);
    const n = st.arr.length;
    const spin = reduced ? 0 : breathe(time, 90) * 0.02;

    for (const W of st.arr) {
      const a0 = W.u * TAU + spin, a1 = a0 + TAU / n;
      const r = reveal(W.u, p, 0.06);
      const near = headNear(W.u, p, 0.05);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a1); ctx.closePath();
      ctx.clip();

      const col = [pal[2][0] + W.hue, pal[2][1], pal[2][2] + r * 12];
      ctx.fillStyle = css(col, 0.1 + r * 0.32);
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

      for (const s of W.shards) {
        const a = a0 + s.a * (TAU / n);
        const rr = s.r * R;
        ctx.fillStyle = css(r > 0.4 ? pal[3] : pal[1], 0.12 + r * 0.5, r * 10);
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, R * 0.09 * s.s * lerp(1.6, 1, r), R * 0.05 * s.s, a, 0, TAU);
        ctx.fill();
      }
      if (near > 0.05) {
        ctx.fillStyle = css(pal[4], near * 0.2, 16);
        ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      }
      ctx.restore();

      ctx.strokeStyle = css(pal[1], 0.2 + r * 0.24);
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R); ctx.stroke();
    }

    const ha = clamp(p) * TAU + spin;
    glow(ctx, cx + Math.cos(ha) * R * 0.66, cy + Math.sin(ha) * R * 0.66, R * 0.3, pal[4], 0.32);
    ctx.strokeStyle = css(pal[1], 0.3); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    finish(ctx, env, 0.8);
  },

  anchors(env) {
    const { w, h, p, prm } = env;
    const cx = w * 0.5, cy = h * (prm.cy ?? 0.5);
    const R = Math.min(w, h) * (prm.radius || 0.52);
    const ha = clamp(p) * TAU;
    const head = { x: cx + Math.cos(ha) * R * 0.62, y: cy + Math.sin(ha) * R * 0.62 };
    const pts = [];
    for (let i = 0; i <= 7; i++) {
      const a = ha - 0.5 + (i / 7) * 1.0;
      pts.push({ x: cx + Math.cos(a) * R * 0.5, y: cy + Math.sin(a) * R * 0.5 });
    }
    return { head, rest: { x: cx, y: cy }, path: pts };
  }
};

export const ENGINES = { fog, trail, front, lines, strand, liquid, caustic, swarm, depth, radial, painting, chronicle, bar };
