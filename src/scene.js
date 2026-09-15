// ─────────────────────────────────────────────────────────────
// The stage. Owns the canvas, the frame loop and the seeded
// environment every engine draws into — plus the two things that sit
// on top of the world: the completion affordance and, afterwards,
// the trace.
// ─────────────────────────────────────────────────────────────

import { ENGINES } from './engines.js';
import { drawTrace } from './traces.js';
import { makeRng, hashString, clamp, css, glow, TAU, lerp } from './util.js';

const TRACE_MS = 700;        // 400–900ms, then it simply stays

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.design = null;
    this.state = { progress: 0, canComplete: false, completed: false, gesture: 0 };
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', (e) => {
      this.reduced = e.matches; this.rebuild();
    });
    this.t0 = performance.now();
    this.completedAt = 0;
    this.anchors = null;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = this.canvas.clientWidth || innerWidth;
    const h = this.canvas.clientHeight || innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.w = w; this.h = h; this.dpr = dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.rebuild();
  }

  /** Swap in a world. `sessionId` seeds it, so a reload is the same place. */
  setDesign(design, sessionId) {
    if (this.design && this.design.id === design.id && this.sessionId === sessionId) return;
    this.design = design;
    this.sessionId = sessionId;
    this.rebuild();
  }

  rebuild() {
    if (!this.design || !this.w) return;
    const engine = ENGINES[this.design.engine];
    this.engine = engine;
    this.rng = makeRng(hashString((this.sessionId || 'seed') + ':' + this.design.id));
    this.env = {
      ctx: this.ctx, w: this.w, h: this.h,
      rng: this.rng, pal: this.design.pal, prm: this.design.prm,
      p: 0, time: 0, reduced: this.reduced, design: this.design
    };
    this.env.st = engine.init(this.env);
  }

  markCompleted(now = performance.now()) {
    if (!this.completedAt) this.completedAt = now;
  }

  frame(now) {
    if (!this.engine || !this.w) return;
    const env = this.env;
    env.p = clamp(this.state.progress);
    env.time = (now - this.t0) / 1000;
    env.reduced = this.reduced;
    env.w = this.w; env.h = this.h;

    this.engine.draw(env);
    this.anchors = this.engine.anchors(env);

    const done = this.state.completed;
    if (!done && this.state.canComplete) this.drawAffordance(env);
    if (done) {
      if (!this.completedAt) this.completedAt = now;
      const phase = this.reduced ? 1 : clamp((now - this.completedAt) / TRACE_MS);
      const spot = this.tracePoint();
      const size = Math.min(this.w, this.h) * 0.2;
      drawTrace(this.ctx, this.design.mark, spot.x, spot.y, size, this.design.pal, phase, this.rng);
    }
  }

  tracePoint() {
    const a = this.anchors || { rest: { x: this.w / 2, y: this.h / 2 } };
    const t = this.design.completion.type;
    if (t === 'hold') return a.head;
    if (t === 'trace') return a.path[a.path.length - 1];
    return a.rest;
  }

  /** The way in. Drawn in the world's own palette, never as a button. */
  drawAffordance(env) {
    const { ctx } = this;
    const a = this.anchors;
    const pal = this.design.pal;
    const type = this.design.completion.type;
    const g = clamp(this.state.gesture);
    const pulse = this.reduced ? 0.6 : 0.5 + 0.5 * Math.sin(env.time * 1.7);

    ctx.save();
    ctx.lineCap = 'round';

    if (type === 'trace') {
      ctx.setLineDash(this.reduced ? [] : [2, 9]);
      ctx.strokeStyle = css(pal[4], 0.3 + pulse * 0.2, 10);
      ctx.lineWidth = this.reduced ? 2.2 : 1.4;
      ctx.beginPath();
      a.path.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.stroke();
      ctx.setLineDash([]);
      // the part already followed warms up
      const lim = Math.max(1, Math.round(a.path.length * g));
      ctx.strokeStyle = css(pal[4], 0.85, 16);
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      a.path.slice(0, lim).forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.stroke();
      const head = a.path[0];
      glow(ctx, head.x, head.y, 26 + pulse * 6, pal[4], 0.3);
    } else if (type === 'hold') {
      const r = 26 + pulse * 3;
      glow(ctx, a.head.x, a.head.y, r * 2.4, pal[4], 0.2 + g * 0.3);
      ctx.strokeStyle = css(pal[4], 0.45 + g * 0.5, 12);
      ctx.lineWidth = this.reduced ? 1.4 + g * 4 : 1.6 + g * 2.6;
      ctx.beginPath(); ctx.arc(a.head.x, a.head.y, r, 0, TAU); ctx.stroke();
      // the hold reads as the shape closing around itself
      ctx.strokeStyle = css(pal[4], 0.95, 20);
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.arc(a.head.x, a.head.y, r, -Math.PI / 2, -Math.PI / 2 + TAU * g); ctx.stroke();
    } else {
      const from = this.gestureFrom(a, g, type);
      ctx.strokeStyle = css(pal[4], 0.22 + pulse * 0.12, 6);
      ctx.lineWidth = 1.1;
      ctx.setLineDash(this.reduced ? [] : [3, 7]);
      ctx.beginPath(); ctx.moveTo(a.head.x, a.head.y); ctx.lineTo(a.rest.x, a.rest.y); ctx.stroke();
      ctx.setLineDash([]);
      // destination
      ctx.strokeStyle = css(pal[4], 0.4 + g * 0.5, 8);
      ctx.lineWidth = 1.4 + g * 1.6;
      ctx.beginPath(); ctx.arc(a.rest.x, a.rest.y, 16 + (1 - g) * 8, 0, TAU); ctx.stroke();
      // the thing in hand
      glow(ctx, from.x, from.y, 26, pal[4], 0.3 + g * 0.3);
      ctx.fillStyle = css(pal[4], 0.9, 16);
      ctx.beginPath(); ctx.arc(from.x, from.y, 7 + g * 2, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  gestureFrom(a, g, type) {
    if (type === 'fold') return { x: lerp(a.head.x, a.rest.x, g), y: lerp(a.head.y, a.rest.y, g) };
    const k = Math.min(1, g / 0.72);
    return { x: lerp(a.head.x, a.rest.x, k), y: lerp(a.head.y, a.rest.y, k) };
  }

  /** Geometry for the hit target, in the shape the gesture needs. */
  affordanceSpec() {
    if (!this.anchors || !this.state.canComplete || this.state.completed) return null;
    const a = this.anchors;
    const type = this.design.completion.type;
    if (type === 'trace') return { type, path: a.path, tolerance: 48 };
    if (type === 'hold') return { type, handle: { ...a.head, r: 34 } };
    return { type, handle: { ...a.head, r: 30 }, target: a.rest, snap: 44 };
  }
}
