/* ═══════════════════════════════════════════════════════════════════════
   PABLE v4 — server.js
   
   Full server-side goodie pre-fetching.
   All API calls happen at midnight Pacific — users get cached data only.
   Zero quota usage per user visit.
   ═══════════════════════════════════════════════════════════════════════ */
require('dotenv').config();
const { getCurated } = require('./curation');
const express = require('express');
const fetch   = require('node-fetch');
const https   = require('https');
const http    = require('http');
const cors    = require('cors');
const path    = require('path');
const { createClient } = require('redis');

const app  = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// ─── Redis ────────────────────────────────────────────────────────────
let redis;
let buildInProgress = false; // mutex — only one build at a time

(async () => {
  try {
    redis = createClient({ url: process.env.REDIS_URL });
    redis.on('error', e => console.error('Redis:', e));
    await redis.connect();
    console.log('Redis connected');
    await ensureDailyCache();
  } catch (e) {
    console.error('Redis failed:', e.message);
  }
})();

// ─── Helpers ──────────────────────────────────────────────────────────
async function apiFetch(url, opts = {}) {
  const r = await fetch(url, { timeout: 12000, ...opts });
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${url.substring(0,80)}`);
  return r.json();
}

// Pacific time helpers — all dates/times relative to America/Los_Angeles
function getPacificDateParts() {
  const now = new Date();
  // toLocaleDateString with en-CA gives YYYY-MM-DD format
  const date = now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const [yyyy, mm, dd] = date.split('-');
  return { yyyy, mm, dd, date };
}

function getTodayPacific() {
  return getPacificDateParts().date; // YYYY-MM-DD
}

function getMonthDayPacific() {
  const { mm, dd } = getPacificDateParts();
  return { mm, dd };
}

function getPacificMidnight() {
  // Find next midnight in Pacific time
  // Get current Pacific date, add one day, that's midnight Pacific
  const { date } = getPacificDateParts();
  const [yyyy, mm, dd] = date.split('-').map(Number);
  // Next day in Pacific
  const nextDay = new Date(yyyy, mm-1, dd+1, 0, 0, 5, 0);
  // This is midnight Pacific in local time — convert to UTC
  // by using the Pacific timezone offset
  const nextDayStr = `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd+1).padStart(2,'0')}T00:00:05`;
  // Parse as Pacific time
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  // Simpler: find ms until next Pacific midnight
  const now = new Date();
  const pacificNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const pacificMidnight = new Date(pacificNow);
  pacificMidnight.setHours(24, 0, 5, 0);
  const msUntilMidnight = pacificMidnight - pacificNow;
  return new Date(now.getTime() + msUntilMidnight);
}

const CACHE_VERSION = 'v11';

// ─── Entity extraction ─────────────────────────────────────────────────
function extractEntities(article) {
  const entities = { people: [], places: [] };
  if (!article) return entities;

  const SKIP = new Set(['The','This','That','When','After','Before','During','While',
    'Their','These','Those','January','February','March','April','May','June','July',
    'August','September','October','November','December','Monday','Tuesday','Wednesday',
    'Thursday','Friday','Saturday','Sunday','Holy','Roman','King','Queen','Emperor',
    'Pope','Prince','Duke','Count','Lord','Saint','General','Admiral']);

  // Pattern 1: Titled names — "King Stefan Nemanja", "Emperor Barbarossa"
  const titledNames = /\b(?:King|Queen|Emperor|Empress|Pope|Prince|Duke|Count|Sultan|Caliph|Tsar|Pharaoh|General|Admiral|President|Chancellor)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/g;
  let m;
  while ((m = titledNames.exec(article)) !== null) {
    const name = m[1].trim();
    if (name.length > 3 && !SKIP.has(name.split(' ')[0])) {
      entities.people.push(name);
      if (entities.people.length >= 8) break;
    }
  }

  // Pattern 2: Standard multi-word proper nouns
  const namePattern = /\b([A-Z][a-z]{2,}(?:\s+(?:von|de|of|the|I|II|III|IV|V|VI|VII|VIII|IX|X))?(?:\s+[A-Z][a-z]{2,}){0,2})\b/g;
  const seen = new Set(entities.people);
  while ((m = namePattern.exec(article)) !== null) {
    const name = m[1];
    if (seen.has(name) || name.length < 5) continue;
    seen.add(name);
    if (SKIP.has(name.split(' ')[0])) continue;
    entities.people.push(name);
    if (entities.people.length >= 8) break;
  }

  // Filter — reject single-word false positives
  const SKIP_SINGLE = new Set([
    'Adrian','Henry','Richard','John','Robert','William','Frederick','Stephen',
    'Philip','Louis','Charles','Edward','Thomas','George','James','Peter','Paul',
    'Francis','Martin','Gregory','Innocent','Alexander','Conrad','Otto','Rudolf',
    'German','Norman','French','English','Italian','Spanish','Roman','Greek',
    'Holy','Christian','Muslim','Jewish','Byzantine','Ottoman','Mongol','Saxon',
    'Crusade','Empire','Kingdom','Republic','Church','Pope','King','Queen','Duke'
  ]);

  entities.people = [...new Set(entities.people)]
    .filter(name => {
      const words = name.trim().split(/\s+/);
      if (words.length >= 2) return true;
      return name.length >= 8 && !SKIP_SINGLE.has(name);
    })
    .slice(0, 6);

  return entities;
}

// ─── Fetch full Wikipedia article ──────────────────────────────────────
async function fetchFullArticle(title) {
  if (!title) return null;
  try {
    const encoded = encodeURIComponent(title.replace(/ /g,'_'));
    const [summary, sections, images] = await Promise.all([
      apiFetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
        { headers: { 'User-Agent': 'PableHistoryApp/4.0 (educational; robpoole24@gmail.com)' } }),
      apiFetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encoded}&prop=extracts&exintro=false&explaintext=true&exsectionformat=plain&format=json&origin=*`).catch(()=>null),
      apiFetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encoded}&prop=images&imlimit=20&format=json&origin=*`).catch(()=>null)
    ]);

    const pages    = sections?.query?.pages;
    const fullText = pages ? Object.values(pages)[0]?.extract || '' : '';

    const imgPages = images?.query?.pages;
    const imgList  = imgPages ? Object.values(imgPages)[0]?.images || [] : [];
    const mapImage = imgList.find(i =>
      /map|location|situe|battle.*plan|theater|theatre|southern|northern|kingdom|region/i.test(i.title) &&
      /\.(png|jpg|jpeg|svg)$/i.test(i.title)
    );

    let infoboxMapUrl = null;
    if (mapImage) {
      try {
        const imgTitle  = encodeURIComponent(mapImage.title.replace('File:',''));
        const imgInfo   = await apiFetch(
          `https://en.wikipedia.org/w/api.php?action=query&titles=File:${imgTitle}&prop=imageinfo&iiprop=url|thumburl&iiurlwidth=800&format=json&origin=*`
        );
        const imgData   = imgInfo?.query?.pages;
        const imgEntry  = imgData ? Object.values(imgData)[0]?.imageinfo?.[0] : null;
        infoboxMapUrl   = imgEntry?.thumburl || imgEntry?.url || null;
      } catch {}
    }

    return { ...summary, fullText, infoboxMapUrl };
  } catch { return null; }
}

