// ─────────────────────────────────────────────────────────────
// The newsroom.
//
// Browsers cannot read another site's feed directly — no newspaper
// sends the header that would allow it — so this runs on the server
// instead: it reads a hundred feeds the papers publish themselves,
// pulls out the headline, the opening of the article and the picture,
// and hands the lot back as JSON.
//
// A five-hour routine has room for eighteen hundred headlines, so one
// pass has to bring back thousands: these hundred-odd feeds between
// them carry close to four thousand items, which is why so many of
// them are section feeds — world, politics, business, science,
// culture. Each language is read in its own language. Taking forty
// from each leaves comfortable headroom over the five hours rather
// than running dry at the end of the evening.
//
// Translation is deliberately NOT done for the whole list here — that
// would be a hundred thousand characters a pass, and no free service
// will carry it. Only the opening few are translated, so the screen
// starts in Japanese immediately; the rest are translated by
// /api/translate as the screen gets to them.
//
// Cached at the edge for five minutes, so the papers see a dozen
// requests an hour from this deployment however many screens are on.
// ─────────────────────────────────────────────────────────────

const { translate, provider } = require('./_translate.js');

const F = (name, place, lang, url) => ({ name, place, lang, url });

const SOURCES = [
  // ── English, from Britain — 34 feeds ──
  F('BBC News', 'UK', 'en', 'https://feeds.bbci.co.uk/news/world/rss.xml'),
  F('BBC News', 'UK', 'en', 'https://feeds.bbci.co.uk/news/rss.xml'),
  F('BBC News', 'UK', 'en', 'https://feeds.bbci.co.uk/news/uk/rss.xml'),
  F('BBC News', 'UK', 'en', 'https://feeds.bbci.co.uk/news/business/rss.xml'),
  F('BBC News', 'UK', 'en', 'https://feeds.bbci.co.uk/news/politics/rss.xml'),
  F('BBC News', 'UK', 'en', 'https://feeds.bbci.co.uk/news/technology/rss.xml'),
  F('BBC News', 'UK', 'en', 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml'),
  F('BBC News', 'UK', 'en', 'https://feeds.bbci.co.uk/news/health/rss.xml'),
  F('BBC News', 'UK', 'en', 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml'),
  F('BBC Sport', 'UK', 'en', 'https://feeds.bbci.co.uk/sport/rss.xml'),
  F('The Guardian', 'UK', 'en', 'https://www.theguardian.com/international/rss'),
  F('The Guardian', 'UK', 'en', 'https://www.theguardian.com/world/rss'),
  F('The Guardian', 'UK', 'en', 'https://www.theguardian.com/uk-news/rss'),
  F('The Guardian', 'UK', 'en', 'https://www.theguardian.com/politics/rss'),
  F('The Guardian', 'UK', 'en', 'https://www.theguardian.com/business/rss'),
  F('The Guardian', 'UK', 'en', 'https://www.theguardian.com/technology/rss'),
  F('The Guardian', 'UK', 'en', 'https://www.theguardian.com/science/rss'),
  F('The Guardian', 'UK', 'en', 'https://www.theguardian.com/environment/rss'),
  F('The Guardian', 'UK', 'en', 'https://www.theguardian.com/culture/rss'),
  F('The Guardian', 'UK', 'en', 'https://www.theguardian.com/football/rss'),
  F('The Guardian', 'UK', 'en', 'https://www.theguardian.com/education/rss'),
  F('The Guardian', 'UK', 'en', 'https://www.theguardian.com/society/rss'),
  F('Sky News', 'UK', 'en', 'https://feeds.skynews.com/feeds/rss/world.xml'),
  F('Sky News', 'UK', 'en', 'https://feeds.skynews.com/feeds/rss/uk.xml'),
  F('Sky News', 'UK', 'en', 'https://feeds.skynews.com/feeds/rss/politics.xml'),
  F('Sky News', 'UK', 'en', 'https://feeds.skynews.com/feeds/rss/business.xml'),
  F('Sky News', 'UK', 'en', 'https://feeds.skynews.com/feeds/rss/technology.xml'),
  F('The Mirror', 'UK', 'en', 'https://www.mirror.co.uk/news/world-news/?service=rss'),
  F('The Mirror', 'UK', 'en', 'https://www.mirror.co.uk/news/?service=rss'),
  F('The Mirror', 'UK', 'en', 'https://www.mirror.co.uk/news/politics/?service=rss'),
  F('Metro', 'UK', 'en', 'https://metro.co.uk/news/world/feed/'),
  F('Metro', 'UK', 'en', 'https://metro.co.uk/news/feed/'),
  F('i News', 'UK', 'en', 'https://inews.co.uk/feed'),
  F('Evening Standard', 'UK', 'en', 'https://www.standard.co.uk/rss'),

  // ── French, from France — 23 feeds ──
  F('Le Monde', 'FR', 'fr', 'https://www.lemonde.fr/rss/une.xml'),
  F('Le Monde', 'FR', 'fr', 'https://www.lemonde.fr/international/rss_full.xml'),
  F('Le Monde', 'FR', 'fr', 'https://www.lemonde.fr/politique/rss_full.xml'),
  F('Le Monde', 'FR', 'fr', 'https://www.lemonde.fr/economie/rss_full.xml'),
  F('Le Monde', 'FR', 'fr', 'https://www.lemonde.fr/sciences/rss_full.xml'),
  F('Le Monde', 'FR', 'fr', 'https://www.lemonde.fr/culture/rss_full.xml'),
  F('Le Figaro', 'FR', 'fr', 'https://www.lefigaro.fr/rss/figaro_actualites.xml'),
  F('Le Figaro', 'FR', 'fr', 'https://www.lefigaro.fr/rss/figaro_international.xml'),
  F('Le Figaro', 'FR', 'fr', 'https://www.lefigaro.fr/rss/figaro_economie.xml'),
  F('Le Figaro', 'FR', 'fr', 'https://www.lefigaro.fr/rss/figaro_politique.xml'),
  F('Le Figaro', 'FR', 'fr', 'https://www.lefigaro.fr/rss/figaro_sciences.xml'),
  F('France 24', 'FR', 'fr', 'https://www.france24.com/fr/rss'),
  F('France 24', 'FR', 'fr', 'https://www.france24.com/fr/france/rss'),
  F('France 24', 'FR', 'fr', 'https://www.france24.com/fr/europe/rss'),
  F('RFI', 'FR', 'fr', 'https://www.rfi.fr/fr/rss'),
  F('RFI', 'FR', 'fr', 'https://www.rfi.fr/fr/monde/rss'),
  F('RFI', 'FR', 'fr', 'https://www.rfi.fr/fr/france/rss'),
  F('Ouest-France', 'FR', 'fr', 'https://www.ouest-france.fr/rss/une'),
  F('Ouest-France', 'FR', 'fr', 'https://www.ouest-france.fr/rss/monde'),
  F('20 Minutes', 'FR', 'fr', 'https://www.20minutes.fr/feeds/rss-une.xml'),
  F('20 Minutes', 'FR', 'fr', 'https://www.20minutes.fr/feeds/rss-monde.xml'),
  F("L'Express", 'FR', 'fr', 'https://www.lexpress.fr/rss/alaune.xml'),
  F('Courrier Intl', 'FR', 'fr', 'https://www.courrierinternational.com/feed/all/rss.xml'),

  // ── Spanish, from Spain — 18 feeds ──
  F('El País', 'ES', 'es', 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada'),
  F('El País', 'ES', 'es', 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/internacional/portada'),
  F('El País', 'ES', 'es', 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/espana/portada'),
  F('El País', 'ES', 'es', 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/economia/portada'),
  F('El País', 'ES', 'es', 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/ciencia/portada'),
  F('El País', 'ES', 'es', 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/cultura/portada'),
  F('La Vanguardia', 'ES', 'es', 'https://www.lavanguardia.com/rss/home.xml'),
  F('ABC', 'ES', 'es', 'https://www.abc.es/rss/2.0/internacional/'),
  F('ABC', 'ES', 'es', 'https://www.abc.es/rss/2.0/espana/'),
  F('ABC', 'ES', 'es', 'https://www.abc.es/rss/2.0/economia/'),
  F('elDiario.es', 'ES', 'es', 'https://www.eldiario.es/rss/'),
  F('elDiario.es', 'ES', 'es', 'https://www.eldiario.es/rss/internacional/'),
  F('20minutos', 'ES', 'es', 'https://www.20minutos.es/rss/internacional/'),
  F('20minutos', 'ES', 'es', 'https://www.20minutos.es/rss/nacional/'),
  F('20minutos', 'ES', 'es', 'https://www.20minutos.es/rss/economia/'),
  F('RTVE', 'ES', 'es', 'https://api2.rtve.es/rss/temas_noticias.xml'),
  F('El Mundo', 'ES', 'es', 'https://e00-elmundo.uecdn.es/elmundo/rss/internacional.xml'),
  F('El Mundo', 'ES', 'es', 'https://e00-elmundo.uecdn.es/elmundo/rss/espana.xml'),

  // ── Chinese (and China in English) — 27 feeds ──
  F('BBC 中文', 'CN', 'zh', 'https://feeds.bbci.co.uk/zhongwen/simp/rss.xml'),
  F('BBC 中文', 'CN', 'zh', 'https://feeds.bbci.co.uk/zhongwen/trad/rss.xml'),
  F('RFI 中文', 'CN', 'zh', 'https://www.rfi.fr/cn/rss'),
  F('纽约时报中文网', 'CN', 'zh', 'https://cn.nytimes.com/rss/'),
  F('人民网', 'CN', 'zh', 'http://www.people.com.cn/rss/world.xml'),
  F('人民网', 'CN', 'zh', 'http://www.people.com.cn/rss/politics.xml'),
  F('人民网', 'CN', 'zh', 'http://www.people.com.cn/rss/finance.xml'),
  F('人民网', 'CN', 'zh', 'http://www.people.com.cn/rss/society.xml'),
  F('中国新闻网', 'CN', 'zh', 'https://www.chinanews.com.cn/rss/world.xml'),
  F('中国新闻网', 'CN', 'zh', 'https://www.chinanews.com.cn/rss/china.xml'),
  F('中国新闻网', 'CN', 'zh', 'https://www.chinanews.com.cn/rss/finance.xml'),
  F('中国新闻网', 'CN', 'zh', 'https://www.chinanews.com.cn/rss/scroll-news.xml'),
  F('中央社', 'CN', 'zh', 'https://feeds.feedburner.com/rsscna/intworld'),
  F('中央社', 'CN', 'zh', 'https://feeds.feedburner.com/rsscna/mainland'),
  F('中央社', 'CN', 'zh', 'https://feeds.feedburner.com/rsscna/politics'),
  F('联合新闻网', 'CN', 'zh', 'https://udn.com/rssfeed/news/2/6638?ch=news'),
  F('联合新闻网', 'CN', 'zh', 'https://udn.com/rssfeed/news/2/6645?ch=news'),
  F('自由时报', 'CN', 'zh', 'https://news.ltn.com.tw/rss/world.xml'),
  F('自由时报', 'CN', 'zh', 'https://news.ltn.com.tw/rss/politics.xml'),
  F('自由时报', 'CN', 'zh', 'https://news.ltn.com.tw/rss/business.xml'),
  F('SCMP', 'CN', 'zh', 'https://www.scmp.com/rss/91/feed'),
  F('SCMP', 'CN', 'zh', 'https://www.scmp.com/rss/4/feed'),
  F('SCMP', 'CN', 'zh', 'https://www.scmp.com/rss/2/feed'),
  F('CGTN', 'CN', 'zh', 'https://www.cgtn.com/subscribe/rss/section/world.xml'),
  F('CGTN', 'CN', 'zh', 'https://www.cgtn.com/subscribe/rss/section/china.xml'),
  F('DW 中文', 'CN', 'zh', 'https://rss.dw.com/rdf/rss-chi-all'),
  F('德国之声', 'CN', 'zh', 'https://rss.dw.com/xml/rss-chi-all'),
];

const PER_SOURCE = 40;         // headlines taken from each feed
const BODY_MAX = 240;          // characters of the article's opening kept
const FEED_TIMEOUT = 6000;     // ms before a slow paper is left out
const MAX_ITEMS = 3200;        // the whole pool: around eight hours at ten seconds each
const PAGE = 400;              // handed over a page at a time, so a phone is not sent it all
const TRANSLATE_FIRST = 24;    // enough to start reading while the rest catches up
const TRANSLATE_BUDGET = 9000; // ms

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  laquo: '«', raquo: '»', hellip: '…', mdash: '—', ndash: '–', middot: '·',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”'
};

function decode(s) {
  const entities = (t) => t
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] || m);
  const strip = (t) => t.replace(/<[^>]+>/g, ' ');
  // Papers escape their own markup as entities, so the tags only appear
  // once the entities are decoded — which means stripping twice.
  let out = String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  out = strip(out);
  out = strip(entities(out));
  return out.replace(/\s+/g, ' ').trim();
}


/**
 * The opening of the article. A feed's description is the paper's own
 * summary of it; where that is missing or is only the headline again,
 * the full text is used instead, cut at a sentence.
 */
function pickBody(block, title) {
  let body = tag(block, 'description');
  const full = tag(block, 'content:encoded');
  if (body.length < 60 && full.length > body.length) body = full;
  if (!body) return '';
  if (body.slice(0, 40) === title.slice(0, 40) && body.length < title.length + 40) return '';
  body = body.replace(/\s*(Read more|Continue reading|続きを読む)[^]*$/i, '').trim();
  if (body.length <= BODY_MAX) return body;
  const cut = body.slice(0, BODY_MAX);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('。'), cut.lastIndexOf('！'), cut.lastIndexOf('？'));
  return (stop > BODY_MAX * 0.5 ? cut.slice(0, stop + 1) : cut.trim() + '…');
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
        body: pickBody(block, title),
        image: pickImage(block, src.url),
        at: Date.parse(tag(block, 'pubDate') || tag(block, 'dc:date')) || null,
        link: tag(block, 'link')
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

/* ── the handler ────────────────────────────────────────────── */

module.exports = async (req, res) => {
  const lists = await Promise.all(SOURCES.map(readFeed));

  // Interleave the feeds rather than run them in blocks, so the screen
  // moves from London to Paris to Beijing instead of showing twenty-five
  // of one masthead in a row. Each round starts at a different feed, so
  // when the list is cut short it is not the same languages that lose
  // out every time. Headlines with a picture come first; those without
  // are let in so the Chinese papers, which mostly publish none, are not
  // shut out.
  const items = [];
  const spare = [];
  const seen = new Set();
  for (let i = 0; i < PER_SOURCE; i++) {
    const offset = i * 7;
    for (let k = 0; k < lists.length; k++) {
      const it = lists[(k + offset) % lists.length][i];
      if (!it || seen.has(it.title)) continue;
      seen.add(it.title);
      (it.image ? items : spare).push(it);
    }
  }
  for (let n = 0; n < spare.length; n++) items.splice((n + 1) * 4, 0, spare[n]);
  const pool = items.slice(0, MAX_ITEMS);

  // Handed over a page at a time. The whole pool in one response is most
  // of a megabyte, and a phone polling that every few minutes for five
  // hours would be paying for headlines it may never reach.
  const q = new URL(req.url || '/', 'http://x').searchParams;
  const offset = Math.max(0, Math.min(MAX_ITEMS, parseInt(q.get('offset'), 10) || 0));
  const limit = Math.max(1, Math.min(PAGE, parseInt(q.get('limit'), 10) || PAGE));
  const out = pool.slice(offset, offset + limit);

  // Only the first page gets its opening headlines translated here, so
  // the screen starts in Japanese; /api/translate does the rest as the
  // screen reaches them.
  let via = provider();
  if (!offset) {
    const jobs = [];
    for (const it of out.slice(0, TRANSLATE_FIRST)) {
      jobs.push({ text: it.title, lang: it.lang });
      if (it.body) jobs.push({ text: it.body, lang: it.lang });
    }
    const done = await translate(jobs, Date.now() + TRANSLATE_BUDGET);
    via = done.via || via;
    for (const it of out) {
      const t = done.out.get(it.title);
      if (t) it.ja = t;
      const b = it.body && done.out.get(it.body);
      if (b) it.bodyJa = b;
    }
  }
  for (const it of out) if (it.bodyJa) delete it.body;    // never shown once translated

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).send(JSON.stringify({
    updated: Date.now(),
    feeds: SOURCES.length,
    via,
    total: pool.length,
    offset,
    items: out
  }));
};

module.exports.SOURCES = SOURCES;
