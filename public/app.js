/* ═══════════════════════════════════════════════════════════════════════
   PABLE — A Living History
   Frontend app.js
   
   Keyed APIs → /api/* (proxied through Express, keys stay server-side)
   Keyless APIs → called directly from browser
   ═══════════════════════════════════════════════════════════════════════ */

// ─── State ────────────────────────────────────────────────────────────────
let selectedEvent = null;
let sealBroken = false;
let todayEvents = [];
let cpiCache = null; // Cache the FRED CPI data — expensive to fetch repeatedly

// ─── Init ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // App loads in background while splash is showing
  loadTodayEvents();
});

function enterApp() {
  const splash = document.getElementById('splash');
  const app = document.getElementById('app');
  splash.classList.add('hidden');
  setTimeout(() => {
    splash.style.display = 'none';
    app.style.display = 'block';
    renderApp();
  }, 500);
}

function renderApp() {
  const today = new Date();
  const monthName = today.toLocaleString('en-US', { month: 'long' });
  const day = today.getDate();

  document.getElementById('app').innerHTML = `
    <div class="pable-root">
      <div class="pable-header">
        <div class="pable-header-eyebrow">A Living History</div>
        <h1 class="pable-wordmark">Pable</h1>
        <div class="pable-header-sub font-18c">History as Mr. Pable taught it — deep, demanding, and alive</div>
      </div>
      <div class="pable-date-banner">This Day in History — ${monthName} ${day}</div>
      <div id="main-content"></div>
    </div>
  `;
  renderEventList();
}

// ─── EVENT LIST ───────────────────────────────────────────────────────────

function renderEventList() {
  const content = document.getElementById('main-content');
  if (todayEvents.length === 0) {
    content.innerHTML = `
      <div class="section-label">Loading history...</div>
      <div class="loading-ink">Consulting the archives…</div>
    `;
    return;
  }

  content.innerHTML = `
    <div class="section-label">Choose an Event · Open the Goodies</div>
    ${todayEvents.map((ev, i) => renderEventCard(ev, i)).join('')}
    <div class="source-footer">
      Events · Wikipedia On This Day<br>
      Images · Wikimedia · DPLA · Smithsonian · Europeana · NASA<br>
      Video & Audio · Internet Archive<br>
      Newspapers · Chronicling America (Library of Congress)<br>
      Etymology · Merriam-Webster · Free Dictionary<br>
      Books · Open Library · Google Books · Project Gutenberg<br>
      Music · Open Opus · MusicBrainz · RISM Online<br>
      Inflation · FRED (St. Louis Fed) CPI Series
    </div>
  `;

  document.querySelectorAll('.event-card').forEach((card, i) => {
    card.addEventListener('click', () => openEvent(todayEvents[i]));
  });
}

function renderEventCard(ev, i) {
  const year = ev.year || '?';
  const title = ev.text ? ev.text.replace(/\[\[.*?\]\]/g, '').substring(0, 100) : 'Historical Event';
  const teaser = ev.pages?.[0]?.extract || '';
  return `
    <div class="event-card" data-index="${i}">
      <div class="event-card-inner">
        <div class="event-card-year">${year}</div>
        <div class="event-card-title font-18c">${title}</div>
        <div style="clear:both"></div>
        <div class="event-card-teaser">${teaser.substring(0, 160)}${teaser.length > 160 ? '…' : ''}</div>
        <div class="event-card-open-hint">Open ↓</div>
      </div>
    </div>
  `;
}

// ─── LOAD TODAY'S EVENTS from Wikipedia On This Day ───────────────────────