// ─── PRE-FETCH GOODIES SERVER-SIDE ────────────────────────────────────
// This replaces all client-side API calls with one server-side pass at midnight
async function fetchGoodiesForEvent(ev) {
  const year      = parseInt(ev.year) || 0;
  const title     = (ev.text||'').replace(/\[\[.*?\]\]/g,'');
  const fullText  = ev.fullText || '';
  const pageTitle = ev.pages?.[0]?.title || '';
  const curated   = ev.curated || {};
  const people    = ev.peopleSummaries || [];
  const qe        = ev.queryExpansion || [pageTitle];

  // All people names for queries
  const curatedPeople = curated.people?.map(p=>p.name) || [];
  const apiPeople     = people.map(p=>p.name);
  const allPeople     = [...new Set([...curatedPeople, ...apiPeople])].slice(0,3);

  // Era flags
  const isRoman    = year < 500 && year > -100 && /roman|caesar|augustus|legion|senate/i.test(title+fullText);
  const isMedieval = year >= 500 && year < 1500;
  const isSpace    = /nasa|apollo|space|astronaut|rocket|moon|mars|orbit/i.test(title+fullText);
  const hasNewspaper = year >= 1770 && year <= 1963;
  const hasRecording = year >= 1877;

  const goodies = {};

  // ── YouTube videos ────────────────────────────────────────────────
  try {
    const ytKey = process.env.YOUTUBE_API_KEY;
    if (ytKey) {
      const queries = [...new Set([...qe.slice(0,3), ...allPeople.slice(0,2)])].filter(Boolean);
      let ytItems = [];
      for (const q of queries) {
        if (ytItems.length >= 8) break;
        try {
          // Search bare first (no "documentary history" appended — reduces results)
          const data = await apiFetch(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&videoEmbeddable=true&maxResults=6&relevanceLanguage=en&key=${ytKey}`
          );
          for (const item of (data.items||[])) {
            if (!ytItems.find(x => x.id?.videoId === item.id?.videoId)) ytItems.push(item);
          }
        } catch {}
      }
      goodies.youtubeVideos = ytItems.slice(0,8).map(v => ({
        id:      v.id?.videoId,
        title:   v.snippet?.title,
        channel: v.snippet?.channelTitle,
        thumb:   v.snippet?.thumbnails?.medium?.url || ''
      }));
    }
  } catch {}

  // ── Internet Archive video ─────────────────────────────────────────
  try {
    // Build smarter queries — use exact page title and people names
    // Add relevance check: result title must share a word with our query
    const queries = [...new Set([pageTitle, ...allPeople.slice(0,2), ...qe.slice(0,2)])].filter(Boolean);
    let archiveDocs = [];
    for (const q of queries.slice(0,4)) {
      if (archiveDocs.length >= 6) break;
      const data = await apiFetch(
        `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}+mediatype:movies&fl[]=identifier,title,description&sort[]=downloads+desc&rows=4&output=json`
      ).catch(()=>({response:{docs:[]}}));
      const qwords = q.toLowerCase().split(' ').filter(w=>w.length>3);
      for (const d of (data.response?.docs||[])) {
        // Relevance check — title must share a meaningful word with query
        const titleLower = (d.title||'').toLowerCase();
        const relevant   = qwords.some(w => titleLower.includes(w));
        if (relevant && !archiveDocs.find(x=>x.identifier===d.identifier)) archiveDocs.push(d);
      }
    }
    goodies.archiveVideo = archiveDocs.slice(0,5).map(d=>({ identifier:d.identifier, title:d.title }));
  } catch {}

  // ── Internet Archive audio ─────────────────────────────────────────
  // Only for post-1877 events; search pageTitle first (most specific), then people
  if (hasRecording) {
    try {
      const audioQueries = [pageTitle, ...allPeople.slice(0,1)].filter(Boolean);
      const pageTitleWords = pageTitle.toLowerCase().split(/\s+/).filter(w=>w.length>4);
      let audioItems = [];
      for (const q of audioQueries.slice(0,2)) {
        if (audioItems.length >= 4) break;
        const data = await apiFetch(
          `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}+mediatype:audio&fl[]=identifier,title&sort[]=downloads+desc&rows=5&output=json`
        ).catch(()=>({response:{docs:[]}}));
        for (const item of (data.response?.docs||[])) {
          if (audioItems.find(x=>x.identifier===item.identifier)) continue;
          // Relevance: result title must share a word with the page title
          const resultTitle = (item.title||'').toLowerCase();
          const relevant = pageTitleWords.some(w => resultTitle.includes(w));
          if (!relevant) continue;
          const meta = await apiFetch(`https://archive.org/metadata/${item.identifier}`).catch(()=>({files:[]}));
          const file = (meta.files||[]).find(f=>/\.mp3$/i.test(f.name));
          if (file) audioItems.push({ identifier:item.identifier, title:item.title,
            audioUrl:`https://archive.org/download/${item.identifier}/${encodeURIComponent(file.name)}` });
        }
      }
      goodies.archiveAudio = audioItems;
    } catch {}
  }

  // ── Wikimedia images ───────────────────────────────────────────────
  try {
    const queries = [...new Set([pageTitle, ...allPeople.slice(0,2)])].filter(Boolean);
    let images = [];
    for (const q of queries.slice(0,3)) {
      if (images.length >= 8) break;
      const data = await apiFetch(
        `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=400&format=json&origin=*&gsrlimit=8`
      ).catch(()=>({}));
      for (const p of Object.values(data.query?.pages||{})) {
        const url = p.imageinfo?.[0]?.url;
        if (!url || /\.(svg|gif)$/i.test(url) || /flag|icon|button|cricket|football/i.test(p.title||'')) continue;
        if (images.find(x=>x.url===url)) continue;
        images.push({ url, caption:(p.imageinfo[0].extmetadata?.ImageDescription?.value||p.title||'').replace(/<[^>]+>/g,'').substring(0,80), source:'Wikimedia' });
      }
    }
    goodies.images = images.slice(0,10);
  } catch {}

  // ── Music (Open Opus) ──────────────────────────────────────────────
  try {
    const musicEpoch = year < 1400 ? 'Medieval' : year < 1600 ? 'Renaissance' :
      year < 1750 ? 'Baroque' : year < 1820 ? 'Classical' : year < 1910 ? 'Romantic' : null;
    if (musicEpoch) {
      const data = await apiFetch(`https://api.openopus.org/composer/list/epoch/${musicEpoch}.json`).catch(()=>({composers:[]}));
      // Tighten range — only composers who lived within 80 years of the event
      // Prevents 1500s events getting 1700s Classical composers
      const pool = (data.composers||[]).filter(c => {
        const born=parseInt(c.birth)||0, died=parseInt(c.death)||9999;
        return born <= year + 80 && died >= year - 30;
      }).sort(()=>Math.random()-0.5).slice(0,8);

      const withAudio = [];
      for (const c of pool) {
        if (withAudio.length >= 4) break;
        try {
          const q  = encodeURIComponent(c.complete_name);
          const ar = await apiFetch(`https://archive.org/advancedsearch.php?q=${q}+mediatype:audio&fl[]=identifier,title&sort[]=downloads+desc&rows=3&output=json`).catch(()=>({response:{docs:[]}}));
          for (const item of (ar.response?.docs||[])) {
            const meta = await apiFetch(`https://archive.org/metadata/${item.identifier}`).catch(()=>({files:[]}));
            const file = (meta.files||[]).find(f=>/\.mp3$/i.test(f.name));
            if (file) {
              withAudio.push({ name:c.complete_name, epoch:musicEpoch, birth:c.birth, death:c.death,
                portrait:c.portrait,
                audioUrl:`https://archive.org/download/${item.identifier}/${encodeURIComponent(file.name)}`,
                audioTitle:item.title, archiveId:item.identifier });
              break;
            }
          }
          if (!withAudio.find(x=>x.name===c.complete_name)) {
            withAudio.push({ name:c.complete_name, epoch:musicEpoch, birth:c.birth, death:c.death, portrait:c.portrait, audioUrl:null });
          }
        } catch {}
      }
      goodies.music = { epoch: musicEpoch, composers: withAudio.slice(0,4) };
    }
  } catch {}

  // ── Books ──────────────────────────────────────────────────────────
  try {
    const booksKey = process.env.GOOGLE_BOOKS_API_KEY;
    // Primary query: page title words (most specific to this event)
    // Secondary: key people — but only if pageTitle search finds nothing
    const pageTitleClean = pageTitle.replace(/_/g, ' ').replace(/,.*/, '').trim();
    const queries = [...new Set([
      pageTitleClean.split(' ').slice(0,4).join(' '),  // e.g. "United States Post Office"
      ...allPeople.slice(0,1)                           // e.g. "Benjamin Franklin" as fallback
    ])].filter(Boolean);
    // Words that must appear in book title for it to be relevant
    const topicWords = pageTitleClean.toLowerCase().split(/\s+/).filter(w=>w.length>4);
    let books = [];
    const seen = new Set();

    // Prepend curated books
    for (const b of (curated.books||[])) {
      seen.add(b.title?.toLowerCase());
      books.push({ ...b, source:'Curated' });
    }

    for (const q of queries.slice(0,3)) {
      if (books.length >= 8) break;
      // Open Library
      const olData = await apiFetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=4&fields=key,title,author_name,first_publish_year,cover_i`).catch(()=>({docs:[]}));
      for (const b of (olData.docs||[])) {
        const t = (b.title||'').toLowerCase();
        // Must match topic words OR query words — prevents off-topic results
        const qwords = q.toLowerCase().split(/\s+/).filter(w=>w.length>4);
        const matchesTopic = topicWords.length ? topicWords.some(w=>t.includes(w)) : true;
        const matchesQuery = qwords.some(w=>t.includes(w));
        if (!matchesTopic && !matchesQuery) continue;
        if (seen.has(t)) continue; seen.add(t);
        books.push({ title:b.title, author:b.author_name?.[0]||'Unknown', year:b.first_publish_year,
          coverUrl:b.cover_i?`https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg`:null,
          url:b.key?`https://openlibrary.org${b.key}`:null, source:'Open Library' });
      }
      // Google Books
      if (booksKey) {
        const gbData = await apiFetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=4&langRestrict=en&key=${booksKey}`).catch(()=>({items:[]}));
        for (const item of (gbData.items||[])) {
          const vol = item.volumeInfo, t=(vol.title||'').toLowerCase();
          const qwords = q.toLowerCase().split(/\s+/).filter(w=>w.length>4);
          const matchesTopic = topicWords.length ? topicWords.some(w=>t.includes(w)) : true;
          const matchesQuery = qwords.some(w=>t.includes(w));
          if (!matchesTopic && !matchesQuery) continue;
          if (seen.has(t)) continue; seen.add(t);
          books.push({ title:vol.title, author:vol.authors?.[0]||'Unknown',
            year:vol.publishedDate?.substring(0,4),
            coverUrl:vol.imageLinks?.thumbnail?.replace('http://','https://')||null,
            url:vol.infoLink||null, source:'Google Books' });
        }
      }
    }
    goodies.books = books.slice(0,8);
  } catch {}

  // ── Newspapers ─────────────────────────────────────────────────────
  if (hasNewspaper) {
    try {
      const startYear = Math.max(year-3, 1770);
      const endYear   = Math.min(year+5, 1963);
      const data = await apiFetch(`https://www.loc.gov/collections/chronicling-america/?andtext=${encodeURIComponent(pageTitle)}&start_date=${startYear}-01-01&end_date=${endYear}-12-31&fo=json`).catch(()=>({results:[]}));
      goodies.newspapers = (data.results||[]).slice(0,4).map(r=>({
        url:r.url, title:r.title, date:r.date, imageUrl:r.image_url?.[0]||null,
        snippet:r.description?.[0]||null, partof:r.partof?.[0]||null
      }));
    } catch {}
  }

  // ── Coins ──────────────────────────────────────────────────────────
  try {
    // Use curated coins first
    let coins = [...(curated.coins||[])];
    if (coins.length < 4) {
      const numistaKey = process.env.NUMISTA_API_KEY;
      const queries = allPeople.length ? allPeople.slice(0,2) : [pageTitle.split(' ').slice(0,2).join(' ')];
      for (const q of queries) {
        if (coins.length >= 6) break;
        // Wikimedia numismatic search
        const data = await apiFetch(`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q+' coin numismatic')}&gsrnamespace=6&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=400&format=json&origin=*&gsrlimit=6`).catch(()=>({}));
        for (const p of Object.values(data.query?.pages||{})) {
          const url = p.imageinfo?.[0]?.url;
          if (!url || /\.(svg|gif)$/i.test(url)) continue;
          if (coins.find(x=>x.url===url)) continue;
          coins.push({ url, caption:(p.title||'').replace('File:','').replace(/\.[^.]+$/,''), source:'Wikimedia' });
        }
        // Numista
        if (numistaKey && coins.length < 4) {
          const nm = await apiFetch(`https://api.numista.com/v3/types?q=${encodeURIComponent(q)}&lang=en&count=4&category=coin`,
            { headers:{ 'Numista-API-Key':numistaKey } }).catch(()=>({types:[]}));
          for (const t of (nm.types||[])) {
            if (t.obverse_thumbnail) coins.push({ url:t.obverse_thumbnail,
              caption:[t.title, t.issuer?.name, t.min_year].filter(Boolean).join(' · '), source:'Numista' });
          }
        }
      }
    }
    goodies.coins = coins.slice(0,8);
  } catch {}

  // ── Primary sources (Gutenberg) ────────────────────────────────────
  if (year < 1600) {
    try {
      const queries = [...allPeople.slice(0,2), pageTitle.split(' ').slice(0,2).join(' ')].filter(Boolean);
      let sources = [];
      const seen = new Set();
      for (const q of queries.slice(0,3)) {
        const data = await apiFetch(`https://gutendex.com/books/?search=${encodeURIComponent(q)}`).catch(()=>({results:[]}));
        for (const b of (data.results||[])) {
          const t = (b.title||'').toLowerCase();
          const qwords = q.toLowerCase().split(/\s+/).filter(w=>w.length>4);
          const ptWords = pageTitleClean?.toLowerCase().split(/\s+/).filter(w=>w.length>4) || [];
          const relevant = qwords.some(w=>t.includes(w)) || ptWords.some(w=>t.includes(w));
          if (!relevant) continue;
          if (seen.has(b.id)) continue; seen.add(b.id);
          sources.push({ title:b.title, author:b.authors?.[0]?.name||'Unknown',
            url:`https://gutenberg.org/ebooks/${b.id}`, source:'Project Gutenberg' });
        }
      }
      goodies.primarySources = sources.slice(0,6);
    } catch {}
  }

  // ── DPLA images ────────────────────────────────────────────────────
  try {
    const dplaKey = process.env.DPLA_API_KEY;
    if (dplaKey) {
      const data = await apiFetch(`https://api.dp.la/v2/items?q=${encodeURIComponent(pageTitle)}&page_size=4&api_key=${dplaKey}`).catch(()=>({docs:[]}));
      goodies.dplaImages = (data.docs||[]).filter(d=>d.object).slice(0,3).map(d=>({
        url:d.object, caption:(d.sourceResource?.title?.[0]||'DPLA').substring(0,80), source:'DPLA' }));
    }
  } catch {}

  // ── Guardian ───────────────────────────────────────────────────────
  if (year >= 1999) {
    try {
      const gKey = process.env.GUARDIAN_API_KEY;
      if (gKey) {
        const data = await apiFetch(`https://content.guardianapis.com/search?q=${encodeURIComponent(pageTitle)}&show-fields=thumbnail,trailText,headline&page-size=5&api-key=${gKey}`).catch(()=>({response:{results:[]}}));
        goodies.guardian = (data.response?.results||[]).slice(0,5).map(r=>({
          url:r.webUrl, headline:r.fields?.headline||r.webTitle,
          date:r.webPublicationDate?.substring(0,10),
          thumbnail:r.fields?.thumbnail||null, trail:r.fields?.trailText?.replace(/<[^>]+>/g,'')||null }));
      }
    } catch {}
  }

  goodies._ready = true;
  goodies._builtAt = new Date().toISOString();
  const sections = Object.keys(goodies).filter(k => !k.startsWith('_') && goodies[k]);
  console.log(`    → Built: ${sections.join(', ') || 'nothing'}`);
  return goodies;
}

