/* ═══════════════════════════════════════════════════════════════════════════
   PABLE v2 — Server
   
   Architecture:
   - Redis caches 20 weighted events + all their goodies, midnight refresh
   - All keyed API calls proxied here (keys never touch the browser)
   - Keyless APIs called directly from frontend
   - Era-aware scoring ensures historical spread across all time periods
   ═══════════════════════════════════════════════════════════════════════════ */

require('dotenv').config();
const express    = require('express');
const fetch      = require('node-fetch');
const cors       = require('cors');
const path       = require('path');
const { createClient } = require('redis');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Redis ────────────────────────────────────────────────────────────────
let redis;
(async () => {
  try {
    redis = createClient({ url: process.env.REDIS_URL });
    redis.on('error', e => console.error('Redis error:', e));
    await redis.connect();
    console.log('Redis connected');
    // Kick off daily event build on startup if not cached
    await ensureDailyEvents();
  } catch (e) {
    console.error('Redis connection failed — running without cache:', e.message);
  }
})();

// ─── Helpers ──────────────────────────────────────────────────────────────
const missingKey = (res, name) =>
  res.status(500).json({ error: `${name} key not configured` });

async function apiFetch(url, opts = {}) {
  const r = await fetch(url, { timeout: 8000, ...opts });
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${url}`);
  return r.json();
}

function extractCurrencyMentions(text) {
  // Returns { amount, currency } if a monetary figure is mentioned, else null
  const patterns = [
    /\$[\d,]+(?:\.\d+)?(?:\s?(?:million|billion|trillion))?/gi,
    /£[\d,]+(?:\.\d+)?(?:\s?(?:million|billion|trillion))?/gi,
    /[\d,]+(?:\.\d+)?\s?(?:million|billion)?\s?(?:dollars?|pounds?|francs?|ducats?|shillings?|denarii|talents?)/gi,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return null;
}

function getEra(year) {
  if (year < 500)   return 'ancient';
  if (year < 1000)  return 'early_medieval';
  if (year < 1400)  return 'medieval';
  if (year < 1600)  return 'renaissance';
  if (year < 1776)  return 'early_modern';
  if (year < 1900)  return 'modern';
  if (year < 1950)  return 'early_20c';
  if (year < 2000)  return 'late_20c';
  return 'contemporary';
}

function scoreEvent(ev) {
  let score = 0;
  const year = parseInt(ev.year) || 0;
  const pageLen = ev.pages?.[0]?.extract?.length || 0;

  // Significance proxy: Wikipedia article length
  score += Math.min(pageLen / 100, 30);

  // Era bonuses — reward ancient/medieval/colonial to counter recency bias
  const era = getEra(year);
  const eraBonus = {
    ancient: 40, early_medieval: 35, medieval: 30,
    renaissance: 25, early_modern: 25, modern: 15,
    early_20c: 10, late_20c: 5, contemporary: 0
  };
  score += eraBonus[era] || 0;

  // Has coordinates (mappable location)
  if (ev.pages?.[0]?.coordinates) score += 5;
  // Has thumbnail image
  if (ev.pages?.[0]?.thumbnail) score += 3;

  return score;
}

// ─── DAILY EVENT SELECTION ────────────────────────────────────────────────
async function buildDailyEvents() {
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');

  console.log(`Building daily events for ${mm}/${dd}…`);

  const data = await apiFetch(
    `https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${mm}/${dd}`,
    { headers: { 'User-Agent': 'PableHistoryApp/2.0 (educational; robpoole24@gmail.com)' } }
  );

  const allEvents = data.events || [];

  // Score all events
  const scored = allEvents.map(ev => ({ ev, score: scoreEvent(ev) }))
    .sort((a, b) => b.score - a.score);

  // Select 20 with era diversity — max 4 per era bucket
  const eraCounts = {};
  const selected = [];
  const ERA_MAX = 4;

  for (const { ev } of scored) {
    if (selected.length >= 20) break;
    const era = getEra(parseInt(ev.year) || 0);
    eraCounts[era] = (eraCounts[era] || 0);
    if (eraCounts[era] < ERA_MAX) {
      selected.push(ev);
      eraCounts[era]++;
    }
  }

  // If we couldn't fill 20 with diversity rules, top up from remainder
  if (selected.length < 20) {
    for (const { ev } of scored) {
      if (selected.length >= 20) break;
      if (!selected.includes(ev)) selected.push(ev);
    }
  }

  console.log(`Selected ${selected.length} events. Era distribution:`, eraCounts);
  return selected;
}

async function ensureDailyEvents() {
  if (!redis) return;
  const today = new Date().toISOString().split('T')[0];
  const cacheKey = `pable:events:${today}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    console.log('Daily events already cached for', today);
    return;
  }
  try {
    const events = await buildDailyEvents();
    // Cache until midnight
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const ttl = Math.floor((midnight - now) / 1000);
    await redis.setEx(cacheKey, ttl, JSON.stringify(events));
    console.log(`Cached ${events.length} events for ${ttl}s`);
  } catch (e) {
    console.error('Failed to build daily events:', e.message);
  }
}

// Schedule midnight refresh
function scheduleMidnightRefresh() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 5, 0); // 12:00:05am
  const ms = midnight - now;
  setTimeout(async () => {
    console.log('Midnight refresh triggered');
    await ensureDailyEvents();
    scheduleMidnightRefresh(); // reschedule for next midnight
  }, ms);
}
scheduleMidnightRefresh();

// ─── ROUTES ───────────────────────────────────────────────────────────────

