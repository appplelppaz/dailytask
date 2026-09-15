// ─────────────────────────────────────────────────────────────
// The stage. Owns the canvas, the frame loop and the seeded
// environment every engine draws into — plus the two things that sit
// on top of the world: the completion affordance and, afterwards,
// the trace.
// ─────────────────────────────────────────────────────────────

import { ENGINES } from './engines.js';
import { drawTrace } from './traces.js';
import { makeRng, hashString, clamp, css, glow, TAU } from './util.js';

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
    this.pausedAt = 0;          // ambient movement stops while the night is held
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

  /** Hold or release the world's own slow movement. */
  setPaused(on) {
    this.state.paused = !!on;
    if (on && !this.pausedAt) this.pausedAt = performance.now();
    else if (!on && this.pausedAt) { this.t0 += performance.now() - this.pausedAt; this.pausedAt = 0; }
  }

  markCompleted(now = performance.now()) {
    if (!this.completedAt) this.completedAt = now;
  }

  frame(now) {
    if (!this.engine || !this.w) return;
    const env = this.env;
    env.p = clamp(this.state.progress);
    env.time = ((this.pausedAt || now) - this.t0) / 1000;
    env.reduced = this.reduced;
    env.w = this.w; env.h = this.h;

    this.engine.draw(env);
    this.anchors = this.engine.anchors(env);

    if (this.state.paused) this.drawPaused(env);

    const done = this.state.completed;
    if (!done && this.state.canComplete) this.drawAffordance(env);
    if (done) {
      if (!this.completedAt) this.completedAt = now;
      const phase = this.reduced ? 1 : clamp((now - this.completedAt) / TRACE_MS);
      const spot = this.tracePoint();
      const size = Math.min(this.w, this.h) * 0.17;
      drawTrace(this.ctx, this.design.mark, spot.x, spot.y, size, this.design.pal, phase, this.rng);
    }
  }

  /**
   * Being held still has to be unmistakable — a stopped world and a slow one
   * look alike, and a routine that quietly is not running is worse than an
   * ugly overlay.
   */
  drawPaused(env) {
    const { ctx, w, h } = this;
    const pal = this.design.pal;
    ctx.save();
    const veil = ctx.createRadialGradient(w / 2, h * 0.5, 0, w / 2, h * 0.5, Math.hypot(w, h) * 0.55);
    veil.addColorStop(0, css(pal[0], 0.44));
    veil.addColorStop(1, css(pal[0], 0.7));
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, w, h);

    const r = Math.min(w, h) * 0.085;
    glow(ctx, w / 2, h * 0.5, r * 2.6, pal[4], 0.16);
    ctx.strokeStyle = css(pal[4], 0.42, 8);
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(w / 2, h * 0.5, r, 0, TAU); ctx.stroke();

    ctx.fillStyle = css(pal[4], 0.72, 12);
    const bw = r * 0.16, bh = r * 0.62, gap = r * 0.2;
    ctx.beginPath();
    ctx.roundRect(w / 2 - gap - bw, h * 0.5 - bh / 2, bw, bh, bw * 0.4);
    ctx.roundRect(w / 2 + gap, h * 0.5 - bh / 2, bw, bh, bw * 0.4);
    ctx.fill();
    ctx.restore();
  }

  tracePoint() {
    const a = this.anchors || { rest: { x: this.w / 2, y: this.h / 2 } };
    const t = this.design.completion.type;
    if (t === 'hold') return a.head;
    if (t === 'trace') return a.path[a.path.length - 1];
    return a.rest;
  }

  /**
   * The way out of a task: one obvious, tappable mark. It is the same in
   * every world on purpose — a person finishing a task at 23:40 should not
   * have to work out what this world wants from them.
   */
  tapSpot() {
    const w = this.w, h = this.h;
    const r = Math.max(30, Math.min(44, Math.min(w, h) * 0.078));
    return { x: w / 2, y: Math.min(h * 0.74, h - (r * 2 + 96)), r };
  }

  drawAffordance(env) {
    const { ctx } = this;
    const s = this.tapSpot();
    const g = clamp(this.state.gesture);
    const breathe = this.reduced ? 0 : 0.5 + 0.5 * Math.sin(env.time * 1.6);
    const r = s.r * (1 - g * 0.06);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // a halo, so the mark survives whatever is painted underneath it
    const halo = ctx.createRadialGradient(s.x, s.y, r * 0.6, s.x, s.y, r * 2.5);
    halo.addColorStop(0, 'rgba(0,0,0,.52)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(s.x, s.y, r * 2.5, 0, TAU); ctx.fill();

    // one slow ring going out, the only movement here
    if (!this.reduced) {
      ctx.strokeStyle = `rgba(255,255,255,${0.2 * (1 - breathe)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(s.x, s.y, r * (1 + breathe * 0.32), 0, TAU); ctx.stroke();
    }

    // the disc
    ctx.fillStyle = `rgba(10,12,16,${0.72 + g * 0.2})`;
    ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.62 + g * 0.35})`;
    ctx.lineWidth = 1.6 + g * 1.4;
    ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.stroke();

    // the mark: a check, drawn on press
    const k = r * 0.46;
    const a = { x: s.x - k * 0.92, y: s.y + k * 0.06 };
    const b = { x: s.x - k * 0.24, y: s.y + k * 0.68 };
    const c = { x: s.x + k * 0.94, y: s.y - k * 0.62 };
    ctx.strokeStyle = `rgba(255,255,255,${0.82 + g * 0.18})`;
    ctx.lineWidth = Math.max(2.4, r * 0.11);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y);
    ctx.stroke();

    ctx.restore();
  }

  /** Geometry for the hit target: one circle, whatever the world is. */
  affordanceSpec() {
    if (!this.state.canComplete || this.state.completed) return null;
    return { type: 'tap', handle: this.tapSpot() };
  }
}