async function loadTodayEvents() {
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${mm}/${dd}`,
      { headers: { 'User-Agent': 'PableHistoryApp/1.0 (educational; contact robpoole24@gmail.com)' } }
    );
    const data = await res.json();
    // Take up to 12 events, prefer ones with Wikipedia page thumbnails
    let events = (data.events || []);
    events.sort((a, b) => {
      const aHasThumb = a.pages?.some(p => p.thumbnail) ? 1 : 0;
      const bHasThumb = b.pages?.some(p => p.thumbnail) ? 1 : 0;
      return bHasThumb - aHasThumb;
    });
    todayEvents = events.slice(0, 12);
    renderEventList();
  } catch (e) {
    console.error('Wikipedia On This Day error:', e);
    document.getElementById('main-content').innerHTML = `
      <div class="section-label">Unable to load today's events</div>
      <div class="empty-state" style="padding:20px 24px">Could not reach Wikipedia. Please check your connection.</div>
    `;
  }
}

// ─── OPEN EVENT ───────────────────────────────────────────────────────────

function openEvent(ev) {
  selectedEvent = ev;
  sealBroken = false;

  const year = ev.year || '?';
  const title = ev.text || 'Historical Event';
  const summary = ev.pages?.[0]?.extract || ev.text || '';
  const wikiUrl = ev.pages?.[0]?.content_urls?.desktop?.page || '#';

  document.getElementById('main-content').innerHTML = `
    <div class="event-expanded">
      <div class="event-expanded-header">
        <div class="event-expanded-year">${year}</div>
        <div class="event-expanded-title font-18c">${title}</div>
      </div>
      <button class="back-btn" id="back-btn">← All Events</button>
      <div class="event-summary">
        ${summary.substring(0, 600)}${summary.length > 600 ? '…' : ''}
        ${wikiUrl !== '#' ? `<div style="margin-top:10px"><a href="${wikiUrl}" target="_blank" style="font-family:'Courier Prime',monospace;font-size:11px;color:var(--brown);letter-spacing:1px">Full Wikipedia article →</a></div>` : ''}
      </div>
      <div class="seal-wrapper">
        <svg id="wax-seal" width="80" height="80" viewBox="0 0 80 80"
          class="seal-svg" style="cursor:pointer">
          <circle cx="40" cy="40" r="36" fill="#8B1A1A"/>
          <circle cx="40" cy="40" r="32" fill="none" stroke="#C0392B" stroke-width="1.5"/>
          ${[0,30,60,90,120,150,180,210,240,270,300,330].map(deg => {
            const rad = deg * Math.PI / 180;
            const x1 = 40 + 36 * Math.cos(rad), y1 = 40 + 36 * Math.sin(rad);
            const x2 = 40 + 30 * Math.cos(rad + 0.26), y2 = 40 + 30 * Math.sin(rad + 0.26);
            return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#C0392B" stroke-width="1" opacity="0.4"/>`;
          }).join('')}
          <text x="40" y="48" text-anchor="middle"
            font-family="IM Fell English, serif" font-size="28"
            fill="#F8F2E6">P</text>
        </svg>
        <div class="seal-label" id="seal-label">Break the Seal</div>
      </div>
      <div id="goodies-container"></div>
    </div>
  `;

  document.getElementById('back-btn').addEventListener('click', () => {
    selectedEvent = null;
    sealBroken = false;
    renderEventList();
  });

  document.getElementById('wax-seal').addEventListener('click', () => {
    if (sealBroken) return;
    sealBroken = true;
    const seal = document.getElementById('wax-seal');
    seal.classList.add('broken');
    seal.style.cursor = 'default';
    // Add crack line
    const crack = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    crack.setAttribute('points', '40,8 44,22 38,35 46,52 40,72');
    crack.setAttribute('stroke', '#F8F2E6');
    crack.setAttribute('stroke-width', '1.5');
    crack.setAttribute('fill', 'none');
    crack.setAttribute('opacity', '0.7');
    seal.appendChild(crack);
    document.getElementById('seal-label').textContent = "Goodies Opened";
    loadGoodies(ev);
  });
}

// ─── LOAD ALL GOODIES ─────────────────────────────────────────────────────

async function loadGoodies(ev) {
  const container = document.getElementById('goodies-container');
  const year = ev.year || new Date().getFullYear();
  const title = ev.text || '';

  // Build search keywords from event text and Wikipedia page title
  const pageTitle = ev.pages?.[0]?.title || '';
  const keywords = [pageTitle, title].filter(Boolean);
  const primaryKeyword = pageTitle || title.split(' ').slice(0, 4).join(' ');

  container.innerHTML = `
    <div class="goodies-title font-18c">Pable's Goodies</div>
    <div class="goodies-container">
      <div id="g-images"></div>
      <div id="g-video"></div>
      <div id="g-audio"></div>
      <div id="g-newspapers"></div>
      <div id="g-etymology"></div>
      <div id="g-money"></div>
      <div id="g-music"></div>
      <div id="g-books"></div>
      <div id="g-map"></div>
    </div>
  `;

  // Fire all goodies in parallel — each renders independently as it resolves
  loadImagesGoodie(primaryKeyword, year);
  loadVideoGoodie(primaryKeyword);
  loadAudioGoodie(primaryKeyword);
  loadNewspapersGoodie(primaryKeyword, year);
  loadEtymologyGoodie(title);
  loadMoneyGoodie(year);
  loadMusicGoodie(year);
  loadBooksGoodie(primaryKeyword, title, ev.pages?.[0]);
  loadMapGoodie(primaryKeyword, ev.pages?.[0]);
}

// ─── GOODIE: IMAGES ───────────────────────────────────────────────────────
// Sources: Wikimedia, DPLA, Smithsonian, Europeana, NASA (for space events)

async function loadImagesGoodie(keyword, year) {
  const el = document.getElementById('g-images');
  el.innerHTML = goodieShell('🖼', 'Period Images', '<div class="loading-ink">Gathering images…</div>');

  try {
    const images = [];

    // 1. Wikimedia Commons (keyless, fast)
    const wikiImgs = await fetchWikimediaImages(keyword);
    images.push(...wikiImgs);

    // 2. DPLA (keyed, U.S. library/archive collections)
    if (images.length < 6) {
      const dplaImgs = await fetchDPLAImages(keyword);
      images.push(...dplaImgs);
    }

    // 3. Smithsonian (keyed) — if still need more
    if (images.length < 4) {
      const siImgs = await fetchSmithsonianImages(keyword);
      images.push(...siImgs);
    }

    // 4. NASA (keyed, space keywords)
    const isSpaceEvent = /nasa|apollo|space|astronaut|rocket|moon|mars|orbit|satellite|shuttle|gemini|mercury|iss|telescope/i.test(keyword);
    if (isSpaceEvent || images.length < 3) {
      const nasaImgs = await fetchNASAImages(keyword);
      images.push(...nasaImgs);
    }

    // 5. Europeana (keyed) — for ancient/European events
    if (images.length < 3) {
      const euroImgs = await fetchEuropeanaImages(keyword);
      images.push(...euroImgs);
    }

    const displayImgs = images.slice(0, 6);
    if (!displayImgs.length) {
      renderGoodieBody('g-images', '🖼', 'Period Images', '<div class="empty-state">No period images located for this event.</div>');
      return;
    }

    const html = `<div class="images-grid">
      ${displayImgs.map(img => `
        <div class="image-item">
          <img src="${img.url}" alt="${img.caption}" loading="lazy"
            onerror="this.closest('.image-item').style.display='none'"/>
          <div class="image-caption">${img.caption}</div>
        </div>
      `).join('')}
    </div>`;
    renderGoodieBody('g-images', '🖼', 'Period Images', html);
  } catch (e) {
    renderGoodieBody('g-images', '🖼', 'Period Images', '<div class="empty-state">Could not load images.</div>');
  }
}

async function fetchWikimediaImages(keyword) {
  try {
    const q = encodeURIComponent(keyword);
    const res = await fetch(`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${q}&gsrnamespace=6&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=400&format=json&origin=*&gsrlimit=6`);
    const data = await res.json();
    if (!data.query?.pages) return [];
    return Object.values(data.query.pages)
      .filter(p => p.imageinfo?.[0]?.url && !/\.(svg|gif)$/i.test(p.imageinfo[0].url))
      .slice(0, 4)
      .map(p => ({
        url: p.imageinfo[0].url,
        caption: (p.imageinfo[0].extmetadata?.ImageDescription?.value || p.title || '').replace(/<[^>]+>/g, '').substring(0, 80),
        source: 'Wikimedia Commons'
      }));
  } catch { return []; }
}

async function fetchDPLAImages(keyword) {
  try {
    const res = await fetch(`/api/dpla?q=${encodeURIComponent(keyword)}&page_size=4`);
    const data = await res.json();
    return (data.docs || [])
      .filter(d => d.object)
      .slice(0, 3)
      .map(d => ({
        url: d.object,
        caption: (d.sourceResource?.title?.[0] || 'DPLA Collection').substring(0, 80),
        source: 'DPLA'
      }));
  } catch { return []; }
}

async function fetchSmithsonianImages(keyword) {
  try {
    const res = await fetch(`/api/smithsonian?q=${encodeURIComponent(keyword)}&rows=4`);
    const data = await res.json();
    return (data.response?.rows || [])
      .filter(r => r.content?.descriptiveNonRepeating?.online_media?.media?.[0]?.thumbnail)
      .slice(0, 3)
      .map(r => ({
        url: r.content.descriptiveNonRepeating.online_media.media[0].thumbnail,
        caption: (r.title || 'Smithsonian Collection').substring(0, 80),
        source: 'Smithsonian'
      }));
  } catch { return []; }
}

async function fetchNASAImages(keyword) {
  try {
    const res = await fetch(`https://images-api.nasa.gov/search?q=${encodeURIComponent(keyword)}&media_type=image&page_size=3`);
    const data = await res.json();
    return (data.collection?.items || [])
      .filter(i => i.links?.[0]?.href)
      .slice(0, 3)
      .map(i => ({
        url: i.links[0].href,
        caption: (i.data?.[0]?.title || 'NASA').substring(0, 80),
        source: 'NASA'
      }));
  } catch { return []; }
}

