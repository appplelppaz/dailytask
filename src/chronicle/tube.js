// ─────────────────────────────────────────────────────────────
// The London Underground, 1863 → 2022.
//
// Drawn as a diagram rather than a map, the way Harry Beck decided in
// 1931 it had to be: straight runs, forty-five degree corners, stations
// spaced evenly whatever the real distance. Lines are in their own
// colours, stations are ticked, interchanges are ringed, and a station
// puts its name up on the day it opens.
//
// Nothing that has not happened yet is on the screen. The map is only
// ever as big as the railway was on the day you are looking at.
// ─────────────────────────────────────────────────────────────

import { clamp, css, lerp, TAU } from '../util.js';
import { fitTo, growBox } from '../chronicle.js';

// name: [x, y, label side]  — a grid where one unit is one station apart
const S = {
  'アマシャム':        [1.0, 1.0, 'b'],
  'ハーロウ':          [3.0, 2.6, 'b'],
  'ハーロウ＆ウィールドストン': [2.0, 4.6, 'l'],
  'ウェンブリー・パーク': [4.6, 4.2, 'b'],
  'フィンチリー・ロード': [6.2, 5.6, 'r'],
  'エッジウェア':      [8.6, 0.8, 'r'],
  'ゴルダーズ・グリーン': [8.6, 2.8, 'r'],
  'カムデン・タウン':   [9.6, 5.0, 'r'],
  'コックフォスターズ': [16.4, 1.2, 'l'],
  'フィンズベリー・パーク': [13.4, 4.2, 'r'],
  'ハイベリー':        [12.6, 5.0, 'r'],
  'ウォルサムストウ':   [17.0, 3.0, 'l'],
  'エッピング':        [19.6, 4.4, 'l'],
  'クイーンズ・パーク': [3.2, 6.2, 'l'],
  'パディントン':      [4.2, 8.0, 't'],
  'エッジウェア・ロード': [5.2, 7.4, 't'],
  'ベイカー・ストリート': [6.6, 6.6, 't'],
  'ユーストン':        [9.2, 6.0, 't'],
  'キングス・クロス':   [10.6, 6.0, 't'],
  'エンジェル':        [12.0, 5.6, 't'],
  'ファリンドン':      [12.0, 7.0, 't'],
  'ムーアゲイト':      [13.4, 7.0, 't'],
  'リヴァプール・ストリート': [14.8, 7.0, 't'],
  'オールドゲイト':    [16.0, 7.6, 'r'],
  'イーリング':        [0.4, 8.6, 'l'],
  'シェパーズ・ブッシュ': [1.8, 8.6, 'b'],
  'ノッティング・ヒル・ゲート': [3.2, 8.6, 'b'],
  'ランカスター・ゲート': [4.6, 8.6, 'b'],
  'マーブル・アーチ':   [5.6, 8.6, 'b'],
  'ボンド・ストリート': [6.6, 8.6, 't'],
  'オックスフォード・サーカス': [7.6, 8.6, 't'],
  'トッテナム・コート・ロード': [9.0, 8.6, 't'],
  'ホルボーン':        [10.4, 8.6, 't'],
  'セント・ポール':     [11.8, 8.6, 't'],
  'バンク':            [13.4, 9.0, 'r'],
  'ピカデリー・サーカス': [8.4, 9.6, 'r'],
  'レスター・スクエア': [9.2, 9.4, 'r'],
  'グリーン・パーク':   [7.6, 10.0, 'l'],
  'チャリング・クロス': [9.2, 10.2, 'r'],
  'エンバンクメント':   [9.6, 11.0, 'r'],
  'ウォータールー':     [10.2, 12.0, 'r'],
  'ウェストミンスター': [8.6, 11.0, 'l'],
  'ヴィクトリア':      [7.0, 11.0, 'b'],
  'スローン・スクエア': [6.0, 11.0, 'b'],
  'サウス・ケンジントン': [5.0, 11.0, 'b'],
  'グロスター・ロード': [4.0, 11.0, 'b'],
  'アールズ・コート':   [3.0, 11.0, 'b'],
  'ハマースミス':      [1.4, 11.0, 'b'],
  'ヒースロー':        [0.2, 12.8, 'b'],
  'ブラックフライアーズ': [11.0, 11.0, 'b'],
  'モニュメント':      [13.0, 10.6, 'r'],
  'タワー・ヒル':      [14.6, 10.6, 'r'],
  'ホワイトチャペル':   [16.4, 9.6, 'r'],
  'ストラットフォード': [18.0, 8.0, 'r'],
  'アップミンスター':   [19.8, 9.2, 'r'],
  'ロンドン・ブリッジ': [12.2, 12.0, 'r'],
  'バラ':              [12.0, 13.0, 'r'],
  'エレファント＆キャッスル': [11.6, 14.0, 'r'],
  'ケニントン':        [11.0, 15.0, 'r'],
  'ストックウェル':     [10.0, 16.0, 'l'],
  'ブリクストン':      [11.0, 17.0, 'r'],
  'モーデン':          [9.6, 18.0, 'l'],
  'カナダ・ウォーター': [15.4, 11.6, 'b'],
  'カナリー・ワーフ':   [17.0, 11.6, 'b'],
  'ノース・グリニッジ': [18.4, 10.6, 'r'],
  'アビー・ウッド':     [19.8, 12.0, 'r'],
  'オールド・ストリート': [14.2, 6.0, 'r']
};

