// ─────────────────────────────────────────────────────────────
// The Nobel Prizes, 1901 → 2023.
//
// Six lanes, one per prize, and time running left to right. What the
// shape of it shows before you read a word: the gaps where the wars
// were and nothing was awarded, the Peace prize going unawarded most
// years of both of them, and the Economic Sciences lane simply not
// existing until 1969 — it is not one of Nobel's, it was added by
// Sweden's central bank.
//
// A selection rather than the whole list: about a hundred of the two
// hundred and twenty, chosen so that what the prize was actually for
// can be said in a line.
// ─────────────────────────────────────────────────────────────

import { clamp, css, lerp, TAU } from '../util.js';

const LANES = ['物理学', '化学', '生理学・医学', '文学', '平和', '経済学'];
const LANE_COL = [
  [206, 52, 52], [150, 42, 46], [4, 52, 54],
  [268, 38, 56], [44, 62, 54], [30, 34, 48]
];

// [year, lane, laureate, what it was for]
const P = [
  [1901, 0, 'レントゲン', 'X線の発見。体の中を切らずに見た最初の人'],
  [1901, 4, 'デュナン／パシー', '赤十字の創設と、国際仲裁の提唱'],
  [1903, 0, 'キュリー夫妻／ベクレル', '放射能の研究。マリ・キュリーは女性初の受賞者'],
  [1905, 2, 'コッホ', '結核菌の発見'],
  [1906, 2, 'ゴルジ／カハール', '神経系の構造。脳が細胞でできていると示した'],
  [1908, 1, 'ラザフォード', '元素が別の元素に変わることの発見'],
  [1911, 1, 'マリ・キュリー', 'ラジウムとポロニウムの発見。二分野での受賞は史上初'],
  [1913, 3, 'タゴール', 'アジアで最初の文学賞'],
  [1914, -1, '', '第一次世界大戦。以後四年、多くの部門で受賞者なし'],
  [1918, 1, 'ハーバー', '空気から窒素肥料を作る方法。世界の食糧と、同時に火薬を増やした'],
  [1921, 0, 'アインシュタイン', '光電効果の発見。相対性理論ではない'],
  [1922, 0, 'ボーア', '原子の構造'],
  [1923, 2, 'バンティング／マクラウド', 'インスリンの発見。糖尿病が死の病でなくなる'],
  [1929, 2, 'エイクマン／ホプキンズ', 'ビタミンの発見'],
  [1932, 0, 'ハイゼンベルク', '量子力学の創始'],
  [1933, 0, 'シュレーディンガー／ディラック', '原子理論の新しい形'],
  [1935, 4, 'オシエツキー', 'ドイツの再軍備を暴いた記者。強制収容所にいて受け取れなかった'],
  [1938, 3, 'パール・バック', '中国の農民の生活を描いた作品に'],
  [1940, -1, '', '第二次世界大戦。一九四三年まで授賞が止まる'],
  [1945, 2, 'フレミング／チェイン／フローリー', 'ペニシリンの発見。感染症で人が死ななくなる'],
  [1945, 1, 'ヴィルタネン', '飼料の保存法'],
  [1949, 3, 'フォークナー', ''],
  [1949, 2, 'モニス', 'ロボトミー。いまでは誤りだったと評価される受賞'],
  [1952, 4, 'シュヴァイツァー', '生命への畏敬'],
  [1954, 1, 'ポーリング', '化学結合の本質。八年後に平和賞も受ける'],
  [1954, 3, 'ヘミングウェイ', ''],
  [1956, 0, 'ショックレー／バーディーン／ブラッテン', 'トランジスタの発明。あらゆる電子機器の元になる'],
  [1957, 0, '楊振寧／李政道', 'パリティ非保存。物理法則が鏡像で同じでないことを示す'],
  [1958, 1, 'サンガー', 'インスリンの構造決定。のちに一九八〇年にも受賞する'],
  [1962, 2, 'ワトソン／クリック／ウィルキンス', 'DNAの二重らせん。ロザリンド・フランクリンの写真が鍵だった'],
  [1962, 1, 'ペルーツ／ケンドリュー', 'タンパク質の立体構造'],
  [1964, 4, 'キング牧師', '非暴力による公民権運動。三十五歳での受賞'],
  [1965, 0, '朝永振一郎／シュウィンガー／ファインマン', '量子電磁力学'],
  [1968, 3, '川端康成', '日本人で最初の文学賞'],
  [1969, 5, 'フリッシュ／ティンバーゲン', '経済学賞の第一回。ノーベルの遺言にはなく、中央銀行が設けた賞'],
  [1970, 4, 'ボーローグ', '小麦の品種改良。「緑の革命」が十億人を飢えから救ったとされる'],
  [1973, 2, 'ローレンツ／ティンバーゲン／フリッシュ', '動物行動学。ミツバチのダンスの解読を含む'],
  [1974, 0, 'ライル／ヒューイッシュ', '電波天文学とパルサーの発見'],
  [1975, 4, 'サハロフ', 'ソ連の物理学者による人権活動。出国を許されなかった'],
  [1978, 4, 'サダト／ベギン', 'エジプトとイスラエルの和平'],
  [1979, 4, 'マザー・テレサ', 'カルカッタでの活動'],
  [1981, 1, '福井謙一／ホフマン', 'フロンティア軌道理論'],
  [1983, 2, 'マクリントック', '動く遺伝子。三十年前の発見がようやく認められた'],
  [1985, 1, 'ハウプトマン／カール', '結晶構造の直接決定法'],
  [1986, 3, 'ソインカ', 'アフリカで最初の文学賞'],
  [1987, 1, 'クラム／レーン／ペダーセン', '分子を認識する分子。超分子化学の始まり'],
  [1989, 4, 'ダライ・ラマ14世', '非暴力による解決の主張'],
  [1991, 4, 'アウンサンスーチー', '自宅軟禁下での受賞。息子が代理で受け取った'],
  [1993, 4, 'マンデラ／デクラーク', 'アパルトヘイトの平和的な終結'],
  [1993, 1, 'マリス／スミス', 'PCR法。DNAを何百万倍にも増やせるようになる'],
  [1995, 1, 'クルッツェン／モリーナ／ローランド', 'オゾン層の破壊の機構。国際条約につながった'],
  [1997, 2, 'プルシナー', 'プリオン。遺伝子を持たない病原体という考え'],
  [2000, 0, 'アルフェロフ／クレーマー／キルビー', '半導体ヘテロ構造と集積回路'],
  [2001, 1, '野依良治／ノールズ／シャープレス', '不斉合成。右手型と左手型を作り分ける'],
  [2002, 1, '田中耕一', '生体高分子の質量分析。企業の技術者としての受賞'],
  [2002, 0, '小柴昌俊／デイビス／ジャコーニ', 'ニュートリノの観測。カミオカンデ'],
  [2005, 2, 'マーシャル／ウォレン', '胃潰瘍の原因はピロリ菌。自ら飲んで証明した'],
  [2006, 4, 'ユヌス／グラミン銀行', 'マイクロクレジット。担保のない人に貸す'],
  [2008, 0, '南部陽一郎／小林誠／益川敏英', '自発的対称性の破れとCP対称性の破れ'],
  [2008, 1, '下村脩／チャルフィー／ツィエン', '緑色蛍光タンパク質。細胞の中が光って見えるようになる'],
  [2010, 1, '根岸英一／鈴木章／ヘック', 'クロスカップリング。炭素と炭素を自在につなぐ'],
  [2012, 2, '山中伸弥／ガードン', 'iPS細胞。大人の細胞を初期化できると示した'],
  [2014, 0, '赤﨑勇／天野浩／中村修二', '青色発光ダイオード。白色LED照明が可能になる'],
  [2014, 4, 'マララ・ユスフザイ', '女子教育のための活動。十七歳、史上最年少の受賞'],
  [2015, 2, '大村智／キャンベル／屠呦呦', '寄生虫症とマラリアの治療薬'],
  [2016, 2, '大隅良典', 'オートファジー。細胞が自分を分解して作り直す仕組み'],
  [2016, 3, 'ボブ・ディラン', '歌詞に対する文学賞。本人はしばらく連絡に応じなかった'],
  [2017, 4, 'ICAN', '核兵器禁止条約への貢献'],
  [2018, 1, 'アーノルド／スミス／ウィンター', '進化を試験管の中で起こして酵素を作る'],
  [2019, 1, '吉野彰／グッドイナフ／ウィッティンガム', 'リチウムイオン電池。持ち運べる電気の始まり'],
  [2020, 1, 'シャルパンティエ／ダウドナ', 'CRISPR。遺伝子を書き換える鋏'],
  [2021, 0, '真鍋淑郎／ハッセルマン／パリージ', '気候モデル。二酸化炭素が地球を暖めると計算で示した'],
  [2023, 2, 'カリコ／ワイスマン', 'mRNAワクチンを可能にした修飾ヌクレオシドの発見']
];