async function fetchEuropeanaImages(keyword) {
  try {
    const res = await fetch(`/api/europeana?q=${encodeURIComponent(keyword)}&rows=4`);
    const data = await res.json();
    return (data.items || [])
      .filter(i => i.edmPreview?.[0])
      .slice(0, 3)
      .map(i => ({
        url: i.edmPreview[0],
        caption: (Array.isArray(i.title) ? i.title[0] : i.title || 'Europeana Collection').substring(0, 80),
        source: 'Europeana'
      }));
  } catch { return []; }
}

// ─── GOODIE: VIDEO ────────────────────────────────────────────────────────

async function loadVideoGoodie(keyword) {
  const el = document.getElementById('g-video');
  el.innerHTML = goodieShell('📽', 'Film & Documentary', '<div class="loading-ink">Searching the Archive…</div>');
  try {
    const res = await fetch(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(keyword)}+mediatype:movies&fl[]=identifier,title,description&sort[]=downloads+desc&rows=4&page=1&output=json`);
    const data = await res.json();
    const videos = data.response?.docs || [];
    if (!videos.length) {
      renderGoodieBody('g-video', '📽', 'Film & Documentary', '<div class="empty-state">No archival films found for this event.</div>');
      return;
    }
    const html = videos.slice(0, 3).map(v => `
      <a href="https://archive.org/details/${v.identifier}" target="_blank" class="video-item">
        <div class="video-thumb">▶</div>
        <div>
          <div class="video-title">${(v.title || 'Untitled').substring(0, 80)}</div>
          <div class="video-source">Internet Archive · archive.org</div>
        </div>
      </a>
    `).join('');
    renderGoodieBody('g-video', '📽', 'Film & Documentary', html);
  } catch {
    renderGoodieBody('g-video', '📽', 'Film & Documentary', '<div class="empty-state">Could not reach Internet Archive.</div>');
  }
}

// ─── GOODIE: AUDIO ────────────────────────────────────────────────────────
// Speeches, period music recordings, historical audio from Internet Archive

async function loadAudioGoodie(keyword) {
  const el = document.getElementById('g-audio');
  el.innerHTML = goodieShell('🔊', 'Voices & Recordings', '<div class="loading-ink">Tuning the archive…</div>');
  try {
    const res = await fetch(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(keyword)}+mediatype:audio&fl[]=identifier,title,description&sort[]=downloads+desc&rows=4&page=1&output=json`);
    const data = await res.json();
    const items = data.response?.docs || [];
    if (!items.length) {
      renderGoodieBody('g-audio', '🔊', 'Voices & Recordings', '<div class="empty-state">No audio recordings found for this event.</div>');
      return;
    }
    // Fetch the actual audio file URL for each item
    const audioItems = await Promise.all(
      items.slice(0, 3).map(async item => {
        try {
          const metaRes = await fetch(`https://archive.org/metadata/${item.identifier}`);
          const meta = await metaRes.json();
          const audioFile = (meta.files || []).find(f => /\.(mp3|ogg|flac)$/i.test(f.name));
          const audioUrl = audioFile ? `https://archive.org/download/${item.identifier}/${audioFile.name}` : null;
          return { title: item.title, identifier: item.identifier, audioUrl };
        } catch { return { title: item.title, identifier: item.identifier, audioUrl: null }; }
      })
    );
    const html = audioItems.map(a => `
      <div class="audio-item">
        <div class="audio-title">${(a.title || 'Untitled').substring(0, 80)}</div>
        ${a.audioUrl
          ? `<audio controls preload="none"><source src="${a.audioUrl}"></audio>`
          : `<a href="https://archive.org/details/${a.identifier}" target="_blank" style="font-family:'Courier Prime',monospace;font-size:11px;color:var(--brown)">Listen on archive.org →</a>`
        }
        <div class="audio-source">Internet Archive · archive.org</div>
      </div>
    `).join('');
    renderGoodieBody('g-audio', '🔊', 'Voices & Recordings', html);
  } catch {
    renderGoodieBody('g-audio', '🔊', 'Voices & Recordings', '<div class="empty-state">Could not load audio recordings.</div>');
  }
}