// ─── Enrich events ────────────────────────────────────────────────────
async function enrichEvents(events) {
  return Promise.all(events.map(async ev => {
    try {
      const title   = ev.pages?.[0]?.title;
      const article = await fetchFullArticle(title);
      const fullText = article?.fullText || ev.pages?.[0]?.extract || '';
      const entities = extractEntities(fullText);

      const peopleSummaries = await Promise.all(
        entities.people.slice(0, 3).map(async name => {
          try {
            const encoded = encodeURIComponent(name.replace(/ /g,'_'));
            const s = await apiFetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
              { headers:{ 'User-Agent':'PableHistoryApp/4.0 (educational; robpoole24@gmail.com)' } });
            if (s.type === 'disambiguation' || !s.extract) return null;
            const desc = (s.description||'').toLowerCase();
            const isPerson = /king|queen|emperor|count|duke|prince|general|pope|sultan|president|founder|commander|lord|baron|leader|bishop|tsar|pharaoh|caliph|knight|ruler|monarch|chancellor/.test(desc);
            if (!isPerson) return null;
            return { name:s.title, role:s.description||'', extract:s.extract?.substring(0,400)||'',
              thumbnail:s.thumbnail?.source||null, url:s.content_urls?.desktop?.page||null };
          } catch { return null; }
        })
      );

      const pageTitle   = ev.pages?.[0]?.title || '';
      const peopleNames = peopleSummaries.filter(Boolean).map(p=>p.name);
      const curated     = getCurated(pageTitle+' '+(ev.text||''), peopleNames);
      const eventYear   = parseInt(ev.year) || 0;

      const geoMatches = fullText.match(/\b(Kingdom|Duchy|County|Empire|Republic|Principality|Caliphate|Sultanate|Dynasty)\s+of\s+[A-Z][a-zA-Z\s]{2,20}/g) || [];
      const geoTerms   = [...new Set(geoMatches.map(m=>m.trim()))].slice(0,2);

      const getEraLabel = y => {
        if (y<500) return 'Ancient'; if (y<1000) return 'Early Medieval';
        if (y<1400) return 'Medieval'; if (y<1600) return 'Renaissance';
        if (y<1776) return 'Early Modern'; if (y<1900) return 'Modern'; return '';
      };
      const eraLabel = getEraLabel(eventYear);

      const queryExpansion = [
        pageTitle, ...peopleNames.slice(0,2), ...geoTerms.slice(0,2),
        eraLabel && peopleNames[0] ? `${eraLabel} ${peopleNames[0].split(' ')[0]}` : null,
        eraLabel && geoTerms[0]    ? `${eraLabel} ${geoTerms[0].split(' ').slice(-1)[0]}` : null,
      ].filter(Boolean).filter((q,i,a)=>a.indexOf(q)===i).slice(0,6);

      const enriched = { ...ev, fullText, fullSummary:article?.extract||ev.pages?.[0]?.extract||'',
        entities, peopleSummaries:peopleSummaries.filter(Boolean),
        coordinates:article?.coordinates||ev.pages?.[0]?.coordinates||null,
        infoboxMapUrl:article?.infoboxMapUrl||null, queryExpansion, curated };

      // Goodies are built separately in buildAllGoodiesBackground
      return enriched;
    } catch { return ev; }
  }));
}

