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
  'Amersham':        [1.0, 1.0, 'b'],
  'Harrow':          [3.0, 2.6, 'b'],
  'Harrow & Wealdstone': [2.0, 4.6, 'l'],
  'Wembley Park': [4.6, 4.2, 'b'],
  'Finchley Road': [6.2, 5.6, 'r'],
  'Edgware':      [8.6, 0.8, 'r'],
  'Golders Green': [8.6, 2.8, 'r'],
  'Camden Town':   [9.6, 5.0, 'r'],
  'Cockfosters': [16.4, 1.2, 'l'],
  'Finsbury Park': [13.4, 4.2, 'r'],
  'Highbury':        [12.6, 5.0, 'r'],
  'Walthamstow':   [17.0, 3.0, 'l'],
  'Epping':        [19.6, 4.4, 'l'],
  'Queen’s Park': [3.2, 6.2, 'l'],
  'Paddington':      [4.2, 8.0, 't'],
  'Edgware Road': [5.2, 7.4, 't'],
  'Baker Street': [6.6, 6.6, 't'],
  'Euston':        [9.2, 6.0, 't'],
  'King’s Cross':   [10.6, 6.0, 't'],
  'Angel':        [12.0, 5.6, 't'],
  'Farringdon':      [12.0, 7.0, 't'],
  'Moorgate':      [13.4, 7.0, 't'],
  'Liverpool Street': [14.8, 7.0, 't'],
  'Aldgate':    [16.0, 7.6, 'r'],
  'Ealing':        [0.4, 8.6, 'l'],
  'Shepherd’s Bush': [1.8, 8.6, 'b'],
  'Notting Hill Gate': [3.2, 8.6, 'b'],
  'Lancaster Gate': [4.6, 8.6, 'b'],
  'Marble Arch':   [5.6, 8.6, 'b'],
  'Bond Street': [6.6, 8.6, 't'],
  'Oxford Circus': [7.6, 8.6, 't'],
  'Tottenham Court Rd': [9.0, 8.6, 't'],
  'Holborn':        [10.4, 8.6, 't'],
  'St Paul’s':     [11.8, 8.6, 't'],
  'Bank':            [13.4, 9.0, 'r'],
  'Piccadilly Circus': [8.4, 9.6, 'r'],
  'Leicester Square': [9.2, 9.4, 'r'],
  'Green Park':   [7.6, 10.0, 'l'],
  'Charing Cross': [9.2, 10.2, 'r'],
  'Embankment':   [9.6, 11.0, 'r'],
  'Waterloo':     [10.2, 12.0, 'r'],
  'Westminster': [8.6, 11.0, 'l'],
  'Victoria':      [7.0, 11.0, 'b'],
  'Sloane Square': [6.0, 11.0, 'b'],
  'South Kensington': [5.0, 11.0, 'b'],
  'Gloucester Road': [4.0, 11.0, 'b'],
  'Earl’s Court':   [3.0, 11.0, 'b'],
  'Hammersmith':      [1.4, 11.0, 'b'],
  'Heathrow':        [0.2, 12.8, 'b'],
  'Blackfriars': [11.0, 11.0, 'b'],
  'Monument':      [13.0, 10.6, 'r'],
  'Tower Hill':      [14.6, 10.6, 'r'],
  'Whitechapel':   [16.4, 9.6, 'r'],
  'Stratford': [18.0, 8.0, 'r'],
  'Upminster':   [19.8, 9.2, 'r'],
  'London Bridge': [12.2, 12.0, 'r'],
  'Borough':              [12.0, 13.0, 'r'],
  'Elephant & Castle': [11.6, 14.0, 'r'],
  'Kennington':        [11.0, 15.0, 'r'],
  'Stockwell':     [10.0, 16.0, 'l'],
  'Brixton':      [11.0, 17.0, 'r'],
  'Morden':          [9.6, 18.0, 'l'],
  'Canada Water': [15.4, 11.6, 'b'],
  'Canary Wharf':   [17.0, 11.6, 'b'],
  'North Greenwich': [18.4, 10.6, 'r'],
  'Abbey Wood':     [19.8, 12.0, 'r'],
  'Old Street': [14.2, 6.0, 'r']
};