// [line name, colour, station chain, openings [year, from, to, note]]
const LINES = [
  ['メトロポリタン線', '#9B0056',
   ['アマシャム', 'ハーロウ', 'ウェンブリー・パーク', 'フィンチリー・ロード', 'ベイカー・ストリート',
    'エッジウェア・ロード', 'パディントン'],
   [[1863, 4, 6, 'パディントン〜ファリンドン。世界で最初の地下鉄が、蒸気機関車で走り出す'],
    [1868, 3, 4, 'スイス・コテージへ。地下鉄が郊外へ向かい始める'],
    [1879, 1, 3, 'ハーロウまで。線路の先に住宅地が造られていく'],
    [1892, 0, 1, 'アマシャムへ。ロンドンから五十キロ、畑の中に駅ができる']]],

  ['メトロポリタン線（東）', '#9B0056',
   ['パディントン', 'エッジウェア・ロード', 'ベイカー・ストリート', 'ユーストン', 'キングス・クロス',
    'ファリンドン', 'ムーアゲイト', 'リヴァプール・ストリート', 'オールドゲイト'],
   [[1863, 0, 5, ''], [1865, 5, 6, 'ムーアゲイトまで延伸'],
    [1876, 6, 8, 'オールドゲイトへ']]],

  ['ハマースミス＆シティ線', '#F3A9BB',
   ['ハマースミス', 'ノッティング・ヒル・ゲート', 'パディントン', 'エッジウェア・ロード',
    'キングス・クロス', 'リヴァプール・ストリート', 'ホワイトチャペル'],
   [[1864, 0, 3, 'ハマースミス支線。まだ畑だった土地に線路が引かれる'],
    [1884, 3, 6, '東へ抜ける']]],

  ['ディストリクト線', '#00782A',
   ['ハマースミス', 'アールズ・コート', 'グロスター・ロード', 'サウス・ケンジントン', 'スローン・スクエア',
    'ヴィクトリア', 'ウェストミンスター', 'エンバンクメント', 'ブラックフライアーズ', 'モニュメント',
    'タワー・ヒル', 'ホワイトチャペル', 'アップミンスター'],
   [[1868, 3, 6, 'ディストリクト鉄道。サウス・ケンジントンからウェストミンスターへ'],
    [1870, 6, 8, 'ブラックフライアーズまで'],
    [1874, 0, 3, 'ハマースミスまで西へ'],
    [1884, 8, 10, 'タワー・ヒルへ。環状線が一周つながる'],
    [1902, 11, 12, 'アップミンスターへ。東の農村が通勤圏に入る']]],

  ['サークル線', '#FFD300',
   ['パディントン', 'エッジウェア・ロード', 'ベイカー・ストリート', 'ユーストン', 'キングス・クロス',
    'ファリンドン', 'ムーアゲイト', 'リヴァプール・ストリート', 'オールドゲイト', 'タワー・ヒル',
    'モニュメント', 'ブラックフライアーズ', 'エンバンクメント', 'ウェストミンスター', 'ヴィクトリア',
    'スローン・スクエア', 'サウス・ケンジントン', 'グロスター・ロード', 'ノッティング・ヒル・ゲート',
    'パディントン'],
   [[1884, 0, 19, 'インナー・サークル完成。煙の立ちこめる環状線を、機関車が一日中回り続けた']]],

  ['シティ・南ロンドン線（ノーザン線）', '#000000',
   ['エッジウェア', 'ゴルダーズ・グリーン', 'カムデン・タウン', 'ユーストン', 'トッテナム・コート・ロード',
    'チャリング・クロス', 'ウォータールー', 'ロンドン・ブリッジ', 'バラ', 'エレファント＆キャッスル',
    'ケニントン', 'ストックウェル', 'モーデン'],
   [[1890, 7, 11, '世界で最初の電気運転の深部地下鉄。煙のない地下鉄がここから始まる'],
    [1907, 1, 5, 'ゴルダーズ・グリーンへ。駅ができてから街ができた'],
    [1924, 0, 1, 'エッジウェアまで'],
    [1926, 11, 12, 'モーデンまで南へ']]],

  ['セントラル線', '#E32017',
   ['イーリング', 'シェパーズ・ブッシュ', 'ノッティング・ヒル・ゲート', 'ランカスター・ゲート',
    'マーブル・アーチ', 'ボンド・ストリート', 'オックスフォード・サーカス', 'トッテナム・コート・ロード',
    'ホルボーン', 'セント・ポール', 'バンク', 'リヴァプール・ストリート', 'ストラットフォード', 'エッピング'],
   [[1900, 1, 10, 'どこまで乗っても均一二ペンス。「トゥーペニー・チューブ」と呼ばれた'],
    [1912, 10, 11, 'リヴァプール・ストリートへ'],
    [1920, 0, 1, 'イーリングへ西進'],
    [1946, 11, 12, '戦時中は防空壕として使われた区間が、旅客線として開く'],
    [1949, 12, 13, 'エッピングへ。森の際まで地下鉄が届く']]],

  ['ウォータールー＆シティ線', '#95CDBA',
   ['ウォータールー', 'バンク'],
   [[1898, 0, 1, '駅二つだけの路線。通勤者はこれを「排水管」と呼んだ']]],

  ['ベイカールー線', '#B36305',
   ['ハーロウ＆ウィールドストン', 'クイーンズ・パーク', 'パディントン', 'エッジウェア・ロード',
    'ベイカー・ストリート', 'オックスフォード・サーカス', 'ピカデリー・サーカス', 'チャリング・クロス',
    'エンバンクメント', 'ウォータールー', 'エレファント＆キャッスル'],
   [[1906, 4, 10, 'ベイカー街とウォータールーを結ぶ ― 名前はその二つをつないだもの'],
    [1907, 3, 4, 'エッジウェア・ロードへ'],
    [1913, 2, 3, 'パディントンへ'],
    [1917, 0, 2, '北西の郊外へ']]],

  ['ピカデリー線', '#003688',
   ['ヒースロー', 'ハマースミス', 'アールズ・コート', 'グロスター・ロード', 'サウス・ケンジントン',
    'グリーン・パーク', 'ピカデリー・サーカス', 'レスター・スクエア', 'ホルボーン', 'キングス・クロス',
    'フィンズベリー・パーク', 'コックフォスターズ'],
   [[1906, 1, 10, 'ハマースミスからフィンズベリー・パークまで一気に開業'],
    [1933, 10, 11, 'コックフォスターズへ。ホールデンが設計した円筒形の駅舎が並ぶ'],
    [1977, 0, 1, 'ヒースロー空港へ。空港に直結した世界で最初の地下鉄']]],

  ['ヴィクトリア線', '#0098D4',
   ['ウォルサムストウ', 'フィンズベリー・パーク', 'ハイベリー', 'キングス・クロス', 'ユーストン',
    'オックスフォード・サーカス', 'グリーン・パーク', 'ヴィクトリア', 'ストックウェル', 'ブリクストン'],
   [[1968, 0, 2, '半世紀ぶりの新線。世界で初めて全線を自動運転にした地下鉄'],
    [1969, 2, 7, 'ヴィクトリア駅まで。女王が開業式で自ら切符を買った'],
    [1971, 7, 9, 'ブリクストンへ']]],

  ['ジュビリー線', '#A0A5A9',
   ['ウェンブリー・パーク', 'フィンチリー・ロード', 'ベイカー・ストリート', 'ボンド・ストリート',
    'グリーン・パーク', 'ウェストミンスター', 'ウォータールー', 'ロンドン・ブリッジ',
    'カナダ・ウォーター', 'カナリー・ワーフ', 'ノース・グリニッジ', 'ストラットフォード'],
   [[1979, 0, 4, '女王在位二十五年を記念して名づけられる'],
    [1999, 5, 11, 'ドックランズへ。閉じた埠頭の跡が金融街に変わっていく']]],

  ['エリザベス線', '#6950A1',
   ['パディントン', 'ボンド・ストリート', 'トッテナム・コート・ロード', 'ファリンドン',
    'リヴァプール・ストリート', 'ホワイトチャペル', 'カナリー・ワーフ', 'アビー・ウッド'],
   [[2022, 0, 7, '構想から四半世紀、地下五十メートルを掘り抜いて開業する']]]
];