// ─── GOODIE: NEWSPAPERS ───────────────────────────────────────────────────

async function loadNewspapersGoodie(keyword, year) {
  const el = document.getElementById('g-newspapers');
  el.innerHTML = goodieShell('📰', 'Historic Newspapers', '<div class="loading-ink">Searching the press…</div>');
  try {
    // Chronicling America covers 1770–1963; only query if event is in that range
    if (year < 1770 || year > 1963) {
      renderGoodieBody('g-newspapers', '📰', 'Historic Newspapers',
        `<div class="empty-state">Chronicling America covers U.S. newspapers 1770–1963. ${year < 1770 ? 'This event predates the collection.' : 'Try searching <a href="https://www.newspapers.com" target="_blank" style="color:var(--brown)">Newspapers.com</a> for post-1963 coverage.'}</div>`
      );
      return;
    }
    const endDate = Math.min(year + 2, 1963);
    const url = `https://www.loc.gov/collections/chronicling-america/?andtext=${encodeURIComponent(keyword)}&start_date=${year - 1}-01-01&end_date=${endDate}-12-31&fo=json`;
    const res = await fetch(url);
    const data = await res.json();
    const results = data.results || [];
    if (!results.length) {
      renderGoodieBody('g-newspapers', '📰', 'Historic Newspapers', '<div class="empty-state">No contemporary newspaper pages found for this event in Chronicling America.</div>');
      return;
    }
    const html = results.slice(0, 4).map(r => `
      <div class="newspaper-item">
        <div class="newspaper-title"><a href="${r.url}" target="_blank">${(r.title || 'Untitled').substring(0, 80)}</a></div>
        <div class="newspaper-meta">${r.date || ''} · ${r.partof?.[0] || 'Chronicling America'}</div>
        ${r.description?.[0] ? `<div class="newspaper-snippet">${r.description[0].substring(0, 120)}…</div>` : ''}
      </div>
    `).join('');
    renderGoodieBody('g-newspapers', '📰', 'Historic Newspapers', html);
  } catch {
    renderGoodieBody('g-newspapers', '📰', 'Historic Newspapers', '<div class="empty-state">Could not reach Chronicling America.</div>');
  }
}

