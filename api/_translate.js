// ─────────────────────────────────────────────────────────────
// Japanese.
//
// Four ways to get it. Every one that has a key is tried in turn, best
// first, so a spent quota falls to the next rather than to the bottom:
//
//   DEEPL_KEY     DeepL. The best of these for a headline. Free tier is
//                 500,000 characters a month, which is perhaps two
//                 evenings of a five-hour routine — good while it lasts,
//                 and it falls back when it runs out.
//   GEMINI_KEY    Gemini Flash. A generous free tier, and forty
//                 headlines fit in one request, so an evening is a few
//                 dozen requests.
//   ANTHROPIC_KEY Claude. Paid, but pennies at this volume.
//   (nothing)     MyMemory, which needs no key at all. 5,000 words a day
//                 anonymously, 50,000 with MYMEMORY_EMAIL set.
//
// Whatever is used, two rules hold. A text that cannot be translated
// comes back missing rather than wrong — the screen then shows the
// original headline on its own, which is honest. And an answer that
// contains no Japanese at all is treated as a failure: some services
// hand back the English they were given when they have nothing, and
// printing that where the reader expects Japanese is the one thing
// worse than a blank line.
// ─────────────────────────────────────────────────────────────

const cache = new Map();
const CACHE_MAX = 4000;

// Kana, or CJK for a headline that is all names. A service that hands
// back the English it was given — some do, when they have nothing — has
// not translated anything, and the screen must not print it in the
// place the reader expects Japanese.
const JAPANESE = /[\u3040-\u30ff\u4e00-\u9fff\uff66-\uff9f]/;

function usable(text, ja) {
  const t = String(ja || '').trim();
  if (!t || t === String(text).trim()) return false;
  return JAPANESE.test(t);
}

