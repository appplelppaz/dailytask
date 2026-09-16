// ─────────────────────────────────────────────────────────────
// The Tōkaidō, Nihonbashi to Sanjō Ōhashi.
//
// Fifty-three post stations over about 492 kilometres. An ordinary
// traveller in the Edo period walked it in twelve to fifteen days,
// leaving before dawn and stopping at sundown; an express courier could
// do it in three or four. The whole road is on the screen from the
// start, so how far there is to go is simply how far along the road
// you can see.
//
// Time here is measured in stations rather than years: the clock reads
// the stage you have reached and the day you would be on.
// ─────────────────────────────────────────────────────────────

import { clamp, css, lerp, TAU, makeRng } from '../util.js';

// the fifty-three stations, plus the two ends
const STATIONS = [
  '日本橋', '品川', '川崎', '神奈川', '程ヶ谷', '戸塚', '藤沢', '平塚', '大磯',
  '小田原', '箱根', '三島', '沼津', '原', '吉原', '蒲原', '由比', '興津', '江尻',
  '府中', '鞠子', '岡部', '藤枝', '島田', '金谷', '日坂', '掛川', '袋井', '見付',
  '浜松', '舞坂', '新居', '白須賀', '二川', '吉田', '御油', '赤坂', '藤川', '岡崎',
  '池鯉鮒', '鳴海', '宮', '桑名', '四日市', '石薬師', '庄野', '亀山', '関', '坂下',
  '土山', '水口', '石部', '草津', '大津', '三条大橋'
];

const NOTE = {
  '日本橋': '五街道の起点。明け六つ、まだ暗いうちに発つ',
  '川崎': '六郷の渡し。橋は流され、以後は舟で渡った',
  '小田原': '関東の入口を守る城下町。ここで箱根に備える',
  '箱根': '天下の険。一日がかりで峠を越え、関所で女は厳しく改められた',
  '三島': '峠を下りきる。富士が背に回る',
  '吉原': '道が海を避けて曲がり、富士が左に見える ― 左富士',
  '由比': '薩埵峠。崖と波のあいだの細い道',
  '府中': '駿府。大御所の城下',
  '金谷': '大井川。橋も渡船も禁じられ、人の肩で越えた。増水すれば何日も足止め',
  '浜松': '出世城。家康が十七年を過ごした',
  '新居': '今切の渡しと関所。舟で渡る',
  '宮': '七里の渡し。桑名まで海路、約二十八キロ',
  '桑名': '海を渡って伊勢の国へ',
  '関': '鈴鹿の関。古代三関のひとつ',
  '草津': '中山道と合流する。人が一気に増える',
  '大津': '琵琶湖の港町。京はもう目の前',
  '三条大橋': '京に着く。日本橋を発って十二日から十五日'
};

const N = STATIONS.length;
const ROAD_W = N - 1;

/** Where the road runs: mostly along the coast, over the pass at Hakone. */
function roadY(i) {
  const u = i / ROAD_W;
  return 0.10 * Math.sin(u * Math.PI * 2.4 + 0.4)
    + 0.05 * Math.sin(u * Math.PI * 5.3 + 1.1)
    - (i >= 9 && i <= 11 ? 0.16 * Math.sin((i - 9) / 2 * Math.PI) : 0);   // 箱根越え
}

