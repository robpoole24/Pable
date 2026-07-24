/* ═══════════════════════════════════════════════════════════════════════
   PABLE v3 — server.js
   Full article enrichment, entity extraction, coin APIs, midnight cache
   ═══════════════════════════════════════════════════════════════════════ */
require('dotenv').config();
const { getCurated } = require('./curation');
const express = require('express');
const fetch   = require('node-fetch');
const cors    = require('cors');
const path    = require('path');
const { createClient } = require('redis');

const app  = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());

// Disable caching for all static files so deploys take effect immediately
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// ─── Redis ────────────────────────────────────────────────────────────
let redis;
(async () => {
  try {
    redis = createClient({ url: process.env.REDIS_URL });
    redis.on('error', e => console.error('Redis:', e));
    await redis.connect();
    console.log('Redis connected');
    await ensureDailyEvents();
  } catch (e) {
    console.error('Redis failed — running without cache:', e.message);
  }
})();

// ─── Helpers ──────────────────────────────────────────────────────────
async function apiFetch(url, opts = {}) {
  const r = await fetch(url, { timeout: 10000, ...opts });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
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
  const year    = parseInt(ev.year) || 0;
  const pageLen = ev.pages?.[0]?.extract?.length || 0;
  score += Math.min(pageLen / 80, 35);
  const eraBonus = { ancient:45, early_medieval:40, medieval:35,
    renaissance:28, early_modern:25, modern:15, early_20c:10,
    late_20c:5, contemporary:0 };
  score += eraBonus[getEra(year)] || 0;
  if (ev.pages?.[0]?.coordinates) score += 6;
  if (ev.pages?.[0]?.thumbnail)   score += 3;
  return score;
}

// ─── Extract named entities from Wikipedia article text ───────────────
function extractEntities(article) {
  // Pull people from the linked text — Wikipedia marks people as [[Name|Name]]
  // or from the article's wikibase_item links. We look for capitalized names
  // in the extract that appear to be proper nouns.
  const entities = { people: [], places: [] };
  if (!article) return entities;

  // Match capitalized multi-word proper nouns (2-3 words)
  const namePattern = /\b([A-Z][a-z]+(?:\s+(?:of|the|de|von|I|II|III|IV|V|VI|VII|VIII|IX|X))?(?:\s+[A-Z][a-z]+){0,2})\b/g;
  const seen = new Set();
  let m;
  while ((m = namePattern.exec(article)) !== null) {
    const name = m[1];
    if (seen.has(name) || name.length < 4) continue;
    seen.add(name);
    // Filter obvious non-names
    if (/^(The|This|That|When|After|Before|During|While|Their|These|Those|July|August|September|January|February|March|April|May|June|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/.test(name)) continue;
    entities.people.push(name);
    if (entities.people.length >= 6) break;
  }
  return entities;
}

// ─── Fetch full Wikipedia article ─────────────────────────────────────
async function fetchFullArticle(title) {
  if (!title) return null;
  try {
    const encoded = encodeURIComponent(title.replace(/ /g,'_'));
    const [summary, sections, images] = await Promise.all([
      apiFetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
        { headers: { 'User-Agent': 'PableHistoryApp/3.0 (educational; robpoole24@gmail.com)' } }
      ),
      apiFetch(
        `https://en.wikipedia.org/w/api.php?action=query&titles=${encoded}&prop=extracts&exintro=false&explaintext=true&exsectionformat=plain&format=json&origin=*`
      ).catch(() => null),
      // Fetch page images to get the infobox map
      apiFetch(
        `https://en.wikipedia.org/w/api.php?action=query&titles=${encoded}&prop=images&imlimit=20&format=json&origin=*`
      ).catch(() => null)
    ]);

    const pages   = sections?.query?.pages;
    const fullText = pages ? Object.values(pages)[0]?.extract || '' : '';

    // Extract infobox map — typically a .png or .jpg with 'map' or location name in filename
    const imgPages  = images?.query?.pages;
    const imgList   = imgPages ? Object.values(imgPages)[0]?.images || [] : [];
    const mapImage  = imgList.find(i =>
      /map|location|situe|battle.*plan|theater|theatre/i.test(i.title) &&
      /\.(png|jpg|jpeg|svg)$/i.test(i.title)
    );

    let infoboxMapUrl = null;
    if (mapImage) {
      try {
        const imgTitle  = encodeURIComponent(mapImage.title.replace('File:',''));
        // Request at 800px wide — Wikimedia auto-converts SVG to PNG at this width
        const imgInfo   = await apiFetch(
          `https://en.wikipedia.org/w/api.php?action=query&titles=File:${imgTitle}&prop=imageinfo&iiprop=url|thumburl&iiurlwidth=800&format=json&origin=*`
        );
        const imgData   = imgInfo?.query?.pages;
        const imgEntry  = imgData ? Object.values(imgData)[0]?.imageinfo?.[0] : null;
        // Prefer thumburl (rasterized PNG) over url (raw SVG)
        infoboxMapUrl   = imgEntry?.thumburl || imgEntry?.url || null;
      } catch {}
    }

    // If no map found via keyword filter, try the first image that looks like a map
    if (!infoboxMapUrl) {
      const fallbackMap = imgList.find(i =>
        /southern|northern|eastern|western|region|territory|kingdom|empire|province|italy|sicily|france|england|spain|egypt|roman|medieval|byzantine|ottoman|battle.*map/i.test(i.title) &&
        /\.(png|jpg|jpeg|svg)$/i.test(i.title)
      );
      if (fallbackMap) {
        try {
          const imgTitle = encodeURIComponent(fallbackMap.title.replace('File:',''));
          const imgInfo  = await apiFetch(
            `https://en.wikipedia.org/w/api.php?action=query&titles=File:${imgTitle}&prop=imageinfo&iiprop=url|thumburl&iiurlwidth=800&format=json&origin=*`
          );
          const imgData  = imgInfo?.query?.pages;
          const imgEntry = imgData ? Object.values(imgData)[0]?.imageinfo?.[0] : null;
          infoboxMapUrl  = imgEntry?.thumburl || imgEntry?.url || null;
        } catch {}
      }
    }

    return { ...summary, fullText, infoboxMapUrl };
  } catch { return null; }
}

