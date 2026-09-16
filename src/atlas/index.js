// ─────────────────────────────────────────────────────────────
// The catalogue.
//
// Each country is its own module — its events and its map are loaded
// only when that country comes up, and prefetched one chapter ahead.
// A night's history is a few hundred kilobytes of text; loading all of
// it to show four countries would be rude to a phone on mobile data.
// ─────────────────────────────────────────────────────────────

const M = (code, ja, en, events, shape) => ({
  code, ja, en,
  load: async () => {
    const [e, s] = await Promise.all([events(), shape()]);
    return { ...e, shape: s.shape };
  }
});

export const CATALOG = [
  M('JP', '日本', 'JAPAN', () => import('./jp.js').then((m) => m.jp), () => import('./shapes/jp.js')),
  M('CN', '中国', 'CHINA', () => import('./cn.js').then((m) => m.cn), () => import('./shapes/cn.js')),
  M('KR', '韓国', 'KOREA', () => import('./kr.js').then((m) => m.kr), () => import('./shapes/kr.js')),
  M('IN', 'インド', 'INDIA', () => import('./in.js').then((m) => m.inn), () => import('./shapes/in.js')),
  M('VN', 'ベトナム', 'VIETNAM', () => import('./vn.js').then((m) => m.vn), () => import('./shapes/vn.js')),
  M('MN', 'モンゴル', 'MONGOLIA', () => import('./mn.js').then((m) => m.mn), () => import('./shapes/mn.js')),
  M('IR', 'イラン', 'IRAN', () => import('./ir.js').then((m) => m.ir), () => import('./shapes/ir.js')),
  M('TR', 'トルコ', 'TURKEY', () => import('./tr.js').then((m) => m.tr), () => import('./shapes/tr.js')),
  M('EG', 'エジプト', 'EGYPT', () => import('./eg.js').then((m) => m.eg), () => import('./shapes/eg.js')),
  M('ET', 'エチオピア', 'ETHIOPIA', () => import('./et.js').then((m) => m.et), () => import('./shapes/et.js')),
  M('GR', 'ギリシャ', 'GREECE', () => import('./gr.js').then((m) => m.gr), () => import('./shapes/gr.js')),
  M('IT', 'イタリア', 'ITALY', () => import('./it.js').then((m) => m.it), () => import('./shapes/it.js')),
  M('ES', 'スペイン', 'SPAIN', () => import('./es.js').then((m) => m.es), () => import('./shapes/es.js')),
  M('FR', 'フランス', 'FRANCE', () => import('./fr.js').then((m) => m.fr), () => import('./shapes/fr.js')),
  M('GB', 'イギリス', 'BRITAIN', () => import('./gb.js').then((m) => m.gb), () => import('./shapes/gb.js')),
  M('DE', 'ドイツ', 'GERMANY', () => import('./de.js').then((m) => m.de), () => import('./shapes/de.js')),
  M('RU', 'ロシア', 'RUSSIA', () => import('./ru.js').then((m) => m.ru), () => import('./shapes/ru.js')),
  M('US', 'アメリカ', 'UNITED STATES', () => import('./us.js').then((m) => m.us), () => import('./shapes/us.js')),
  M('MX', 'メキシコ', 'MEXICO', () => import('./mx.js').then((m) => m.mx), () => import('./shapes/mx.js')),
  M('PE', 'ペルー', 'PERU', () => import('./pe.js').then((m) => m.pe), () => import('./shapes/pe.js'))
];
