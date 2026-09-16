// ─────────────────────────────────────────────────────────────
// The London Underground, 1863 → 2022.
//
// The world's first underground railway was three and a half miles of
// cut-and-cover tunnel between Paddington and Farringdon, opened on
// 9 January 1863 and worked by steam locomotives. What it became is
// drawn here from the first second, unlit, so the shape of the finished
// network is the shape of the time remaining.
//
// Geometry is schematic — the lines are placed roughly where they run,
// not to the Beck diagram — but the line colours are the real ones and
// every opening date is the real date.
// ─────────────────────────────────────────────────────────────

import { clamp, css, lerp, TAU, makeRng } from '../util.js';
import { fitTo, growBox, path } from '../history.js';

const P = (x, y) => ({ x, y });

// [name, colour, points, openings: [year, fromIndex, toIndex, label?]]
const LINES = [
  ['Metropolitan', '#9B0056', [
    P(0.06, 0.06), P(0.16, 0.14), P(0.22, 0.20), P(0.31, 0.28), P(0.38, 0.34),
    P(0.44, 0.40), P(0.52, 0.38), P(0.56, 0.37), P(0.60, 0.42), P(0.66, 0.43)
  ], [
    [1863, 5, 8, 'メトロポリタン鉄道 パディントン〜ファリンドン ― 世界初の地下鉄'],
    [1865, 8, 9, 'ムーアゲイトまで延伸'],
    [1868, 4, 5, 'スイス・コテージへ ― 郊外へ向かい始める'],
    [1879, 1, 4, 'ハーロウまで ― 沿線に住宅地が生まれる'],
    [1892, 0, 1, 'アマシャムへ。ロンドンから50km、田園の中へ']
  ]],
  ['District', '#00782A', [
    P(0.14, 0.52), P(0.26, 0.52), P(0.36, 0.52), P(0.46, 0.52), P(0.50, 0.50),
    P(0.60, 0.48), P(0.66, 0.47), P(0.70, 0.46), P(0.78, 0.42), P(0.88, 0.38), P(0.96, 0.34)
  ], [
    [1868, 2, 4, 'ディストリクト鉄道 開業'],
    [1870, 4, 5, 'ブラックフライアーズへ'],
    [1874, 0, 2, 'ハマースミスまで西へ'],
    [1902, 8, 10, 'アップミンスターへ。東の郊外が通勤圏に']
  ]],
  ['Circle', '#FFD300', [
    P(0.34, 0.40), P(0.44, 0.40), P(0.52, 0.38), P(0.56, 0.37), P(0.60, 0.42),
    P(0.66, 0.43), P(0.70, 0.46), P(0.66, 0.47), P(0.60, 0.48), P(0.50, 0.50),
    P(0.46, 0.52), P(0.36, 0.52), P(0.34, 0.40)
  ], [
    [1884, 0, 12, 'インナー・サークル完成 ― 環状線がつながる']
  ]],
  ['Northern', '#000000', [
    P(0.36, 0.10), P(0.40, 0.20), P(0.46, 0.30), P(0.52, 0.36), P(0.54, 0.42),
    P(0.60, 0.50), P(0.58, 0.60), P(0.54, 0.64), P(0.52, 0.72), P(0.52, 0.84)
  ], [
    [1890, 5, 8, 'シティ・南ロンドン鉄道 ― 世界初の電気運転による深部地下鉄'],
    [1907, 2, 5, 'ゴルダーズ・グリーンへ。畑の中に駅ができ、街ができる'],
    [1924, 0, 2, 'エッジウェアまで北へ'],
    [1926, 8, 9, 'モーデンまで南へ']
  ]],
  ['Central', '#E32017', [
    P(0.06, 0.44), P(0.18, 0.44), P(0.28, 0.44), P(0.42, 0.42), P(0.48, 0.41),
    P(0.56, 0.40), P(0.66, 0.45), P(0.74, 0.40), P(0.80, 0.34), P(0.92, 0.20)
  ], [
    [1900, 1, 6, 'セントラル・ロンドン鉄道 ― 均一2ペンスで「トゥーペニー・チューブ」'],
    [1920, 0, 1, 'イーリングへ西進'],
    [1946, 6, 8, '戦後、東へ ― 大戦中は防空壕として使われた'],
    [1949, 8, 9, 'エッピングへ。森まで地下鉄が届く']
  ]],
  ['Bakerloo', '#B36305', [
    P(0.14, 0.16), P(0.26, 0.30), P(0.34, 0.40), P(0.44, 0.40), P(0.48, 0.41),
    P(0.50, 0.44), P(0.53, 0.47), P(0.56, 0.52), P(0.58, 0.60)
  ], [
    [1906, 4, 8, 'ベイカールー線 開業'],
    [1907, 2, 4, 'パディントンへ'],
    [1917, 0, 2, 'ワトフォード方面へ乗り入れ']
  ]],
  ['Piccadilly', '#003688', [
    P(0.06, 0.60), P(0.14, 0.52), P(0.26, 0.52), P(0.36, 0.52), P(0.40, 0.48),
    P(0.50, 0.44), P(0.52, 0.45), P(0.56, 0.40), P(0.56, 0.37), P(0.62, 0.28), P(0.72, 0.14)
  ], [
    [1906, 2, 9, 'ピカデリー線 開業'],
    [1933, 9, 10, 'コックフォスターズへ。チャールズ・ホールデンの駅舎群'],
    [1977, 0, 2, 'ヒースロー空港へ ― 空港に直結した最初の地下鉄']
  ]],
  ['Victoria', '#0098D4', [
    P(0.74, 0.24), P(0.62, 0.28), P(0.56, 0.37), P(0.48, 0.41), P(0.46, 0.52), P(0.58, 0.78)
  ], [
    [1968, 0, 2, 'ヴィクトリア線 ― 50年ぶりの新線、全線自動運転'],
    [1969, 2, 4, 'ヴィクトリア駅まで'],
    [1971, 4, 5, 'ブリクストンへ']
  ]],
  ['Jubilee', '#A0A5A9', [
    P(0.28, 0.10), P(0.22, 0.20), P(0.44, 0.40), P(0.45, 0.42), P(0.47, 0.46),
    P(0.50, 0.50), P(0.56, 0.52), P(0.64, 0.50), P(0.82, 0.48), P(0.80, 0.34)
  ], [
    [1979, 0, 6, 'ジュビリー線 ― 女王在位25年に因む'],
    [1999, 6, 9, 'ドックランズへ延伸。埠頭跡が金融街になる']
  ]],
  ['Elizabeth', '#6950A1', [
    P(0.02, 0.48), P(0.34, 0.40), P(0.45, 0.42), P(0.51, 0.42), P(0.60, 0.42),
    P(0.70, 0.42), P(0.78, 0.42), P(0.82, 0.48), P(0.94, 0.52)
  ], [
    [2022, 0, 8, 'エリザベス線 開業 ― 構想から四半世紀']
  ]]
];