// ─── Enrich events with full articles + entity extraction ─────────────
async function enrichEvents(events) {
  return Promise.all(events.map(async ev => {
    try {
      const title   = ev.pages?.[0]?.title;
      const article = await fetchFullArticle(title);
      const fullText = article?.fullText || ev.pages?.[0]?.extract || '';

      // Extract key people/places from full article
      const entities = extractEntities(fullText);

      // Fetch brief Wikipedia summaries for top 3 people
      const peopleSummaries = await Promise.all(
        entities.people.slice(0, 3).map(async name => {
          try {
            const encoded = encodeURIComponent(name.replace(/ /g,'_'));
            const s = await apiFetch(
              `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
              { headers: { 'User-Agent': 'PableHistoryApp/3.0 (educational; robpoole24@gmail.com)' } }
            );
            if (s.type === 'disambiguation' || !s.extract) return null;
            return {
              name:      s.title,
              extract:   s.extract?.substring(0, 400),
              thumbnail: s.thumbnail?.source || null,
              url:       s.content_urls?.desktop?.page || null
            };
          } catch { return null; }
        })
      );

      // Attach curated resources (specific chronicles, videos, coins)
      const pageTitle  = ev.pages?.[0]?.title || '';
      const peopleNames = peopleSummaries.filter(Boolean).map(p => p.name);
      const curated    = getCurated(pageTitle + ' ' + (ev.text||''), peopleNames);

      return {
        ...ev,
        fullText,
        fullSummary: article?.extract || ev.pages?.[0]?.extract || '',
        entities,
        peopleSummaries: peopleSummaries.filter(Boolean),
        coordinates: article?.coordinates || ev.pages?.[0]?.coordinates || null,
        infoboxMapUrl: article?.infoboxMapUrl || null,
        curated
      };
    } catch { return ev; }
  }));
}

// ─── Daily event selection + enrichment ───────────────────────────────
async function buildDailyEvents() {
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  console.log(`Building daily events for ${mm}/${dd}…`);

  const data = await apiFetch(
    `https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${mm}/${dd}`,
    { headers: { 'User-Agent': 'PableHistoryApp/3.0 (educational; robpoole24@gmail.com)' } }
  );

  const allEvents = (data.events || []);
  const scored    = allEvents.map(ev => ({ ev, score: scoreEvent(ev) }))
                             .sort((a, b) => b.score - a.score);

  const eraCounts = {};
  const selected  = [];
  const ERA_MAX   = 4;

  for (const { ev } of scored) {
    if (selected.length >= 20) break;
    const era = getEra(parseInt(ev.year) || 0);
    eraCounts[era] = eraCounts[era] || 0;
    if (eraCounts[era] < ERA_MAX) { selected.push(ev); eraCounts[era]++; }
  }
  // Top up if needed
  for (const { ev } of scored) {
    if (selected.length >= 20) break;
    if (!selected.includes(ev)) selected.push(ev);
  }

  console.log(`Selected ${selected.length} events. Enriching…`);
  const enriched = await enrichEvents(selected);
  console.log('Enrichment complete. Era distribution:', eraCounts);
  return enriched;
}

async function ensureDailyEvents() {
  if (!redis) return;
  const today    = new Date().toISOString().split('T')[0];
  const cacheKey = `pable:events:v5:${today}`;
  const cached   = await redis.get(cacheKey);
  if (cached) { console.log('Events cached for', today); return; }
  try {
    const events = await buildDailyEvents();
    const now      = new Date();
    const midnight = new Date(now); midnight.setHours(24,0,0,0);
    const ttl      = Math.floor((midnight - now) / 1000);
    await redis.setEx(cacheKey, ttl, JSON.stringify(events));
    console.log(`Cached ${events.length} events (TTL ${ttl}s)`);
  } catch (e) { console.error('Build failed:', e.message); }
}

function scheduleMidnightRefresh() {
  const now = new Date();
  const midnight = new Date(now); midnight.setHours(24,0,5,0);
  setTimeout(async () => {
    console.log('Midnight refresh');
    await ensureDailyEvents();
    scheduleMidnightRefresh();
  }, midnight - now);
}
scheduleMidnightRefresh();

// ─── API Routes ───────────────────────────────────────────────────────

app.get('/api/events/today', async (req, res) => {
  try {
    const today    = new Date().toISOString().split('T')[0];
    const cacheKey = `pable:events:v5:${today}`;
    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));
    }
    const events = await buildDailyEvents();
    if (redis) {
      const now = new Date(), midnight = new Date(now);
      midnight.setHours(24,0,0,0);
      await redis.setEx(cacheKey, Math.floor((midnight-now)/1000), JSON.stringify(events));
    }
    res.json(events);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Wikipedia full article sections (for deeper context)
app.get('/api/wiki/article', async (req, res) => {
  const { title } = req.query;
  if (!title) return res.status(400).json({ error: 'title required' });
  try {
    const encoded = encodeURIComponent(title.replace(/ /g,'_'));
    const data = await apiFetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encoded}&prop=extracts&exintro=false&explaintext=false&exsectionformat=plain&format=json&origin=*`
    );
    const pages = data.query?.pages;
    const page  = pages ? Object.values(pages)[0] : null;
    res.json({ extract: page?.extract || '', pageid: page?.pageid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Wikipedia person summary
app.get('/api/wiki/person', async (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const encoded = encodeURIComponent(name.replace(/ /g,'_'));
    const data = await apiFetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
      { headers: { 'User-Agent': 'PableHistoryApp/3.0 (educational; robpoole24@gmail.com)' } }
    );
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DPLA
app.get('/api/dpla', async (req, res) => {
  const key = process.env.DPLA_API_KEY;
  if (!key) return res.status(500).json({ error: 'DPLA key missing' });
  const { q, page_size = 6 } = req.query;
  try {
    res.json(await apiFetch(`https://api.dp.la/v2/items?q=${encodeURIComponent(q)}&page_size=${page_size}&api_key=${key}`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Smithsonian
app.get('/api/smithsonian', async (req, res) => {
  const key = process.env.SMITHSONIAN_API_KEY;
  if (!key) return res.status(500).json({ error: 'Smithsonian key missing' });
  const { q, rows = 6 } = req.query;
  try {
    res.json(await apiFetch(`https://api.si.edu/openaccess/api/v1.0/search?q=${encodeURIComponent(q)}&rows=${rows}&api_key=${key}`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Europeana
app.get('/api/europeana', async (req, res) => {
  const key = process.env.EUROPEANA_API_KEY;
  if (!key) return res.status(500).json({ error: 'Europeana key missing' });
  const { q, rows = 6 } = req.query;
  try {
    res.json(await apiFetch(`https://api.europeana.eu/record/v2/search.json?wskey=${key}&query=${encodeURIComponent(q)}&rows=${rows}&media=true&thumbnail=true`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// NASA APOD
app.get('/api/nasa/apod', async (req, res) => {
  const key = process.env.NASA_API_KEY;
  if (!key) return res.status(500).json({ error: 'NASA key missing' });
  try {
    res.json(await apiFetch(`https://api.nasa.gov/planetary/apod?api_key=${key}${req.query.date?`&date=${req.query.date}`:''}`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// YouTube — layered queries: specific → figures → era/region
app.get('/api/youtube', async (req, res) => {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return res.status(500).json({ error: 'YouTube key missing' });
  const { q, fallback1, fallback2, type = 'any' } = req.query;

  const queries = [q, fallback1, fallback2].filter(Boolean);
  let items = [];

  for (const query of queries) {
    if (items.length >= 4) break;
    try {
      const searchQ = type === 'news'
        ? `${query} news report footage`
        : type === 'docs' ? `${query} documentary history`
        : query;
      const data = await apiFetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQ)}&type=video&videoEmbeddable=true&maxResults=8&relevanceLanguage=en&videoDuration=any&key=${key}`
      );
      const found = data.items || [];
      // Deduplicate
      for (const item of found) {
        if (!items.find(x => x.id?.videoId === item.id?.videoId)) {
          items.push(item);
        }
      }
    } catch {}
  }
  res.json({ items: items.slice(0, 6) });
});

// FRED CPI
app.get('/api/fred/cpi', async (req, res) => {
  const key = process.env.FRED_API_KEY;
  if (!key) return res.status(500).json({ error: 'FRED key missing' });
  try {
    res.json(await apiFetch(`https://api.stlouisfed.org/fred/series/observations?series_id=CPIAUCSL&api_key=${key}&file_type=json&observation_start=${req.query.start||'1913-01-01'}&observation_end=${req.query.end||new Date().toISOString().split('T')[0]}&frequency=a`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Merriam-Webster Dictionary
app.get('/api/dictionary/:word', async (req, res) => {
  const key = process.env.MERRIAM_WEBSTER_DICTIONARY_API_KEY;
  if (!key) return res.status(500).json({ error: 'MW Dict key missing' });
  try {
    res.json(await apiFetch(`https://www.dictionaryapi.com/api/v3/references/collegiate/json/${encodeURIComponent(req.params.word)}?key=${key}`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Merriam-Webster Thesaurus
app.get('/api/thesaurus/:word', async (req, res) => {
  const key = process.env.MERRIAM_WEBSTER_THESAURUS_API_KEY;
  if (!key) return res.status(500).json({ error: 'MW Thes key missing' });
  try {
    res.json(await apiFetch(`https://www.dictionaryapi.com/api/v3/references/thesaurus/json/${encodeURIComponent(req.params.word)}?key=${key}`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Google Books — targeted query
app.get('/api/books', async (req, res) => {
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  if (!key) return res.status(500).json({ error: 'Books key missing' });
  const { q, maxResults = 8 } = req.query;
  try {
    res.json(await apiFetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=${maxResults}&langRestrict=en&key=${key}`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Numista — coin catalogue search
app.get('/api/numista', async (req, res) => {
  const key = process.env.NUMISTA_API_KEY;
  if (!key) return res.json({ types: [] }); // graceful no-op if not configured
  const { q, category = 'coin', count = 6 } = req.query;
  try {
    // v3 base URL is api.numista.com/v3 (no extra /api/ segment)
    // Key goes in Numista-API-Key header
    // Returns: { count, types: [{ id, title, issuer, min_year, max_year,
    //   obverse_thumbnail, reverse_thumbnail, ... }] }
    const data = await apiFetch(
      `https://api.numista.com/v3/types?q=${encodeURIComponent(q)}&lang=en&count=${count}&category=${category}`,
      { headers: { 'Numista-API-Key': key } }
    );
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// OCRE — Roman coin linked data (no key needed)
app.get('/api/ocre', async (req, res) => {
  const { q } = req.query;
  try {
    const data = await apiFetch(
      `https://numismatics.org/ocre/api/json?q=${encodeURIComponent(q)}&rows=4`
    );
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Cache status — check what's currently cached
app.get('/api/cache/status', async (req, res) => {
  if (!redis) return res.status(503).json({ error: 'Redis not connected' });
  const today = new Date().toISOString().split('T')[0];
  const results = {};
  for (const v of ['v3','v4','v5']) {
    const key  = `pable:events:${v}:${today}`;
    const raw  = await redis.get(key).catch(()=>null);
    const ttl  = await redis.ttl(key).catch(()=>-1);
    if (raw) {
      const events = JSON.parse(raw);
      const sample = events[0];
      results[key] = {
        count:      events.length,
        ttl_seconds: ttl,
        hasCurated: !!sample?.curated,
        hasFullText: !!sample?.fullText,
        hasInfboxMap: !!sample?.infoboxMapUrl,
        sampleTitle: sample?.pages?.[0]?.title || sample?.text?.substring(0,60)
      };
    } else {
      results[key] = null;
    }
  }
  res.json(results);
});

// Cache clear — force rebuild of today's events (admin use)
app.post('/api/cache/clear', async (req, res) => {
  if (!redis) return res.status(503).json({ error: 'Redis not connected' });
  try {
    const today    = new Date().toISOString().split('T')[0];
    // Clear all version keys for today
    for (const v of ['v3','v4','v5']) {
      await redis.del(`pable:events:${v}:${today}`).catch(()=>{});
    }
    // Rebuild immediately
    const events = await buildDailyEvents();
    const now = new Date(), midnight = new Date(now);
    midnight.setHours(24,0,0,0);
    const ttl = Math.floor((midnight-now)/1000);
    await redis.setEx(`pable:events:v5:${today}`, ttl, JSON.stringify(events));
    res.json({ ok: true, built: events.length, ttl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Audio proxy — streams Internet Archive audio server-side to avoid CORS/redirect issues
app.get('/api/audio/proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });
  
  // Only allow archive.org URLs
  if (!url.startsWith('https://archive.org/') && !url.startsWith('http://archive.org/')) {
    return res.status(403).json({ error: 'Only archive.org URLs allowed' });
  }
  
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'PableHistoryApp/3.0 (educational; robpoole24@gmail.com)' },
      redirect: 'follow'
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    // Forward content headers
    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    const contentLength = response.headers.get('content-length');
    
    res.set('Content-Type', contentType);
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Accept-Ranges', 'bytes');
    if (contentLength) res.set('Content-Length', contentLength);
    
    // Stream the audio
    response.body.pipe(res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health check
app.get('/api/health', async (req, res) => {
  const redisOk = redis ? await redis.ping().then(()=>true).catch(()=>false) : false;
  res.json({
    status: 'ok', redis: redisOk,
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
      numista:      !!process.env.NUMISTA_API_KEY,
    }
  });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT, () => console.log(`Pable v3 on port ${PORT}`));