// ─── Event scoring and selection ──────────────────────────────────────
function getEra(year) {
  if (year<500) return 'ancient'; if (year<1000) return 'early_medieval';
  if (year<1400) return 'medieval'; if (year<1600) return 'renaissance';
  if (year<1776) return 'early_modern'; if (year<1900) return 'modern';
  if (year<1950) return 'early_20c'; if (year<2000) return 'late_20c';
  return 'contemporary';
}

function scoreEvent(ev) {
  let score = 0;
  const year    = parseInt(ev.year) || 0;
  const pageLen = ev.pages?.[0]?.extract?.length || 0;
  score += Math.min(pageLen / 80, 35);
  const eraBonus = { ancient:45, early_medieval:40, medieval:35, renaissance:28,
    early_modern:25, modern:15, early_20c:10, late_20c:5, contemporary:0 };
  score += eraBonus[getEra(year)] || 0;
  if (ev.pages?.[0]?.coordinates) score += 6;
  if (ev.pages?.[0]?.thumbnail)   score += 3;
  return score;
}

async function buildDailyEvents() {
  const { mm, dd } = getMonthDayPacific();
  console.log(`Building daily events for ${mm}/${dd} Pacific…`);

  const data = await apiFetch(
    `https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${mm}/${dd}`,
    { headers:{ 'User-Agent':'PableHistoryApp/4.0 (educational; robpoole24@gmail.com)' } }
  );

  const scored = (data.events||[]).map(ev=>({ ev, score:scoreEvent(ev) })).sort((a,b)=>b.score-a.score);
  const eraCounts = {};
  const selected  = [];
  for (const { ev } of scored) {
    if (selected.length >= 20) break;
    const era = getEra(parseInt(ev.year)||0);
    eraCounts[era] = eraCounts[era] || 0;
    if (eraCounts[era] < 4) { selected.push(ev); eraCounts[era]++; }
  }
  for (const { ev } of scored) {
    if (selected.length >= 20) break;
    if (!selected.includes(ev)) selected.push(ev);
  }

  console.log(`Selected ${selected.length} events. Enriching (Wikipedia only)…`);
  const enriched = await enrichEvents(selected);
  console.log('Done. Era distribution:', eraCounts);
  return enriched;
}

