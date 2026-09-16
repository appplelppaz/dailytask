// ─────────────────────────────────────────────────────────────
// World history on the map, 紀元前3300年 → 1991.
//
// Every event has a place. Putting them on a map instead of in a list
// is the whole point: you see that writing and law and the wheel come
// out of the same few hundred miles of Mesopotamia, that the fourteenth
// century happens to Eurasia all at once, that the nineteenth is Europe
// reaching outward and the twentieth is the reach coming apart.
//
// The camera flies to each event and holds there while you read it, and
// a thread is drawn back to where the last one happened.
// ─────────────────────────────────────────────────────────────

import { clamp, css, lerp, TAU } from '../util.js';
import { fitTo } from '../chronicle.js';

// equirectangular: the whole world in a unit square
const X = (lon) => (lon + 180) / 360;
const Y = (lat) => (90 - lat) / 180;
const ring = (pts) => pts.map(([lon, lat]) => [X(lon), Y(lat)]);

const LAND = [
  // アフリカ
  ring([[-17,15],[-16,21],[-12,28],[-6,35],[2,37],[10,37],[20,32],[26,31],[32,31],[35,23],
        [39,15],[43,11],[51,12],[48,4],[41,-2],[40,-10],[35,-19],[33,-26],[28,-33],[20,-35],
        [15,-28],[13,-17],[11,-4],[6,4],[-2,5],[-8,4],[-13,9]]),
  // ユーラシア
  ring([[-10,36],[-9,43],[-2,48],[3,51],[8,54],[10,58],[18,55],[24,60],[30,60],[28,66],
        [22,70],[32,70],[44,68],[60,70],[73,72],[90,76],[105,77],[115,74],[130,72],[142,73],
        [160,70],[170,66],[180,64],[162,60],[155,50],[142,46],[135,35],[122,31],[120,22],
        [108,21],[105,10],[100,4],[98,9],[92,21],[88,22],[80,13],[77,8],[72,20],[66,24],
        [60,25],[52,26],[48,30],[43,40],[36,36],[30,36],[26,40],[19,40],[12,38],[15,44],
        [13,45],[5,43],[-2,43],[-9,44]]),
  // 北アメリカ
  ring([[-168,66],[-160,71],[-140,70],[-125,70],[-110,68],[-95,68],[-82,70],[-70,62],
        [-64,50],[-60,47],[-70,42],[-76,37],[-81,31],[-80,25],[-84,30],[-90,29],[-97,26],
        [-97,21],[-95,16],[-86,15],[-83,9],[-79,9],[-85,13],[-92,16],[-105,20],[-110,24],
        [-114,31],[-124,40],[-124,48],[-135,57],[-150,60],[-160,58],[-165,62]]),
  // 南アメリカ
  ring([[-81,8],[-76,11],[-70,12],[-62,10],[-52,5],[-50,0],[-44,-2],[-35,-6],[-39,-14],
        [-48,-25],[-54,-34],[-58,-39],[-62,-41],[-65,-45],[-68,-52],[-73,-54],[-75,-46],
        [-73,-37],[-71,-28],[-70,-18],[-77,-6],[-80,-3],[-79,2]]),
  // オーストラリア
  ring([[113,-22],[114,-27],[118,-34],[129,-32],[137,-35],[141,-38],[147,-38],[150,-35],
        [153,-28],[146,-19],[142,-11],[136,-12],[130,-12],[126,-14],[120,-18]]),
  // 島々
  ring([[130,31],[132,34],[137,37],[141,41],[142,45],[145,44],[140,38],[136,34],[133,32]]),
  ring([[-6,50],[-3,53],[-3,58],[-5,58],[-6,55],[-5,52]]),
  ring([[95,5],[105,-2],[115,-4],[120,-8],[110,-8],[100,0]]),
  ring([[43,-12],[49,-15],[50,-22],[45,-25],[44,-19]])
];