const Y0 = 1901, Y1 = 2024;

export const topic = {
  id: 'nobel',
  title: 'ノーベル賞',
  subtitle: '1901 → 2023',
  palette: { bg: [224, 24, 8], ink: [42, 18, 88], ghost: [222, 14, 20], gold: [44, 66, 56] },

  events() {
    return P.map(([t, lane, who, what], i) => ({
      t, i, lane, who,
      label: lane < 0 ? what : `${LANES[lane]}　${who}${what ? ' ― ' + what : ''}`
    })).sort((a, b) => a.t - b.t);
  },

  focus(g) {
    const { w, h } = g;
    // years per screen, wide enough to see the neighbours and the gaps
    const span = 26;
    const S = w / span;
    const laneH = (h * 0.082) / S;
    return { x: g.year + span * 0.05, y: laneH * 2.5 + (h / 2 - h * 0.60) / S, S };
  },

  draw(g) {
    const { ctx, pal } = g;
    const now = g.year;
    // the lanes are sized in screen terms, not in years
    const laneH = (g.h * 0.082) / g.cam.S;

    // the lanes
    for (let l = 0; l < LANES.length; l++) {
      const y = l * laneH;
      ctx.strokeStyle = css(LANE_COL[l], 0.16);
      ctx.lineWidth = laneH * 0.72;
      ctx.beginPath();
      const from = l === 5 ? 1969 : Y0;
      ctx.moveTo(Math.max(from, now - 22), y);
      ctx.lineTo(now + 22, y);
      ctx.stroke();
      // the economics lane simply does not exist before 1969
      if (l === 5 && now - 22 < 1969) {
        ctx.strokeStyle = css(pal.ink, 0.1);
        ctx.setLineDash([g.px(3), g.px(6)]);
        ctx.lineWidth = g.px(1);
        ctx.beginPath(); ctx.moveTo(now - 22, y); ctx.lineTo(Math.min(1969, now + 22), y); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // decade marks
    ctx.strokeStyle = css(pal.ink, 0.14);
    ctx.lineWidth = g.px(1);
    for (let yr = 1900; yr <= 2030; yr += 10) {
      if (Math.abs(yr - now) > 24) continue;
      ctx.beginPath();
      ctx.moveTo(yr, -laneH * 0.75); ctx.lineTo(yr, laneH * 5.75);
      ctx.stroke();
    }

    // the prizes
    for (const [t, lane, who] of P) {
      if (lane < 0 || Math.abs(t - now) > 24) continue;
      const y = lane * laneH;
      const given = now >= t;
      const r = g.px(given ? 7 : 4.5);
      ctx.beginPath(); ctx.arc(t, y, r, 0, TAU);
      ctx.fillStyle = given ? css(LANE_COL[lane], 0.95, 8) : css(pal.ghost, 0.5);
      ctx.fill();
      if (given) {
        ctx.strokeStyle = css(pal.gold, 0.5);
        ctx.lineWidth = g.px(1.2);
        ctx.stroke();
      }
      const fl = g.justNow(t, 2);
      if (fl > 0.02) {
        ctx.strokeStyle = css(pal.gold, fl * 0.85);
        ctx.lineWidth = g.px(2);
        ctx.beginPath(); ctx.arc(t, y, g.px(8 + (1 - fl) * 26), 0, TAU); ctx.stroke();
      }
    }

    // the years no prize was given: the wars leave a hole in the lanes
    for (const [a, b] of [[1914, 1918], [1940, 1943]]) {
      if (b < now - 24 || a > now + 24) continue;
      ctx.fillStyle = css(pal.bg, 0.72);
      ctx.fillRect(a - 0.4, -laneH * 0.62, (b - a) + 0.8, laneH * 5.95);
      ctx.strokeStyle = css([2, 50, 40], 0.5);
      ctx.lineWidth = g.px(1);
      ctx.strokeRect(a - 0.4, -laneH * 0.62, (b - a) + 0.8, laneH * 5.95);
    }

    // the present
    ctx.strokeStyle = css(pal.gold, 0.8);
    ctx.lineWidth = g.px(1.4);
    ctx.beginPath();
    ctx.moveTo(now, -laneH * 0.85); ctx.lineTo(now, laneH * 5.85);
    ctx.stroke();
  },

  overlay(g) {
    const { ctx, pal, w, h } = g;
    const size = Math.max(11, Math.round(Math.min(w, h) * 0.028));
    ctx.font = `500 ${size}px Inter, system-ui, "Hiragino Sans", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let l = 0; l < LANES.length; l++) {
      const laneH = (h * 0.082) / g.cam.S;
      const p = g.screen(g.cam.x, l * laneH);
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = css(pal.bg, 0.9);
      ctx.strokeText(LANES[l], 12, p.y);
      ctx.fillStyle = css(LANE_COL[l], 0.9, 24);
      ctx.fillText(LANES[l], 12, p.y);
    }
    // the laureate being read
    const e = g.event;
    if (e && e.lane >= 0) {
      const live = clamp(1 - g.travel * 1.5);
      if (live < 0.03) return;
      const laneH = (h * 0.082) / g.cam.S;
      const p = g.screen(e.t, e.lane * laneH);
      const big = Math.max(13, Math.round(Math.min(w, h) * 0.036));
      ctx.font = `600 ${big}px Inter, system-ui, "Hiragino Sans", sans-serif`;
      ctx.textAlign = p.x > w * 0.6 ? 'right' : 'left';
      const dx = p.x > w * 0.6 ? -16 : 16;
      ctx.lineWidth = 5;
      ctx.strokeStyle = css(pal.bg, 0.92 * live);
      ctx.strokeText(e.who, p.x + dx, p.y);
      ctx.fillStyle = css(pal.ink, 0.97 * live);
      ctx.fillText(e.who, p.x + dx, p.y);
    }
  },

  stamp: (y) => String(Math.round(y))
};