// [line name, colour, station chain, openings [year, from, to, note]]
const LINES = [
  ['Metropolitan line', '#9B0056',
   ['Amersham', 'Harrow', 'Wembley Park', 'Finchley Road', 'Baker Street',
    'Edgware Road', 'Paddington'],
   [[1863, 4, 6, 'Paddington 〜 Farringdon。世界で最初の地下鉄が、蒸気機関車で走り出す'],
    [1868, 3, 4, 'Swiss Cottage へ。地下鉄が郊外へ向かい始める'],
    [1879, 1, 3, 'Harrow まで。線路の先に住宅地が造られていく'],
    [1892, 0, 1, 'Amersham へ。ロンドンから五十キロ、畑の中に駅ができる']]],

  ['Metropolitan line', '#9B0056',
   ['Paddington', 'Edgware Road', 'Baker Street', 'Euston', 'King’s Cross',
    'Farringdon', 'Moorgate', 'Liverpool Street', 'Aldgate'],
   [[1863, 0, 5, ''], [1865, 5, 6, 'Moorgate まで延伸'],
    [1876, 6, 8, 'Aldgate へ']]],

  ['Hammersmith & City line', '#F3A9BB',
   ['Hammersmith', 'Notting Hill Gate', 'Paddington', 'Edgware Road',
    'King’s Cross', 'Liverpool Street', 'Whitechapel'],
   [[1864, 0, 3, 'Hammersmith 支線。まだ畑だった土地に線路が引かれる'],
    [1884, 3, 6, '東へ抜ける']]],

  ['District line', '#00782A',
   ['Hammersmith', 'Earl’s Court', 'Gloucester Road', 'South Kensington', 'Sloane Square',
    'Victoria', 'Westminster', 'Embankment', 'Blackfriars', 'Monument',
    'Tower Hill', 'Whitechapel', 'Upminster'],
   [[1868, 3, 6, 'ディストリクト鉄道。South Kensington から Westminster へ'],
    [1870, 6, 8, 'Blackfriars まで'],
    [1874, 0, 3, 'Hammersmith まで西へ'],
    [1884, 8, 10, 'Tower Hill へ。環状線が一周つながる'],
    [1902, 11, 12, 'Upminster へ。東の農村が通勤圏に入る']]],

  ['Circle line', '#FFD300',
   ['Paddington', 'Edgware Road', 'Baker Street', 'Euston', 'King’s Cross',
    'Farringdon', 'Moorgate', 'Liverpool Street', 'Aldgate', 'Tower Hill',
    'Monument', 'Blackfriars', 'Embankment', 'Westminster', 'Victoria',
    'Sloane Square', 'South Kensington', 'Gloucester Road', 'Notting Hill Gate',
    'Paddington'],
   [[1884, 0, 19, 'インナー・サークル完成。煙の立ちこめる環状線を、機関車が一日中回り続けた']]],

  ['Northern line', '#000000',
   ['Edgware', 'Golders Green', 'Camden Town', 'Euston', 'Tottenham Court Rd',
    'Charing Cross', 'Waterloo', 'London Bridge', 'Borough', 'Elephant & Castle',
    'Kennington', 'Stockwell', 'Morden'],
   [[1890, 7, 11, '世界で最初の電気運転の深部地下鉄。煙のない地下鉄がここから始まる'],
    [1907, 1, 5, 'Golders Green へ。駅ができてから街ができた'],
    [1924, 0, 1, 'Edgware まで'],
    [1926, 11, 12, 'Morden まで南へ']]],

  ['Central line', '#E32017',
   ['Ealing', 'Shepherd’s Bush', 'Notting Hill Gate', 'Lancaster Gate',
    'Marble Arch', 'Bond Street', 'Oxford Circus', 'Tottenham Court Rd',
    'Holborn', 'St Paul’s', 'Bank', 'Liverpool Street', 'Stratford', 'Epping'],
   [[1900, 1, 10, 'どこまで乗っても均一二ペンス。「トゥーペニー・チューブ」と呼ばれた'],
    [1912, 10, 11, 'Liverpool Street へ'],
    [1920, 0, 1, 'Ealing へ西進'],
    [1946, 11, 12, '戦時中は防空壕として使われた区間が、旅客線として開く'],
    [1949, 12, 13, 'Epping へ。森の際まで地下鉄が届く']]],

  ['Waterloo & City line', '#95CDBA',
   ['Waterloo', 'Bank'],
   [[1898, 0, 1, '駅二つだけの路線。通勤者はこれを「排水管」と呼んだ']]],

  ['Bakerloo line', '#B36305',
   ['Harrow & Wealdstone', 'Queen’s Park', 'Paddington', 'Edgware Road',
    'Baker Street', 'Oxford Circus', 'Piccadilly Circus', 'Charing Cross',
    'Embankment', 'Waterloo', 'Elephant & Castle'],
   [[1906, 4, 10, 'Baker Street と Waterloo を結ぶ ― 名前はその二つをつないだもの'],
    [1907, 3, 4, 'Edgware Road へ'],
    [1913, 2, 3, 'Paddington へ'],
    [1917, 0, 2, '北西の郊外へ']]],

  ['Piccadilly line', '#003688',
   ['Heathrow', 'Hammersmith', 'Earl’s Court', 'Gloucester Road', 'South Kensington',
    'Green Park', 'Piccadilly Circus', 'Leicester Square', 'Holborn', 'King’s Cross',
    'Finsbury Park', 'Cockfosters'],
   [[1906, 1, 10, 'Hammersmith から Finsbury Park まで一気に開業'],
    [1933, 10, 11, 'Cockfosters へ。ホールデンが設計した円筒形の駅舎が並ぶ'],
    [1977, 0, 1, 'Heathrow 空港へ。空港に直結した世界で最初の地下鉄']]],

  ['Victoria line', '#0098D4',
   ['Walthamstow', 'Finsbury Park', 'Highbury', 'King’s Cross', 'Euston',
    'Oxford Circus', 'Green Park', 'Victoria', 'Stockwell', 'Brixton'],
   [[1968, 0, 2, '半世紀ぶりの新線。世界で初めて全線を自動運転にした地下鉄'],
    [1969, 2, 7, 'Victoria 駅まで。女王が開業式で自ら切符を買った'],
    [1971, 7, 9, 'Brixton へ']]],

  ['Jubilee line', '#A0A5A9',
   ['Wembley Park', 'Finchley Road', 'Baker Street', 'Bond Street',
    'Green Park', 'Westminster', 'Waterloo', 'London Bridge',
    'Canada Water', 'Canary Wharf', 'North Greenwich', 'Stratford'],
   [[1979, 0, 4, '女王在位二十五年を記念して名づけられる'],
    [1999, 5, 11, 'Docklands へ。閉じた埠頭の跡が金融街に変わっていく']]],

  ['Elizabeth line', '#6950A1',
   ['Paddington', 'Bond Street', 'Tottenham Court Rd', 'Farringdon',
    'Liverpool Street', 'Whitechapel', 'Canary Wharf', 'Abbey Wood'],
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
    // The view follows the work rather than trying to hold the whole
    // network: by 1970 the map does not fit on a phone at a size you can
    // read the names at, so the camera stays in close and moves around.
    let box = null;
    const recent = g.events.filter((e) => g.seen(e.t) && g.year - e.t < 26).slice(-5);
    const use = recent.length ? recent : [g.event];
    for (const e of use) {
      const chain = LINES[e.li][2];
      for (let i = e.from; i <= e.to; i++) {
        const p = S[chain[i]];
        if (p) box = growBox(box, p[0], p[1], 2.2);
      }
    }
    if (!box) box = { x: 9, y: 5.4, w: 4, h: 3 };
    const wide = fitTo(box, w, h, 0.9, 0.56);
    // and never further out than this, so type stays readable
    wide.S = Math.max(wide.S, w / 15);
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
        near.S = Math.max(near.S, w / 11);
        const k = Math.pow(g.fresh, 0.7) * 0.72;
        return { x: lerp(wide.x, near.x, k), y: lerp(wide.y, near.y, k),
                 S: lerp(wide.S, Math.min(near.S, wide.S * 2.2), k) };
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
    const hits = (b) => placed.some((o) => !(b.x > o.x + o.w || b.x + b.w < o.x ||
                                             b.y > o.y + o.h || b.y + b.h < o.y));
    for (const q of items) {
      const tw = ctx.measureText(q.name).width;
      const off = q.inter ? 13 : 10;
      // the side the data asks for first, then the other three
      const order = [q.side, 'r', 'l', 't', 'b'];
      let box = null, bx = 0, by = 0;
      for (const side of order) {
        let x = q.p.x, y = q.p.y;
        if (side === 'l') x -= off + tw / 2;
        else if (side === 'r') x += off + tw / 2;
        else y += side === 't' ? -(off + 4) : (off + 5);
        const b = { x: x - tw / 2 - 3, y: y - size * 0.62, w: tw + 6, h: size * 1.3 };
        if (b.x < 2 || b.x + b.w > w - 2) continue;
        if (!hits(b)) { box = b; bx = x; by = y; break; }
      }
      if (!box) continue;
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

  stamp: (y) => String(Math.round(y))
};