// ─── GOODIE: ETYMOLOGY ────────────────────────────────────────────────────
// Extract notable period words from the event title and look them up

async function loadEtymologyGoodie(eventText) {
  const el = document.getElementById('g-etymology');
  el.innerHTML = goodieShell('📜', 'Words of the Era', '<div class="loading-ink">Consulting the lexicon…</div>');

  // Extract the most historically interesting words (nouns, 5+ letters, not stop words)
  const stopWords = new Set(['which','about','their','there','after','where','these','those','would','could','should','other','every','through','during','while','before','between','against','around','under','above']);
  const words = eventText
    .replace(/[^a-zA-Z\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length >= 5 && !stopWords.has(w.toLowerCase()))
    .map(w => w.toLowerCase());
  const unique = [...new Set(words)].slice(0, 4);

  if (!unique.length) {
    renderGoodieBody('g-etymology', '📜', 'Words of the Era', '<div class="empty-state">No period vocabulary identified for this event.</div>');
    return;
  }

  const entries = await Promise.all(unique.map(fetchMWDefinition));
  const valid = entries.filter(Boolean);

  if (!valid.length) {
    renderGoodieBody('g-etymology', '📜', 'Words of the Era', '<div class="empty-state">Etymology data unavailable for these terms.</div>');
    return;
  }

  const html = valid.map(e => `
    <div class="word-item">
      <div>
        <span class="word-term">${e.word}</span>
        <span class="word-pos">${e.pos}</span>
      </div>
      ${e.etymology ? `<div class="word-etymology">⟐ ${e.etymology}</div>` : ''}
      ${e.definition ? `<div class="word-definition">${e.definition}</div>` : ''}
    </div>
  `).join('');
  renderGoodieBody('g-etymology', '📜', 'Words of the Era', html);
}

async function fetchMWDefinition(word) {
  try {
    const res = await fetch(`/api/dictionary/${encodeURIComponent(word)}`);
    const data = await res.json();
    if (!Array.isArray(data) || !data[0] || typeof data[0] === 'string') return null;
    const entry = data[0];
    const etymology = entry.et?.[0]?.[1]
      ? entry.et[0][1].replace(/\{[^}]+\}/g, '').replace(/\*/g, '').trim()
      : null;
    const definition = entry.shortdef?.[0] || entry.def?.[0]?.sseq?.[0]?.[0]?.[1]?.dt?.[0]?.[1] || null;
    return {
      word: entry.hwi?.hw?.replace(/\*/g, '') || word,
      pos: entry.fl || '',
      etymology,
      definition: typeof definition === 'string' ? definition.replace(/\{[^}]+\}/g, '').trim() : null
    };
  } catch { return null; }
}