// Daily events — the 20 weighted, cached events
app.get('/api/events/today', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `pable:events:${today}`;

    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));
    }

    // Cache miss — build on the fly
    const events = await buildDailyEvents();
    if (redis) {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const ttl = Math.floor((midnight - now) / 1000);
      await redis.setEx(cacheKey, ttl, JSON.stringify(events));
    }
    res.json(events);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GOODIES ROUTES ───────────────────────────────────────────────────────

// DPLA — U.S. library & archive collections
app.get('/api/dpla', async (req, res) => {
  const key = process.env.DPLA_API_KEY;
  if (!key) return missingKey(res, 'DPLA');
  const { q, page_size = 5 } = req.query;
  try {
    const data = await apiFetch(
      `https://api.dp.la/v2/items?q=${encodeURIComponent(q)}&page_size=${page_size}&api_key=${key}`
    );
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Smithsonian — artifacts across all SI museums
app.get('/api/smithsonian', async (req, res) => {
  const key = process.env.SMITHSONIAN_API_KEY;
  if (!key) return missingKey(res, 'Smithsonian');
  const { q, rows = 5 } = req.query;
  try {
    const data = await apiFetch(
      `https://api.si.edu/openaccess/api/v1.0/search?q=${encodeURIComponent(q)}&rows=${rows}&api_key=${key}`
    );
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Europeana — European museums & archives
app.get('/api/europeana', async (req, res) => {
  const key = process.env.EUROPEANA_API_KEY;
  if (!key) return missingKey(res, 'Europeana');
  const { q, rows = 5 } = req.query;
  try {
    const data = await apiFetch(
      `https://api.europeana.eu/record/v2/search.json?wskey=${key}&query=${encodeURIComponent(q)}&rows=${rows}&media=true&thumbnail=true`
    );
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// NASA APOD
app.get('/api/nasa/apod', async (req, res) => {
  const key = process.env.NASA_API_KEY;
  if (!key) return missingKey(res, 'NASA');
  const { date } = req.query;
  try {
    const data = await apiFetch(
      `https://api.nasa.gov/planetary/apod?api_key=${key}${date ? `&date=${date}` : ''}`
    );
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// YouTube — documentary + news search
app.get('/api/youtube', async (req, res) => {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return missingKey(res, 'YouTube');
  const { q, type = 'documentary' } = req.query;
  // Two separate queries: educational/documentary AND news coverage
  const searchQ = type === 'news'
    ? `${q} news report footage`
    : `${q} documentary history`;
  try {
    const data = await apiFetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQ)}&type=video&maxResults=4&relevanceLanguage=en&key=${key}`
    );
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// FRED CPI inflation
app.get('/api/fred/cpi', async (req, res) => {
  const key = process.env.FRED_API_KEY;
  if (!key) return missingKey(res, 'FRED');
  const startDate = req.query.start || '1913-01-01';
  const endDate   = req.query.end   || new Date().toISOString().split('T')[0];
  try {
    const data = await apiFetch(
      `https://api.stlouisfed.org/fred/series/observations?series_id=CPIAUCSL&api_key=${key}&file_type=json&observation_start=${startDate}&observation_end=${endDate}&frequency=a`
    );
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Merriam-Webster Dictionary
app.get('/api/dictionary/:word', async (req, res) => {
  const key = process.env.MERRIAM_WEBSTER_DICTIONARY_API_KEY;
  if (!key) return missingKey(res, 'Merriam-Webster Dictionary');
  try {
    const data = await apiFetch(
      `https://www.dictionaryapi.com/api/v3/references/collegiate/json/${encodeURIComponent(req.params.word)}?key=${key}`
    );
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Merriam-Webster Thesaurus
app.get('/api/thesaurus/:word', async (req, res) => {
  const key = process.env.MERRIAM_WEBSTER_THESAURUS_API_KEY;
  if (!key) return missingKey(res, 'Merriam-Webster Thesaurus');
  try {
    const data = await apiFetch(
      `https://www.dictionaryapi.com/api/v3/references/thesaurus/json/${encodeURIComponent(req.params.word)}?key=${key}`
    );
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Google Books — targeted to specific event
app.get('/api/books', async (req, res) => {
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  if (!key) return missingKey(res, 'Google Books');
  const { q, maxResults = 6 } = req.query;
  try {
    // Use intitle/inauthor qualifiers for precision
    const data = await apiFetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=${maxResults}&langRestrict=en&key=${key}`
    );
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Currency mention extractor — used by inflation goodie
app.get('/api/extract-currency', (req, res) => {
  const { text } = req.query;
  if (!text) return res.json({ found: null });
  const found = extractCurrencyMentions(text);
  res.json({ found });
});

// Health check
app.get('/api/health', async (req, res) => {
  const redisOk = redis ? await redis.ping().then(() => true).catch(() => false) : false;
  res.json({
    status: 'ok',
    redis: redisOk,
    keys: {
      dpla:         !!process.env.DPLA_API_KEY,
      nasa:         !!process.env.NASA_API_KEY,
      smithsonian:  !!process.env.SMITHSONIAN_API_KEY,
      europeana:    !!process.env.EUROPEANA_API_KEY,
      fred:         !!process.env.FRED_API_KEY,
      mw_dict:      !!process.env.MERRIAM_WEBSTER_DICTIONARY_API_KEY,
      mw_thes:      !!process.env.MERRIAM_WEBSTER_THESAURUS_API_KEY,
      google_books: !!process.env.GOOGLE_BOOKS_API_KEY,
      youtube:      !!process.env.YOUTUBE_API_KEY,
    }
  });
});

app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

app.listen(PORT, () => console.log(`Pable v2 running on port ${PORT}`));
