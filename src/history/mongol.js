// ─────────────────────────────────────────────────────────────
// The Mongol conquests, 1206 → 1294.
//
// In 1206 a man named Temüjin was acclaimed Chinggis Khan by an assembly
// of steppe tribes. Within a lifetime and a half his family ruled from
// the Pacific to the Danube — the largest contiguous land empire there
// has ever been. The speed of it is the thing worth feeling, and the
// speed is what a clock can show.
//
// The frontier here is an envelope drawn around the cities and campaigns
// that had fallen by a given year: the real borders of a steppe empire
// were never a line on a map, so this is the shape of its reach rather
// than a claim about where it ended.
// ─────────────────────────────────────────────────────────────

import { clamp, css, lerp, TAU, makeRng } from '../util.js';
import { fitTo, growBox } from '../history.js';

// A coarse Eurasia: x runs from the Atlantic to the Pacific, y from the
// Arctic to the Indian Ocean. Enough of a shape to know where you are.
const COAST = [
  [[0.075,0.26],[0.055,0.34],[0.075,0.42],[0.045,0.47],[0.075,0.505],[0.115,0.49],
   [0.145,0.545],[0.175,0.525],[0.205,0.565],[0.245,0.545],[0.275,0.555],[0.285,0.60],
   [0.305,0.655],[0.335,0.695],[0.365,0.66],[0.345,0.615],[0.385,0.60],[0.415,0.625],
   [0.445,0.595],[0.475,0.64],[0.495,0.755],[0.525,0.655],[0.555,0.615],[0.585,0.635],
   [0.615,0.665],[0.645,0.735],[0.675,0.70],[0.695,0.635],[0.735,0.615],[0.775,0.565],
   [0.805,0.495],[0.815,0.44],[0.845,0.40],[0.835,0.355],[0.865,0.315],[0.885,0.245],
   [0.895,0.165],[0.855,0.115],[0.775,0.085],[0.665,0.065],[0.545,0.06],[0.425,0.075],
   [0.315,0.095],[0.215,0.125],[0.135,0.175]]
];
// Japan, and the big inland seas
const ISLANDS = [
  [[0.895,0.345],[0.925,0.305],[0.945,0.325],[0.935,0.375],[0.905,0.405],[0.885,0.385]]
];
const SEAS = [
  [[0.195,0.485],[0.245,0.475],[0.265,0.495],[0.235,0.515],[0.195,0.51]],      // 黒海
  [[0.295,0.455],[0.325,0.45],[0.335,0.515],[0.305,0.535],[0.29,0.50]],        // カスピ海
  [[0.375,0.415],[0.405,0.41],[0.41,0.445],[0.38,0.45]],                       // アラル海
  [[0.115,0.535],[0.265,0.555],[0.255,0.585],[0.115,0.565]]                    // 地中海
];

// [name, x, y, year, note]
const CITIES = [
  ['カラコルム', 0.665, 0.275, 1235, '帝国の都が草原に築かれる'],
  ['北京（中都）', 0.795, 0.375, 1215, '金の中都が落ちる'],
  ['サマルカンド', 0.405, 0.455, 1220, 'ホラズムの都。抵抗した街は消された'],
  ['ブハラ', 0.375, 0.470, 1220, ''],
  ['カルカ河', 0.240, 0.435, 1223, '偵察隊がルーシ諸侯連合を破る'],
  ['開封', 0.775, 0.445, 1233, '金が滅びる'],
  ['リャザン', 0.235, 0.345, 1237, '冬、凍った川を道にして北上する'],
  ['キエフ', 0.205, 0.395, 1240, 'ルーシの都が焼かれる'],
  ['レグニツァ', 0.145, 0.345, 1241, 'ポーランド・ドイツ連合軍を破る'],
  ['モヒ', 0.165, 0.405, 1241, 'ハンガリー軍を破る。翌年、大ハンの死で撤退'],
  ['バグダード', 0.300, 0.565, 1258, 'アッバース朝の五百年が終わる'],
  ['アイン・ジャールート', 0.258, 0.585, 1260, 'マムルーク軍に敗れる。西への進撃が止まる'],
  ['大都', 0.800, 0.372, 1271, 'フビライが国号を元と定める'],
  ['臨安', 0.800, 0.495, 1276, '南宋の都が無血開城する'],
  ['厓山', 0.780, 0.545, 1279, '南宋が海の上で滅びる'],
  ['博多', 0.898, 0.372, 1274, '元寇。暴風で艦隊が失われる'],
  ['デリー', 0.470, 0.615, 1299, 'ここは越えられなかった']
];

const EVENTS = [
  [1206, '', 'テムジンがチンギス・ハンとなる ― 草原の諸部族が一つになる'],
  [1209, '', '西夏を従える'],
  [1211, '', '金へ侵攻。万里の長城を越える'],
  [1215, '北京（中都）', ''],
  [1218, '', '西遼を併合。イスラム世界と国境を接する'],
  [1219, '', '使節団の虐殺を口実にホラズムへ西征'],
  [1220, 'サマルカンド', ''],
  [1223, 'カルカ河', ''],
  [1227, '', 'チンギス・ハン死す。遺体の場所はいまも分からない'],
  [1229, '', 'オゴデイが第二代ハンに'],
  [1233, '開封', ''],
  [1235, 'カラコルム', ''],
  [1237, 'リャザン', ''],
  [1240, 'キエフ', ''],
  [1241, 'レグニツァ', ''],
  [1242, '', 'オゴデイの訃報が届き、軍はヨーロッパから引き返す'],
  [1258, 'バグダード', ''],
  [1260, 'アイン・ジャールート', ''],
  [1264, '', 'フビライが即位。帝国は四つの汗国に分かれていく'],
  [1271, '大都', ''],
  [1274, '博多', ''],
  [1276, '臨安', ''],
  [1279, '厓山', ''],
  [1281, '博多', '二度目の元寇。再び艦隊が失われる'],
  [1294, '', 'フビライ死す。ユーラシアの半分が一つの家の下にあった']
];