// ─── GOODIE: INFLATION / MONEY ────────────────────────────────────────────

async function loadMoneyGoodie(year) {
  const el = document.getElementById('g-money');
  el.innerHTML = goodieShell('💰', 'What It Was Worth', '<div class="loading-ink">Calculating across centuries…</div>');

  if (year < 1913) {
    // Pre-FRED era — use hardcoded BLS/historical research anchors
    const historicalCPI = {
      1209: 0.08, 1400: 0.15, 1500: 0.20, 1600: 0.35, 1650: 0.50,
      1700: 0.65, 1750: 0.80, 1765: 0.95, 1770: 1.0, 1775: 1.1,
      1778: 1.3, 1780: 1.5, 1783: 1.2, 1790: 1.1, 1800: 1.3,
      1812: 1.6, 1830: 1.1, 1850: 1.2, 1860: 1.3, 1865: 1.9,
      1880: 1.1, 1900: 1.2
    };
    const modernCPI = 314;
    const years = Object.keys(historicalCPI).map(Number).sort((a, b) => a - b);
    const nearestYear = years.reduce((prev, curr) => Math.abs(curr - year) < Math.abs(prev - year) ? curr : prev);
    const baseCPI = historicalCPI[nearestYear];
    const multiplier = (modernCPI / baseCPI).toFixed(0);

    const html = `
      <div class="money-display">
        <div class="money-original">$1.00 in ${year}</div>
        <div class="money-arrow">↓</div>
        <div class="money-modern">≈ $${Number(multiplier).toLocaleString()} in 2024</div>
        <div class="money-note">× ${Number(multiplier).toLocaleString()} multiplier</div>
      </div>
      <div class="money-context">Based on historical price research anchors (pre-FRED era). The purchasing power of a single dollar — or its equivalent — across ${Math.round((2024 - year) / 100) * 100} years.</div>
    `;
    renderGoodieBody('g-money', '💰', 'What It Was Worth', html);
    return;
  }

  // Post-1913: use FRED CPIAUCSL
  try {
    if (!cpiCache) {
      const res = await fetch('/api/fred/cpi');
      const data = await res.json();
      cpiCache = data.observations || [];
    }

    // Find annual CPI for the event year and for today
    const eventObs = cpiCache.find(o => o.date.startsWith(String(year)));
    const modernObs = cpiCache[cpiCache.length - 1];

    if (!eventObs || !modernObs || eventObs.value === '.' || modernObs.value === '.') {
      throw new Error('CPI data unavailable for this year');
    }

    const ratio = (parseFloat(modernObs.value) / parseFloat(eventObs.value));
    const multiplier = ratio.toFixed(1);
    const modernYear = modernObs.date.substring(0, 4);

    const html = `
      <div class="money-display">
        <div class="money-original">$1.00 in ${year}</div>
        <div class="money-arrow">↓</div>
        <div class="money-modern">≈ $${Number(multiplier).toLocaleString()} in ${modernYear}</div>
        <div class="money-note">× ${multiplier} · FRED CPIAUCSL Series · St. Louis Fed</div>
      </div>
      <div class="money-context">Every dollar spent in ${year} had the purchasing power of $${Number(multiplier).toLocaleString()} today.</div>
    `;
    renderGoodieBody('g-money', '💰', 'What It Was Worth', html);
  } catch (e) {
    renderGoodieBody('g-money', '💰', 'What It Was Worth', '<div class="empty-state">Inflation data unavailable for this period.</div>');
  }
}

// ─── GOODIE: MUSIC ────────────────────────────────────────────────────────
// Routes by era: Medieval → Cantus concept, Renaissance → Josquin,
// Baroque/Classical/Romantic → Open Opus + MusicBrainz

