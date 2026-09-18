// ─────────────────────────────────────────────────────────────
// Translation, as the screen needs it.
//
// /api/news deliberately leaves most of its list untranslated: a
// five-hour routine works through hundreds of headlines, and
// translating all of them up front would spend a month of free quota in
// an evening. So the screen asks for the dozen or so it is about to
// show, and this answers.
//
// Anything already translated comes back from memory. Anything that
// cannot be translated comes back missing rather than wrong, and the
// screen shows the original on its own.
// ─────────────────────────────────────────────────────────────

const { translate, provider } = require('./_translate.js');

const MAX_TEXTS = 60;
const MAX_CHARS = 600;
const BUDGET = 15000;          // ms — the function itself is allowed twenty

function readBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 200000) reject(new Error('too large'));
    });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).send(JSON.stringify({ error: 'POST only' }));

  let body;
  try {
    body = await readBody(req);
  } catch {
    return res.status(400).send(JSON.stringify({ error: 'bad request' }));
  }

  const jobs = [];
  for (const row of (body.texts || []).slice(0, MAX_TEXTS)) {
    const text = String(row && row.text || '').slice(0, MAX_CHARS);
    const lang = String(row && row.lang || 'en').slice(0, 5).toLowerCase();
    if (text && /^(en|fr|es|zh|de|it|pt|ru|ko)$/.test(lang)) jobs.push({ text, lang });
  }
  if (!jobs.length) return res.status(200).send(JSON.stringify({ via: provider(), ja: {} }));

  const { out, via } = await translate(jobs, Date.now() + BUDGET);
  const ja = {};
  for (const [text, t] of out) ja[text] = t;

  // Translations of a fixed list of headlines are worth caching briefly;
  // several screens on one routine ask for the same ones.
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
  res.status(200).send(JSON.stringify({ via, ja }));
};