const THAMES = [
  P(-0.05, 0.60), P(0.14, 0.57), P(0.30, 0.55), P(0.42, 0.545), P(0.50, 0.535),
  P(0.56, 0.545), P(0.62, 0.51), P(0.70, 0.495), P(0.76, 0.53), P(0.82, 0.555),
  P(0.86, 0.50), P(0.90, 0.455), P(1.05, 0.44)
];

export const topic = {
  id: 'tube',
  title: 'ロンドン地下鉄',
  subtitle: '1863 → 2022',
  palette: {
    bg: [222, 30, 9], ink: [210, 12, 88], ghost: [214, 16, 26],
    river: [204, 46, 30], riverLit: [200, 52, 40]
  },

  events() {
    const out = [];
    LINES.forEach((L, li) => {
      L[3].forEach((op) => out.push({
        t: op[0], label: op[3], line: li, from: op[1], to: op[2], colour: L[1], name: L[0]
      }));
    });
    return out.sort((a, b) => a.t - b.t);
  },

  /** Everything open so far, framed; with a push in on whatever just landed. */
  focus(g) {
    const { w, h } = g;
    let box = null;
    for (const e of g.events) {
      if (!g.seen(e.t)) continue;
      const pts = LINES[e.line][2];
      for (let i = e.from; i <= e.to; i++) box = growBox(box, pts[i].x, pts[i].y, 0.02);
    }
    if (!box) box = { x: 0.4, y: 0.34, w: 0.2, h: 0.12 };
    const wide = fitTo(box, w, h);

    // when something opens, lean in on it for a moment
    const e = g.event;
    if (e && g.fresh > 0.01) {
      const pts = LINES[e.line][2];
      let nb = null;
      for (let i = e.from; i <= e.to; i++) nb = growBox(nb, pts[i].x, pts[i].y, 0.05);
      const near = fitTo(nb, w, h, 0.7, 0.5);
      const k = Math.pow(g.fresh, 0.7) * 0.72;
      return { x: lerp(wide.x, near.x, k), y: lerp(wide.y, near.y, k), S: lerp(wide.S, Math.min(near.S, wide.S * 2.6), k) };
    }
    return wide;
  },

  draw(g) {
    const { ctx, pal } = g;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // the river, the one thing that was always there
    ctx.strokeStyle = css(pal.river, 0.85);
    ctx.lineWidth = g.px(11);
    path(ctx, THAMES); ctx.stroke();
    ctx.strokeStyle = css(pal.riverLit, 0.5);
    ctx.lineWidth = g.px(3);
    path(ctx, THAMES); ctx.stroke();

    // the network that will exist, unlit
    for (const L of LINES) {
      const pts = L[2];
      let lo = Infinity, hi = -Infinity;
      for (const op of L[3]) { lo = Math.min(lo, op[1]); hi = Math.max(hi, op[2]); }
      ctx.strokeStyle = css(pal.ghost, 0.5);
      ctx.lineWidth = g.px(2.2);
      ctx.setLineDash([g.px(5), g.px(7)]);
      if (path(ctx, pts, lo / (pts.length - 1), hi / (pts.length - 1))) ctx.stroke();
      ctx.setLineDash([]);
    }

    // and what has opened, in its own colour
    for (let li = 0; li < LINES.length; li++) {
      const L = LINES[li], pts = LINES[li][2], n = pts.length - 1;
      for (const op of L[3]) {
        if (!g.seen(op[0])) continue;
        const grow = clamp((g.year - op[0]) / 1.6 + 0.12);
        const a = op[1] / n, b = lerp(op[1], op[2], grow) / n;
        ctx.strokeStyle = L[1];
        ctx.lineWidth = g.px(L[0] === 'Metropolitan' || L[0] === 'District' ? 5.5 : 4.6);
        if (path(ctx, pts, a, b)) ctx.stroke();
        // a fresh opening flares
        const fl = g.justNow(op[0], 3);
        if (fl > 0.01) {
          ctx.strokeStyle = css([0, 0, 100], fl * 0.75);
          ctx.lineWidth = g.px(9 * fl + 1);
          if (path(ctx, pts, a, b)) ctx.stroke();
        }
      }
    }

    // interchanges: where two lit lines meet
    const lit = [];
    for (let li = 0; li < LINES.length; li++) {
      const pts = LINES[li][2];
      for (const op of LINES[li][3]) {
        if (!g.seen(op[0])) continue;
        for (let i = op[1]; i <= op[2]; i++) lit.push(pts[i]);
      }
    }
    ctx.fillStyle = css(pal.ink, 0.92);
    ctx.strokeStyle = css(pal.bg, 1);
    ctx.lineWidth = g.px(1.6);
    for (let i = 0; i < lit.length; i++) {
      let hits = 0;
      for (let j = 0; j < lit.length; j++) if (Math.hypot(lit[i].x - lit[j].x, lit[i].y - lit[j].y) < 0.006) hits++;
      if (hits < 3 || i > 0 && Math.hypot(lit[i].x - lit[i - 1].x, lit[i].y - lit[i - 1].y) < 0.006) continue;
      ctx.beginPath(); ctx.arc(lit[i].x, lit[i].y, g.px(3.4), 0, TAU); ctx.fill(); ctx.stroke();
    }

    // trains, so the network is never still
    if (!g.reduced) {
      for (let li = 0; li < LINES.length; li++) {
        const L = LINES[li], pts = L[2], n = pts.length - 1;
        for (let oi = 0; oi < L[3].length; oi++) {
          const op = L[3][oi];
          if (!g.seen(op[0])) continue;
          for (let k = 0; k < 2; k++) {
            const u = ((g.time * 0.055 + k * 0.5 + li * 0.17 + oi * 0.31) % 1);
            const idx = lerp(op[1], op[2], u), i = Math.min(n - 1, Math.floor(idx)), f = idx - i;
            const x = lerp(pts[i].x, pts[i + 1].x, f), y = lerp(pts[i].y, pts[i + 1].y, f);
            ctx.fillStyle = css([0, 0, 100], 0.85);
            ctx.beginPath(); ctx.arc(x, y, g.px(2.1), 0, TAU); ctx.fill();
          }
        }
      }
    }
  },

  stamp: (y) => String(y)
};
