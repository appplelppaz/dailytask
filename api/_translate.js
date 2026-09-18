// ─────────────────────────────────────────────────────────────
// Japanese.
//
// Four ways to get it, in order of what is configured:
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
// Whatever is used, the rule is the same: a text that cannot be
// translated is returned untranslated rather than dropped. The screen
// always has something to show.
// ─────────────────────────────────────────────────────────────

const cache = new Map();
const CACHE_MAX = 4000;

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

function chosen() {
  const deepl = (process.env.DEEPL_KEY || '').trim();
  const gemini = (process.env.GEMINI_KEY || process.env.GOOGLE_API_KEY || '').trim();
  const claude = (process.env.ANTHROPIC_KEY || '').trim();
  if (deepl) return { name: 'deepl', key: deepl, batch: viaDeepL };
  if (gemini) return { name: 'gemini', key: gemini, batch: viaGemini };
  if (claude) return { name: 'claude', key: claude, batch: viaClaude };
  return { name: 'mymemory', key: '', batch: null };
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
  if (!todo.length) return { out, via: chosen().name, done: 0 };

  const service = chosen();
  let via = service.name;
  let left = todo;

  if (service.batch) {
    const byLang = new Map();
    for (const job of todo) {
      if (!byLang.has(job.lang)) byLang.set(job.lang, []);
      byLang.get(job.lang).push(job);
    }
    const failed = [];
    let dead = false;
    for (const [lang, group] of byLang) {
      for (let i = 0; i < group.length; i += BATCH) {
        const chunk = group.slice(i, i + BATCH);
        if (dead || Date.now() > deadline) { failed.push(...chunk); continue; }
        try {
          const ja = await service.batch(chunk.map((j) => j.text), lang, service.key);
          chunk.forEach((job, n) => {
            const t = (ja[n] || '').trim();
            if (t) { out.set(job.text, t); remember(job.text, t); }
            else failed.push(job);
          });
        } catch (e) {
          failed.push(...chunk);
          if (e && e.fatal) { dead = true; via = 'mymemory'; }
        }
      }
    }
    left = failed.filter((j) => !out.has(j.text));
    if (!left.length) return { out, via, done: out.size };
  }

  // MyMemory, one at a time, as the default and as the safety net
  const mail = process.env.MYMEMORY_EMAIL;
  let i = 0;
  const worker = async () => {
    while (i < left.length && Date.now() < deadline) {
      const job = left[i++];
      try {
        const ja = (await viaMyMemory(job.text, job.lang, mail)).trim();
        if (ja) { out.set(job.text, ja); remember(job.text, ja); }
      } catch { /* untranslated is still readable */ }
    }
  };
  await Promise.all(Array.from({ length: AT_ONCE }, worker));
  return { out, via, done: out.size };
}

module.exports = { translate, provider: () => chosen().name };
