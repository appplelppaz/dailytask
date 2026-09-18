// ─────────────────────────────────────────────────────────────
// The newsroom.
//
// Browsers cannot read another site's feed directly — no newspaper
// sends the header that would allow it — so this runs on the server
// instead: it reads the papers' own RSS feeds, pulls out the headline,
// the picture and the link, and hands the lot back as JSON.
//
// It is cached at the edge for three minutes, which means the papers
// see about twenty requests an hour from this deployment no matter how
// many screens are showing it. That is the polite way to do this, and
// it is also the fast way.
// ─────────────────────────────────────────────────────────────

const SOURCES = [
  { id: 'bbc',    name: 'BBC News',       place: 'UK',     url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { id: 'bbc2',   name: 'BBC News',       place: 'UK',     url: 'https://feeds.bbci.co.uk/news/rss.xml' },
  { id: 'gdn',    name: 'The Guardian',   place: 'UK',     url: 'https://www.theguardian.com/international/rss' },
  { id: 'cgtn',   name: 'CGTN',           place: 'CN',     url: 'https://www.cgtn.com/subscribe/rss/section/world.xml' },
  { id: 'scmp',   name: 'SCMP',           place: 'CN',     url: 'https://www.scmp.com/rss/91/feed' },
  { id: 'monde',  name: 'Le Monde',       place: 'FR',     url: 'https://www.lemonde.fr/rss/une.xml' },
  { id: 'figaro', name: 'Le Figaro',      place: 'FR',     url: 'https://www.lefigaro.fr/rss/figaro_actualites.xml' },
  { id: 'f24',    name: 'France 24',      place: 'FR',     url: 'https://www.france24.com/fr/rss' },
  { id: 'pais',   name: 'El País',        place: 'ES',     url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada' },
  { id: 'vang',   name: 'La Vanguardia',  place: 'ES',     url: 'https://www.lavanguardia.com/rss/home.xml' }
];

const PER_SOURCE = 8;          // headlines taken from each paper
const TIMEOUT = 7000;          // ms before a slow paper is left out

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  laquo: '«', raquo: '»', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', eacute: 'é', egrave: 'è'
};

function decode(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
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
function pickImage(block, id) {
  let best = null, bestW = 0;
  const re = /<(media:content|media:thumbnail|enclosure)\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(block))) {
    const at = m[2];
    const url = (at.match(/url\s*=\s*"([^"]+)"/i) || [])[1];
    if (!url) continue;
    const type = (at.match(/type\s*=\s*"([^"]+)"/i) || [])[1] || '';
    if (type && !/^image\//i.test(type)) continue;
    if (!/\.(jpe?g|png|webp|avif)(\?|$)/i.test(url) && !/image/i.test(type)) continue;
    const w = +((at.match(/width\s*=\s*"(\d+)"/i) || [])[1] || 0);
    if (!best || w > bestW) { best = url; bestW = w; }
  }
  if (!best) {
    const inline = block.match(/<img[^>]+src\s*=\s*"([^"]+)"/i);
    if (inline) best = inline[1];
  }
  if (!best) return null;
  // BBC publishes a 240-pixel thumbnail; the same path serves 976.
  if (/ichef\.bbci\.co\.uk/.test(best)) best = best.replace(/\/(?:120|160|200|240|320|480)\//, '/976/');
  return best.replace(/^http:/, 'https:');
}

async function readFeed(src) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(src.url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'night-routine/1.0 (personal routine display; +https://github.com/appplelppaz/dailytask)',
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
      const image = pickImage(block, src.id);
      if (!title || !image) continue;             // a headline with no picture has nothing to show
      out.push({
        source: src.name,
        place: src.place,
        title,
        link: tag(block, 'link'),
        image,
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

module.exports = async (req, res) => {
  const lists = await Promise.all(SOURCES.map(readFeed));

  // Interleave the papers rather than run them in blocks, so the screen
  // moves from London to Paris to Hong Kong instead of showing eight of
  // the same masthead in a row.
  const items = [];
  const seen = new Set();
  for (let i = 0; i < PER_SOURCE; i++) {
    for (const list of lists) {
      const it = list[i];
      if (!it || seen.has(it.title)) continue;
      seen.add(it.title);
      items.push(it);
    }
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=180, stale-while-revalidate=900');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).send(JSON.stringify({
    updated: Date.now(),
    papers: SOURCES.length,
    items
  }));
};

module.exports.SOURCES = SOURCES;
