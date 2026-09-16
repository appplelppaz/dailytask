// ─────────────────────────────────────────────────────────────
// The task screen.
//
// One bar, filling. Nothing counts down, nothing is measured in
// figures — you look at it and see how far along you are, the way you
// read a glass of water.
//
// Everything on this screen is set large on purpose: it is looked at
// from across a room, at night, at a glance, and a small figure that
// has to be squinted at is worse than no figure at all.
// ─────────────────────────────────────────────────────────────

import { clamp, css, TAU } from './util.js';

export const bar = {
  ownPaused: true,

  init() { return {}; },

  draw(env) {
    const { ctx, w, h, clock, reduced, time } = env;
    if (!clock) return;

    const U = Math.min(w, h);
    const ink = [216, 12, 92];
    const dim = [216, 14, 26];
    const col = clock.color;
    const state = clock.state;
    const p = clamp(clock.progress);
    const F = (weight, px) =>
      `${weight} ${Math.round(px)}px Inter, system-ui, "Hiragino Sans", sans-serif`;

    // ── ground ──
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, css([220, 22, 7]));
    bg.addColorStop(1, css([224, 26, 4]));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    const wash = ctx.createRadialGradient(w / 2, h * 0.46, 0, w / 2, h * 0.46, Math.max(w, h) * 0.7);
    wash.addColorStop(0, css(col, 0.12));
    wash.addColorStop(1, css(col, 0));
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // ── the name of the task, big enough to read from the piano ──
    const title = state === 'closing' ? 'おつかれさま' : clock.taskName;
    const latin = /^[\x20-\x7e]+$/.test(title);
    let size = U * (latin ? 0.145 : 0.115);
    ctx.letterSpacing = latin ? '0.10em' : '0.04em';
    ctx.font = F(600, size);
    while (ctx.measureText(title).width > w * 0.86 && size > U * 0.06) {
      size *= 0.94;
      ctx.font = F(600, size);
    }
    ctx.fillStyle = state === 'dormant' ? css(ink, 0.34)
      : state === 'paused' ? css(ink, 0.5)
      : css(col, 0.97, 22);
    ctx.fillText(title, w / 2, h * 0.42);
    ctx.letterSpacing = '0px';

    // ── the bar ──
    const bx = w * 0.09, bw = w * 0.82, bh = Math.max(12, U * 0.046);
    const by = h * 0.53 - bh / 2;
    const r = bh / 2;

    ctx.fillStyle = css(dim, 1);
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, r); ctx.fill();

    if (p > 0.0005) {
      const fw = Math.max(bh, bw * p);
      const grd = ctx.createLinearGradient(bx, 0, bx + fw, 0);
      grd.addColorStop(0, css(col, 1, -6));
      grd.addColorStop(1, css(col, 1, 14));
      ctx.fillStyle = state === 'paused' ? css(col, 0.45) : grd;
      ctx.beginPath(); ctx.roundRect(bx, by, fw, bh, r); ctx.fill();

      // a soft light at the head of the fill, the only movement here
      if (state === 'live' && !reduced) {
        const breathe = 0.5 + 0.5 * Math.sin(time * 1.4);
        const gx = bx + fw;
        const glow = ctx.createRadialGradient(gx, by + bh / 2, 0, gx, by + bh / 2, bh * 1.9);
        glow.addColorStop(0, css(col, 0.24 + breathe * 0.18, 26));
        glow.addColorStop(1, css(col, 0));
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(gx, by + bh / 2, bh * 1.9, 0, TAU); ctx.fill();
      }
    }

    // ── a word, only when there is one worth saying ──
    if (state === 'paused') {
      ctx.font = F(500, U * 0.070);
      ctx.fillStyle = css(ink, 0.82);
      ctx.fillText('一時停止中', w / 2, h * 0.645);
      ctx.font = F(400, U * 0.046);
      ctx.fillStyle = css(ink, 0.42);
      ctx.fillText('タップで再開', w / 2, h * 0.705);
    } else if (state === 'dormant') {
      ctx.font = F(400, U * 0.050);
      ctx.fillStyle = css(ink, 0.34);
      ctx.fillText('開始前', w / 2, h * 0.645);
    }

    ctx.textBaseline = 'alphabetic';
  },

  /** The mark to finish with: as big as a thumb expects. */
  tapSpot(env) {
    const { w, h } = env;
    return { x: w / 2, y: h * 0.70, r: Math.max(38, Math.min(56, Math.min(w, h) * 0.105)) };
  },

  anchors(env) {
    const { w, h } = env;
    const y = h * 0.70, x = w / 2;
    const path = [];
    for (let i = 0; i <= 6; i++) path.push({ x: x - w * 0.16 + (i / 6) * w * 0.16, y });
    return { head: path[0], rest: { x, y }, path };
  }
};
