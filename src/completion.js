// ─────────────────────────────────────────────────────────────
// The completion control. Time running out never completes a task —
// the person does, by tapping the mark the stage puts on screen.
//
// One tap is the whole gesture: the same in every world, so finishing a
// task is never a puzzle. The slower gesture families are kept below for
// worlds that ask for them. Pointer, touch and keyboard reach the same
// place, and the callback runs exactly once.
// ─────────────────────────────────────────────────────────────

import { clamp } from './util.js';

const HOLD_MS = 950;          // inside the 0.8–1.2s the spec asks for
const KEY_MS = 800;           // keyboard hold: the accessible path
const SETTLE_MS = 260;        // drag/anchor must come to rest, not just arrive
const DECAY = 0.0022;         // per ms; letting go rewinds instead of snapping back

export class CompletionControl {
  /**
   * @param {HTMLButtonElement} el transparent hit target laid over the canvas
   * @param {() => void} onComplete called once, ever
   */
  constructor(el, onComplete) {
    this.el = el;
    this.onComplete = onComplete;
    this.spec = null;         // geometry handed over by the active design
    this.t = 0;               // 0..1 gesture progress, for the design to draw
    this.pressing = false;
    this.pointer = null;      // { x, y } in canvas space
    this.grabbed = null;      // pointer offset at grab time
    this.holdStart = 0;
    this.settleStart = 0;
    this.traceHits = null;
    this.keyDown = false;
    this.keyStart = 0;
    this.fired = false;
    this.lastTick = performance.now();

    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('pointerleave', this.onLeave);
    el.addEventListener('keydown', this.onKeyDown);
    el.addEventListener('keyup', this.onKeyUp);
    el.addEventListener('blur', this.onKeyUp);
    el.addEventListener('click', (e) => {
      e.preventDefault();
      // Some browsers synthesise a click without a usable pointerup
      // (assistive tech, mouse emulation); honour it for the tap control.
      if (this.spec?.type === 'tap' && !this.fired && e.detail === 0) this.finish();
    });
  }

  /** Canvas-space position of a pointer event. */
  toLocal(e) {
    const r = this.el.ownerDocument.getElementById('stage').getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  onDown = (e) => {
    if (!this.spec || this.fired) return;
    this.el.setPointerCapture?.(e.pointerId);
    this.pressing = true;
    this.pointer = this.toLocal(e);
    this.holdStart = performance.now();
    this.settleStart = 0;
    if (this.spec.type === 'tap') this.t = Math.max(this.t, 0.5);
    if (this.spec.type === 'trace') this.traceHits = 0;
    if (this.spec.handle) {
      this.grabbed = { dx: this.pointer.x - this.spec.handle.x, dy: this.pointer.y - this.spec.handle.y };
    }
    e.preventDefault();
  };

  onMove = (e) => {
    if (!this.pressing) return;
    this.pointer = this.toLocal(e);
    e.preventDefault();
  };

  onUp = (e) => {
    const tap = this.pressing && this.spec?.type === 'tap';
    this.pressing = false;
    this.grabbed = null;
    this.settleStart = 0;
    // A tap counts when the finger lifts on the mark it went down on.
    if (tap && e && e.type === 'pointerup' && this.inHandle(this.toLocal(e))) this.finish();
  };

  onLeave = () => { if (!this.el.hasPointerCapture) this.onUp(); };

  onKeyDown = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    e.preventDefault();
    if (this.keyDown || this.fired || !this.spec) return;
    if (this.spec.type === 'tap') { this.finish(); return; }
    this.keyDown = true;
    this.keyStart = performance.now();
  };