// [year, lon, lat, title, note]
const E = [
  [-3300, 45.6, 31.3, '文字の発明', 'ウルクの粘土板。人が記憶の外に情報を置いた最初の場所'],
  [-3100, 31.2, 30.0, 'エジプト統一', '上下エジプトが一つの王国になる'],
  [-2560, 31.1, 29.98, 'ギザの大ピラミッド', '二百万個以上の石。底辺の誤差は数センチしかない'],
  [-2500, 68.1, 27.3, 'インダス文明', 'モヘンジョダロ。碁盤目の街路と下水道を備えた都市'],
  [-1750, 44.4, 32.5, 'ハンムラビ法典', '法が石に刻まれ、王の気分ではなく文が裁く'],
  [-1600, 114.3, 36.1, '殷', '甲骨に刻まれた文字から、中国最古の確実な王朝が分かる'],
  [-1274, 36.5, 34.6, 'カデシュの戦い', 'エジプトとヒッタイト。現存する世界最古の和平条約が結ばれる'],
  [-1200, 22.5, 38.5, '青銅器時代の崩壊', '地中海東岸の王国が数十年でまとめて消える'],
  [-753, 12.5, 41.9, 'ローマ建国', '伝説の年。七つの丘の上の村から始まる'],
  [-563, 83.4, 27.5, 'ブッダ', 'ルンビニーに生まれる（年代には諸説ある）'],
  [-551, 117.0, 35.6, '孔子', '魯の国に生まれる'],
  [-508, 23.7, 37.98, 'アテネの民主政', 'クレイステネスの改革。くじ引きで役人を選ぶ'],
  [-334, 26.4, 40.2, 'アレクサンドロス東征', '十一年でインダス川まで到達する'],
  [-221, 108.9, 34.4, '秦の統一', '文字も、ものさしも、車軸の幅までそろえた'],
  [-202, 100.0, 40.0, 'シルクロード', '東西が絹と、思想と、病でつながる'],
  [-44, 12.5, 41.9, 'カエサル暗殺', '共和政ローマが終わりへ向かう'],
  [30, 35.2, 31.8, 'イエスの処刑', 'エルサレム'],
  [105, 113.0, 34.7, '紙', '蔡倫が製法を改良し、記録の値段が桁ちがいに下がる'],
  [117, 12.5, 41.9, 'ローマ最大版図', 'トラヤヌス帝。地中海はローマの内海になった'],
  [313, 9.2, 45.5, 'ミラノ勅令', '迫害されていた宗教が公認される'],
  [476, 12.5, 41.9, '西ローマ帝国滅亡', '最後の皇帝は十六歳で退位した'],
  [610, 39.8, 21.4, 'イスラームの始まり', 'ムハンマドがメッカで啓示を受ける'],
  [645, 135.8, 34.7, '大化の改新', '日本が律令国家へ向かう'],
  [751, 71.0, 42.5, 'タラス河畔の戦い', '唐とアッバース朝が衝突し、製紙法が西へ渡ったと伝わる'],
  [794, 135.8, 35.0, '平安京', '四百年続く都が置かれる'],
  [800, 12.5, 41.9, 'カールの戴冠', '西ヨーロッパという枠組みが形を持ち始める'],
  [1054, 28.98, 41.0, '東西教会の分裂', '互いに破門し合い、千年たっても戻らない'],
  [1066, 0.5, 50.9, 'ノルマン征服', 'ヘイスティングズ。英語の語彙が半分入れ替わる'],
  [1095, 3.1, 45.8, '十字軍', 'クレルモンの教会会議で呼びかけられる'],
  [1206, 106.9, 47.9, 'モンゴル帝国', 'テムジンがチンギス・ハンとなる'],
  [1215, -0.5, 51.4, 'マグナ・カルタ', '王も法の下にあると文書に書かせた'],
  [1271, 116.4, 39.9, '元', 'フビライが国号を定め、都を大都に置く'],
  [1324, -8.0, 17.0, 'マンサ・ムーサの巡礼', 'マリの王が配った金でカイロの金相場が十年崩れた'],
  [1347, 12.3, 45.4, '黒死病', '船とともに広がり、ヨーロッパの人口の三分の一が消える'],
  [1368, 118.8, 32.1, '明', '漢民族の王朝が戻る'],
  [1405, 121.5, 31.2, '鄭和の大航海', '全長百メートル級の船団が七度、アフリカ東岸まで往復する'],
  [1440, 8.7, 50.1, '活版印刷', 'グーテンベルク。本が写す物から刷る物になる'],
  [1453, 28.98, 41.0, 'コンスタンティノープル陥落', '千年続いた帝国が大砲の前に終わる'],
  [1492, -74.0, 18.0, 'コロンブス', '大西洋を渡る。二つの世界の生き物と病が混ざり始める'],
  [1498, 74.8, 15.5, 'ヴァスコ・ダ・ガマ', '喜望峰をまわってインドへ。香辛料の値が崩れる'],
  [1517, 11.3, 51.8, '宗教改革', 'ルターの九十五か条。印刷機が二週間でドイツ中に広げた'],
  [1521, -99.1, 19.4, 'アステカ滅亡', 'テノチティトラン陥落。疫病が兵より多く殺した'],
  [1543, 18.6, 54.4, '地動説', 'コペルニクスの死の年に本が出る'],
  [1600, 136.5, 35.4, '関ヶ原', '二百六十年の徳川の世が始まる'],
  [1619, -76.3, 37.0, '大西洋奴隷貿易', '北米に最初のアフリカ人が連れてこられる'],
  [1687, -0.1, 52.2, 'プリンキピア', 'ニュートン。天と地が同じ法則で動いていると示す'],
  [1689, -0.1, 51.5, '権利章典', '議会が王より上に立つ'],
  [1760, -2.2, 53.5, '産業革命', 'マンチェスター。人の力でも馬の力でもないもので機械が回り出す'],
  [1776, -75.2, 39.95, 'アメリカ独立宣言', 'フィラデルフィア'],
  [1789, 2.35, 48.86, 'フランス革命', 'バスティーユ襲撃'],
  [1804, -72.3, 18.5, 'ハイチ独立', '奴隷にされた人々が自力で勝ち取った唯一の国家'],
  [1815, 4.4, 50.7, 'ワーテルロー', 'ナポレオン戦争が終わる'],
  [1839, 113.3, 23.1, 'アヘン戦争', '清が敗れ、東アジアの秩序が組み替わる'],
  [1848, 8.7, 50.1, '一八四八年', '共産党宣言。同じ年、ヨーロッパ中で革命が起きて全部失敗する'],
  [1853, 139.7, 35.0, '黒船来航', '浦賀。二百年の鎖国が終わる'],
  [1859, -0.1, 51.5, '種の起源', 'ダーウィン。生き物に設計者が要らなくなる'],
  [1869, 32.3, 30.6, 'スエズ運河', 'アジアとヨーロッパが六千キロ近くなる'],
  [1871, 13.4, 52.5, 'ドイツ帝国', 'ヨーロッパの真ん中に大国ができる'],
  [1885, 13.4, 52.5, 'ベルリン会議', 'アフリカが、行ったこともない人々の手で机の上で分割される'],
  [1889, 139.75, 35.68, '大日本帝国憲法', 'アジアで最初の近代憲法'],
  [1903, -75.6, 36.0, 'ライト兄弟', 'キティホーク。最初の飛行は十二秒だった'],
  [1914, 18.4, 43.9, 'サラエボ', '一発の銃弾から四年で一千万人が死ぬ'],
  [1917, 30.3, 59.9, 'ロシア革命', 'ペトログラード'],
  [1929, -74.0, 40.7, '世界恐慌', 'ウォール街。世界中の工場が止まる'],
  [1939, 21.0, 52.2, '第二次世界大戦', 'ワルシャワ'],
  [1945, 132.5, 34.4, '広島', '核兵器が人に対して使われる'],
  [1947, 77.2, 28.6, 'インド独立', '同時に分離独立が起き、一千万人以上が移動する'],
  [1949, 116.4, 39.9, '中華人民共和国'],
  [1957, 63.3, 45.9, 'スプートニク', 'バイコヌール。人工物が初めて地球を回る'],
  [1960, 21.0, 4.0, 'アフリカの年', '一年で十七か国が独立する'],
  [1969, -80.6, 28.6, 'アポロ11号', 'ケネディ宇宙センターから月へ'],
  [1989, 13.4, 52.5, 'ベルリンの壁崩壊', '一夜で国境が意味を失う'],
  [1991, 6.1, 46.2, 'ウェブ', 'CERN。誰でも読める最初のページが公開される']
];