const THAMES = [
  [-1, 12.4], [2.2, 12.2], [5.0, 11.9], [7.4, 11.8], [8.8, 11.6], [10.0, 11.5],
  [11.4, 11.4], [12.6, 11.2], [13.6, 11.1], [14.8, 11.2], [15.6, 12.2], [16.6, 12.4],
  [17.4, 12.0], [18.2, 11.3], [19.4, 11.6], [21, 11.8]
];

/** Which segments of which lines are open in a given year. */
function openRuns(g) {
  const runs = [];
  for (const L of LINES) {
    for (const op of L[3]) {
      if (!g.seen(op[0])) continue;
      const grow = clamp((g.year - op[0]) / 1.4 + 0.15);
      runs.push({ line: L, from: op[1], to: op[2], grow, year: op[0] });
    }
  }
  return runs;
}

export const topic = {
  id: 'tube',
  title: 'ロンドン地下鉄',
  subtitle: '1863 → 2022',
  palette: { bg: [222, 24, 7], ink: [210, 8, 92], ghost: [214, 14, 20], river: [205, 40, 26] },

  events() {
    const out = [];
    LINES.forEach((L, li) => L[3].forEach((op) => out.push({
      t: op[0], li, from: op[1], to: op[2],
      label: op[3] ? `${L[0]} ― ${op[3]}` : `${L[0]} 延伸`
    })));
    return out.sort((a, b) => a.t - b.t);
  },

  focus(g) {
    const { w, h } = g;
    let box = null;
    for (const r of openRuns(g)) {
      for (let i = r.from; i <= r.to; i++) {
        const p = S[r.line[2][i]];
        if (p) box = growBox(box, p[0], p[1], 1.6);
      }
    }
    if (!box) box = { x: 9, y: 5.4, w: 4, h: 3 };
    const wide = fitTo(box, w, h, 0.9, 0.56);
    const e = g.event;
    if (e && g.fresh > 0.01) {
      const chain = LINES[e.li][2];
      let nb = null;
      for (let i = e.from; i <= e.to; i++) {
        const p = S[chain[i]];
        if (p) nb = growBox(nb, p[0], p[1], 2.4);
      }
      if (nb) {
        const near = fitTo(nb, w, h, 0.74, 0.46);
        const k = Math.pow(g.fresh, 0.7) * 0.7;
        return { x: lerp(wide.x, near.x, k), y: lerp(wide.y, near.y, k),
                 S: lerp(wide.S, Math.min(near.S, wide.S * 2.4), k) };
      }
    }
    return wide;
  },

  draw(g) {
    const { ctx, pal } = g;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const runs = openRuns(g);

    // the river, which the diagram has always kept
    ctx.strokeStyle = css(pal.river, 0.9);
    ctx.lineWidth = g.px(13);
    ctx.beginPath();
    THAMES.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();

    // the lines. A casing in the background colour first, so where two
    // lines cross the upper one reads as passing over.
    const stroke = (r, width, style) => {
      const chain = r.line[2];
      ctx.beginPath();
      const last = lerp(r.from, r.to, r.grow);
      for (let i = r.from; i <= Math.floor(last); i++) {
        const p = S[chain[i]];
        if (!p) continue;
        ctx[i === r.from ? 'moveTo' : 'lineTo'](p[0], p[1]);
      }
      const i0 = Math.floor(last), f = last - i0;
      if (f > 0 && chain[i0 + 1]) {
        const a = S[chain[i0]], b = S[chain[i0 + 1]];
        if (a && b) ctx.lineTo(lerp(a[0], b[0], f), lerp(a[1], b[1], f));
      }
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.stroke();
    };
    for (const r of runs) stroke(r, g.px(9.5), css(pal.bg, 1));
    for (const r of runs) stroke(r, g.px(5.5), r.line[1]);

    // a new run flares as it opens
    for (const r of runs) {
      const fl = g.justNow(r.year, 2.4);
      if (fl > 0.02) stroke(r, g.px(5.5 + fl * 9), css([0, 0, 100], fl * 0.5));
    }

    // the stations, and how many lines each one has by now
    const count = {};
    for (const r of runs) {
      const chain = r.line[2];
      const last = lerp(r.from, r.to, r.grow);
      for (let i = r.from; i <= Math.round(last); i++) {
        const n = chain[i];
        if (!n || !S[n]) continue;
        count[n] = count[n] || { lines: new Set(), year: r.year };
        count[n].lines.add(r.line[1]);
        count[n].year = Math.min(count[n].year, r.year);
      }
    }

    for (const name of Object.keys(count)) {
      const [x, y] = S[name];
      const c = count[name];
      const inter = c.lines.size > 1;
      if (inter) {
        ctx.beginPath(); ctx.arc(x, y, g.px(5.4), 0, TAU);
        ctx.fillStyle = css([0, 0, 100], 0.97); ctx.fill();
        ctx.strokeStyle = css(pal.bg, 1); ctx.lineWidth = g.px(2.2); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(x, y, g.px(3), 0, TAU);
        ctx.fillStyle = css([0, 0, 100], 0.9); ctx.fill();
      }
    }

    // trains, so the railway is never standing still
    if (!g.reduced) {
      for (let ri = 0; ri < runs.length; ri++) {
        const r = runs[ri], chain = r.line[2];
        const span = Math.max(1, lerp(r.from, r.to, r.grow) - r.from);
        for (let k = 0; k < 2; k++) {
          const u = (g.time * 0.05 + k * 0.5 + ri * 0.19) % 1;
          const idx = r.from + u * span;
          const i = Math.floor(idx), f = idx - i;
          const a = S[chain[i]], b = S[chain[i + 1]] || a;
          if (!a || !b) continue;
          ctx.fillStyle = css([0, 0, 100], 0.8);
          ctx.beginPath();
          ctx.arc(lerp(a[0], b[0], f), lerp(a[1], b[1], f), g.px(2.4), 0, TAU);
          ctx.fill();
        }
      }
    }
  },

  /**
   * The names. Written in screen pixels, and dropped where two would
   * collide — a map with overlapping type is worse than one with fewer
   * names on it. Interchanges and stations that have just opened win.
   */
  overlay(g) {
    const { ctx, pal, w, h } = g;
    const runs = openRuns(g);
    const seen = {};
    for (const r of runs) {
      const chain = r.line[2];
      const last = lerp(r.from, r.to, r.grow);
      for (let i = r.from; i <= Math.round(last); i++) {
        const n = chain[i];
        if (!n || !S[n]) continue;
        if (!seen[n]) seen[n] = { lines: new Set(), year: r.year };
        seen[n].lines.add(r.line[1]);
        seen[n].year = Math.min(seen[n].year, r.year);
      }
    }

    const size = Math.max(11, Math.round(Math.min(w, h) * 0.030));
    ctx.font = `500 ${size}px Inter, system-ui, "Hiragino Sans", sans-serif`;
    ctx.textBaseline = 'middle';

    const items = Object.keys(seen).map((name) => {
      const [x, y, side] = S[name];
      const c = seen[name];
      const p = g.screen(x, y);
      const fresh = g.justNow(c.year, 3);
      return { name, p, side, inter: c.lines.size > 1, fresh,
               age: clamp((g.year - c.year) / 1.2),
               rank: (c.lines.size > 1 ? 2 : 0) + fresh * 6
                     + clamp(1 - Math.hypot(p.x - w / 2, p.y - h / 2) / (w * 0.7)) };
    }).filter((q) => q.age > 0.02 && q.p.x > -60 && q.p.x < w + 60 && q.p.y > h * 0.30 && q.p.y < h - 24)
      .sort((a, b) => b.rank - a.rank);

    const placed = [];
    for (const q of items) {
      const tw = ctx.measureText(q.name).width;
      const off = q.inter ? 13 : 10;
      let bx = q.p.x, by = q.p.y;
      if (q.side === 'l') bx -= off + tw / 2;
      else if (q.side === 'r') bx += off + tw / 2;
      else by += q.side === 't' ? -(off + 4) : (off + 5);
      const box = { x: bx - tw / 2 - 3, y: by - size * 0.62, w: tw + 6, h: size * 1.24 };
      if (placed.some((o) => !(box.x > o.x + o.w || box.x + box.w < o.x ||
                               box.y > o.y + o.h || box.y + box.h < o.y))) continue;
      placed.push(box);
      ctx.textAlign = 'center';
      const a = q.age * (q.inter ? 1 : 0.86);
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = css(pal.bg, 0.92);
      ctx.strokeText(q.name, bx, by);
      ctx.fillStyle = css(pal.ink, 0.55 + a * 0.42 + q.fresh * 0.2);
      ctx.fillText(q.name, bx, by);
    }
  },

  stamp: (y) => String(y)
};