export const topic = {
  id: 'tokaido',
  title: '東海道五十三次',
  subtitle: '日本橋 → 三条大橋',
  palette: {
    bg: [34, 26, 12], ink: [36, 20, 88], ghost: [34, 14, 26],
    sea: [200, 34, 22], hill: [140, 16, 20], far: [220, 18, 26],
    road: [36, 30, 52], lit: [40, 62, 62]
  },

  events() {
    return STATIONS.map((name, i) => ({
      t: i, name, i,
      label: NOTE[name] ? `${name} ― ${NOTE[name]}` : `${name}`
    }));
  },

  focus(g) {
    const { w, h } = g;
    // the road unrolls past a fixed viewer; it closes in at each station
    const span = lerp(9.5, 4.6, Math.pow(g.fresh, 0.8));
    const S = w / span;
    // the road sits in the lower part of the screen, under the caption
    return { x: g.year + span * 0.18, y: roadY(g.year) * 0.35 + (h / 2 - h * 0.60) / S, S };
  },

  backdrop(g) {
    const { ctx, w, h, pal } = g;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, css(pal.bg, 1, -4));
    sky.addColorStop(0.55, css([28, 24, 16], 1));
    sky.addColorStop(1, css([32, 22, 10], 1));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
  },

  draw(g) {
    const { ctx, pal } = g;
    const here = g.year;
    // the vertical world: one screen height, so the landscape can be laid
    // out in fractions of the view rather than in station-widths
    const V = g.h / g.cam.S;
    const Y = (v) => v * V;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // three ranges at three speeds — the far one barely moves
    const range = (amp, freq, base, par, col, alpha) => {
      ctx.beginPath();
      const x0 = here - 9, x1 = here + 9;
      ctx.moveTo(x0, Y(0.55));
      for (let x = x0; x <= x1; x += 0.18) {
        const s = here + (x - here) * par;
        const y = Y(base) - Y(amp) * (0.55 + 0.45 * Math.sin(s * freq * 1.7 + 0.5))
                  * (0.7 + 0.3 * Math.sin(s * freq * 0.63 + 1.9));
        ctx.lineTo(x, y);
      }
      ctx.lineTo(x1, Y(0.55)); ctx.closePath();
      ctx.fillStyle = css(col, alpha); ctx.fill();
    };
    range(0.20, 0.42, -0.06, 0.22, pal.far, 1);

    // Fuji, in view across the Suruga stations
    const fujiX = 14.4, dx = (fujiX - here) * 0.34;
    if (Math.abs(dx) < 11) {
      ctx.save();
      ctx.translate(here + dx, Y(-0.015));
      const R = 2.2, Hh = Y(0.27);
      ctx.beginPath();
      ctx.moveTo(-R, 0);
      ctx.quadraticCurveTo(-R * 0.26, -Hh * 0.72, 0, -Hh);
      ctx.quadraticCurveTo(R * 0.26, -Hh * 0.72, R, 0);
      ctx.closePath();
      ctx.fillStyle = css([224, 22, 27], 1); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-R * 0.22, -Hh * 0.70);
      ctx.quadraticCurveTo(-R * 0.09, -Hh * 0.9, 0, -Hh);
      ctx.quadraticCurveTo(R * 0.09, -Hh * 0.9, R * 0.22, -Hh * 0.70);
      ctx.quadraticCurveTo(R * 0.08, -Hh * 0.74, 0, -Hh * 0.72);
      ctx.quadraticCurveTo(-R * 0.08, -Hh * 0.74, -R * 0.22, -Hh * 0.70);
      ctx.closePath();
      ctx.fillStyle = css([40, 12, 88], 0.95); ctx.fill();
      ctx.restore();
    }

    range(0.13, 0.78, 0.01, 0.52, pal.hill, 1);

    // the sea, on the left hand all the way to Kuwana
    ctx.fillStyle = css(pal.sea, 1);
    ctx.fillRect(here - 9, Y(0.10), 18, Y(0.30));
    if (!g.reduced) {
      ctx.strokeStyle = css([200, 26, 42], 0.42);
      ctx.lineWidth = g.px(1.2);
      for (let k = 0; k < 8; k++) {
        const y = Y(0.13 + k * 0.031);
        ctx.beginPath();
        for (let x = here - 9; x <= here + 9; x += 0.3) {
          ctx.lineTo(x, y + Math.sin(x * 2.6 + k * 1.7 + g.time * 0.7) * Y(0.006));
        }
        ctx.stroke();
      }
    }
    // the near bank in the foreground, rushing past
    ctx.beginPath();
    ctx.moveTo(here - 9, Y(0.55));
    for (let x = here - 9; x <= here + 9; x += 0.16) {
      const t = here + (x - here) * 1.7;
      ctx.lineTo(x, Y(0.375) - Y(0.03) * (0.5 + 0.5 * Math.sin(t * 2.3)) * (0.6 + 0.4 * Math.sin(t * 0.9)));
    }
    ctx.lineTo(here + 9, Y(0.55)); ctx.closePath();
    ctx.fillStyle = css([36, 26, 8], 1); ctx.fill();

    // the road: all of it, with what has been walked laid brighter
    const ry = (i) => Y(0.055) + Y(0.05) * roadY(i);
    const line = (from, to, style, wid) => {
      ctx.beginPath();
      let started = false;
      for (let x = Math.max(0, from); x <= Math.min(ROAD_W, to); x += 0.2) {
        const y = ry(x);
        if (started) ctx.lineTo(x, y); else { ctx.moveTo(x, y); started = true; }
      }
      if (!started) return;
      ctx.strokeStyle = style; ctx.lineWidth = wid; ctx.stroke();
    };
    line(here - 9, here + 9, css(pal.road, 0.5), g.px(10));
    line(here - 9, here, css(pal.lit, 0.95), g.px(10));

    // the stations
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (let i = 0; i < N; i++) {
      if (Math.abs(i - here) > 8.5) continue;
      const y = ry(i), done = here >= i;
      ctx.fillStyle = css(done ? pal.lit : pal.ghost, done ? 1 : 0.75);
      ctx.beginPath(); ctx.arc(i, y, g.px(6), 0, TAU); ctx.fill();
      ctx.strokeStyle = css(pal.bg, 0.9); ctx.lineWidth = g.px(1.6); ctx.stroke();
      const near = clamp(1 - Math.abs(i - here) / 4.2);
      if (near > 0.02) {
        ctx.save();
        ctx.translate(i, y - g.px(20));
        ctx.scale(g.px(1), g.px(1));
        ctx.font = `500 ${Math.round(g.h * 0.024)}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = css(pal.ink, 0.28 + near * 0.68);
        ctx.fillText(STATIONS[i], 0, 0);
        ctx.font = `300 ${Math.round(g.h * 0.015)}px "JetBrains Mono", monospace`;
        ctx.fillStyle = css(pal.ink, 0.18 + near * 0.32);
        ctx.fillText(i === 0 ? '起点' : i === N - 1 ? '京' : String(i), 0, Math.round(g.h * 0.028));
        ctx.restore();
      }
    }

    // the traveller
    const ty = ry(here);
    const bob = g.reduced ? 0 : Math.abs(Math.sin(g.time * 3.6)) * g.px(4);
    ctx.save();
    ctx.translate(here, ty - bob);
    ctx.scale(g.px(1), g.px(1));
    const u = g.h * 0.012;
    ctx.fillStyle = css([36, 26, 86], 0.96);
    ctx.beginPath(); ctx.arc(0, -u * 3.1, u * 0.62, 0, TAU); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-u * 0.7, -u * 2.4); ctx.lineTo(u * 0.7, -u * 2.4);
    ctx.lineTo(u * 0.5, 0); ctx.lineTo(-u * 0.5, 0);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = css([36, 26, 86], 0.85);
    ctx.lineWidth = u * 0.22;
    ctx.beginPath();
    ctx.moveTo(u * 1.1, -u * 4.2); ctx.lineTo(u * 1.1, u * 0.3);
    ctx.stroke();
    ctx.restore();
  },

  stamp: (u) => {
    const i = Math.round(u);
    const day = Math.max(1, Math.round(1 + (i / ROAD_W) * 13));
    return i <= 0 ? '出立' : i >= N - 1 ? '着' : `${i}次`;
  }
};
