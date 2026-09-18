// ─────────────────────────────────────────────────────────────
// The newsroom.
//
// Browsers cannot read another site's feed directly — no newspaper
// sends the header that would allow it — so this runs on the server
// instead: it reads the papers' own RSS feeds, pulls out the headline,
// the picture and the link, translates the headline into Japanese, and
// hands the lot back as JSON.
//
// Each language is read in its own language: the British papers in
// English, the French in French, the Spanish in Spanish, the Chinese in
// Chinese. The translation is there to help, not to replace — the
// screen shows the original first.
//
// It is cached at the edge for three minutes, so the papers see about
// twenty requests an hour from this deployment no matter how many
// screens are showing it. That is the polite way to do this, and it is
// also the fast way.
// ─────────────────────────────────────────────────────────────

const SOURCES = [
  // ── English, from Britain ──
  { name: 'BBC News',        place: 'UK', lang: 'en', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { name: 'BBC News',        place: 'UK', lang: 'en', url: 'https://feeds.bbci.co.uk/news/rss.xml' },
  { name: 'The Guardian',    place: 'UK', lang: 'en', url: 'https://www.theguardian.com/international/rss' },
  { name: 'The Guardian',    place: 'UK', lang: 'en', url: 'https://www.theguardian.com/world/rss' },
  { name: 'Sky News',        place: 'UK', lang: 'en', url: 'https://feeds.skynews.com/feeds/rss/world.xml' },
  { name: 'The Mirror',      place: 'UK', lang: 'en', url: 'https://www.mirror.co.uk/news/world-news/?service=rss' },
  { name: 'Metro',           place: 'UK', lang: 'en', url: 'https://metro.co.uk/news/world/feed/' },
  { name: 'i News',          place: 'UK', lang: 'en', url: 'https://inews.co.uk/feed' },

  // ── French, from France ──
  { name: 'Le Monde',        place: 'FR', lang: 'fr', url: 'https://www.lemonde.fr/rss/une.xml' },
  { name: 'Le Figaro',       place: 'FR', lang: 'fr', url: 'https://www.lefigaro.fr/rss/figaro_actualites.xml' },
  { name: 'France 24',       place: 'FR', lang: 'fr', url: 'https://www.france24.com/fr/rss' },
  { name: 'RFI',             place: 'FR', lang: 'fr', url: 'https://www.rfi.fr/fr/rss' },
  { name: 'Ouest-France',    place: 'FR', lang: 'fr', url: 'https://www.ouest-france.fr/rss/une' },
  { name: '20 Minutes',      place: 'FR', lang: 'fr', url: 'https://www.20minutes.fr/feeds/rss-une.xml' },

  // ── Spanish, from Spain ──
  { name: 'El País',         place: 'ES', lang: 'es', url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada' },
  { name: 'El País',         place: 'ES', lang: 'es', url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/internacional/portada' },
  { name: 'La Vanguardia',   place: 'ES', lang: 'es', url: 'https://www.lavanguardia.com/rss/home.xml' },
  { name: 'ABC',             place: 'ES', lang: 'es', url: 'https://www.abc.es/rss/2.0/internacional/' },
  { name: 'elDiario.es',     place: 'ES', lang: 'es', url: 'https://www.eldiario.es/rss/' },
  { name: '20minutos',       place: 'ES', lang: 'es', url: 'https://www.20minutos.es/rss/internacional/' },

  // ── Chinese ──
  { name: 'BBC 中文',        place: 'CN', lang: 'zh', url: 'https://feeds.bbci.co.uk/zhongwen/simp/rss.xml' },
  { name: 'RFI 中文',        place: 'CN', lang: 'zh', url: 'https://www.rfi.fr/cn/rss' },
  { name: '纽约时报中文网',   place: 'CN', lang: 'zh', url: 'https://cn.nytimes.com/rss/' },
  { name: '人民网',          place: 'CN', lang: 'zh', url: 'http://www.people.com.cn/rss/world.xml' },
  { name: '中国新闻网',      place: 'CN', lang: 'zh', url: 'https://www.chinanews.com.cn/rss/world.xml' },
  { name: '中央社',          place: 'CN', lang: 'zh', url: 'https://feeds.feedburner.com/rsscna/intworld' },
  { name: '联合新闻网',      place: 'CN', lang: 'zh', url: 'https://udn.com/rssfeed/news/2/6638?ch=news' },
  { name: '自由时报',        place: 'CN', lang: 'zh', url: 'https://news.ltn.com.tw/rss/world.xml' },
  { name: 'SCMP',            place: 'CN', lang: 'en', url: 'https://www.scmp.com/rss/91/feed' },
  { name: 'CGTN',            place: 'CN', lang: 'en', url: 'https://www.cgtn.com/subscribe/rss/section/world.xml' }
];

const PER_SOURCE = 5;          // headlines taken from each paper
const FEED_TIMEOUT = 6000;     // ms before a slow paper is left out
const MAX_ITEMS = 50;
const NO_PICTURE_SHARE = 0.3;  // how much of the list may be headlines without one
const TRANSLATE_BUDGET = 10000; // ms spent translating, at most
const TRANSLATE_AT_ONCE = 12;

// Warm instances keep what they have already translated, so the same
// headline is never sent twice.
const cache = new Map();
const CACHE_MAX = 600;

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  laquo: '«', raquo: '»', hellip: '…', mdash: '—', ndash: '–', middot: '·',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”'
};

function decode(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] || m)
    .replace(/\s+/g, ' ')
    .trim();
}

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]) : '';
};

/**
 * The best picture in one item. Feeds offer the same photograph at
 * several widths; take the widest, and where a paper only publishes a
 * thumbnail but its server will serve a bigger one, ask for that.
 */