// Build and cache ALL goodies for all events — blocks until complete
// This is the only place goodies are ever built. Never triggered by a user request.
async function buildAndCacheAllGoodies(events, today) {
  const midnight = getPacificMidnight();
  const ttl = Math.max(Math.floor((midnight - new Date()) / 1000), 3600);
  for (let i = 0; i < events.length; i++) {
    const ev        = events[i];
    const goodieKey = `pable:goodies:${CACHE_VERSION}:${today}:${i}`;
    const existing  = await redis.get(goodieKey).catch(()=>null);
    if (existing) {
      const g = JSON.parse(existing);
      if (g._ready) { console.log(`  [${i+1}/${events.length}] Already cached: ${ev.pages?.[0]?.title||ev.year}`); continue; }
    }
    try {
      console.log(`  [${i+1}/${events.length}] Building: ${ev.pages?.[0]?.title||ev.year}`);
      const goodies = await fetchGoodiesForEvent(ev);
      await redis.setEx(goodieKey, ttl, JSON.stringify(goodies));
    } catch (e) {
      console.error(`  [${i+1}/${events.length}] Error: ${e.message}`);
    }
  }
  console.log('All goodies built and cached.');
}

async function ensureDailyCache() {
  if (!redis) return;
  if (buildInProgress) { console.log('Build already in progress — skipping'); return; }
  buildInProgress = true;
  const today = getTodayPacific();
  try {
    const eventKey   = `pable:events:${CACHE_VERSION}:${today}`;
    const goodie0Key = `pable:goodies:${CACHE_VERSION}:${today}:0`;

    // Check if everything is fully built — verify ALL slots have real content
    const evCached = await redis.get(eventKey).catch(()=>null);
    if (evCached) {
      const events = JSON.parse(evCached);
      const goodieChecks = await Promise.all(
        events.map((_, i) =>
          redis.get(`pable:goodies:${CACHE_VERSION}:${today}:${i}`).catch(()=>null)
        )
      );
      const allBuilt = goodieChecks.every(g => {
        if (!g) return false;
        const parsed = JSON.parse(g);
        // Must be marked ready AND have at least some real content
        return parsed._ready === true && (
          parsed.images?.length > 0 ||
          parsed.youtubeVideos?.length > 0 ||
          parsed.books?.length > 0 ||
          parsed.music != null
        );
      });
      if (allBuilt) {
        console.log(`Full cache hit for ${today} — all ${events.length} events + goodies verified ready`);
        return;
      }
      console.log(`Cache incomplete — ${goodieChecks.filter(Boolean).length}/${events.length} goodies found, rebuilding…`);
    }

    // Build events if needed
    let events;
    if (evCached) {
      events = JSON.parse(evCached);
      // Ensure events have _goodieIndex (may be missing from older cache)
      events = events.map((ev, i) => ev._goodieIndex !== undefined ? ev : { ...ev, _goodieIndex: i });
      console.log('Events already cached, building goodies…');
    } else {
      console.log('Building events…');
      events = await buildDailyEvents();
      const ttl = Math.max(Math.floor((getPacificMidnight() - new Date()) / 1000), 3600);
        // Tag each event with its cache index BEFORE storing
      // This survives client-side sorting — events carry their own goodie slot number
      const taggedEvents = events.map((ev, i) => ({ ...ev, _goodieIndex: i }));
      await redis.setEx(eventKey, ttl, JSON.stringify(taggedEvents));
      events = taggedEvents;
      console.log(`Events cached (${events.length})`);
    }

    // Build ALL goodies completely before serving users
    console.log('Building goodies for all events…');
    await buildAndCacheAllGoodies(events, today);
    console.log('✓ Daily cache complete — ready to serve');

  } catch (e) {
    console.error('Cache build failed:', e.message);
  } finally {
    buildInProgress = false;
  }
}