export const topic = {
  id: 'world',
  title: '世界史',
  subtitle: '前3300 → 1991',
  palette: {
    bg: [212, 40, 8], ink: [206, 12, 90], ghost: [208, 18, 18],
    sea: [211, 44, 11], land: [205, 16, 20], edge: [200, 20, 32],
    mark: [38, 84, 60], markHot: [30, 92, 66]
  },

  events() {
    return E.map(([t, lon, lat, title, note], i) => ({
      t, i, x: X(lon), y: Y(lat), title,
      label: note ? `${title} ― ${note}` : title
    }));
  },

  focus(g) {
    const { w, h } = g;
    const e = g.event, n = g.next;
    // Hold close while the event is being read; then pull back and fly to
    // where the next one happens, arriving as the year does.
    const t = g.travel;
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const x = lerp(e.x, n.x, ease), y = lerp(e.y, n.y, ease);
    const away = Math.sin(clamp(t) * Math.PI);          // rises in mid-flight
    const span = lerp(0.24, 0.9, Math.max(away, 1 - Math.pow(g.fresh, 0.6)) * (t > 0 ? 1 : 0.2));
    const box = { x: x - span / 2, y: y - span / 4, w: span, h: span / 2 };
    return fitTo(box, w, h, 0.95, 0.56);
  },

  backdrop(g) {
    const { ctx, w, h, pal } = g;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, css(pal.bg, 1, -2));
    sky.addColorStop(1, css(pal.sea, 1, -3));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
  },

  draw(g) {
    const { ctx, pal } = g;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // the graticule, faint, so the projection is legible
    ctx.strokeStyle = css(pal.ink, 0.07);
    ctx.lineWidth = g.px(1);
    for (let lon = -180; lon <= 180; lon += 30) {
      ctx.beginPath(); ctx.moveTo(X(lon), 0); ctx.lineTo(X(lon), 1); ctx.stroke();
    }
    for (let lat = -60; lat <= 75; lat += 30) {
      ctx.beginPath(); ctx.moveTo(0, Y(lat)); ctx.lineTo(1, Y(lat)); ctx.stroke();
    }
    ctx.strokeStyle = css(pal.ink, 0.12);
    ctx.beginPath(); ctx.moveTo(0, Y(0)); ctx.lineTo(1, Y(0)); ctx.stroke();

    // the land
    for (const poly of LAND) {
      ctx.beginPath();
      poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = css(pal.land, 1);
      ctx.fill();
      ctx.strokeStyle = css(pal.edge, 0.7);
      ctx.lineWidth = g.px(1.1);
      ctx.stroke();
    }

    // the thread drawn on towards where the next thing will happen
    const e = g.event;
    if (g.next && g.travel > 0.01) {
      const a = { x: e.x, y: e.y };
      const b = { x: g.next.x, y: g.next.y };
      const t = clamp(g.travel);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - Math.abs(b.x - a.x) * 0.16;
      ctx.strokeStyle = css(pal.mark, 0.34);
      ctx.lineWidth = g.px(1.4);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(mx, my, lerp(a.x, b.x, t), lerp(a.y, b.y, t));
      ctx.stroke();
    }

    // everything that has already happened stays on the map
    for (let i = 0; i < E.length; i++) {
      if (i > g.index) break;
      const x = X(E[i][1]), y = Y(E[i][2]);
      const age = clamp((g.index - i) / 8);
      ctx.fillStyle = css(pal.mark, 0.85 - age * 0.5);
      ctx.beginPath(); ctx.arc(x, y, g.px(2.6), 0, TAU); ctx.fill();
    }

    // and the one being read, which dims as the clock moves off it
    const live = clamp(1 - g.travel * 1.4);
    const pulse = g.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(g.time * 2.2);
    ctx.globalAlpha = 0.25 + live * 0.75;
    ctx.fillStyle = css(pal.markHot, 0.98);
    ctx.beginPath(); ctx.arc(e.x, e.y, g.px(5.5), 0, TAU); ctx.fill();
    ctx.strokeStyle = css(pal.markHot, 0.30 + pulse * 0.35);
    ctx.lineWidth = g.px(1.6);
    ctx.beginPath(); ctx.arc(e.x, e.y, g.px(11 + pulse * 7), 0, TAU); ctx.stroke();
    const fl = 1 - clamp(g.fresh);
    if (g.fresh > 0.02) {
      ctx.strokeStyle = css([0, 0, 100], g.fresh * 0.55);
      ctx.lineWidth = g.px(2);
      ctx.beginPath(); ctx.arc(e.x, e.y, g.px(10 + (1 - g.fresh) * 60), 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  /** The name of the place, beside its mark. */
  overlay(g) {
    const { ctx, pal, w, h } = g;
    const e = g.event;
    const p = g.screen(e.x, e.y);
    const size = Math.max(13, Math.round(Math.min(w, h) * 0.040));
    ctx.font = `600 ${size}px Inter, system-ui, "Hiragino Sans", sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = p.x > w * 0.6 ? 'right' : 'left';
    const dx = p.x > w * 0.6 ? -18 : 18;
    const live = clamp(1 - g.travel * 1.5);
    if (live < 0.03) return;
    ctx.lineWidth = 4.5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = css(pal.bg, 0.9 * live);
    ctx.strokeText(e.title, p.x + dx, p.y);
    ctx.fillStyle = css(pal.ink, 0.96 * live);
    ctx.fillText(e.title, p.x + dx, p.y);
  },

  stamp: (y) => (y < 0 ? `前${-Math.round(y)}` : String(Math.round(y)))
};