async function loadMusicGoodie(year) {
  const el = document.getElementById('g-music');
  el.innerHTML = goodieShell('🎵', 'Music of the Period', '<div class="loading-ink">Tuning the fife and drum…</div>');

  let tracks = [];
  let sourceNote = '';

  try {
    if (year < 1400) {
      // Medieval — surface Cantus concept + known chant info
      tracks = [
        { title: 'Gregorian Chant (Liturgical Office)', composer: 'Medieval Church — various manuscripts', note: 'The chant tradition documented in the Cantus Database was the dominant musical form of this era.' },
        { title: 'Plainchant & Polyphony', composer: 'Various monastic composers', note: 'Manuscripts from this period are catalogued in RISM Online, the international inventory of musical sources.' }
      ];
      sourceNote = 'Medieval chant records: Cantus Database (cantusdatabase.org) · RISM Online (rism.online)';
    } else if (year >= 1400 && year <= 1600) {
      // Renaissance — Open Opus Renaissance composers
      const epoch = 'Renaissance';
      const res = await fetch(`https://api.openopus.org/composer/list/epoch/${epoch}.json`);
      const data = await res.json();
      const composers = (data.composers || []).slice(0, 3);
      tracks = composers.map(c => ({
        title: `Works of ${c.complete_name}`,
        composer: `${c.complete_name} · b.${c.birth?.substring(0,4) || '?'}`,
        note: `Renaissance composer active during this period. Scores available at IMSLP.`,
        portrait: c.portrait
      }));
      sourceNote = 'Open Opus (openopus.org) · Josquin Research Project (josquin.stanford.edu) · IMSLP';
    } else if (year > 1600 && year <= 1900) {
      // Baroque / Classical / Romantic
      const epoch = year <= 1750 ? 'Baroque' : year <= 1820 ? 'Classical' : 'Romantic';
      const res = await fetch(`https://api.openopus.org/composer/list/epoch/${epoch}.json`);
      const data = await res.json();
      // Filter to composers alive around the event year
      const alive = (data.composers || []).filter(c => {
        const born = parseInt(c.birth);
        const died = parseInt(c.death) || 9999;
        return born <= year && died >= year - 10;
      });
      const display = alive.length ? alive.slice(0, 4) : (data.composers || []).slice(0, 4);
      tracks = display.map(c => ({
        title: `${c.complete_name}`,
        composer: `${epoch} composer · ${c.birth?.substring(0,4) || '?'}–${c.death?.substring(0,4) || 'present'}`,
        note: 'Works and recordings available via MusicBrainz and IMSLP.',
        portrait: c.portrait
      }));
      sourceNote = `Open Opus ${epoch} catalog · MusicBrainz · IMSLP`;
    } else {
      // 20th century and beyond — MusicBrainz search
      const q = encodeURIComponent(`period historical year:${year}`);
      tracks = [
        { title: 'Search MusicBrainz for period recordings', composer: 'musicbrainz.org', note: `Search for music from ${year} in the MusicBrainz open encyclopedia.` }
      ];
      sourceNote = 'MusicBrainz (musicbrainz.org) · Internet Archive audio archive';
    }

    if (!tracks.length) {
      renderGoodieBody('g-music', '🎵', 'Music of the Period', '<div class="empty-state">No period music data found.</div>');
      return;
    }

    const html = `
      ${tracks.map(t => `
        <div class="music-item">
          ${t.portrait ? `<img src="${t.portrait}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0" onerror="this.style.display='none'" />` : `<div class="music-icon">♪</div>`}
          <div>
            <div class="music-title">${t.title}</div>
            <div class="music-composer">${t.composer}</div>
            ${t.note ? `<div class="music-note">${t.note}</div>` : ''}
          </div>
        </div>
      `).join('')}
      <div style="font-family:'Courier Prime',monospace;font-size:10px;color:var(--ink-light);margin-top:10px;letter-spacing:1px;opacity:0.7">${sourceNote}</div>
    `;
    renderGoodieBody('g-music', '🎵', 'Music of the Period', html);
  } catch {
    renderGoodieBody('g-music', '🎵', 'Music of the Period', '<div class="empty-state">Could not load period music data.</div>');
  }
}

// ─── GOODIE: BOOKS ────────────────────────────────────────────────────────

