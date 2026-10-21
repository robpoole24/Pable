/* ═══════════════════════════════════════════════════════════════════════
   PABLE — sources.js
   Everything Pable gathers for an event, built once at midnight Pacific.

   Who & what      Wikidata (which linked pages are real people, their
                   lifespans; where the event happened) + Wikipedia
                   redirects (other names the event goes by)
   Video           YouTube: (1) the full catalogues of trusted history
                   channels — Tasting History, Kings and Generals, … — read
                   cheaply once a week and matched against the event's
                   names, people and period; (2) at most two searches per
                   event. Quota-aware: stops when the day's budget or
                   Google's quota runs out and fills the gaps later.
   Coins           Smithsonian National Numismatic Collection, The Met,
                   Numista (rulers only, dated to the period)
   Art & artifacts The Met, Europeana, Smithsonian — public domain / open

   Results are kept per Wikipedia article for most of a year, because the
   same events come round on the same date next year.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
const fetch = require('node-fetch');

const UA = 'PableHistoryApp/5.0 (educational; robpoole24@gmail.com)';
let redis = null;
function init(r) { redis = r; }

// ── Small helpers ────────────────────────────────────────────────────────
const enc = encodeURIComponent;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/&amp;|&#39;|&quot;/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const has = (hay, needle) => needle && (' ' + hay + ' ').includes(' ' + needle + ' ');
const uniq = (a) => [...new Set(a.filter(Boolean))];

// Recent problems, for /api/sources/status — nothing fails silently any more
const problems = [];
function note(source, msg) {
  const line = `${new Date().toISOString().slice(0, 19)} ${source}: ${String(msg).slice(0, 200)}`;
  problems.unshift(line); if (problems.length > 60) problems.pop();
  console.warn('[sources]', line);
}

async function getJSON(url, opts = {}) {
  const r = await fetch(url, { timeout: 15000, ...opts,
    headers: { 'User-Agent': UA, Accept: 'application/json', ...(opts.headers || {}) } });
  const text = await r.text();
  let body = null; try { body = JSON.parse(text); } catch (_) {}
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}${body?.error?.message ? ' — ' + body.error.message : ''}`);
    e.status = r.status; e.body = body; throw e;
  }
  if (body === null) throw new Error('reply was not JSON');
  return body;
}

// Run fn over items with at most n at a time
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (_) { out[k] = null; } }
  }));
  return out;
}

async function rget(k) { if (!redis) return null; try { const v = await redis.get(k); return v ? JSON.parse(v) : null; } catch (_) { return null; } }
async function rset(k, v, ttl) { if (!redis) return; try { await redis.setEx(k, Math.max(60, Math.round(ttl)), JSON.stringify(v)); } catch (_) {} }

function secsToPacificMidnight() {
  const now = new Date();
  const p = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const m = new Date(p); m.setHours(24, 5, 0, 0);
  return Math.max(60, Math.round((m - p) / 1000));
}
const pacificDate = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

// Topic cache: keyed by Wikipedia article, kept ~11 months; empty answers kept 2 days
const TOPIC_DAYS = 330;
async function topic(section, key, fn, { days = TOPIC_DAYS, fresh = false } = {}) {
  const k = `pable:topic:v1:${section}:${norm(key).slice(0, 120)}`;
  if (!fresh) { const hit = await rget(k); if (hit) return hit.v; }
  const v = await fn();
  const empty = v == null || (Array.isArray(v) && !v.length);
  await rset(k, { v, at: Date.now() }, (empty ? 2 : days) * 86400);
  return v;
}

// ═══════════════════════════════════════════════════════════════════════
// WHO & WHAT — people, other names, places, period words
// ═══════════════════════════════════════════════════════════════════════
const RULER = /\b(king|queen|emperor|empress|sultan|caliph|tsar|czar|pharaoh|pope|shah|khan|doge|duke|duchess|prince|princess|elector|margrave|count|earl|regent|monarch|ruler|consul|dictator|president)\b/i;

function yearOf(t) {
  if (!t) return null;
  const m = String(t).match(/^(-?)0*(\d{1,4})-/);
  return m ? (m[1] ? -1 : 1) * parseInt(m[2], 10) : null;
}

async function sparql(q) {
  const d = await getJSON(`https://query.wikidata.org/sparql?format=json&query=${enc(q)}`,
    { headers: { Accept: 'application/sparql-results+json' } });
  return d.results?.bindings || [];
}

// Which of the event's linked Wikipedia pages are people, with lifespans
async function peopleFromPages(pages, eventYear) {
  const byQ = {};
  for (const p of pages || []) if (p?.wikibase_item) byQ[p.wikibase_item] = p;
  const qids = Object.keys(byQ);
  if (!qids.length) return [];
  let rows;
  try {
    rows = await sparql(`SELECT ?item ?birth ?death WHERE {
      VALUES ?item { ${qids.map(q => 'wd:' + q).join(' ')} }
      ?item wdt:P31 wd:Q5 .
      OPTIONAL { ?item wdt:P569 ?birth } OPTIONAL { ?item wdt:P570 ?death } }`);
  } catch (e) { note('wikidata people', e.message); return []; }
  const seen = new Map();
  for (const r of rows) {
    const q = r.item.value.split('/').pop();
    if (!seen.has(q)) seen.set(q, { born: yearOf(r.birth?.value), died: yearOf(r.death?.value) });
  }
  const out = [];
  for (const [q, life] of seen) {
    const p = byQ[q];
    // Must have been alive around the event (when we know)
    if (eventYear && life.born != null && life.born > eventYear + 5) continue;
    if (eventYear && life.died != null && life.died < eventYear - 5) continue;
    const name = p.normalizedtitle || p.titles?.normalized || String(p.title || '').replace(/_/g, ' ');
    out.push({ name, role: p.description || '', extract: (p.extract || '').slice(0, 400),
      thumbnail: p.thumbnail?.source || null, url: p.content_urls?.desktop?.page || null,
      born: life.born, died: life.died, ruler: RULER.test(p.description || ''), confirmed: true });
  }
  return out.slice(0, 6);
}

// Where it happened (country / location labels from Wikidata)
async function placesFor(qid) {
  if (!qid) return [];
  try {
    const rows = await sparql(`SELECT DISTINCT ?l WHERE {
      wd:${qid} (wdt:P17|wdt:P276|wdt:P131|wdt:P495) ?p . ?p rdfs:label ?l FILTER(lang(?l) = "en") } LIMIT 8`);
    return uniq(rows.map(r => r.l.value)).slice(0, 5);
  } catch (e) { note('wikidata places', e.message); return []; }
}

// Other names the event is known by (Wikipedia redirects)
async function altNamesFor(title) {
  if (!title) return [];
  try {
    const d = await getJSON(`https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&titles=${enc(title)}&prop=redirects&rdnamespace=0&rdlimit=100`);
    const page = d.query?.pages?.[0];
    const main = norm(page?.title || title);
    const mainSet = new Set(main.split(' '));
    const cands = (page?.redirects || []).map(r => r.title).filter(t => {
      const n = norm(t);
      if (!n || n === main || /[()]/.test(t) || t.length < 6 || t.length > 70) return false;
      if (/^[A-Z0-9 .-]{2,8}$/.test(t)) return false;                     // bare abbreviations
      const words = n.split(' ');
      if (words.length < 2 && t.length < 9) return false;
      if (words.every(w => mainSet.has(w)) && words.length >= mainSet.size - 1) return false;   // reordered / spelling variant
      return true;
    });
    // Prefer names that bring new words
    cands.sort((a, b) => newWords(b, mainSet) - newWords(a, mainSet) || a.length - b.length);
    const picked = [];
    for (const c of cands) if (!picked.some(p => norm(p) === norm(c))) picked.push(c);
    return picked.slice(0, 4);
  } catch (e) { note('wikipedia redirects', e.message); return []; }
}
const newWords = (t, set) => norm(t).split(' ').filter(w => w.length > 3 && !set.has(w)).length;

const STRONG_CULTURES = ['ancient rome', 'roman', 'ancient greek', 'byzantine', 'norman', 'viking', 'anglo saxon', 'saxon',
  'ottoman', 'mongol', 'aztec', 'inca', 'maya', 'mayan', 'ancient egypt', 'egyptian', 'persian', 'tudor', 'elizabethan',
  'victorian', 'georgian', 'regency', 'medieval', 'colonial', 'revolutionary war', 'american revolution', 'civil war',
  'napoleonic', 'ming', 'tang dynasty', 'edo', 'samurai', 'crusade', 'crusader', 'black death', 'prohibition',
  'great depression', 'world war i', 'world war ii', 'ww1', 'ww2', 'wwi', 'wwii', 'soviet', 'cold war', 'hanseatic',
  'venetian', 'renaissance', 'baroque', 'sumerian', 'babylonian', 'assyrian', 'celtic', 'carthaginian', 'spartan',
  'pilgrim', 'puritan', 'frontier', 'confederate', 'gold rush', 'wild west', 'stuart', 'plantagenet', 'mughal',
  'qing', 'han dynasty', 'shogun', 'pirate', 'colonial america', 'continental army', 'jacobite', 'hapsburg', 'habsburg'];
const WEAK_CULTURES = ['french', 'english', 'british', 'spanish', 'italian', 'german', 'prussian', 'russian', 'dutch',
  'scottish', 'irish', 'american', 'chinese', 'japanese', 'polish', 'swedish', 'danish', 'portuguese', 'austrian', 'hungarian'];

function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

function periodContext(year, text) {
  const t = ' ' + norm(text).slice(0, 6000) + ' ';
  const strong = STRONG_CULTURES.filter(c => t.includes(' ' + c + ' '));
  const weak = WEAK_CULTURES.filter(c => t.includes(' ' + c + ' '));
  if (year >= 500 && year < 1500 && !strong.includes('medieval')) strong.push('medieval');
  const century = year > 0 ? `${ordinal(Math.floor((year - 1) / 100) + 1)} century` : null;
  return { year, strong: uniq(strong).slice(0, 6), weak: uniq(weak).slice(0, 4), century };
}

// Everything above for one event (cached per article)
async function enrich(ev, fullText) {
  const pageTitle = ev.pages?.[0]?.title ? String(ev.pages[0].title).replace(/_/g, ' ') : '';
  const year = parseInt(ev.year, 10) || 0;
  const key = pageTitle || (ev.text || '').slice(0, 80);
  return topic('enrich', `${key}|${year}`, async () => {
    const [people, altNames, places] = await Promise.all([
      peopleFromPages(ev.pages || [], year),
      altNamesFor(pageTitle),
      placesFor(ev.pages?.[0]?.wikibase_item),
    ]);
    return { people, altNames, places, period: periodContext(year, (ev.text || '') + ' ' + (fullText || '')) };
  }, { days: 60 });
}

// ═══════════════════════════════════════════════════════════════════════
// YOUTUBE
// ═══════════════════════════════════════════════════════════════════════
class QuotaError extends Error {}
const YT = 'https://www.googleapis.com/youtube/v3';
const ytKey = () => (process.env.YOUTUBE_API_KEY || '').trim();
const ytBudget = () => parseInt(process.env.YT_DAILY_BUDGET || '8000', 10);

async function ytUnitsToday() { return (await rget(`pable:yt:units:${pacificDate()}`)) || 0; }
async function ytBlocked() { return !!(await rget('pable:yt:blocked')); }

// Every YouTube call goes through here: counts units, stops at the budget, spots Google's quota errors
async function yt(path, params, units) {
  const key = ytKey();
  if (!key) throw new QuotaError('no YOUTUBE_API_KEY');
  if (await ytBlocked()) throw new QuotaError('quota used up until midnight Pacific');
  const used = await ytUnitsToday();
  if (used + units > ytBudget()) throw new QuotaError(`daily budget reached (${used}/${ytBudget()} units)`);
  if (redis) { try { const k = `pable:yt:units:${pacificDate()}`; await redis.set(k, JSON.stringify(used + units), { EX: 2 * 86400 }); } catch (_) {} }
  const qs = Object.entries({ ...params, key }).map(([k, v]) => `${k}=${enc(v)}`).join('&');
  try {
    return await getJSON(`${YT}/${path}?${qs}`);
  } catch (e) {
    const reason = e.body?.error?.errors?.[0]?.reason || '';
    if (/quotaExceeded|dailyLimitExceeded|rateLimitExceeded/.test(reason)) {
      await rset('pable:yt:blocked', { reason, at: Date.now() }, secsToPacificMidnight());
      note('youtube', `Google says ${reason} — pausing until midnight Pacific`);
      throw new QuotaError(reason);
    }
    note('youtube', `${path}: ${e.message}${reason ? ' (' + reason + ')' : ''}`);
    throw e;
  }
}

// Trusted channels. "food"/"life" channels are matched on the period, the rest on names.
// Override in Railway with PABLE_YT_CHANNELS="@Handle:food,@Other,..."
const DEFAULT_CHANNELS = [
  '@TastingHistory:food', '@Townsends:food',
  '@KingsandGenerals', '@HistoriaCivilis', '@EpicHistoryTV', '@OverSimplified', '@ExtraHistory',
  '@HistoryMatters', '@TheArmchairHistorian', '@SimpleHistory', '@InvictaHistory', '@BazBattles',
  '@TheGreatWar', '@WorldWarTwo', '@fallofcivilizationspodcast', '@ToldinStone', '@Sandrhoman',
  '@TimelineWorldHistoryDocumentaries', '@TheHistoryGuyChannel', '@VoicesofthePast',
];
function channelList() {
  const raw = (process.env.PABLE_YT_CHANNELS || '').trim();
  return (raw ? raw.split(',') : DEFAULT_CHANNELS).map(s => s.trim()).filter(Boolean).map(s => {
    const [handle, kind] = s.split(':');
    return { handle: handle.startsWith('@') ? handle : '@' + handle, kind: kind || 'history' };
  });
}

const CATALOG_DAYS = 7;
let _catalogs = null;          // in memory: [{ handle, kind, title, videos:[{id,t,th,d}] }]
let _catalogRun = null;

async function loadCatalogs() {
  if (_catalogs) return _catalogs;
  const out = [];
  for (const c of channelList()) { const cat = await rget(`pable:yt:cat:${c.handle.toLowerCase()}`); if (cat) out.push({ ...cat, kind: c.kind }); }
  _catalogs = out;
  return out;
}

// Read each channel's uploads list (1 unit per 50 videos). Weekly.
function refreshCatalogs(force = false) {
  if (_catalogRun) return _catalogRun;
  _catalogRun = (async () => {
    const report = [];
    for (const c of channelList()) {
      const k = `pable:yt:cat:${c.handle.toLowerCase()}`;
      const cur = await rget(k);
      if (!force && cur && Date.now() - cur.at < CATALOG_DAYS * 86400000) { report.push(`${c.handle}: ${cur.videos.length} (fresh)`); continue; }
      try {
        let ch = await rget(`pable:yt:chan:${c.handle.toLowerCase()}`);
        if (!ch) {
          const d = await yt('channels', { part: 'snippet,contentDetails', forHandle: c.handle }, 1);
          const it = d.items?.[0];
          if (!it) { note('youtube channels', `${c.handle} not found — check the handle`); report.push(`${c.handle}: not found`); continue; }
          ch = { id: it.id, title: it.snippet?.title, uploads: it.contentDetails?.relatedPlaylists?.uploads };
          await rset(`pable:yt:chan:${c.handle.toLowerCase()}`, ch, 120 * 86400);
        }
        const videos = []; let page = '';
        for (let n = 0; n < 80; n++) {
          const d = await yt('playlistItems', { part: 'snippet', playlistId: ch.uploads, maxResults: 50, ...(page ? { pageToken: page } : {}) }, 1);
          for (const it of d.items || []) {
            const s = it.snippet || {};
            const id = s.resourceId?.videoId;
            if (!id || /^(private|deleted) video$/i.test(s.title || '')) continue;
            videos.push({ id, t: s.title, th: s.thumbnails?.medium?.url || s.thumbnails?.default?.url || '', d: (s.description || '').slice(0, 300) });
          }
          page = d.nextPageToken; if (!page) break;
        }
        await rset(k, { handle: c.handle, title: ch.title, at: Date.now(), videos }, 30 * 86400);
        report.push(`${c.handle}: ${videos.length}`);
      } catch (e) {
        report.push(`${c.handle}: ${e.message}`);
        if (e instanceof QuotaError) break;
      }
    }
    _catalogs = null;
    console.log('[sources] YouTube channel catalogues:', report.join(' · '));
    return report;
  })().finally(() => { _catalogRun = null; });
  return _catalogRun;
}

// How well a video title names this event (0 = not at all)
function nameScore(text, ctx) {
  const t = norm(text);
  let s = 0;
  for (const n of ctx.eventNames) { const k = norm(n); if (k.split(' ').length >= 2 || k.length >= 7) { if (has(t, k)) { s = Math.max(s, 10); } } }
  for (const p of ctx.peopleNames) {
    const k = norm(p);
    const words = k.split(' ');
    if (has(t, k)) s = Math.max(s, 7);
    // "Roger II of Sicily" → also "Roger II"; "William the Conqueror" stays whole
    else if (words.length >= 3 && /^(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)$/.test(words[1]) && has(t, words.slice(0, 2).join(' '))) s = Math.max(s, 6);
  }
  return s;
}
// How well a title fits the period (for food / daily-life channels)
function periodScore(text, ctx) {
  const t = norm(text);
  const p = ctx.period || {};
  let s = 0;
  for (const m of t.matchAll(/\b(\d{3,4})(s)?\b/g)) {
    const y = parseInt(m[1], 10);
    if (y < 400 || y > 2030) continue;
    if (m[2]) { const span = y % 100 === 0 ? 100 : 10; if (ctx.year >= y - 5 && ctx.year < y + span + 5) s = Math.max(s, 4); }
    else if (Math.abs(y - ctx.year) <= 25) s = Math.max(s, 4);
  }
  if (p.century && has(t, norm(p.century))) s = Math.max(s, 4);
  let culture = 0;
  for (const c of p.strong || []) if (has(t, c) || has(t, c + 's')) culture += c === 'medieval' ? 3 : 4;
  s = Math.max(s, Math.min(culture, 8));
  if (s >= 3) for (const c of p.weak || []) if (has(t, c) || has(t, c + 's')) s += 1;
  return s;
}

const fromCatalog = (v, ch, why) => ({ id: v.id, title: v.t, channel: ch.title || ch.handle, thumb: v.th, why });

async function catalogMatches(ctx) {
  const cats = await loadCatalogs();
  const direct = [], period = [];
  for (const ch of cats) {
    for (const v of ch.videos || []) {
      const ns = nameScore(v.t, ctx);
      if (ns >= 6) { direct.push({ s: ns + 1, v: fromCatalog(v, ch, 'name') }); continue; }
      if (ch.kind === 'food' || ch.kind === 'life') {
        const ps = periodScore(v.t + ' ' + (v.d || '').slice(0, 120), ctx);
        if (ps >= 4) period.push({ s: ps, v: fromCatalog(v, ch, 'period') });
      }
    }
  }
  const top = (a, n) => a.sort((x, y) => y.s - x.s).map(x => x.v).filter((v, i, arr) => arr.findIndex(z => z.id === v.id) === i).slice(0, n);
  return { direct: top(direct, 8), period: top(period, 6) };
}

async function ytSearch(q, ctx) {
  const k = `pable:yt:q:${norm(q).slice(0, 150)}`;
  const hit = await rget(k);
  if (hit) return hit;
  const d = await yt('search', { part: 'snippet', q, type: 'video', videoEmbeddable: 'true', maxResults: 15,
    relevanceLanguage: 'en', safeSearch: 'strict' }, 100);
  const items = (d.items || []).map(it => ({ id: it.id?.videoId, title: decode(it.snippet?.title), channel: it.snippet?.channelTitle,
    thumb: it.snippet?.thumbnails?.medium?.url || '', desc: decode(it.snippet?.description || '').slice(0, 200) })).filter(v => v.id);
  await rset(k, items, (items.length ? TOPIC_DAYS : 7) * 86400);
  return items;
}
const decode = (s) => String(s || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// Videos for one event → { videos, periodVideos, pending }
async function youtubeFor(ctx, { fresh = false } = {}) {
  const run = async () => {
    const { direct, period } = await catalogMatches(ctx);
    const videos = [...direct];
    let pending = false;
    const add = (items) => {
      for (const v of items) {
        if (videos.length >= 12) break;
        if (videos.some(x => x.id === v.id)) continue;
        if (nameScore(v.title + ' ' + (v.desc || ''), ctx) < 6) continue;      // must actually be about the event
        videos.push({ id: v.id, title: v.title, channel: v.channel, thumb: v.thumb, why: 'search' });
      }
    };
    const q1 = ctx.eventNames.slice(0, 3).map(n => `"${n}"`).join('|');
    try {
      if (q1) add(await ytSearch(q1, ctx));
      const person = ctx.peopleNames.find(p => !ctx.eventNames.some(n => norm(n).includes(norm(p))));
      if (videos.length < 6 && person) add(await ytSearch(`"${person}"`, ctx));
    } catch (e) {
      if (e instanceof QuotaError) pending = true; else note('youtube search', e.message);
    }
    return { videos, periodVideos: period.filter(v => !videos.some(x => x.id === v.id)).slice(0, 6), pending };
  };
  if (fresh) return run();
  // Only keep complete answers long-term; a run cut short by quota is retried later
  const k = `pable:topic:v1:yt:${norm(ctx.key).slice(0, 120)}`;
  const hit = await rget(k);
  if (hit && !hit.v.pending) return hit.v;
  const v = await run();
  if (!v.pending) await rset(k, { v, at: Date.now() }, (v.videos.length ? 45 : 3) * 86400);
  return v;
}

// ═══════════════════════════════════════════════════════════════════════
// COINS & ART
// ═══════════════════════════════════════════════════════════════════════
const MET = 'https://collectionapi.metmuseum.org/public/collection/v1';
const COIN_WORDS = /\b(coins?|denarius|denarii|penny|pennies|pfennig|solidus|dirham|dinar|florin|ducat|groat|stater|drachm|tetradrachm|obol|aureus|sestertius|follis|thaler|taler|doubloon|escudo|guinea|sovereign|shilling|mohur|rupee|real|reales|livre|sou|ecu|écu|noble|angel|bracteate|hyperpyron|miliaresion|cash coin|mon|tremissis|siliqua|antoninianus)\b/i;

async function metSearch(params) {
  const qs = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}=${enc(v)}`).join('&');
  const d = await getJSON(`${MET}/search?${qs}`);
  return d.objectIDs || [];
}
async function metObjects(ids) {
  return (await pool(ids, 6, id => getJSON(`${MET}/objects/${id}`))).filter(Boolean);
}
const metItem = (o, kind) => ({ url: o.primaryImageSmall, big: o.primaryImage, caption: [o.title, o.objectDate, o.culture || o.country].filter(Boolean).join(' · ').slice(0, 110),
  source: 'The Met', link: o.objectURL, kind });

function siItems(rows, kind) {
  const out = [];
  for (const r of rows || []) {
    const m = r.content?.descriptiveNonRepeating?.online_media?.media?.find(x => x.type === 'Images' || /image/i.test(x.type || '')) ;
    const img = m?.thumbnail || m?.content;
    if (!img) continue;
    const ix = r.content?.indexedStructured || {};
    out.push({ url: img.includes('ids.si.edu') && !img.includes('max=') ? img + '&max=480' : img,
      caption: [r.title, ix.date?.[0], ix.place?.[0]].filter(Boolean).join(' · ').slice(0, 110),
      source: 'Smithsonian', link: r.content?.descriptiveNonRepeating?.record_link || null, kind });
  }
  return out;
}
async function siSearch(q, rows = 12) {
  const key = (process.env.SMITHSONIAN_API_KEY || '').trim();
  if (!key) return [];
  const d = await getJSON(`https://api.si.edu/openaccess/api/v1.0/search?q=${enc(q)}&rows=${rows}&api_key=${key}`);
  return d.response?.rows || [];
}
const decades = (y, span) => { const out = []; for (let d = Math.floor((y - span) / 10) * 10; d <= y + span; d += 10) if (d > 0) out.push(`"${d}s"`); return out; };

async function coinsFor(ctx) {
  const y = ctx.year;
  return topic('coins', `${ctx.key}|${y}`, async () => {
    const coins = [];
    const push = (arr) => { for (const c of arr) if (c.url && !coins.some(x => x.url === c.url) && coins.length < 10) coins.push(c); };

    // 1. Smithsonian National Numismatic Collection — dated to the period
    if (y > 0) {
      const dates = decades(y, 20).join(' OR ');
      const placeQ = ctx.places.slice(0, 2).map(p => `place:"${p.replace(/"/g, '')}"`).join(' OR ');
      const base = `(coin OR coins) AND unit_code:NMAH AND online_media_type:Images AND date:(${dates})`;
      try {
        if (placeQ) push(siItems(await siSearch(`${base} AND (${placeQ})`), 'coin'));
        if (coins.length < 4) push(siItems(await siSearch(base), 'coin'));
      } catch (e) { note('smithsonian coins', e.message); }
    }

    // 2. The Met — coins made within ~30 years, from the right place when known
    if (coins.length < 8) {
      try {
        const tries = [...ctx.places.slice(0, 2).map(p => ({ geoLocation: p })), {}];
        for (const extra of tries) {
          if (coins.length >= 8) break;
          const ids = await metSearch({ q: 'coin', hasImages: 'true', dateBegin: y - 30, dateEnd: y + 30, ...extra });
          const objs = await metObjects(ids.slice(0, 18));
          push(objs.filter(o => o.isPublicDomain && o.primaryImageSmall && COIN_WORDS.test(`${o.objectName} ${o.classification} ${o.title}`)
            && (o.objectBeginDate == null || o.objectBeginDate <= y + 30) && (o.objectEndDate == null || o.objectEndDate >= y - 80)).map(o => metItem(o, 'coin')));
        }
      } catch (e) { note('met coins', e.message); }
    }

    // 3. Numista — only for rulers, and only coins dated to their time
    const nkey = (process.env.NUMISTA_API_KEY || '').trim();
    if (nkey && coins.length < 8) {
      for (const p of ctx.rulers.slice(0, 2)) {
        try {
          const d = await getJSON(`https://api.numista.com/v3/types?q=${enc(p.name)}&lang=en&count=10&category=coin`, { headers: { 'Numista-API-Key': nkey } });
          push((d.types || []).filter(t => t.obverse_thumbnail && t.min_year != null && t.min_year <= y + 40 && (t.max_year ?? t.min_year) >= y - 40)
            .map(t => ({ url: t.obverse_thumbnail, caption: [t.title, t.issuer?.name, t.min_year].filter(Boolean).join(' · '),
              source: 'Numista', link: `https://en.numista.com/catalogue/pieces${t.id}.html`, kind: 'coin' })));
        } catch (e) { note('numista', e.message); }
      }
    }
    return coins;
  });
}

async function artFor(ctx) {
  const y = ctx.year;
  return topic('art', `${ctx.key}|${y}`, async () => {
    const art = [];
    const push = (arr, max = 14) => { for (const a of arr) if (a.url && !art.some(x => x.url === a.url) && art.length < max) art.push(a); };
    const span = y < 1000 ? 75 : y < 1800 ? 40 : 15;

    // The Met — the people, the place, the event, from the period
    try {
      const qs = uniq([...ctx.peopleNames.slice(0, 2), ctx.eventNames[0], ...ctx.places.slice(0, 1)]);
      for (const q of qs) {
        if (art.length >= 8) break;
        const ids = await metSearch({ q, hasImages: 'true', dateBegin: y - span, dateEnd: y + span });
        const objs = await metObjects(ids.slice(0, 8));
        push(objs.filter(o => o.isPublicDomain && o.primaryImageSmall && !COIN_WORDS.test(`${o.objectName} ${o.classification}`)).map(o => metItem(o, 'art')), 8);
      }
    } catch (e) { note('met art', e.message); }

    // Europeana — open-licensed images from European collections, dated to the period
    const ekey = (process.env.EUROPEANA_API_KEY || '').trim();
    if (ekey && y > 0) {
      try {
        const q = uniq([ctx.eventNames[0], ...ctx.peopleNames.slice(0, 2)]).map(s => `"${s}"`).join(' OR ');
        const d = await getJSON(`https://api.europeana.eu/record/v2/search.json?wskey=${ekey}&query=${enc(q)}&qf=TYPE:IMAGE&reusability=open&media=true&thumbnail=true&rows=10`);
        push((d.items || []).filter(it => it.edmPreview?.[0]).map(it => ({ url: it.edmPreview[0], caption: [it.title?.[0], it.year?.[0], it.dataProvider?.[0]].filter(Boolean).join(' · ').slice(0, 110),
          source: 'Europeana', link: it.guid || null, kind: 'art' })), 12);
      } catch (e) { note('europeana', e.message); }
    }

    // Smithsonian — portraits and objects of the people (great for American history)
    try {
      for (const p of ctx.peopleNames.slice(0, 2)) {
        if (art.length >= 14) break;
        push(siItems(await siSearch(`"${p.replace(/"/g, '')}" AND online_media_type:Images`, 6), 'art'));
      }
    } catch (e) { note('smithsonian art', e.message); }
    return art;
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Context for one event — what every source above works from
// ═══════════════════════════════════════════════════════════════════════
function contextFor(ev) {
  const pageTitle = ev.pages?.[0]?.title ? String(ev.pages[0].title).replace(/_/g, ' ') : '';
  const people = [...(ev.keyPeople || []), ...(ev.curated?.people || [])].map(p => ({ name: p.name, ruler: p.ruler ?? RULER.test(p.role || '') }));
  const peopleNames = uniq(people.map(p => p.name)).slice(0, 5);
  return {
    key: pageTitle || String(ev.text || '').slice(0, 80),
    year: parseInt(ev.year, 10) || 0,
    eventNames: uniq([pageTitle, ...(ev.altNames || [])]).slice(0, 4),
    peopleNames,
    rulers: people.filter(p => p.ruler),
    places: ev.places || [],
    period: ev.period || periodContext(parseInt(ev.year, 10) || 0, ev.text || ''),
  };
}

async function status() {
  const cats = await loadCatalogs();
  return { youtube: { unitsToday: await ytUnitsToday(), budget: ytBudget(), blocked: await rget('pable:yt:blocked'),
      channels: channelList().map(c => { const cat = cats.find(x => x.handle?.toLowerCase() === c.handle.toLowerCase());
        return { handle: c.handle, kind: c.kind, title: cat?.title || null, videos: cat?.videos?.length || 0, updated: cat ? new Date(cat.at).toISOString().slice(0, 10) : null }; }) },
    keys: { youtube: !!ytKey(), smithsonian: !!process.env.SMITHSONIAN_API_KEY, europeana: !!process.env.EUROPEANA_API_KEY, numista: !!process.env.NUMISTA_API_KEY },
    recentProblems: problems.slice(0, 30) };
}

module.exports = { init, enrich, contextFor, youtubeFor, coinsFor, artFor, refreshCatalogs, status, note, QuotaError,
  _lib: { getJSON, topic, sparql, ytSearch, norm, pool, uniq, rget, rset },
  _test: { norm, nameScore, periodScore, periodContext, altNamesFor } };