function schedulePacificMidnight() {
  const midnight = getPacificMidnight();
  const ms = Math.max(midnight - new Date(), 60000); // at least 1 min gap
  console.log(`Next Pacific midnight refresh in ${Math.round(ms/3600000 * 10)/10}h`);
  setTimeout(async () => {
    console.log('Pacific midnight — rebuilding daily events');
    await ensureDailyCache();
    schedulePacificMidnight();
  }, ms);
}
// Delay scheduler start by 10s to avoid racing with startup build
setTimeout(schedulePacificMidnight, 10000);

// ─── Routes ───────────────────────────────────────────────────────────

app.get('/api/events/today', async (req, res) => {
  try {
    const today    = getTodayPacific();
    const cacheKey = `pable:events:${CACHE_VERSION}:${today}`;
    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));
    }
    // Cache miss (e.g. after manual flush) — trigger a full rebuild
    console.log('Cache miss on /api/events/today — triggering rebuild');
    await ensureDailyCache();
    // Try again after rebuild
    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));
    }
    res.status(503).json({ error: 'Cache build failed — check server logs' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Serve pre-cached goodies for a specific event — never built on demand
app.get('/api/goodies/:index', async (req, res) => {
  const today     = getTodayPacific();
  const idx       = parseInt(req.params.index);
  const goodieKey = `pable:goodies:${CACHE_VERSION}:${today}:${idx}`;
  try {
    if (redis) {
      const cached = await redis.get(goodieKey);
      if (cached) return res.json(JSON.parse(cached));
    }
    res.json({ _ready: false }); // not built yet
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Audio proxy — streams archive.org audio server-side to avoid CORS
app.get('/api/audio/proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });
  if (!url.startsWith('https://archive.org/') && !url.startsWith('http://archive.org/')) {
    return res.status(403).json({ error: 'Only archive.org URLs allowed' });
  }
  const makeRequest = (targetUrl) => {
    const mod = targetUrl.startsWith('https') ? https : http;
    mod.get(targetUrl, { headers:{ 'User-Agent':'PableHistoryApp/4.0 (educational; robpoole24@gmail.com)' } }, (audioRes) => {
      if ([301,302,303].includes(audioRes.statusCode)) {
        const loc = audioRes.headers.location;
        if (loc) return makeRequest(loc);
      }
      if (audioRes.statusCode !== 200) {
        return res.status(audioRes.statusCode).json({ error:`Archive returned ${audioRes.statusCode}` });
      }
      res.set('Content-Type', audioRes.headers['content-type']||'audio/mpeg');
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Accept-Ranges', 'bytes');
      if (audioRes.headers['content-length']) res.set('Content-Length', audioRes.headers['content-length']);
      audioRes.pipe(res);
      audioRes.on('error', e => { if (!res.headersSent) res.status(500).end(); });
    }).on('error', e => { if (!res.headersSent) res.status(500).json({ error:e.message }); });
  };
  makeRequest(url);
});

// Cache status
app.get('/api/cache/status', async (req, res) => {
  if (!redis) return res.status(503).json({ error:'Redis not connected' });
  const today = getTodayPacific();
  const results = {};
  for (const v of [CACHE_VERSION, 'v10', 'v9']) {
    const key = `pable:events:${v}:${today}`;
    const raw = await redis.get(key).catch(()=>null);
    const ttl = await redis.ttl(key).catch(()=>-1);
    if (raw) {
      const events = JSON.parse(raw);
      const sample = events[0];
      results[key] = { count:events.length, ttl_seconds:ttl,
        hasCurated:!!sample?.curated, hasFullText:!!sample?.fullText,
        hasGoodies:!!sample?.goodies, hasYouTube:!!(sample?.goodies?.youtubeVideos?.length),
        sampleTitle:sample?.pages?.[0]?.title||sample?.text?.substring(0,60) };
    } else { results[key] = null; }
  }
  res.json(results);
});

// Cache clear + full rebuild — this request blocks until ALL goodies are built
// Expect this to take 3-5 minutes. Use only when you need a manual refresh.
app.post('/api/cache/clear', async (req, res) => {
  if (!redis) return res.status(503).json({ error:'Redis not connected' });
  const today = getTodayPacific();
  // Clear all cached data
  for (const v of [CACHE_VERSION,'v11','v10','v9','v8','v7','v6','v5','v4','v3']) {
    await redis.del(`pable:events:${v}:${today}`).catch(()=>{});
    for (let i=0; i<25; i++) await redis.del(`pable:goodies:${v}:${today}:${i}`).catch(()=>{});
  }
  try {
    // Build events
    const events   = await buildDailyEvents();
    const midnight = getPacificMidnight();
    const ttl      = Math.max(Math.floor((midnight - new Date()) / 1000), 3600);
    await redis.setEx(`pable:events:${CACHE_VERSION}:${today}`, ttl, JSON.stringify(events));
    // Build ALL goodies synchronously — this request waits until complete
    await buildAndCacheAllGoodies(events, today);
    res.json({ ok:true, built:events.length, ttl, ready:true,
      message:`All ${events.length} events and goodies fully cached.` });
  } catch (e) { res.status(500).json({ error:e.message }); }
});

// Nuclear option — flush ALL today's cache keys and rebuild from scratch
app.post('/api/cache/flush', async (req, res) => {
  if (!redis) return res.status(503).json({ error: 'Redis not connected' });
  const today = getTodayPacific();
  let deleted = 0;
  for (const v of [CACHE_VERSION,'v11','v10','v9','v8','v7','v6','v5','v4','v3']) {
    const d1 = await redis.del(`pable:events:${v}:${today}`).catch(()=>0);
    deleted += d1;
    for (let i = 0; i < 25; i++) {
      const d2 = await redis.del(`pable:goodies:${v}:${today}:${i}`).catch(()=>0);
      deleted += d2;
    }
  }
  console.log(`Flushed ${deleted} Redis keys for ${today}`);
  res.json({ flushed: deleted, today, message: 'Cache cleared. Now POST /api/cache/clear to rebuild.' });
});

// YouTube test
app.get('/api/youtube/test', async (req, res) => {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return res.json({ error:'No YouTube key' });
  const q = req.query.q || 'Friedrich Barbarossa';
  try {
    const data = await apiFetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&videoEmbeddable=true&maxResults=5&key=${key}`);
    res.json({ query:q, total:data.pageInfo?.totalResults, count:data.items?.length,
      items:(data.items||[]).map(i=>({ id:i.id?.videoId, title:i.snippet?.title, channel:i.snippet?.channelTitle })),
      error:data.error||null });
  } catch (e) { res.json({ error:e.message }); }
});

// Health check
app.get('/api/health', async (req, res) => {
  const redisOk = redis ? await redis.ping().then(()=>true).catch(()=>false) : false;
  res.json({ status:'ok', redis:redisOk, cacheVersion:CACHE_VERSION, timezone:'Pacific',
    keys:{ dpla:!!process.env.DPLA_API_KEY, nasa:!!process.env.NASA_API_KEY,
      smithsonian:!!process.env.SMITHSONIAN_API_KEY, europeana:!!process.env.EUROPEANA_API_KEY,
      fred:!!process.env.FRED_API_KEY, mw_dict:!!process.env.MERRIAM_WEBSTER_DICTIONARY_API_KEY,
      mw_thes:!!process.env.MERRIAM_WEBSTER_THESAURUS_API_KEY,
      google_books:!!process.env.GOOGLE_BOOKS_API_KEY, youtube:!!process.env.YOUTUBE_API_KEY,
      numista:!!process.env.NUMISTA_API_KEY, guardian:!!process.env.GUARDIAN_API_KEY,
      newsdata:!!process.env.NEWSDATA_API_KEY }});
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT, () => console.log(`Pable v4 on port ${PORT}`));
