// ─────────────────────────────────────────────────────────────
// The task screen.
//
// One job: say how far into the task you are and how much of it is
// left, so that both are legible at arm's length in a dark room.
//
//   The ring is the task. The lit arc is what has gone, the dim arc is
//   what remains, and the number in the middle is the time left.
//   The bar under it is the same thing again, laid flat, with the time
//   gone on the left and the time left on the right.
//   The strip at the bottom is the whole night — six blocks, sized by
//   how long each task runs, with tonight's position marked on it.
//
// Everything is drawn in the colour of the task being worked on, so the
// six tasks are told apart at a glance and match the colours in the
// record.
// ─────────────────────────────────────────────────────────────

import { clamp, css, lerp, TAU } from './util.js';

const RING_W = 0.055;      // of the ring's diameter

/** m:ss, or h:mm:ss once there is an hour of it. */
export function hms(sec) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}

export const timer = {
  // the screen says "一時停止中" itself, so the stage must not also veil it
  ownPaused: true,

  init() { return {}; },

  draw(env) {
    const { ctx, w, h, clock, reduced, time } = env;
    if (!clock) return;

    const ink = [218, 14, 92];
    const dim = [218, 12, 34];
    const col = clock.color;
    const live = clock.state === 'live';
    const paused = clock.state === 'paused';

    // ── ground ──
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, css([220, 22, 7]));
    bg.addColorStop(1, css([224, 26, 4]));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    // the task's colour, very faintly, behind everything
    const wash = ctx.createRadialGradient(w / 2, h * 0.40, 0, w / 2, h * 0.40, Math.max(w, h) * 0.7);
    wash.addColorStop(0, css(col, 0.10));
    wash.addColorStop(1, css(col, 0));
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const F = (weight, px, mono) =>
      `${weight} ${Math.round(px)}px ${mono ? '"JetBrains Mono", ui-monospace, monospace'
                                            : 'Inter, system-ui, "Hiragino Sans", sans-serif'}`;
    const U = Math.min(w, h);

    // ── which task, and where it sits in the six ──
    ctx.font = F(600, U * 0.062);
    ctx.fillStyle = css(col, 0.95, 18);
    ctx.letterSpacing = '0.18em';
    ctx.fillText(clock.taskName, w / 2, h * 0.135);
    ctx.letterSpacing = '0px';

    const dotY = h * 0.188, gap = U * 0.052;
    const x0 = w / 2 - gap * (clock.tasks.length - 1) / 2;
    for (let i = 0; i < clock.tasks.length; i++) {
      const t = clock.tasks[i];
      const x = x0 + i * gap;
      const here = i === clock.taskIndex;
      ctx.beginPath();
      ctx.arc(x, dotY, U * (here ? 0.016 : 0.011), 0, TAU);
      ctx.fillStyle = t.done ? css(t.color, 0.95) : here ? css(col, 0.95) : css(dim, 1);
      ctx.fill();
      if (here) {
        ctx.strokeStyle = css(col, 0.5);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, dotY, U * 0.028, 0, TAU); ctx.stroke();
      }
    }

    // ── the ring ──
    const cx = w / 2, cy = h * 0.465, R = U * 0.30;
    const lw = R * 2 * RING_W;
    ctx.lineCap = 'round';

    ctx.strokeStyle = css(dim, 1);
    ctx.lineWidth = lw;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();

    const p = clamp(clock.progress);
    if (p > 0.0005) {
      const a0 = -Math.PI / 2, a1 = a0 + TAU * p;
      const grd = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      grd.addColorStop(0, css(col, 0.75, -8));
      grd.addColorStop(1, css(col, 1, 8));
      ctx.strokeStyle = grd;
      ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.stroke();
      // the head, so the ring is never quite still
      const hx = cx + Math.cos(a1) * R, hy = cy + Math.sin(a1) * R;
      if (live && !reduced) {
        const b = 0.5 + 0.5 * Math.sin(time * 2.2);
        ctx.fillStyle = css(col, 0.18 + b * 0.16);
        ctx.beginPath(); ctx.arc(hx, hy, lw * (1.1 + b * 0.5), 0, TAU); ctx.fill();
      }
      ctx.fillStyle = css(col, 1, 22);
      ctx.beginPath(); ctx.arc(hx, hy, lw * 0.52, 0, TAU); ctx.fill();
    }

    // ── what the ring says ──
    if (clock.state === 'dormant') {
      ctx.font = F(300, U * 0.040);
      ctx.fillStyle = css(ink, 0.45);
      ctx.fillText('開始まで', cx, cy - U * 0.085);
      ctx.font = F(300, U * 0.155, true);
      ctx.fillStyle = css(ink, 0.9);
      ctx.fillText(hms(clock.startsInSec), cx, cy + U * 0.012);
      ctx.font = F(400, U * 0.036);
      ctx.fillStyle = css(ink, 0.4);
      ctx.fillText(clock.startsAtLabel + ' 開始', cx, cy + U * 0.11);
    } else if (clock.state === 'closing') {
      ctx.font = F(400, U * 0.046);
      ctx.fillStyle = css(col, 0.85, 14);
      ctx.fillText('おつかれさま', cx, cy - U * 0.045);
      ctx.font = F(300, U * 0.085, true);
      ctx.fillStyle = css(ink, 0.9);
      ctx.fillText(hms(clock.durSec), cx, cy + U * 0.045);
      ctx.font = F(400, U * 0.034);
      ctx.fillStyle = css(ink, 0.42);
      ctx.fillText('完了', cx, cy + U * 0.115);
    } else {
      ctx.font = F(300, U * 0.040);
      ctx.fillStyle = css(ink, 0.45);
      ctx.fillText('のこり', cx, cy - U * 0.085);
      ctx.font = F(300, U * 0.155, true);
      ctx.fillStyle = css(ink, paused ? 0.45 : 0.94);
      ctx.fillText(hms(clock.remainingSec), cx, cy + U * 0.012);
      ctx.font = F(400, U * 0.036, true);
      ctx.fillStyle = css(ink, 0.4);
      ctx.fillText(`${Math.round(p * 100)}%　${hms(clock.durSec)}`, cx, cy + U * 0.11);
    }

    // ── the same thing flat, the way a video shows it ──
    const bx = w * 0.09, bw = w * 0.82, by = h * 0.725, bh = Math.max(6, U * 0.018);
    ctx.fillStyle = css(dim, 1);
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, bh / 2); ctx.fill();
    if (p > 0.001) {
      ctx.fillStyle = css(col, 1);
      ctx.beginPath(); ctx.roundRect(bx, by, Math.max(bh, bw * p), bh, bh / 2); ctx.fill();
      ctx.fillStyle = css(col, 1, 26);
      ctx.beginPath(); ctx.arc(bx + bw * p, by + bh / 2, bh * 0.95, 0, TAU); ctx.fill();
    }
    ctx.font = F(400, U * 0.036, true);
    ctx.textAlign = 'left';
    ctx.fillStyle = css(ink, 0.6);
    ctx.fillText(hms(clock.elapsedSec), bx, by + bh * 3.1);
    ctx.textAlign = 'right';
    ctx.fillStyle = css(ink, 0.6);
    ctx.fillText('-' + hms(clock.remainingSec), bx + bw, by + bh * 3.1);

    // ── the whole night ──
    const ny = h * 0.805, nh = Math.max(5, U * 0.014);
    let nx = bx;
    for (let i = 0; i < clock.tasks.length; i++) {
      const t = clock.tasks[i];
      const seg = bw * (t.durSec / clock.nightTotal);
      const pad = i ? 2 : 0;
      const done = i < clock.taskIndex || t.done;
      ctx.fillStyle = done ? css(t.color, 0.85)
        : i === clock.taskIndex ? css(dim, 1, 6) : css(dim, 1);
      ctx.beginPath();
      ctx.roundRect(nx + pad, ny, Math.max(2, seg - pad), nh, nh / 2);
      ctx.fill();
      // the part of the running task that is done
      if (i === clock.taskIndex && clock.state !== 'dormant') {
        ctx.fillStyle = css(t.color, 0.9);
        ctx.beginPath();
        ctx.roundRect(nx + pad, ny, Math.max(2, (seg - pad) * p), nh, nh / 2);
        ctx.fill();
      }
      nx += seg;
    }
    ctx.fillStyle = css(ink, 0.9);
    const markX = bx + bw * clamp(clock.nightProgress);
    ctx.beginPath();
    ctx.moveTo(markX, ny - nh * 0.5);
    ctx.lineTo(markX + nh * 0.42, ny - nh * 1.3);
    ctx.lineTo(markX - nh * 0.42, ny - nh * 1.3);
    ctx.closePath(); ctx.fill();

    ctx.textAlign = 'left';
    ctx.font = F(400, U * 0.030);
    ctx.fillStyle = css(ink, 0.34);
    ctx.fillText('今夜　のこり ' + hms(clock.nightRemainingSec), bx, ny + nh * 3.4);
    if (clock.nextName) {
      ctx.textAlign = 'right';
      ctx.fillStyle = css(ink, 0.34);
      ctx.fillText(`つぎ ${clock.nextName} ${clock.nextAtLabel}`, bx + bw, ny + nh * 3.4);
    }

    // ── held ──
    // A stopped clock and a slow one look alike, so say it plainly — but
    // keep the numbers readable underneath, which is the whole point of
    // being able to see them.
    if (paused) {
      ctx.textAlign = 'center';
      const gy = h * 0.676, s = U * 0.026;
      const label = '一時停止中　タップで再開';
      ctx.font = F(500, U * 0.036);
      const tw = ctx.measureText(label).width;
      const pw = tw + s * 6.2, ph = s * 3.2;
      ctx.fillStyle = css(dim, 0.9, -4);
      ctx.beginPath();
      ctx.roundRect(w / 2 - pw / 2, gy - ph / 2, pw, ph, ph / 2);
      ctx.fill();
      ctx.fillStyle = css(ink, 0.78);
      const bx0 = w / 2 - pw / 2 + s * 1.5;
      ctx.beginPath();
      ctx.roundRect(bx0 - s * 0.75, gy - s * 0.85, s * 0.62, s * 1.7, s * 0.2);
      ctx.roundRect(bx0 + s * 0.2, gy - s * 0.85, s * 0.62, s * 1.7, s * 0.2);
      ctx.fill();
      ctx.textAlign = 'left';
      ctx.fillStyle = css(ink, 0.82);
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bx0 + s * 1.6, gy + 1);
      ctx.textBaseline = 'alphabetic';
    }
  },

  anchors(env) {
    const { w, h } = env;
    // the mark left behind belongs where the check was tapped, dead centre
    const y = h * 0.90, x = w / 2;
    const path = [];
    for (let i = 0; i <= 6; i++) path.push({ x: x - w * 0.16 + (i / 6) * w * 0.16, y });
    return { head: path[0], rest: { x, y }, path };
  }
};