function pickImage(block, feedUrl) {
  let best = null, bestW = 0;
  const re = /<(media:content|media:thumbnail|enclosure)\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(block))) {
    const at = m[2];
    const url = (at.match(/url\s*=\s*"([^"]+)"/i) || [])[1];
    if (!url) continue;
    const type = (at.match(/type\s*=\s*"([^"]+)"/i) || [])[1] || '';
    if (type && !/^image\//i.test(type)) continue;
    if (!/\.(jpe?g|png|webp|avif)(\?|$|\/)/i.test(url) && !/^image\//i.test(type)) continue;
    const w = +((at.match(/width\s*=\s*"(\d+)"/i) || [])[1] || 0);
    if (!best || w > bestW) { best = url; bestW = w; }
  }
  if (!best) {
    const inline = block.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i);
    if (inline) best = inline[1];
  }
  if (!best) return null;
  if (best.startsWith('//')) best = 'https:' + best;
  else if (best.startsWith('/')) {                       // relative to the paper's own site
    try { best = new URL(best, feedUrl).href; } catch { return null; }
  }
  if (!/^https?:/i.test(best)) return null;
  // BBC publishes a 240-pixel thumbnail; the same path serves 976.
  if (/ichef\.bbci\.co\.uk/.test(best)) best = best.replace(/\/(?:120|160|200|240|320|480)\//, '/976/');
  return best.replace(/^http:/, 'https:');
}

async function readFeed(src) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FEED_TIMEOUT);
  try {
    const res = await fetch(src.url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; night-routine/1.0; +https://github.com/appplelppaz/dailytask)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      }
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const blocks = xml.split(/<item[\s>]/i).slice(1);
    const out = [];
    for (const raw of blocks) {
      const block = raw.split(/<\/item>/i)[0];
      const title = tag(block, 'title');
      if (!title || title.length < 8) continue;
      out.push({
        source: src.name,
        place: src.place,
        lang: src.lang,
        title,
        link: tag(block, 'link'),
        image: pickImage(block, src.url),
        at: Date.parse(tag(block, 'pubDate') || tag(block, 'dc:date')) || null
      });
      if (out.length >= PER_SOURCE) break;
    }
    return out;
  } catch {
    return [];                                     // one paper being down is not an outage
  } finally {
    clearTimeout(timer);
  }
}

/* ── Japanese ───────────────────────────────────────────────── */

async function viaDeepL(text, lang, key) {
  const res = await fetch('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: { 'Authorization': `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ text, target_lang: 'JA', source_lang: lang.toUpperCase() })
  });
  if (!res.ok) throw new Error(res.status);
  const d = await res.json();
  return d.translations[0].text;
}

async function viaMyMemory(text, lang) {
  const u = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${lang}|ja`;
  const res = await fetch(u, { headers: { 'User-Agent': 'night-routine/1.0' } });
  if (!res.ok) throw new Error(res.status);
  const d = await res.json();
  const out = d && d.responseData && d.responseData.translatedText;
  if (!out || /^(MYMEMORY WARNING|QUERY LENGTH LIMIT)/i.test(out)) throw new Error('quota');
  return out;
}

async function translate(items, deadline) {
  const key = process.env.DEEPL_KEY;
  const todo = [];
  for (const it of items) {
    if (it.lang === 'ja') continue;
    const hit = cache.get(it.title);
    if (hit) { it.ja = hit; continue; }
    todo.push(it);
  }
  let i = 0;
  const worker = async () => {
    while (i < todo.length && Date.now() < deadline) {
      const it = todo[i++];
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), Math.max(1000, deadline - Date.now()));
      try {
        const ja = key ? await viaDeepL(it.title, it.lang, key) : await viaMyMemory(it.title, it.lang);
        if (ja && ja.trim()) {
          it.ja = ja.trim();
          cache.set(it.title, it.ja);
          if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
        }
      } catch {
        /* a headline without its translation still reads */
      } finally {
        clearTimeout(t);
      }
    }
  };
  await Promise.all(Array.from({ length: TRANSLATE_AT_ONCE }, worker));
}

/* ── the handler ────────────────────────────────────────────── */

module.exports = async (req, res) => {
  const lists = await Promise.all(SOURCES.map(readFeed));

  // Interleave the papers rather than run them in blocks, so the screen
  // moves from London to Paris to Beijing instead of showing five of the
  // same masthead in a row. Headlines with a picture come first; a few
  // without are let in so the Chinese papers, which mostly publish none,
  // are not shut out.
  const items = [];
  const spare = [];
  const seen = new Set();
  for (let i = 0; i < PER_SOURCE; i++) {
    // Each round starts at a different paper, so when the list is cut
    // short it is not always the same languages that are cut.
    const offset = i * 7;
    for (let k = 0; k < lists.length; k++) {
      const list = lists[(k + offset) % lists.length];
      const it = list[i];
      if (!it || seen.has(it.title)) continue;
      seen.add(it.title);
      (it.image ? items : spare).push(it);
    }
  }
  const room = Math.min(spare.length, Math.round(MAX_ITEMS * NO_PICTURE_SHARE));
  for (let n = 0; n < room; n++) items.splice((n + 1) * 4, 0, spare[n]);
  const out = items.slice(0, MAX_ITEMS);

  await translate(out, Date.now() + TRANSLATE_BUDGET);

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=180, stale-while-revalidate=900');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).send(JSON.stringify({
    updated: Date.now(),
    papers: SOURCES.length,
    translated: out.filter((i) => i.ja).length,
    items: out
  }));
};

module.exports.SOURCES = SOURCES;