const cityOf = (n) => CITIES.find((c) => c[0] === n);

export const topic = {
  id: 'mongol',
  title: 'モンゴル帝国',
  subtitle: '1206 → 1294',
  palette: {
    bg: [30, 18, 9], ink: [36, 24, 86], ghost: [34, 14, 22],
    land: [36, 16, 17], sea: [206, 34, 15], empire: [8, 66, 46], edge: [20, 78, 58]
  },

  events() {
    return EVENTS.map(([t, city, note]) => {
      const c = city ? cityOf(city) : null;
      return { t, city: c, label: note || (c ? `${c[0]} ― ${c[4]}` : '') };
    });
  },

  focus(g) {
    const { w, h } = g;
    // the frame follows the frontier: it starts on the Mongolian steppe
    // and opens out as the reach of the empire does
    let box = { x: 0.62, y: 0.245, w: 0.10, h: 0.07 };
    for (const c of CITIES) if (g.seen(c[3])) box = growBox(box, c[1], c[2], 0.05);
    const wide = fitTo(box, w, h, 0.9, 0.56);
    const e = g.event;
    if (e && e.city && g.fresh > 0.01) {
      const near = fitTo({ x: e.city[1] - 0.10, y: e.city[2] - 0.075, w: 0.20, h: 0.15 }, w, h, 0.8, 0.5);
      const k = Math.pow(g.fresh, 0.75) * 0.6;
      return { x: lerp(wide.x, near.x, k), y: lerp(wide.y, near.y, k),
               S: lerp(wide.S, Math.min(near.S, wide.S * 2.4), k) };
    }
    return wide;
  },

  draw(g) {
    const { ctx, pal } = g;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // the land
    for (const poly of COAST) {
      ctx.beginPath();
      poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = css(pal.land, 1);
      ctx.fill();
      ctx.strokeStyle = css(pal.ink, 0.18);
      ctx.lineWidth = g.px(1);
      ctx.stroke();
    }
    for (const poly of ISLANDS) {
      ctx.beginPath();
      poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = css(pal.land, 1); ctx.fill();
      ctx.strokeStyle = css(pal.ink, 0.18); ctx.lineWidth = g.px(1); ctx.stroke();
    }
    for (const poly of SEAS) {
      ctx.beginPath();
      poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = css(pal.sea, 1);
      ctx.fill();
    }

    // the reach of the empire: a soft envelope round everything taken
    const held = CITIES.filter((c) => g.seen(c[3]));
    if (held.length) {
      ctx.save();
      for (const c of held) {
        const age = clamp((g.year - c[3]) / 4 + 0.25);
        const r = 0.055 + age * 0.045;
        const grd = ctx.createRadialGradient(c[1], c[2], r * 0.15, c[1], c[2], r);
        grd.addColorStop(0, css(pal.empire, 0.5));
        grd.addColorStop(1, css(pal.empire, 0));
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(c[1], c[2], r, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }

    // only the campaigns of the last few years are drawn, so the map shows
    // an army moving rather than a web of every march ever made
    ctx.lineWidth = g.px(1.8);
    for (let i = Math.max(1, held.length - 4); i < held.length; i++) {
      const a = held[i - 1], b = held[i];
      const t = clamp((g.year - b[3]) / 2.2);
      const age = clamp(1 - (g.year - b[3]) / 26);
      if (t <= 0 || age <= 0) continue;
      const mx = (a[1] + b[1]) / 2, my = (a[2] + b[2]) / 2 - Math.abs(b[1] - a[1]) * 0.22;
      ctx.strokeStyle = css(pal.edge, (0.25 + 0.4 * t) * age);
      ctx.beginPath();
      ctx.moveTo(a[1], a[2]);
      ctx.quadraticCurveTo(mx, my, lerp(a[1], b[1], t), lerp(a[2], b[2], t));
      ctx.stroke();
    }

    // the cities
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const c of CITIES) {
      const on = g.seen(c[3]);
      ctx.fillStyle = css(on ? pal.edge : pal.ink, on ? 0.95 : 0.22);
      ctx.beginPath(); ctx.arc(c[1], c[2], g.px(on ? 4 : 2.4), 0, TAU); ctx.fill();
      const fl = g.justNow(c[3], 3);
      if (fl > 0.02) {
        ctx.strokeStyle = css([40, 86, 66], fl * 0.9);
        ctx.lineWidth = g.px(2);
        ctx.beginPath(); ctx.arc(c[1], c[2], g.px(6 + (1 - fl) * 22), 0, TAU); ctx.stroke();
      }
      // a name is dropped when a nearer, later city has already claimed the space
      let crowded = false;
      for (const o of CITIES) {
        if (o === c || !g.seen(o[3])) continue;
        if (Math.hypot(o[1] - c[1], o[2] - c[2]) < 0.028 && o[3] > c[3]) crowded = true;
      }
      if (on && !crowded) {
        ctx.save();
        ctx.translate(c[1] + g.px(8), c[2]);
        ctx.scale(g.px(1), g.px(1));
        ctx.font = `400 ${Math.round(g.h * 0.017)}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = css(pal.ink, 0.66);
        ctx.fillText(c[0], 0, 0);
        ctx.restore();
      }
    }
  },

  stamp: (y) => String(y)
};