async function loadBooksGoodie(keyword, eventText, wikiPage) {
  const el = document.getElementById('g-books');
  el.innerHTML = goodieShell('📚', 'Reading List', '<div class="loading-ink">Consulting the library…</div>');

  try {
    // Query Open Library and Google Books in parallel
    const [olData, gbData] = await Promise.all([
      fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(keyword)}&limit=4&fields=key,title,author_name,first_publish_year,cover_i,subject`)
        .then(r => r.json()).catch(() => ({ docs: [] })),
      fetch(`/api/books?q=${encodeURIComponent(keyword + ' history')}&maxResults=4`)
        .then(r => r.json()).catch(() => ({ items: [] }))
    ]);

    const books = [];

    // Open Library results
    (olData.docs || []).slice(0, 3).forEach(b => {
      books.push({
        title: b.title,
        author: b.author_name?.[0] || 'Unknown',
        year: b.first_publish_year,
        coverUrl: b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg` : null,
        url: b.key ? `https://openlibrary.org${b.key}` : null,
        type: 'Non-Fiction',
        source: 'Open Library'
      });
    });

    // Google Books results — add ones not already in list
    (gbData.items || []).slice(0, 3).forEach(item => {
      const vol = item.volumeInfo;
      if (books.find(b => b.title?.toLowerCase() === vol.title?.toLowerCase())) return;
      books.push({
        title: vol.title,
        author: vol.authors?.[0] || 'Unknown',
        year: vol.publishedDate?.substring(0, 4),
        coverUrl: vol.imageLinks?.thumbnail || null,
        url: vol.infoLink || null,
        type: vol.categories?.[0] || 'Non-Fiction',
        source: 'Google Books'
      });
    });

    // Also check Project Gutenberg for primary sources
    const gutRes = await fetch(`https://gutendex.com/books/?search=${encodeURIComponent(keyword)}`).catch(() => null);
    if (gutRes) {
      const gutData = await gutRes.json().catch(() => ({}));
      (gutData.results || []).slice(0, 2).forEach(b => {
        books.push({
          title: b.title,
          author: b.authors?.[0]?.name || 'Unknown',
          year: b.authors?.[0]?.birth_year,
          coverUrl: b.formats?.['image/jpeg'] || null,
          url: `https://gutenberg.org/ebooks/${b.id}`,
          type: 'Primary Source (Free)',
          source: 'Project Gutenberg'
        });
      });
    }

    if (!books.length) {
      renderGoodieBody('g-books', '📚', 'Reading List', '<div class="empty-state">No books found for this event.</div>');
      return;
    }

    const colors = ['#8B4513', '#4A3728', '#2C1A0E', '#A07840'];
    const html = books.slice(0, 6).map((b, i) => `
      <div class="book-item">
        <div class="book-cover">
          ${b.coverUrl
            ? `<img src="${b.coverUrl}" alt="${b.title}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\'book-cover-placeholder\' style=\'background:${colors[i % colors.length]}\'></div>'">`
            : `<div class="book-cover-placeholder" style="background:${colors[i % colors.length]}"></div>`
          }
        </div>
        <div style="flex:1">
          <div class="book-title">
            ${b.url ? `<a href="${b.url}" target="_blank">${b.title}</a>` : b.title}
          </div>
          <div class="book-author">${b.author}${b.year ? ` · ${b.year}` : ''}</div>
          <span class="book-type">${b.type}</span>
          <div class="book-note" style="font-size:11px;opacity:0.7">${b.source}</div>
        </div>
      </div>
    `).join('');
    renderGoodieBody('g-books', '📚', 'Reading List', html);
  } catch {
    renderGoodieBody('g-books', '📚', 'Reading List', '<div class="empty-state">Could not load book recommendations.</div>');
  }
}

// ─── GOODIE: MAP ──────────────────────────────────────────────────────────

async function loadMapGoodie(keyword, wikiPage) {
  const el = document.getElementById('g-map');
  const coords = wikiPage?.coordinates;
  const lat = coords?.lat;
  const lon = coords?.lon;

  const mapQuery = encodeURIComponent(keyword);
  const googleUrl = lat && lon
    ? `https://www.google.com/maps/@${lat},${lon},10z`
    : `https://www.google.com/maps/search/${mapQuery}`;

  const html = `
    <div class="map-placeholder">
      <div style="font-size:28px;margin-bottom:8px">🗺</div>
      <div style="font-family:'Crimson Pro',serif;font-style:italic">${keyword}</div>
      ${lat && lon ? `<div style="font-family:'Courier Prime',monospace;font-size:10px;margin-top:4px;opacity:0.6">${lat.toFixed(4)}°, ${lon.toFixed(4)}°</div>` : ''}
      <div class="map-link" onclick="window.open('${googleUrl}','_blank')">Open in Google Maps →</div>
      <div class="map-link" style="margin-left:12px" onclick="window.open('https://www.davidrumsey.com/luna/servlet/view/search?q=${mapQuery}','_blank')">Historical Maps (Rumsey) →</div>
    </div>
  `;
  el.innerHTML = goodieShell('🗺', 'Place on the Map', html);
}

// ─── RENDER HELPERS ───────────────────────────────────────────────────────

function goodieShell(icon, title, bodyHtml) {
  return `
    <div class="goodie-section">
      <div class="goodie-section-header">
        <span class="goodie-icon">${icon}</span>${title}
      </div>
      <div class="goodie-body">${bodyHtml}</div>
    </div>
  `;
}

function renderGoodieBody(id, icon, title, bodyHtml) {
  const el = document.getElementById(`g-${id.replace('g-', '')}`);
  if (el) el.innerHTML = goodieShell(icon, title, bodyHtml);
}
