// ─────────────────────────────────────────────────────────────
// The periodic table filling up, 1669 → 2010.
//
// Nine substances were known before anyone thought of them as elements
// — gold, silver, copper, iron, lead, tin, mercury, carbon, sulfur —
// and they are on the board from the start. Everything after that has a
// date and a discoverer, and the empty cells are the time left.
//
// Where a discovery is disputed the commonly cited year is used: the
// year the element was first isolated or identified, not the year it
// was named or confirmed.
// ─────────────────────────────────────────────────────────────

import { clamp, css, lerp, TAU } from '../util.js';
import { fitTo } from '../chronicle.js';

// [atomic number, symbol, year, family, who]
const E = [
  [6,'C',-3000,0,'古代より'], [16,'S',-3000,0,'古代より'], [26,'Fe',-3000,1,'古代より'],
  [29,'Cu',-3000,1,'古代より'], [47,'Ag',-3000,1,'古代より'], [50,'Sn',-3000,2,'古代より'],
  [79,'Au',-3000,1,'古代より'], [80,'Hg',-3000,1,'古代より'], [82,'Pb',-3000,2,'古代より'],
  [51,'Sb',-800,2,'古代より'], [33,'As',1250,2,'アルベルトゥス・マグヌス'],
  [83,'Bi',1450,2,'錬金術師たち'], [30,'Zn',1746,1,'マルクグラーフ'],
  [15,'P',1669,0,'ヘニッヒ・ブラント ― 尿から抽出した、最初の「発見された」元素'],
  [27,'Co',1735,1,'ブラント'], [78,'Pt',1735,1,'ウジョーア'], [28,'Ni',1751,1,'クローンステット'],
  [12,'Mg',1755,3,'ブラック'], [1,'H',1766,0,'キャヴェンディッシュ ― 「燃える空気」'],
  [7,'N',1772,0,'ラザフォード'], [8,'O',1774,0,'プリーストリーとシェーレ ― 燃焼の正体が分かる'],
  [17,'Cl',1774,4,'シェーレ'], [25,'Mn',1774,1,'ガーン'], [42,'Mo',1778,1,'イェルム'],
  [52,'Te',1782,2,'ミュラー'], [74,'W',1783,1,'デルュヤル兄弟'], [92,'U',1789,6,'クラプロート'],
  [40,'Zr',1789,1,'クラプロート'], [22,'Ti',1791,1,'グレゴール'], [39,'Y',1794,1,'ガドリン'],
  [24,'Cr',1797,1,'ヴォークラン'], [4,'Be',1798,3,'ヴォークラン'], [41,'Nb',1801,1,'ハチェット'],
  [73,'Ta',1802,1,'エーケベリ'], [58,'Ce',1803,5,'ベルセリウス'], [46,'Pd',1803,1,'ウォラストン'],
  [45,'Rh',1803,1,'ウォラストン'], [76,'Os',1803,1,'テナント'], [77,'Ir',1803,1,'テナント'],
  [19,'K',1807,3,'デイヴィー ― 電気分解で金属を取り出す'], [11,'Na',1807,3,'デイヴィー'],
  [20,'Ca',1808,3,'デイヴィー'], [5,'B',1808,2,'ゲイ＝リュサックとデイヴィー'],
  [56,'Ba',1808,3,'デイヴィー'], [38,'Sr',1808,3,'デイヴィー'], [53,'I',1811,4,'クールトワ'],
  [3,'Li',1817,3,'アルフェドソン'], [48,'Cd',1817,1,'シュトロマイヤー'], [34,'Se',1817,0,'ベルセリウス'],
  [14,'Si',1824,2,'ベルセリウス'], [13,'Al',1825,2,'エルステッド ― 当初は金より高価だった'],
  [35,'Br',1826,4,'バラール'], [90,'Th',1829,6,'ベルセリウス'], [23,'V',1830,1,'セフストレーム'],
  [57,'La',1839,5,'モサンデル'], [68,'Er',1843,5,'モサンデル'], [65,'Tb',1843,5,'モサンデル'],
  [44,'Ru',1844,1,'クラウス'], [55,'Cs',1860,3,'ブンゼンとキルヒホフ ― 分光器が元素を見つけ始める'],
  [37,'Rb',1861,3,'ブンゼンとキルヒホフ'], [81,'Tl',1861,2,'クルックス'], [49,'In',1863,2,'ライヒとリヒター'],
  [2,'He',1868,7,'ジャンサンとロッキャー ― 太陽の光の中に、地球より先に見つかった'],
  [31,'Ga',1875,2,'ボアボードラン ― メンデレーエフが予言した空席が埋まる'],
  [70,'Yb',1878,5,'マリニャック'], [67,'Ho',1878,5,'クレーヴェ'], [69,'Tm',1879,5,'クレーヴェ'],
  [62,'Sm',1879,5,'ボアボードラン'], [21,'Sc',1879,1,'ニルソン ― これも予言どおりの空席'],
  [64,'Gd',1880,5,'マリニャック'], [60,'Nd',1885,5,'ヴェルスバッハ'], [59,'Pr',1885,5,'ヴェルスバッハ'],
  [66,'Dy',1886,5,'ボアボードラン'], [32,'Ge',1886,2,'ヴィンクラー ― メンデレーエフの三つ目の的中'],
  [9,'F',1886,4,'モアッサン ― 単離を試みた化学者が何人も死んだ'],
  [18,'Ar',1894,7,'レイリーとラムゼー ― 空気の中に誰も知らない気体があった'],
  [36,'Kr',1898,7,'ラムゼーとトラヴァース'], [10,'Ne',1898,7,'ラムゼーとトラヴァース'],
  [54,'Xe',1898,7,'ラムゼーとトラヴァース'], [84,'Po',1898,2,'キュリー夫妻 ― 祖国ポーランドに因む'],
  [88,'Ra',1898,3,'キュリー夫妻 ― 暗闇で光った'], [89,'Ac',1899,6,'ドビエルヌ'],
  [86,'Rn',1900,7,'ドルン'], [63,'Eu',1901,5,'ドマルセー'], [71,'Lu',1907,5,'ユルバン'],
  [91,'Pa',1913,6,'ファヤンスとゲーリング'], [72,'Hf',1923,1,'コスターとヘヴェシー'],
  [75,'Re',1925,1,'ノダック夫妻 ― 天然に存在する最後の元素'],
  [43,'Tc',1937,1,'ペリエとセグレ ― 初めて人工的に作られた元素'],
  [87,'Fr',1939,3,'ペレー'], [85,'At',1940,4,'コルソンら'], [93,'Np',1940,6,'マクミランとエイベルソン'],
  [94,'Pu',1940,6,'シーボーグら'], [96,'Cm',1944,6,'シーボーグら'], [95,'Am',1944,6,'シーボーグら'],
  [61,'Pm',1945,5,'マリンスキーら'], [97,'Bk',1949,6,'バークレーで'], [98,'Cf',1950,6,'カリフォルニアで'],
  [99,'Es',1952,6,'水爆実験の灰の中から'], [100,'Fm',1952,6,'同じ灰の中から'],
  [101,'Md',1955,6,'メンデレーエフに因む'], [103,'Lr',1961,6,'ローレンスに因む'],
  [104,'Rf',1964,1,'ドゥブナとバークレーが争う'], [102,'No',1966,6,'ノーベルに因む'],
  [105,'Db',1970,1,'ドゥブナに因む'], [106,'Sg',1974,1,'シーボーグに因む'],
  [107,'Bh',1981,1,'ダルムシュタット'], [109,'Mt',1982,1,'マイトナーに因む'],
  [108,'Hs',1984,1,'ヘッセンに因む'], [110,'Ds',1994,1,'ダルムシュタットに因む'],
  [111,'Rg',1994,1,'レントゲンに因む'], [112,'Cn',1996,1,'コペルニクスに因む'],
  [114,'Fl',1999,2,'フレロフに因む'], [116,'Lv',2000,2,'リバモアに因む'],
  [118,'Og',2002,7,'オガネシアンに因む ― いまのところ最後の元素'],
  [115,'Mc',2003,2,'モスクワに因む'], [113,'Nh',2004,2,'理化学研究所 ― 日本、そしてアジアで初'],
  [117,'Ts',2010,4,'テネシーに因む']
];

