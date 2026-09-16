// ─────────────────────────────────────────────────────────────
// The Roman emperors, 27 BC → AD 476.
//
// Five hundred years as a ribbon, every reign drawn to scale. That is
// the whole point: Augustus holds forty-one years and the ribbon crawls,
// and then the third century arrives and emperors go past in a blur —
// twenty-six of them in fifty years, almost all of them murdered. You
// can see the empire coming apart without being told.
//
// The camera zooms with the reign it is on, so a long peace opens the
// view out and a crisis closes it right in.
//
// Dates are the conventional regnal dates; co-emperors and usurpers are
// left out, or this would be a wall rather than a ribbon.
// ─────────────────────────────────────────────────────────────

import { clamp, css, lerp, TAU } from '../util.js';

// [name, from, to, house, end]  end: 0 natural, 1 murdered, 2 killed in war,
//                                    3 abdicated, 4 died of plague/illness in office
const R = [
  ['アウグストゥス', -27, 14, 0, 0], ['ティベリウス', 14, 37, 0, 0],
  ['カリグラ', 37, 41, 0, 1], ['クラウディウス', 41, 54, 0, 1],
  ['ネロ', 54, 68, 0, 1], ['ガルバ', 68, 69, 1, 1], ['オト', 69, 69, 1, 1],
  ['ウィテリウス', 69, 69, 1, 1], ['ウェスパシアヌス', 69, 79, 2, 0],
  ['ティトゥス', 79, 81, 2, 0], ['ドミティアヌス', 81, 96, 2, 1],
  ['ネルウァ', 96, 98, 3, 0], ['トラヤヌス', 98, 117, 3, 0],
  ['ハドリアヌス', 117, 138, 3, 0], ['アントニヌス・ピウス', 138, 161, 3, 0],
  ['マルクス・アウレリウス', 161, 180, 3, 4], ['コンモドゥス', 180, 192, 3, 1],
  ['ペルティナクス', 193, 193, 1, 1], ['ディディウス・ユリアヌス', 193, 193, 1, 1],
  ['セプティミウス・セウェルス', 193, 211, 4, 0], ['カラカラ', 211, 217, 4, 1],
  ['マクリヌス', 217, 218, 4, 1], ['エラガバルス', 218, 222, 4, 1],
  ['セウェルス・アレクサンデル', 222, 235, 4, 1],
  ['マクシミヌス・トラクス', 235, 238, 5, 1], ['ゴルディアヌス1世', 238, 238, 5, 1],
  ['ゴルディアヌス3世', 238, 244, 5, 1], ['ピリップス・アラブス', 244, 249, 5, 2],
  ['デキウス', 249, 251, 5, 2], ['トレボニアヌス・ガッルス', 251, 253, 5, 1],
  ['アエミリアヌス', 253, 253, 5, 1], ['ウァレリアヌス', 253, 260, 5, 2],
  ['ガッリエヌス', 253, 268, 5, 1], ['クラウディウス2世', 268, 270, 5, 4],
  ['クインティッルス', 270, 270, 5, 1], ['アウレリアヌス', 270, 275, 5, 1],
  ['タキトゥス', 275, 276, 5, 1], ['プロブス', 276, 282, 5, 1],
  ['カルス', 282, 283, 5, 0], ['カリヌス', 283, 285, 5, 1],
  ['ディオクレティアヌス', 284, 305, 6, 3], ['ガレリウス', 305, 311, 6, 4],
  ['コンスタンティヌス1世', 306, 337, 7, 0], ['コンスタンティウス2世', 337, 361, 7, 4],
  ['ユリアヌス', 361, 363, 7, 2], ['ヨウィアヌス', 363, 364, 7, 0],
  ['ウァレンティニアヌス1世', 364, 375, 8, 0], ['ウァレンス', 364, 378, 8, 2],
  ['グラティアヌス', 375, 383, 8, 1], ['テオドシウス1世', 379, 395, 8, 4],
  ['ホノリウス', 395, 423, 8, 4], ['ウァレンティニアヌス3世', 425, 455, 8, 1],
  ['マヨリアヌス', 457, 461, 9, 1], ['アンテミウス', 467, 472, 9, 1],
  ['ロムルス・アウグストゥルス', 475, 476, 9, 3]
];

const HOUSE = [
  [352, 46, 52], [24, 50, 50], [44, 48, 48], [96, 36, 46],
  [186, 40, 48], [16, 62, 46], [268, 40, 52], [212, 46, 52],
  [40, 34, 50], [0, 12, 44]
];
const HOUSE_NAME = [
  'ユリウス・クラウディウス朝', '内乱の年', 'フラウィウス朝', '五賢帝',
  'セウェルス朝', '軍人皇帝時代', '四分統治', 'コンスタンティヌス朝',
  'ウァレンティニアヌス・テオドシウス朝', '西帝国の末期'
];
const END = ['病死・自然死', '殺害', '戦死・捕囚', '退位', '病により在位中に死去'];

