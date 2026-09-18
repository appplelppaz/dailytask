// ─────────────────────────────────────────────────────────────
// The task screen.
//
// The news, and a thin bar along the bottom that fills as the task
// runs. A headline and its photograph from one of the papers, changed
// every few seconds, with the masthead named above it; the bar is small
// on purpose, because it only has to be glanced at.
//
// Nothing here counts down and nothing is measured in figures. If the
// wire is not reachable — no connection, or the site running without
// its server function — the screen falls back to exactly what it was:
// the name of the task, large, above a bar.
// ─────────────────────────────────────────────────────────────

import { clamp, css, TAU } from './util.js';
import { createNews } from './news.js';

const HOLD = 10;         // seconds a headline stays on screen
const FADE = 0.9;        // seconds of cross-fade between two

export const bar = {
  ownPaused: true,

  init(env) {
    return { news: createNews(), now: null, prev: null, at: -1e9 };
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
      `${weight} ${Math.round(px)}px Inter, system-ui, "Hiragino Sans", "Noto Sans CJK JP", sans-serif`;

    // ── the wire ──
    // Only while the task is running: there is no reason to poll the
    // papers for a screen nobody is sitting in front of.
    if (state !== 'dormant') {
      st.news.pump();
      if (time - st.at >= HOLD || !st.now) {
        const next = st.news.take();
        if (next && next !== st.now) {
          st.prev = st.now;
          st.now = next;
          st.at = time;
        }
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
    const item = st.now;
    if (item && item.img) {
      const age = time - st.at;
      const inAlpha = clamp(age / FADE);
      if (st.prev && st.prev.img && inAlpha < 1) {
        ctx.globalAlpha = shade;
        cover(ctx, st.prev.img, w, h, reduced ? 1 : 1 + Math.min(0.04, (age + HOLD) * 0.003));
      }
      ctx.globalAlpha = shade * (st.prev ? inAlpha : 1);
      cover(ctx, item.img, w, h, reduced ? 1 : 1 + Math.min(0.04, age * 0.003));
      ctx.globalAlpha = 1;

      // the picture is a background for words, so it is shaded for them
      const top = ctx.createLinearGradient(0, 0, 0, h * 0.20);
      top.addColorStop(0, 'rgba(0,0,0,.6)');
      top.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = top;
      ctx.fillRect(0, 0, w, h * 0.20);
      const foot = ctx.createLinearGradient(0, h, 0, h * 0.28);
      foot.addColorStop(0, 'rgba(0,0,0,.93)');
      foot.addColorStop(0.35, 'rgba(0,0,0,.82)');
      foot.addColorStop(0.72, 'rgba(0,0,0,.45)');
      foot.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = foot;
      ctx.fillRect(0, h * 0.28, w, h * 0.72);
    } else {
      // no photograph with this one, or none at all yet: the task's
      // colour, faintly, so the screen is never blank
      const wash = ctx.createRadialGradient(w / 2, h * 0.34, 0, w / 2, h * 0.34, Math.max(w, h) * 0.8);
      wash.addColorStop(0, css(col, item ? 0.30 : 0.12, item ? -6 : 0));
      wash.addColorStop(1, css(col, 0));
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, w, h);
      if (item) {
        const deep = ctx.createLinearGradient(0, h * 0.3, 0, h);
        deep.addColorStop(0, 'rgba(0,0,0,0)');
        deep.addColorStop(1, 'rgba(0,0,0,.55)');
        ctx.fillStyle = deep;
        ctx.fillRect(0, h * 0.3, w, h * 0.7);
      }
    }

    ctx.textBaseline = 'middle';

    // ── the name of the task ──
    const big = !item || state === 'closing';   // no headline: the name takes the screen
    const title = state === 'closing' ? 'WELL DONE' : clock.taskName;
    const latin = /^[\x20-\x7e]+$/.test(title);
    let size = U * (big ? (latin ? 0.145 : 0.115) : 0.048);
    ctx.letterSpacing = latin ? '0.10em' : '0.04em';
    ctx.font = F(600, size);
    const room = big ? w * 0.86 : w * 0.42;
    while (ctx.measureText(title).width > room && size > U * 0.038) {
      size *= 0.94;
      ctx.font = F(600, size);
    }
    ctx.textAlign = big ? 'center' : 'left';
    const tx = big ? w / 2 : w * 0.06;
    const ty = big ? h * 0.42 : h * 0.072;
    if (item) {
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillText(title, tx, ty + Math.max(1.5, U * 0.005));
    }
    ctx.fillStyle = state === 'dormant' ? css(ink, 0.34)
      : big ? css(col, 0.97, 22)
      : css(ink, 0.9);
    ctx.fillText(title, tx, ty);
    ctx.letterSpacing = '0px';

    // ── the headline, then what the article says ──
    // Three blocks, laid out from the bottom of the screen upwards: the
    // paper's own headline, the same in Japanese, and the opening of the
    // article in Japanese under it. If they will not all fit, the
    // summary gives up lines first — the headline never does. The two
    // Japanese blocks are left out entirely until their Japanese
    // arrives: only the paper's own headline is ever shown in the
    // paper's own language.
    if (item && !big) {
      const x = w * 0.06, width = w * 0.88;
      const fresh = clamp((time - st.at) / 0.5);
      const bottom = h * 0.905;
      const ceiling = h * 0.30;

      const oSize = Math.max(20, U * 0.064), oLead = oSize * 1.26;
      const jSize = Math.max(16, U * 0.050), jLead = jSize * 1.34;
      const sSize = Math.max(14, U * 0.040), sLead = sSize * 1.46;
      const headSize = Math.max(13, U * 0.034);

      const fit = (max) => {
        ctx.font = F(400, oSize);
        const head = layout(ctx, item.title, width, max.head);
        ctx.font = F(400, jSize);
        const ja = item.ja ? layout(ctx, item.ja, width, max.ja) : [];
        ctx.font = F(400, sSize);
        // The opening of the article, in Japanese and only in Japanese.
        // The original of it is carried so that it can be translated,
        // never so that it can be shown: an English or Chinese sentence
        // printed in the place the reader expects Japanese is worse
        // than leaving the line out altogether.
        const tail = item.bodyJa || '';
        const sum = tail ? layout(ctx, tail, width, max.sum) : [];
        const gapJa = ja.length ? jSize * 1.5 : 0;
        const gapSum = sum.length ? sSize * 1.9 : 0;
        const sumTop = bottom - (sum.length ? (sum.length - 1) * sLead : 0);
        const jaTop = sumTop - gapSum - (ja.length ? (ja.length - 1) * jLead : 0);
        const headTop = jaTop - gapJa - (head.length - 1) * oLead;
        return { head, ja, sum, sumTop, jaTop, headTop, top: headTop - oLead * 0.95 };
      };

      let box = fit({ head: 3, ja: 2, sum: 4 });
      for (const max of [{ head: 3, ja: 2, sum: 3 }, { head: 3, ja: 2, sum: 2 },
                         { head: 2, ja: 2, sum: 2 }, { head: 2, ja: 1, sum: 2 }]) {
        if (box.top >= ceiling) break;
        box = fit(max);
      }

      ctx.textAlign = 'left';
      ctx.globalAlpha = fresh;

      // the masthead, above everything
      ctx.font = F(600, headSize);
      ctx.letterSpacing = '0.16em';
      ctx.fillStyle = 'rgba(0,0,0,.7)';
      ctx.fillText(item.source.toUpperCase(), x + 1.5, box.top + 2);
      ctx.fillStyle = css(col, 0.97, 22);
      ctx.fillText(item.source.toUpperCase(), x, box.top);
      ctx.letterSpacing = '0px';

      const run = (lines, y, lead, size, alpha) => {
        ctx.font = F(400, size);
        for (const line of lines) {
          ctx.fillStyle = 'rgba(0,0,0,.8)';
          ctx.fillText(line, x + 1.5, y + 2);
          ctx.fillStyle = css(ink, alpha);
          ctx.fillText(line, x, y);
          y += lead;
        }
      };
      run(box.head, box.headTop, oLead, oSize, 0.98);
      run(box.ja, box.jaTop, jLead, jSize, 0.86);
      run(box.sum, box.sumTop, sLead, sSize, 0.75);
      ctx.globalAlpha = 1;
    }

    // ── the bar ──
    const small = !!item;
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
    ctx.textAlign = 'center';
    if (held) {
      if (item) {
        const veil = ctx.createRadialGradient(w / 2, h * 0.5, 0, w / 2, h * 0.5, U * 0.6);
        veil.addColorStop(0, 'rgba(0,0,0,.66)');
        veil.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = veil;
        ctx.fillRect(0, h * 0.25, w, h * 0.5);
      }
      ctx.font = F(500, U * 0.070);
      ctx.fillStyle = css(ink, 0.92);
      ctx.fillText('PAUSED', w / 2, h * 0.47);
      ctx.font = F(400, U * 0.046);
      ctx.fillStyle = css(ink, 0.55);
      ctx.fillText('Tap to resume', w / 2, h * 0.53);
    } else if (state === 'dormant') {
      ctx.font = F(400, U * 0.050);
      ctx.fillStyle = css(ink, 0.34);
      ctx.fillText('Not started', w / 2, h * 0.645);
    }

    ctx.textBaseline = 'alphabetic';
  },

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

/** Cover-fit: fill the frame, crop the overflow, never distort. */
function cover(ctx, img, w, h, scale = 1) {
  if (!img) return;
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const s = Math.max(w / iw, h / ih) * scale;
  ctx.drawImage(img, (w - iw * s) / 2, (h - ih * s) / 2, iw * s, ih * s);
}

/**
 * Break a headline into lines that fit, on spaces where there are any
 * and between characters where there are not, and cut it with an
 * ellipsis rather than let it run past the limit.
 */
function layout(ctx, text, maxW, maxLines) {
  const words = String(text).split(/(\s+)/);
  const lines = [];
  let line = '';
  const fits = (t) => ctx.measureText(t).width <= maxW;
  const push = () => { lines.push(line.trim()); line = ''; };

  for (const word of words) {
    if (fits(line + word)) { line += word; continue; }
    if (fits(word.trim())) {                       // it will fit on a line of its own
      if (line.trim()) push();
      if (lines.length >= maxLines) break;
      line = word.trimStart();
      continue;
    }
    // Too long for any line — Japanese and Chinese, which have no spaces,
    // arrive here. Break between characters, carrying on from whatever is
    // already on this line rather than starting a new one, and never
    // begin a line with a mark that closes something.
    let full = false;
    for (const ch of word) {
      const closing = '、。，．）」』】〉》!?！？,.:;：；…'.includes(ch);
      if (!fits(line + ch) && line.trim() && !closing) {
        push();
        if (lines.length >= maxLines) { full = true; break; }
      }
      line += ch;
    }
    if (full) break;
  }
  if (line.trim() && lines.length < maxLines) push();

  if (lines.length === maxLines) {
    const shown = lines.join('').replace(/\s+/g, '');
    const whole = String(text).replace(/\s+/g, '');
    if (shown.length < whole.length - 1) {         // something was left out
      let last = lines[maxLines - 1];
      while (last && !fits(last + '…')) last = last.slice(0, -1);
      lines[maxLines - 1] = last.replace(/[\s,;:、。]+$/, '') + '…';
    }
  }
  return lines.slice(0, maxLines);
}

