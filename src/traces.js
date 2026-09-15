// ─────────────────────────────────────────────────────────────
// Completion traces. No checkmarks, no badges: each world keeps a
// small, specific mark of the session that closed inside it.
// A trace is a shape, a placement and a structure — never a colour swap.
// `phase` runs 0..1 over 400–900ms, then stays at 1 forever.
// ─────────────────────────────────────────────────────────────

import { css, TAU, clamp, lerp } from './util.js';

const ring = (ctx, x, y, r, color, w, a) => {
  ctx.strokeStyle = css(color, a); ctx.lineWidth = w;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
};

export const TRACES = {
  // three closed contours, drawn from the inside out
  contourTriple(ctx, x, y, s, c, p, rng) {
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const t = clamp((p - i * 0.18) / 0.55);
      if (t <= 0) continue;
      const r = s * (0.34 + i * 0.26);
      ctx.strokeStyle = css(c[3], 0.85 - i * 0.16, 6);
      ctx.lineWidth = 1.5 - i * 0.25;
      ctx.beginPath();
      for (let k = 0; k <= 48; k++) {
        const a = (k / 48) * TAU * t - 0.5;
        const wob = 1 + Math.sin(a * 3 + i * 1.7) * 0.11 + Math.cos(a * 5 - i) * 0.05;
        const px = x + Math.cos(a) * r * wob, py = y + Math.sin(a) * r * wob * 0.82;
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
  },

  spiral(ctx, x, y, s, c, p) {
    ctx.strokeStyle = css(c[3], 0.9, 8); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath();
    const turns = 3.1, steps = 130 * p;
    for (let k = 0; k <= steps; k++) {
      const u = k / 130;
      const a = u * TAU * turns, r = s * 0.1 + u * s * 0.58;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.92;
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
    ctx.fillStyle = css(c[4], 0.9 * p, 14);
    ctx.beginPath(); ctx.arc(x, y, s * 0.07, 0, TAU); ctx.fill();
  },

  leafVein(ctx, x, y, s, c, p) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.42);
    ctx.strokeStyle = css(c[3], 0.85 * p, 10); ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.62 * p);
    ctx.bezierCurveTo(s * 0.44, -s * 0.26, s * 0.4, s * 0.34, 0, s * 0.62 * p);
    ctx.bezierCurveTo(-s * 0.4, s * 0.34, -s * 0.44, -s * 0.26, 0, -s * 0.62 * p);
    ctx.stroke();
    ctx.lineWidth = 0.8;
    for (let i = -3; i <= 3; i++) {
      const t = clamp((p - 0.3) / 0.6); if (t <= 0) break;
      const yy = i * s * 0.15;
      ctx.strokeStyle = css(c[4], 0.5 * t, 12);
      ctx.beginPath(); ctx.moveTo(0, yy);
      ctx.quadraticCurveTo(s * 0.18 * Math.sign(i || 1) * t, yy + s * 0.07, s * 0.3 * t * (i % 2 ? 1 : -1), yy + s * 0.13);
      ctx.stroke();
    }
    ctx.restore();
  },

  crystal6(ctx, x, y, s, c, p) {
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.26, len = s * 0.62 * clamp(p * 1.3);
      ctx.strokeStyle = css(c[4], 0.9, 12); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
      const t2 = clamp((p - 0.35) / 0.6);
      if (t2 > 0) {
        for (const side of [-1, 1]) {
          for (let b = 1; b <= 2; b++) {
            const bx = x + Math.cos(a) * len * (b * 0.32), by = y + Math.sin(a) * len * (b * 0.32);
            const ba = a + side * 1.05, bl = len * 0.22 * t2;
            ctx.lineWidth = 0.9; ctx.strokeStyle = css(c[4], 0.6 * t2, 10);
            ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(ba) * bl, by + Math.sin(ba) * bl); ctx.stroke();
          }
        }
      }
    }
  },

  reflectLine(ctx, x, y, s, c, p) {
    const len = s * 1.5 * p;
    const g = ctx.createLinearGradient(x, y - len / 2, x, y + len / 2);
    g.addColorStop(0, css(c[4], 0)); g.addColorStop(0.5, css(c[4], 0.85, 14)); g.addColorStop(1, css(c[4], 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - s * 0.045, y - len / 2, s * 0.09, len);
    ctx.fillStyle = css(c[4], 0.5 * p, 10);
    ctx.fillRect(x - s * 0.16, y - len * 0.1, s * 0.32, len * 0.2);
  },

  rosette(ctx, x, y, s, c, p, rng, petals = 6) {
    ctx.strokeStyle = css(c[3], 0.85, 8); ctx.lineWidth = 1.2;
    for (let i = 0; i < petals; i++) {
      const t = clamp((p - i / (petals * 2)) / 0.5); if (t <= 0) continue;
      const a = (i / petals) * TAU;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * s * 0.22, y + Math.sin(a) * s * 0.22, s * 0.3 * t, s * 0.13 * t, a, 0, TAU);
      ctx.stroke();
    }
    ring(ctx, x, y, s * 0.1, c[4], 1.4, 0.9 * p);
  },

  hexScan(ctx, x, y, s, c, p) {
    ctx.strokeStyle = css(c[4], 0.9, 10); ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6;
      const px = x + Math.cos(a) * s * 0.55 * clamp(p * 1.2), py = y + Math.sin(a) * s * 0.55 * clamp(p * 1.2);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
    const t2 = clamp((p - 0.4) / 0.6);
    ctx.lineWidth = 0.7; ctx.strokeStyle = css(c[4], 0.45 * t2, 6);
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(x - s * 0.4 * t2, y + i * s * 0.16); ctx.lineTo(x + s * 0.4 * t2, y + i * s * 0.16); ctx.stroke();
    }
  },

  knot(ctx, x, y, s, c, p) {
    ctx.lineCap = 'round'; ctx.lineWidth = 2.2;
    for (let i = 0; i < 3; i++) {
      const t = clamp((p - i * 0.12) / 0.6); if (t <= 0) continue;
      ctx.strokeStyle = css(c[3 + (i % 2)], 0.8, 6 + i * 3);
      ctx.beginPath();
      for (let k = 0; k <= 60 * t; k++) {
        const u = (k / 60) * TAU;
        const px = x + Math.sin(u * 2 + i * 2.1) * s * 0.42;
        const py = y + Math.sin(u * 3 + i * 1.3) * s * 0.3;
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
  },

  crescentRipple(ctx, x, y, s, c, p) {
    ctx.strokeStyle = css(c[4], 0.9, 12); ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y, s * 0.46, -1.15 - p * 0.9, 1.15 + p * 0.9); ctx.stroke();
    for (let i = 1; i <= 3; i++) {
      const t = clamp((p - i * 0.16) / 0.5); if (t <= 0) continue;
      ctx.lineWidth = 0.8; ctx.strokeStyle = css(c[4], 0.35 * t, 6);
      ctx.beginPath(); ctx.arc(x, y, s * (0.46 + i * 0.16), -0.9, 0.9); ctx.stroke();
    }
  },

  ribbonKnot(ctx, x, y, s, c, p) {
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const t = clamp((p - i * 0.14) / 0.6); if (t <= 0) continue;
      ctx.strokeStyle = css(c[3 + (i % 2)], 0.55, 10); ctx.lineWidth = 5 - i * 1.2;
      ctx.beginPath();
      for (let k = 0; k <= 50 * t; k++) {
        const u = k / 50;
        const px = x + (u - 0.5) * s * 1.3;
        const py = y + Math.sin(u * Math.PI * 2 + i * 2) * s * 0.2 * Math.sin(u * Math.PI);
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
  },

  squareLattice(ctx, x, y, s, c, p) {
    const n = 3, cell = s * 0.3;
    ctx.strokeStyle = css(c[4], 0.8, 10); ctx.lineWidth = 1.1;
    for (let i = 0; i <= n; i++) {
      const t = clamp((p - i * 0.12) / 0.5); if (t <= 0) continue;
      const o = (i - n / 2) * cell;
      ctx.beginPath(); ctx.moveTo(x - cell * 1.5 * t, y + o); ctx.lineTo(x + cell * 1.5 * t, y + o); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + o, y - cell * 1.5 * t); ctx.lineTo(x + o, y + cell * 1.5 * t); ctx.stroke();
    }
    ctx.fillStyle = css(c[4], 0.16 * p, 16);
    ctx.fillRect(x - cell * 1.5, y - cell * 1.5, cell * 3, cell * 3);
  },

  halo(ctx, x, y, s, c, p) {
    ring(ctx, x, y, s * 0.5 * clamp(p * 1.2), c[4], 1.6, 0.9);
    const t2 = clamp((p - 0.35) / 0.6);
    if (t2 > 0) ring(ctx, x, y, s * 0.68, c[4], 0.8, 0.45 * t2);
    ctx.fillStyle = css(c[4], 0.5 * p, 18);
    ctx.beginPath(); ctx.arc(x, y, s * 0.06, 0, TAU); ctx.fill();
  },

  plate(ctx, x, y, s, c, p) {
    const w = s * 0.8 * p, h = s * 0.22;
    ctx.fillStyle = css(c[4], 0.7, 6);
    ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, h * 0.4); ctx.fill();
    const g = ctx.createLinearGradient(x - w / 2, y, x + w / 2, y);
    g.addColorStop(0, css(c[4], 0)); g.addColorStop(0.5, css(c[4], 0.8, 20)); g.addColorStop(1, css(c[4], 0));
    ctx.fillStyle = g; ctx.fillRect(x - w / 2, y - h * 0.16, w, h * 0.3);
  },

  starRing(ctx, x, y, s, c, p) {
    ctx.strokeStyle = css(c[4], 0.9, 14); ctx.lineWidth = 1.1; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI, len = s * 0.4 * clamp(p * 1.4);
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(a) * len, y - Math.sin(a) * len);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
    const t2 = clamp((p - 0.4) / 0.6);
    if (t2 > 0) { ring(ctx, x, y, s * 0.3, c[4], 0.9, 0.6 * t2); ring(ctx, x, y, s * 0.44, c[4], 0.6, 0.35 * t2); }
  },

  dropRing(ctx, x, y, s, c, p) {
    ring(ctx, x, y, s * 0.4 * clamp(p * 1.3), c[4], 1.5, 0.8);
    const t2 = clamp((p - 0.4) / 0.6);
    for (let i = 0; i < 7 && t2 > 0; i++) {
      const a = (i / 7) * TAU + 0.4;
      ctx.fillStyle = css(c[4], 0.6 * t2, 12);
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * s * 0.4, y + Math.sin(a) * s * 0.4, s * 0.035, 0, TAU); ctx.fill();
    }
  },

  fleck(ctx, x, y, s, c, p) {
    for (let i = 0; i < 5; i++) {
      const t = clamp((p - i * 0.1) / 0.5); if (t <= 0) continue;
      const a = i * 1.9, r = s * 0.18 * i * 0.5;
      const g = ctx.createRadialGradient(x + Math.cos(a) * r, y + Math.sin(a) * r, 0, x + Math.cos(a) * r, y + Math.sin(a) * r, s * 0.2 * t);
      g.addColorStop(0, css([(c[4][0] + i * 40) % 360, 80, 70], 0.7 * t));
      g.addColorStop(1, css([(c[4][0] + i * 40) % 360, 80, 70], 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, s * 0.2 * t, 0, TAU); ctx.fill();
    }
  },

  crease(ctx, x, y, s, c, p) {
    ctx.strokeStyle = css(c[4], 0.85, 12); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.5 * p, y + s * 0.18);
    ctx.quadraticCurveTo(x, y - s * 0.3, x + s * 0.5 * p, y + s * 0.1);
    ctx.stroke();
    const t2 = clamp((p - 0.4) / 0.6);
    if (t2 > 0) {
      ctx.strokeStyle = css(c[3], 0.4 * t2, 4); ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.42, y + s * 0.3); ctx.quadraticCurveTo(x, y - s * 0.12, x + s * 0.42, y + s * 0.24);
      ctx.stroke();
    }
  },

  dropGlow(ctx, x, y, s, c, p) {
    const g = ctx.createRadialGradient(x, y - s * 0.05, 0, x, y, s * 0.45 * clamp(p * 1.2));
    g.addColorStop(0, css(c[4], 0.9, 20)); g.addColorStop(0.6, css(c[4], 0.3, 6)); g.addColorStop(1, css(c[4], 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, s * 0.45, 0, TAU); ctx.fill();
    ctx.strokeStyle = css(c[4], 0.7 * p, 16); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, s * 0.2, 0, TAU); ctx.stroke();
  },

  dustRing(ctx, x, y, s, c, p, rng) {
    const n = 26;
    for (let i = 0; i < n; i++) {
      const t = clamp((p - (i / n) * 0.4) / 0.6); if (t <= 0) continue;
      const a = (i / n) * TAU, r = s * 0.42 * (0.9 + Math.sin(i * 2.7) * 0.1);
      ctx.fillStyle = css(c[4], 0.55 * t, 14);
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, s * 0.022, 0, TAU); ctx.fill();
    }
  },

  stitch(ctx, x, y, s, c, p) {
    ctx.strokeStyle = css(c[4], 0.85, 10); ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = clamp((p - i / (n * 1.4)) / 0.4); if (t <= 0) continue;
      const u = i / (n - 1), px = x + (u - 0.5) * s * 1.1, py = y + Math.sin(u * 3.1) * s * 0.12;
      ctx.beginPath();
      ctx.moveTo(px - s * 0.05 * t, py - s * 0.06 * t);
      ctx.lineTo(px + s * 0.05 * t, py + s * 0.06 * t);
      ctx.stroke();
    }
  },

  weavePatch(ctx, x, y, s, c, p) {
    const n = 4, cell = s * 0.22;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const t = clamp((p - (i + j) / (n * 3)) / 0.5); if (t <= 0) continue;
        const over = (i + j) % 2 === 0;
        ctx.fillStyle = css(c[over ? 3 : 4], (over ? 0.6 : 0.45) * t, over ? 4 : 12);
        const px = x + (i - n / 2 + 0.5) * cell, py = y + (j - n / 2 + 0.5) * cell;
        ctx.fillRect(px - cell * 0.44, py - cell * 0.44, cell * 0.88, cell * 0.88);
      }
    }
  },

  goldSeam(ctx, x, y, s, c, p) {
    ctx.lineCap = 'round';
    const pts = [[-0.5, 0.2], [-0.18, -0.12], [0.05, 0.06], [0.3, -0.24], [0.52, 0.04]];
    ctx.strokeStyle = css(c[4], 0.9, 16); ctx.lineWidth = 2.1;
    ctx.beginPath();
    const lim = Math.max(1, Math.floor(pts.length * p));
    pts.slice(0, lim + 1).forEach(([px, py], i) => {
      const X = x + px * s, Y = y + py * s;
      i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
    });
    ctx.stroke();
    ctx.strokeStyle = css(c[4], 0.35 * p, 26); ctx.lineWidth = 4.5; ctx.stroke();
  },

  prismHex(ctx, x, y, s, c, p) {
    for (let i = 0; i < 6; i++) {
      const t = clamp((p - i * 0.08) / 0.5); if (t <= 0) continue;
      const a0 = (i / 6) * TAU, a1 = ((i + 1) / 6) * TAU;
      ctx.strokeStyle = `hsl(${(i * 52 + c[4][0]) % 360} 82% 66% / ${0.8 * t})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a0) * s * 0.5, y + Math.sin(a0) * s * 0.5);
      ctx.lineTo(x + Math.cos(a1) * s * 0.5, y + Math.sin(a1) * s * 0.5);
      ctx.stroke();
    }
  },

  arcTrail(ctx, x, y, s, c, p) {
    ctx.strokeStyle = css(c[4], 0.85, 12); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y + s * 0.3, s * 0.6, -2.3, -0.84 * (0.4 + 0.6 * p)); ctx.stroke();
    const t2 = clamp((p - 0.3) / 0.7);
    for (let i = 0; i < 6 && t2 > 0; i++) {
      const a = -2.2 + (i / 6) * 1.3;
      ctx.fillStyle = css(c[4], 0.5 * t2, 8);
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * s * 0.6, y + s * 0.3 + Math.sin(a) * s * 0.6, s * 0.03, 0, TAU);
      ctx.fill();
    }
  },

  constellation(ctx, x, y, s, c, p, rng) {
    const n = 6, pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.sin(i * 3.3) * 0.5;
      const r = s * (0.22 + ((i * 37) % 10) / 10 * 0.32);
      pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.85 });
    }
    ctx.strokeStyle = css(c[4], 0.5, 8); ctx.lineWidth = 0.8;
    ctx.beginPath();
    const lim = Math.floor(n * p);
    pts.slice(0, lim + 1).forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
    ctx.stroke();
    pts.forEach((pt, i) => {
      const t = clamp((p - i / n) / 0.3); if (t <= 0) return;
      ctx.fillStyle = css(c[4], 0.9 * t, 18);
      ctx.beginPath(); ctx.arc(pt.x, pt.y, s * 0.032, 0, TAU); ctx.fill();
    });
  },

  bubbleSeal(ctx, x, y, s, c, p) {
    const r = s * 0.28 * clamp(p * 1.2);
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    g.addColorStop(0, css(c[4], 0.75, 22)); g.addColorStop(1, css(c[3], 0.35, 4));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = css(c[4], 0.6 * p, 20); ctx.lineWidth = 0.9; ctx.stroke();
  },

  heatMark(ctx, x, y, s, c, p) {
    for (let i = 4; i >= 0; i--) {
      const t = clamp((p - (4 - i) * 0.09) / 0.55); if (t <= 0) continue;
      const r = s * (0.14 + i * 0.09) * t;
      ctx.strokeStyle = `hsl(${(c[4][0] + i * 18) % 360} 75% ${62 - i * 4}% / ${0.55 - i * 0.07})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let k = 0; k <= 30; k++) {
        const a = (k / 30) * TAU;
        const wob = 1 + Math.sin(a * 3 + i) * 0.14;
        const px = x + Math.cos(a) * r * wob, py = y + Math.sin(a) * r * wob;
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.stroke();
    }
  },

  loopCircuit(ctx, x, y, s, c, p) {
    const pts = [[-0.45, -0.3], [0.2, -0.42], [0.48, 0.05], [0.1, 0.42], [-0.4, 0.26]];
    ctx.strokeStyle = css(c[4], 0.85, 14); ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
    ctx.beginPath();
    const total = pts.length;
    for (let i = 0; i <= total * p; i++) {
      const pt = pts[i % total];
      const X = x + pt[0] * s, Y = y + pt[1] * s;
      i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
    }
    if (p >= 0.999) ctx.closePath();
    ctx.stroke();
    pts.forEach((pt, i) => {
      const t = clamp((p - i / total) / 0.25); if (t <= 0) return;
      ctx.fillStyle = css(c[4], 0.8 * t, 18);
      ctx.beginPath(); ctx.arc(x + pt[0] * s, y + pt[1] * s, s * 0.035, 0, TAU); ctx.fill();
    });
  },

  moonArc(ctx, x, y, s, c, p) {
    ctx.fillStyle = css(c[4], 0.6 * p, 16);
    ctx.beginPath();
    ctx.arc(x, y, s * 0.42, 0.7, -0.7);
    ctx.arc(x + s * 0.2, y, s * 0.4, -0.85, 0.85, true);
    ctx.fill();
  },

  foldFan(ctx, x, y, s, c, p) {
    for (let i = 0; i < 5; i++) {
      const t = clamp((p - i * 0.12) / 0.5); if (t <= 0) continue;
      const a = -1.1 + (i / 4) * 2.2;
      ctx.strokeStyle = css(c[i % 2 ? 3 : 4], 0.6 * t, 8); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(x, y + s * 0.34);
      ctx.lineTo(x + Math.sin(a) * s * 0.5 * t, y + s * 0.34 - Math.cos(a) * s * 0.6 * t);
      ctx.stroke();
    }
  }
};

export function drawTrace(ctx, name, x, y, size, palette, phase, rng, arg) {
  const fn = TRACES[name] || TRACES.halo;
  ctx.save();
  fn(ctx, x, y, size, palette, clamp(phase), rng, arg);
  ctx.restore();
}