const FAMILY = [
  [64, 60, 52],    // 0 非金属
  [200, 34, 56],   // 1 遷移金属
  [28, 54, 54],    // 2 卑金属・半金属
  [352, 50, 58],   // 3 アルカリ・アルカリ土類
  [110, 46, 50],   // 4 ハロゲン
  [268, 42, 60],   // 5 ランタノイド
  [16, 70, 54],    // 6 アクチノイド
  [186, 52, 54]    // 7 貴ガス
];

/** Where an element sits on the board, in columns and rows. */
function cell(z) {
  if (z === 1) return [1, 1];
  if (z === 2) return [18, 1];
  if (z <= 10) return [z <= 4 ? z - 2 : z + 8, 2];
  if (z <= 18) return [z <= 12 ? z - 10 : z, 3];
  if (z <= 36) return [z - 18, 4];
  if (z <= 54) return [z - 36, 5];
  if (z >= 57 && z <= 71) return [z - 54, 8.6];       // ランタノイド
  if (z >= 89 && z <= 103) return [z - 86, 9.6];      // アクチノイド
  if (z <= 86) return [z <= 56 ? z - 54 : z - 68, 6];
  return [z <= 88 ? z - 86 : z - 100, 7];
}

const CW = 1, GAP = 0.11;

export const topic = {
  id: 'elements',
  title: '元素の発見',
  subtitle: '古代 → 2010',
  palette: { bg: [226, 26, 8], ink: [212, 10, 90], ghost: [216, 14, 24] },

  events() {
    const out = E.map(([z, sym, t, fam, who]) => ({ t, z, sym, fam, who, label: `${sym} ― ${who}` }))
      .sort((a, b) => a.t - b.t || a.z - b.z);
    // the ancients arrive together, at the beginning
    return out;
  },

  focus(g) {
    const { w, h } = g;
    const board = { x: 0, y: 0, w: 18 * (CW + GAP), h: 10.6 * (CW + GAP) };
    const wide = fitTo(board, w, h, 0.94, 0.62);
    const e = g.event;
    if (!e || g.fresh < 0.01) return wide;
    // lean in on the cell that just filled
    const [c, r] = cell(e.z);
    // lean in, but never so far that the shape of the board is lost
    const near = fitTo({ x: (c - 5.5) * (CW + GAP), y: (r - 3.6) * (CW + GAP),
                         w: 10 * (CW + GAP), h: 7 * (CW + GAP) }, w, h, 0.9, 0.55);
    const k = Math.pow(g.fresh, 0.8) * 0.6;
    return { x: lerp(wide.x, near.x, k), y: lerp(wide.y, near.y, k), S: lerp(wide.S, near.S, k) };
  },

  draw(g) {
    const { ctx, pal } = g;
    const S = CW + GAP;
    const box = (c, r) => ({ x: (c - 1) * S, y: (r - 1) * S, w: CW, h: CW });

    // the whole board, empty: this is the time left
    ctx.lineWidth = g.px(1);
    for (const [z] of E.map((e) => [e[0]])) {
      const [c, r] = cell(z), b = box(c, r);
      ctx.strokeStyle = css(pal.ghost, 0.8);
      ctx.strokeRect(b.x, b.y, b.w, b.h);
    }

    // and the elements that have been found
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [z, sym, t, fam] of E) {
      if (!g.seen(t)) continue;
      const [c, r] = cell(z), b = box(c, r);
      const land = clamp((g.year - t) / 2.5 + 0.3);
      const pop = 1 + (1 - land) * 0.55;
      ctx.save();
      ctx.translate(b.x + CW / 2, b.y + CW / 2);
      ctx.scale(pop, pop);
      const col = FAMILY[fam];
      ctx.fillStyle = css(col, 0.24 + land * 0.38);
      ctx.fillRect(-CW / 2, -CW / 2, CW, CW);
      ctx.strokeStyle = css(col, 0.55 + land * 0.4);
      ctx.lineWidth = g.px(1.4);
      ctx.strokeRect(-CW / 2, -CW / 2, CW, CW);
      // lettering is drawn in a hundred-unit box scaled down to the cell:
      // a font size below a pixel gets rasterised badly whatever the camera
      ctx.scale(CW / 100, CW / 100);
      ctx.fillStyle = css([col[0], Math.min(40, col[1]), 94], 0.5 + land * 0.5);
      ctx.font = '500 42px Inter, system-ui, sans-serif';
      ctx.fillText(sym, 0, 5);
      ctx.font = '300 19px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillStyle = css([col[0], 20, 90], 0.36 + land * 0.3);
      ctx.fillText(String(z), 0, -30);
      ctx.restore();

      // the flash as it lands
      const fl = g.justNow(t, 2.5);
      if (fl > 0.02) {
        ctx.strokeStyle = css([col[0], 40, 96], fl * 0.55);
        ctx.lineWidth = g.px(1.5 + fl * 3);
        const e2 = CW * 0.5 + fl * CW * 0.3;
        ctx.strokeRect(b.x + CW / 2 - e2, b.y + CW / 2 - e2, e2 * 2, e2 * 2);
      }
    }
  },

  stamp: (y) => (y < 0 ? `前${-y}` : String(y))
};