  onKeyUp = (e) => {
    if (e && e.key && e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    this.keyDown = false;
  };

  /** Hand the controller this frame's affordance geometry, or null to hide it. */
  setSpec(spec) {
    if (!spec) {
      if (this.spec) { this.spec = null; this.reset(); }
      this.el.hidden = true;
      return;
    }
    const first = !this.spec;
    this.spec = spec;
    if (this.el.hidden) this.el.hidden = false;
    if (first) { this.t = 0; this.traceHits = 0; }

    // Position the hit target: the handle for gestures with one, the path
    // bounding box for traces. Never smaller than a comfortable touch target.
    const pad = 26;
    let x, y, w, h;
    if (spec.type === 'trace' && spec.path && spec.path.length) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of spec.path) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
      x = x0 - pad; y = y0 - pad; w = (x1 - x0) + pad * 2; h = (y1 - y0) + pad * 2;
    } else if (spec.type === 'tap') {
      const r = (spec.handle.r || 34) * 1.45;
      x = spec.handle.x - r; y = spec.handle.y - r; w = r * 2; h = r * 2;
    } else if (spec.type === 'drag' || spec.type === 'join' || spec.type === 'anchor' || spec.type === 'fold') {
      // cover both the handle and where it has to end up
      const tx = spec.target?.x ?? spec.handle.x, ty = spec.target?.y ?? spec.handle.y;
      const x0 = Math.min(spec.handle.x, tx), x1 = Math.max(spec.handle.x, tx);
      const y0 = Math.min(spec.handle.y, ty), y1 = Math.max(spec.handle.y, ty);
      x = x0 - pad * 1.6; y = y0 - pad * 1.6; w = (x1 - x0) + pad * 3.2; h = (y1 - y0) + pad * 3.2;
    } else {
      const r = Math.max(30, spec.handle.r || 34);
      x = spec.handle.x - r; y = spec.handle.y - r; w = r * 2; h = r * 2;
    }
    const s = this.el.style;
    s.left = `${Math.round(x)}px`; s.top = `${Math.round(y)}px`;
    s.width = `${Math.round(Math.max(48, w))}px`; s.height = `${Math.round(Math.max(48, h))}px`;
  }

  /** Is this point on the tappable mark? Generous: fingers are not precise. */
  inHandle(p) {
    const h = this.spec?.handle;
    return !!h && Math.hypot(p.x - h.x, p.y - h.y) <= (h.r || 34) * 1.45;
  }

  /** Complete, once. */
  finish() {
    if (this.fired || !this.spec) return;
    this.fired = true;
    this.t = 1;
    this.onComplete();
  }

  reset() { this.t = 0; this.pressing = false; this.keyDown = false; this.traceHits = 0; }

  /** Advance the gesture. Returns the 0..1 value for the design to draw. */
  tick(now = performance.now()) {
    const dt = Math.min(64, now - this.lastTick);
    this.lastTick = now;
    if (!this.spec || this.fired) return this.t;
    const spec = this.spec;
    let target = null;          // where t should head this frame

    if (spec.type === 'tap') {
      // the mark only brightens under the finger; the lift does the rest
      target = this.pressing ? 1 : 0;
      this.t = target ? Math.min(1, this.t + dt / 120) : Math.max(0, this.t - DECAY * dt * 2.4);
      return this.t;
    }

    if (this.keyDown) {
      target = clamp((now - this.keyStart) / KEY_MS);
    } else if (this.pressing && this.pointer) {
      const p = this.pointer;
      switch (spec.type) {
        case 'hold': {
          const near = dist(p, spec.handle) <= (spec.handle.r || 40) * 1.9;
          target = near ? clamp((now - this.holdStart) / HOLD_MS) : this.t - 0.0001;
          break;
        }
        case 'drag': case 'join': case 'anchor': {
          const h = spec.handle, tg = spec.target;
          const hx = p.x - (this.grabbed?.dx || 0), hy = p.y - (this.grabbed?.dy || 0);
          const total = Math.max(1, dist(h, tg));
          const left = dist({ x: hx, y: hy }, tg);
          const reach = clamp(1 - left / total);
          const snap = (spec.snap || 42);
          if (left <= snap) {
            // arrived — it still has to come to rest before it counts
            if (!this.settleStart) this.settleStart = now;
            target = 0.72 + 0.28 * clamp((now - this.settleStart) / SETTLE_MS);
          } else {
            this.settleStart = 0;
            target = reach * 0.72;
          }
          this.dragPos = { x: hx, y: hy };
          break;
        }
        case 'fold': {
          const h = spec.handle, tg = spec.target;
          const ax = tg.x - h.x, ay = tg.y - h.y;
          const len2 = ax * ax + ay * ay || 1;
          const proj = ((p.x - h.x) * ax + (p.y - h.y) * ay) / len2;
          target = clamp(proj) * 0.92 + (clamp(proj) >= 0.92 ? 0.08 : 0);
          this.dragPos = { x: h.x + ax * clamp(proj), y: h.y + ay * clamp(proj) };
          break;
        }
        case 'trace': {
          const pts = spec.path;
          const want = this.traceHits || 0;
          let hits = want;
          // checkpoints must be taken in order, so a scribble will not do
          while (hits < pts.length && dist(p, pts[hits]) < (spec.tolerance || 46)) hits++;
          this.traceHits = hits;
          target = clamp(hits / pts.length);
          break;
        }
        default: target = this.t;
      }
    }

    if (target === null || target === undefined) {
      this.t = Math.max(0, this.t - DECAY * dt);      // release = unwind, gently
      if (spec.type === 'trace' && this.t < 0.02) this.traceHits = 0;
    } else {
      // never jump forward: the gesture should feel like it has weight
      this.t = target > this.t ? Math.min(target, this.t + dt / 220) : Math.max(target, this.t - DECAY * dt * 1.6);
    }

    if (this.t >= 0.999 && !this.fired) {
      this.fired = true;
      this.t = 1;
      this.onComplete();
    }
    return this.t;
  }
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