function remember(text, ja) {
  cache.set(text, ja);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

/* ── the services ───────────────────────────────────────────── */

async function viaDeepL(texts, lang, key) {
  const host = /:fx$/.test(key) ? 'api-free.deepl.com' : 'api.deepl.com';
  const res = await fetch(`https://${host}/v2/translate`, {
    method: 'POST',
    headers: { 'Authorization': `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: texts, target_lang: 'JA', source_lang: lang.toUpperCase(), preserve_formatting: true })
  });
  if (!res.ok) {
    const err = new Error(res.status === 403 ? 'key refused' : res.status === 456 ? 'quota spent' : `HTTP ${res.status}`);
    err.fatal = res.status === 403 || res.status === 456;
    throw err;
  }
  const d = await res.json();
  return (d.translations || []).map((t) => t.text);
}

/** One call, many lines. The model is told to answer with a bare JSON array. */
async function viaGemini(texts, lang, key) {
  const prompt = 'Translate each line into natural Japanese, as a news headline or summary would be written. '
    + 'Keep proper nouns, numbers and organisation names correct. Answer with a JSON array of strings, '
    + 'the same length and order as the input, and nothing else.\n\n'
    + JSON.stringify(texts);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' }
    })
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.fatal = res.status === 400 || res.status === 403;
    throw err;
  }
  const d = await res.json();
  const text = d?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  const out = JSON.parse(text);
  return Array.isArray(out) ? out.map(String) : [];
}

async function viaClaude(texts, lang, key) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: 'Translate each line into natural Japanese, as a news headline or summary would be written. '
          + 'Answer with a JSON array of strings, same length and order as the input, and nothing else.\n\n'
          + JSON.stringify(texts)
      }]
    })
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.fatal = res.status === 401 || res.status === 400;
    throw err;
  }
  const d = await res.json();
  const text = (d.content || []).map((c) => c.text || '').join('');
  const out = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1) || '[]');
  return Array.isArray(out) ? out.map(String) : [];
}

async function viaMyMemory(text, lang, email) {
  const u = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${lang}|ja`
    + (email ? `&de=${encodeURIComponent(email)}` : '');
  const res = await fetch(u, { headers: { 'User-Agent': 'night-routine/1.0' } });
  if (!res.ok) throw new Error(res.status);
  const d = await res.json();
  const out = d && d.responseData && d.responseData.translatedText;
  if (!out || /^(MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID)/i.test(out)) throw new Error('quota');
  return out;
}

/* ── the front door ─────────────────────────────────────────── */

const BATCH = 40;            // texts in one request to a batching service
const AT_ONCE = 14;          // parallel requests to a one-at-a-time service
const TOGETHER = 5;          // batches in flight at once — one per language, in practice

/**
 * Every service configured, best first, with MyMemory always last as
 * the one that needs no key. DeepL's free tier is half a million
 * characters a month — an evening and a half of this — so when it runs
 * out the work falls to the next key rather than straight to the
 * bottom of the list.
 */
function chain() {
  const deepl = (process.env.DEEPL_KEY || '').trim();
  const gemini = (process.env.GEMINI_KEY || process.env.GOOGLE_API_KEY || '').trim();
  const claude = (process.env.ANTHROPIC_KEY || '').trim();
  const list = [];
  if (deepl) list.push({ name: 'deepl', key: deepl, batch: viaDeepL });
  if (gemini) list.push({ name: 'gemini', key: gemini, batch: viaGemini });
  if (claude) list.push({ name: 'claude', key: claude, batch: viaClaude });
  list.push({ name: 'mymemory', key: process.env.MYMEMORY_EMAIL || '', batch: null });
  return list;
}

/**
 * Translate what is asked for, within the time given. Returns a map of
 * text to Japanese, and the name of whatever did the work. Anything
 * already done is served from memory and costs nothing.
 */
async function translate(jobs, deadline) {
  const out = new Map();
  const todo = [];
  for (const job of jobs) {
    if (!job.text || job.lang === 'ja') continue;
    const hit = cache.get(job.text);
    if (hit) { out.set(job.text, hit); continue; }
    if (!todo.some((j) => j.text === job.text)) todo.push(job);
  }
  const services = chain();
  if (!todo.length) return { out, via: services[0].name, done: 0 };

  const keep = (job, ja) => {
    if (!usable(job.text, ja)) return false;
    const t = String(ja).trim();
    out.set(job.text, t);
    remember(job.text, t);
    return true;
  };

  // Whatever one service cannot do is handed to the next.
  let left = todo;
  let via = '';
  for (const service of services) {
    if (!left.length || Date.now() > deadline) break;
    const before = out.size;
    left = service.batch
      ? await inBatches(service, left, keep, deadline)
      : await oneAtATime(service, left, keep, deadline);
    if (!via && out.size > before) via = service.name;
  }
  return { out, via: via || services[0].name, done: out.size };
}

/**
 * A service that takes many texts at once. Each request carries a
 * single language, so a mixed batch becomes several — run together
 * rather than one after another, because the screen is waiting and the
 * whole call has only a few seconds to answer.
 */
async function inBatches(service, jobs, keep, deadline) {
  const byLang = new Map();
  for (const job of jobs) {
    if (!byLang.has(job.lang)) byLang.set(job.lang, []);
    byLang.get(job.lang).push(job);
  }
  const chunks = [];
  for (const [lang, group] of byLang) {
    for (let i = 0; i < group.length; i += BATCH) chunks.push({ lang, jobs: group.slice(i, i + BATCH) });
  }

  const failed = [];
  let at = 0;
  let dead = false;                       // no key, or the month is spent
  const worker = async () => {
    while (at < chunks.length) {
      const { lang, jobs: chunk } = chunks[at++];
      if (dead || Date.now() > deadline) { failed.push(...chunk); continue; }
      try {
        const ja = await service.batch(chunk.map((j) => j.text), lang, service.key);
        chunk.forEach((job, n) => { if (!keep(job, ja[n])) failed.push(job); });
      } catch (e) {
        failed.push(...chunk);
        if (e && e.fatal) dead = true;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(TOGETHER, chunks.length) }, worker));
  return failed;
}

/** MyMemory, which takes one text per request. */
async function oneAtATime(service, jobs, keep, deadline) {
  const failed = [];
  let i = 0;
  const worker = async () => {
    while (i < jobs.length) {
      const job = jobs[i++];
      if (Date.now() > deadline) { failed.push(job); continue; }
      try {
        if (!keep(job, await viaMyMemory(job.text, job.lang, service.key))) failed.push(job);
      } catch {
        failed.push(job);                   // untranslated is still readable
      }
    }
  };
  await Promise.all(Array.from({ length: AT_ONCE }, worker));
  return failed;
}

module.exports = { translate, provider: () => chain()[0].name };