const NOTE = {
  'アウグストゥス': '共和政の衣をまとった帝政が始まる',
  'ネロ': 'ローマ大火。四代で血統が絶える',
  'ウェスパシアヌス': '内乱を制した属州出身の将軍。コロッセウム着工',
  'トラヤヌス': '版図が史上最大に達する',
  'マルクス・アウレリウス': '疫病と戦争のなかで『自省録』を書いた',
  'コンモドゥス': '闘技場に立った皇帝。ここから坂を下る',
  'ペルティナクス': '近衛隊に殺され、帝位が競売にかけられる',
  'マクシミヌス・トラクス': '元老院を踏まえない最初の兵士皇帝。半世紀の混乱が始まる',
  'ウァレリアヌス': 'ペルシアに捕らえられた唯一の皇帝',
  'アウレリアヌス': '分裂した帝国を再統一。「世界の修復者」',
  'ディオクレティアヌス': '四分統治。自ら退位した唯一の皇帝',
  'コンスタンティヌス1世': 'キリスト教を公認し、都をコンスタンティノープルへ',
  'テオドシウス1世': '帝国を東西に分けて息子たちに遺す',
  'ロムルス・アウグストゥルス': '退位。西ローマ帝国が終わる'
};

export const topic = {
  id: 'emperors',
  title: 'ローマ皇帝',
  subtitle: '前27 → 476',
  palette: { bg: [228, 22, 8], ink: [38, 16, 88], ghost: [226, 14, 22] },

  events() {
    return R.map((e, i) => ({
      t: e[1], i,
      label: NOTE[e[0]] ? `${e[0]} ― ${NOTE[e[0]]}` : `${e[0]} 即位`
    }));
  },

  focus(g) {
    const { w, h } = g;
    const e = R[g.index];
    const reign = Math.max(1, e[2] - e[1]);
    // a long reign opens the view; a year on the throne closes it right in
    const span = clamp(reign * 5.5, 18, 105);
    return { x: g.year, y: 0, S: w / span };
  },

  draw(g) {
    const { ctx, pal } = g;
    const H = g.px(g.h * 0.30), y0 = -H / 2;
    const now = g.year;

    // the whole span, unlit, so the end is always in view on the strip
    ctx.fillStyle = css(pal.ghost, 0.55);
    ctx.fillRect(-30, y0, 506, H);

    for (let i = 0; i < R.length; i++) {
      const [name, a, b, house, end] = R[i];
      const wd = Math.max(0.45, b - a);
      const col = HOUSE[house];
      const past = now >= b, live = now >= a && now < b;
      ctx.fillStyle = css(col, now >= a ? (past ? 0.72 : 0.95) : 0.16);
      ctx.fillRect(a, y0, wd, H);
      ctx.strokeStyle = css(pal.bg, 0.9);
      ctx.lineWidth = g.px(1);
      ctx.strokeRect(a, y0, wd, H);

      // how it ended, marked at the end of the reign
      if (now >= b && end === 1) {
        ctx.strokeStyle = css([2, 76, 56], 0.95);
        ctx.lineWidth = g.px(2.4);
        ctx.beginPath();
        ctx.moveTo(b, y0 + H * 0.12); ctx.lineTo(b, y0 + H * 0.88);
        ctx.stroke();
      } else if (now >= b && end === 2) {
        ctx.fillStyle = css([28, 70, 56], 0.95);
        ctx.beginPath();
        ctx.arc(b, y0 + H * 0.5, g.px(3.4), 0, TAU);
        ctx.fill();
      }

      // the reigning emperor's name, upright and legible
      if (live && wd * g.cam.S > 26) {
        ctx.save();
        ctx.translate(a + wd / 2, y0 + H / 2);
        ctx.scale(g.px(1), g.px(1));
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `500 ${Math.round(g.h * 0.021)}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = css([col[0], 14, 96], 0.95);
        ctx.fillText(name, 0, 0);
        ctx.restore();
      }
    }

    // the century marks: the only fixed thing to measure against
    ctx.textAlign = 'center';
    for (let c = -100; c <= 500; c += 25) {
      const major = c % 100 === 0;
      ctx.strokeStyle = css(pal.ink, major ? 0.3 : 0.13);
      ctx.lineWidth = g.px(1);
      ctx.beginPath();
      ctx.moveTo(c, y0 + H + g.px(6)); ctx.lineTo(c, y0 + H + g.px(major ? 16 : 10));
      ctx.stroke();
      if (major) {
        ctx.save();
        ctx.translate(c, y0 + H + g.px(34));
        ctx.scale(g.px(1), g.px(1));
        ctx.font = `300 ${Math.round(g.h * 0.016)}px "JetBrains Mono", monospace`;
        ctx.fillStyle = css(pal.ink, 0.42);
        ctx.fillText(c < 0 ? `前${-c}` : String(c), 0, 0);
        ctx.restore();
      }
    }

    // the present
    ctx.strokeStyle = css([40, 80, 70], 0.9);
    ctx.lineWidth = g.px(1.6);
    ctx.beginPath();
    ctx.moveTo(now, y0 - g.px(18)); ctx.lineTo(now, y0 + H + g.px(4));
    ctx.stroke();

    // the house being lived through
    const house = R[g.index][3];
    ctx.save();
    ctx.translate(now, y0 - g.px(34));
    ctx.scale(g.px(1), g.px(1));
    ctx.textAlign = 'center';
    ctx.font = `400 ${Math.round(g.h * 0.019)}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = css(HOUSE[house], 0.9, 24);
    ctx.fillText(HOUSE_NAME[house], 0, 0);
    ctx.font = `300 ${Math.round(g.h * 0.015)}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = css(pal.ink, 0.42);
    ctx.fillText(END[R[g.index][4]], 0, Math.round(g.h * 0.024));
    ctx.restore();
  },

  stamp: (y) => (y < 0 ? `前${-y}` : String(y))
};
