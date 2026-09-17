// ─────────────────────────────────────────────────────────────
// The task screen.
//
// A photograph, changed every three seconds, and a thin bar along the
// bottom that fills as the task runs. Nothing counts down and nothing is
// measured in figures: the bar is small on purpose, because it only has
// to be glanced at, and the picture is what the room is looking at.
//
// The pictures come from people who post them; the loader in photos.js
// says where from and how it behaves when the network is not there. If
// no photo has arrived, this screen is simply dark, which is what it was
// before, and everything still works.
// ─────────────────────────────────────────────────────────────

import { clamp, css, TAU } from './util.js';
import { createPhotos, cover } from './photos.js';

const SWAP = 3;          // seconds each photo is held
const FADE = 0.9;        // seconds of cross-fade between two photos

export const bar = {
  ownPaused: true,

  init(env) {
    const tag = Math.floor(env.rng() * 1e9).toString(36);
    return { photos: createPhotos(tag, env.rng), now: null, prev: null, at: -1e9 };
  },

  draw(env) {
    const { ctx, w, h, st, clock, reduced, time } = env;
    if (!clock) return;

    const U = Math.min(w, h);
    const ink = [216, 12, 92];
    const dim = [216, 14, 26];
    const col = clock.color;
    const state = clock.state;
    const p = clamp(clock.progress);
    const F = (weight, px) =>
      `${weight} ${Math.round(px)}px Inter, system-ui, "Hiragino Sans", sans-serif`;

    // ── the pictures ──
    // Only while the task is actually running: there is no reason to
    // spend a phone's data on a screen nobody is sitting in front of.
    const wants = state !== 'dormant';
    if (wants) {
      // Asked for at about two thirds of the screen's pixels: these sit
      // behind a scrim and are dimmed, so the difference cannot be seen,
      // and it is a third of the data on a phone.
      const dpr = Math.min(2, devicePixelRatio || 1) * 0.66;
      st.photos.pump(Math.min(900, Math.round(w * dpr)), Math.min(1600, Math.round(h * dpr)));
      if (time - st.at >= SWAP || !st.now) {
        const next = st.photos.take();
        if (next && next !== st.now) {
          st.prev = st.now;
          st.now = next;
          st.at = time;
        }                               // nothing yet: try again next frame
      }
    }

    // ── ground ──
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, css([220, 22, 7]));
    bg.addColorStop(1, css([224, 26, 4]));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const held = state === 'paused';
    const shade = held ? 0.34 : state === 'closing' ? 0.42 : 1;
    if (st.now) {
      const age = time - st.at;
      const inAlpha = clamp(age / FADE);
      // the one going out, underneath
      if (st.prev && inAlpha < 1) {
        ctx.globalAlpha = shade;
        cover(ctx, st.prev, w, h, reduced ? 1 : 1 + Math.min(0.05, (age + SWAP) * 0.008));
      }
      ctx.globalAlpha = shade * (st.prev ? inAlpha : 1);
      // a slow drift, so a still picture does not look like a frozen screen
      cover(ctx, st.now, w, h, reduced ? 1 : 1 + Math.min(0.05, age * 0.008));
      ctx.globalAlpha = 1;

      // enough shade at top and bottom to keep the lettering readable
      const top = ctx.createLinearGradient(0, 0, 0, h * 0.22);
      top.addColorStop(0, 'rgba(0,0,0,.62)');
      top.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = top;
      ctx.fillRect(0, 0, w, h * 0.22);
      const foot = ctx.createLinearGradient(0, h, 0, h * 0.74);
      foot.addColorStop(0, 'rgba(0,0,0,.70)');
      foot.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = foot;
      ctx.fillRect(0, h * 0.74, w, h * 0.26);
    } else {
      // no picture yet: the task's colour, faintly, so the screen is not blank
      const wash = ctx.createRadialGradient(w / 2, h * 0.46, 0, w / 2, h * 0.46, Math.max(w, h) * 0.7);
      wash.addColorStop(0, css(col, 0.12));
      wash.addColorStop(1, css(col, 0));
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, w, h);
    }

    const photo = !!st.now;
    ctx.textBaseline = 'middle';

    // ── the name of the task ──
    // Large in the middle when there is no picture to look at; a caption
    // in the corner when there is, clear of the buttons on the right.
    const big = !photo || state === 'closing';
    const title = state === 'closing' ? 'WELL DONE' : clock.taskName;
    const latin = /^[\x20-\x7e]+$/.test(title);
    let size = U * (big ? (latin ? 0.145 : 0.115) : 0.055);
    ctx.letterSpacing = latin ? '0.10em' : '0.04em';
    ctx.font = F(600, size);
    const room = big ? w * 0.86 : w * 0.46;
    while (ctx.measureText(title).width > room && size > U * 0.042) {
      size *= 0.94;
      ctx.font = F(600, size);
    }
    ctx.textAlign = big ? 'center' : 'left';
    const tx = big ? w / 2 : w * 0.06;
    const ty = big ? h * 0.42 : h * 0.078;
    if (photo) {
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillText(title, tx, ty + Math.max(1.5, U * 0.005));
    }
    ctx.fillStyle = state === 'dormant' ? css(ink, 0.34)
      : big ? css(col, 0.97, 22)
      : css(ink, 0.95);
    ctx.fillText(title, tx, ty);
    ctx.letterSpacing = '0px';
    ctx.textAlign = 'center';

    // ── the bar ──
    // A thin line along the foot of the screen when there is a picture
    // behind it; the whole subject of the screen when there is not.
    const small = photo;
    const bx = small ? w * 0.05 : w * 0.09;
    const bw = w - bx * 2;
    const bh = small ? Math.max(5, U * 0.016) : Math.max(12, U * 0.046);
    const by = (small ? h * 0.955 : h * 0.53) - bh / 2;
    const r = bh / 2;

    ctx.fillStyle = small ? 'rgba(255,255,255,.2)' : css(dim, 1);
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, r); ctx.fill();

    if (p > 0.0005) {
      const fw = Math.max(bh, bw * p);
      const grd = ctx.createLinearGradient(bx, 0, bx + fw, 0);
      grd.addColorStop(0, css(col, 1, -6));
      grd.addColorStop(1, css(col, 1, 14));
      ctx.fillStyle = held ? css(col, 0.5) : grd;
      ctx.beginPath(); ctx.roundRect(bx, by, fw, bh, r); ctx.fill();

      if (state === 'live' && !reduced && !small) {
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
    if (held) {
      if (photo) {
        const veil = ctx.createRadialGradient(w / 2, h * 0.67, 0, w / 2, h * 0.67, U * 0.62);
        veil.addColorStop(0, 'rgba(0,0,0,.6)');
        veil.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = veil;
        ctx.fillRect(0, h * 0.42, w, h * 0.5);
      }
      ctx.font = F(500, U * 0.070);
      ctx.fillStyle = css(ink, 0.9);
      ctx.fillText('PAUSED', w / 2, h * 0.645);
      ctx.font = F(400, U * 0.046);
      ctx.fillStyle = css(ink, 0.5);
      ctx.fillText('Tap to resume', w / 2, h * 0.705);
    } else if (state === 'dormant') {
      ctx.font = F(400, U * 0.050);
      ctx.fillStyle = css(ink, 0.34);
      ctx.fillText('Not started', w / 2, h * 0.645);
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
