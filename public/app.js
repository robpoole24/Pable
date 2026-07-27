/* ═══════════════════════════════════════════════════════════════════════
   PABLE v3 — app.js
   Full rabbit-hole goodies: people, places, coins, full articles,
   layered YouTube, primary sources, About section w/ Mr. Pable tribute
   ═══════════════════════════════════════════════════════════════════════ */

// ─── State ────────────────────────────────────────────────────────────
let todayEvents   = [];
let selectedEvent = null;
let sealBroken    = false;
let cpiCache      = null;
let currentView   = 'list'; // 'list' | 'event' | 'about'

// ─── HTTPS enforcer — fixes mixed content on all image URLs ─────────
function toHttps(url) {
  if (!url) return url;
  return url.replace(/^http:\/\//, 'https://');
}

// ─── Vocabulary sets ──────────────────────────────────────────────────
const ARCHAIC_WORDS = new Set([
  'henceforth','whereupon','hitherto','thereof','whereby','herein',
  'forthwith','thenceforth','whence','thither','hither','perchance',
  'forsooth','sennight','fortnight','farthing','groat','musket',
  'arquebus','trebuchet','ballista','catapult','phalanx','centurion',
  'praetor','consul','tribune','legate','prefect','serf','vassal',
  'liege','fealty','suzerainty','fiefdom','redcoat','minuteman',
  'dragoon','hussar','cuirassier','pikeman','galleon','brigantine',
  'frigate','carrack','privateer','corsair','apotheosis','hegemony',
  'satrap','vizier','caliph','emir','inquisition','heresy','crusade',
  'indulgence','schism','papal','plague','pestilence','miasma',
  'alchemy','astrolabe','quadrant','sextant','parchment','vellum',
  'illuminated','codex','papyrus','manuscript','siege','rampart',
  'bastion','castle','manor','guild','charter','parliament','jury',
  'verdict','liberty','republic','tyranny','empire','senate',
  'dictator','patrician','plebeian','gladiator','catapult','trebuchet',
  'longbow','crossbow','hauberk','destrier','palfrey','joust','melee'
]);

const STOP_WORDS = new Set([
  'about','after','again','against','along','already','also','although',
  'always','among','another','around','became','because','been','before',
  'being','between','both','could','during','every','first','following',
  'found','give','given','having','however','include','into','known',
  'later','least','less','made','make','many','more','most','much',
  'must','near','never','next','none','noted','often','once','only',
  'onto','other','over','part','place','same','several','since','small',
  'some','still','such','than','that','their','them','then','there',
  'these','they','this','those','through','time','under','until','upon',
  'used','very','were','what','when','where','while','which','will',
  'with','within','would','year','years','your','have','from','were'
]);

// ─── Init ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadTodayEvents();

  // Global image lightbox — click any .image-item img to view full size
  document.body.addEventListener('click', e => {
    const img = e.target.closest('.image-item img') || e.target.closest('.met-img');
    if (!img) return;
    const modal = document.createElement('div');
    modal.className = 'lightbox-modal';
    modal.innerHTML = `
      <div class="lightbox-backdrop"></div>
      <div class="lightbox-content">
        <img src="${img.src}" alt="${img.alt}" class="lightbox-img"/>
        <div class="lightbox-caption">${img.alt || img.closest('.image-item')?.querySelector('.image-caption')?.textContent || ''}</div>
        <button class="lightbox-close" aria-label="Close">✕</button>
      </div>`;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('lightbox-open'));
    const close = () => { modal.classList.remove('lightbox-open'); setTimeout(()=>modal.remove(), 300); };
    modal.querySelector('.lightbox-close').addEventListener('click', close);
    modal.querySelector('.lightbox-backdrop').addEventListener('click', close);
    document.addEventListener('keydown', function esc(e) { if(e.key==='Escape'){close();document.removeEventListener('keydown',esc);} });
  });

  // Browser back/forward button support
  window.addEventListener('popstate', e => {
    const state = e.state || { view: 'list' };
    if (state.view === 'list') {
      currentView = 'list'; selectedEvent = null; sealBroken = false;
      renderEventList();
    } else if (state.view === 'event' && state.eventIndex != null) {
      const ev = todayEvents[state.eventIndex];
      if (ev) { currentView = 'event'; openEvent(ev, false); }
      else { currentView = 'list'; renderEventList(); }
    } else if (state.view === 'about') {
      currentView = 'about'; showAbout(false);
    } else {
      currentView = 'list'; renderEventList();
    }
  });
});

// Push a new history state without triggering popstate
function pushState(view, extra = {}) {
  const state = { view, ...extra };
  const titles = {
    list:  'Pable — This Day in History',
    event: 'Pable — Event',
    about: 'Pable — About'
  };
  history.pushState(state, titles[view] || 'Pable', window.location.pathname);
}

function enterApp() {
  const splash = document.getElementById('splash');
  const appEl  = document.getElementById('app');
  splash.classList.add('hidden');
  setTimeout(() => {
    splash.style.display = 'none';
    appEl.style.display  = 'block';
    // Replace current history entry so back from list goes to splash, not off-app
    history.replaceState({ view: 'list' }, 'Pable', window.location.pathname);
    renderApp();
  }, 500);
}

// ─── SHELL ────────────────────────────────────────────────────────────
function renderApp() {
  const today     = new Date();
  const monthName = today.toLocaleString('en-US', { month: 'long' });
  const day       = today.getDate();
  const year      = today.getFullYear(); // kept for internal use

  document.getElementById('app').innerHTML = `
    <div class="pable-root">
      <div class="pable-header">
        <div class="pable-header-eyebrow">
          <button class="about-btn" onclick="showAbout()">About</button>
        </div>
        <h1 class="pable-wordmark">Pable</h1>
      </div>
      <div class="pable-date-banner">This Day in History — ${monthName} ${day}</div>
      <div id="main-content"></div>
    </div>
  `;
  renderEventList();
}

// ─── LOAD EVENTS ──────────────────────────────────────────────────────
async function loadTodayEvents() {
  try {
    const res = await fetch('/api/events/today');
    todayEvents = await res.json();
    if (document.getElementById('main-content')) renderEventList();
  } catch (e) { console.error('Events load failed:', e); }
}

// ─── EVENT LIST ───────────────────────────────────────────────────────
function renderEventList() {
  const content = document.getElementById('main-content');
  if (!content) return;
  if (!todayEvents.length) {
    content.innerHTML = `<div class="loading-ink" style="padding:40px">Consulting the archives…</div>`;
    return;
  }
  content.innerHTML = `
    <div class="section-label">20 Events · Weighted by Historical Significance</div>
    ${todayEvents.map((ev, i) => eventCardHTML(ev, i)).join('')}
    <div class="source-footer">
      Events · Wikipedia On This Day<br>
      Images · Wikimedia · DPLA · Smithsonian · Europeana · NASA<br>
      Video · YouTube Data API v3 · Internet Archive<br>
      Newspapers · Chronicling America (LOC, 1770–1963)<br>
      Etymology · Merriam-Webster · Books · Open Library · Google Books · Gutenberg<br>
      Music · Open Opus · MusicBrainz · Internet Archive Audio<br>
      Coins · Numista · OCRE (Roman) · Wikimedia Numismatic<br>
      Inflation · FRED CPIAUCSL · Maps · OpenStreetMap · Leaflet
    </div>
  `;
  document.querySelectorAll('.event-card').forEach((card, i) => {
    card.addEventListener('click', () => openEvent(todayEvents[i], true));
  });
}

function eraLabel(year) {
  const y = parseInt(year) || 0;
  if (y < 500)   return 'Ancient';
  if (y < 1000)  return 'Early Medieval';
  if (y < 1400)  return 'Medieval';
  if (y < 1600)  return 'Renaissance';
  if (y < 1776)  return 'Early Modern';
  if (y < 1900)  return 'Modern Era';
  if (y < 1950)  return 'Early 20th C.';
  if (y < 2000)  return 'Late 20th C.';
  return 'Contemporary';
}

function eventCardHTML(ev, i) {
  const year    = ev.year || '?';
  const title   = (ev.text || 'Historical Event').replace(/\[\[.*?\]\]/g,'');
  const extract = ev.fullSummary || ev.pages?.[0]?.extract || '';
  const thumb   = ev.pages?.[0]?.thumbnail?.source || '';
  return `
    <div class="event-card" data-index="${i}">
      ${thumb ? `<img class="event-card-thumb" src="${thumb}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
      <div class="event-card-inner">
        <div class="event-card-era">${eraLabel(year)}</div>
        <div class="event-card-year">${year}</div>
        <div class="event-card-title">${title.substring(0,120)}</div>
        <div class="event-card-teaser">${extract.substring(0,200)}${extract.length>200?'…':''}</div>
        <div class="event-card-open-hint">Explore this event ↓</div>
      </div>
    </div>
  `;
}

// ─── OPEN EVENT ───────────────────────────────────────────────────────
function openEvent(ev, pushHistory = true) {
  selectedEvent = ev;
  sealBroken    = false;
  currentView   = 'event';
  // Push history state so browser back works
  if (pushHistory) {
    const idx = todayEvents.indexOf(ev);
    pushState('event', { eventIndex: idx });
  }

  const year     = ev.year || '?';
  const title    = (ev.text || '').replace(/\[\[.*?\]\]/g,'');
  const fullText = ev.fullText || ev.fullSummary || ev.pages?.[0]?.extract || '';
  const wikiUrl  = ev.pages?.[0]?.content_urls?.desktop?.page || '';

  // Split full article into paragraphs, take up to 6
  const paragraphs = fullText.split(/\n+/).filter(p=>p.trim().length>40).slice(0,6);

  document.getElementById('main-content').innerHTML = `
    <div class="event-expanded">
      <div class="event-expanded-header">
        <div class="event-expanded-era">${eraLabel(year)}</div>
        <div class="event-expanded-year">${year}</div>
        <div class="event-expanded-title">${title}</div>
      </div>
      <button class="back-btn" id="back-btn">← All Events</button>
      <div class="event-summary">
        ${ev.curated?.context ? `<div class="curated-context">${ev.curated.context}</div>` : ''}
        ${ev.infoboxMapUrl ? `
          <div class="infobox-map-wrap">
            <img src="${ev.infoboxMapUrl}" class="infobox-map" alt="Map of ${title}" loading="lazy"/>
            <div class="infobox-map-caption">Map · Wikipedia</div>
          </div>` : ''}
        ${paragraphs.map(p=>`<p>${p}</p>`).join('')}
        ${wikiUrl ? `<a class="wiki-link" href="${wikiUrl}" target="_blank">Full Wikipedia article →</a>` : ''}
      </div>
      <div class="seal-wrapper">
        <div id="wax-seal" class="seal-img-wrap">
          <img id="seal-img" src="wax_seal.png" alt="Wax Seal" class="seal-img"/>
        </div>
        <div class="seal-label" id="seal-label">Break the Seal · Open the Goodies</div>
      </div>
      <div id="goodies-container"></div>
    </div>
  `;

  document.getElementById('back-btn').addEventListener('click', () => {
    history.back(); // triggers popstate → renders event list
  });
  document.getElementById('wax-seal').addEventListener('click', breakSeal);
}

function breakSeal() {
  if (sealBroken) return;
  sealBroken = true;

  const wrap  = document.getElementById('wax-seal');
  const img   = document.getElementById('seal-img');
  const label = document.getElementById('seal-label');

  wrap.style.cursor = 'default';
  label.textContent = 'Opening…';

  // Swap static PNG for animated GIF — browser plays it automatically from frame 1
  img.src = 'WaxSealRemoval.gif';

  // Wait for GIF to finish playing, then fade out and load goodies
  // Adjust this timeout to match your GIF's actual duration
  setTimeout(() => {
    wrap.style.transition  = 'opacity 0.5s ease, transform 0.5s ease';
    wrap.style.opacity     = '0';
    wrap.style.transform   = 'scale(0.85) translateY(-8px)';
    label.style.transition = 'opacity 0.3s ease';
    label.style.opacity    = '0';
    setTimeout(() => {
      // Collapse seal area completely — no gap
      const wrapper = document.querySelector('.seal-wrapper');
      if (wrapper) wrapper.style.display = 'none';
      loadAllGoodies(selectedEvent);
    }, 500);
  }, 3000); // exactly matches GIF duration
}

// ─── LOAD ALL GOODIES ─────────────────────────────────────────────────
async function loadAllGoodies(ev) {
  const container = document.getElementById('goodies-container');
  const year      = parseInt(ev.year) || new Date().getFullYear();
  const title     = (ev.text||'').replace(/\[\[.*?\]\]/g,'');
  const fullText  = ev.fullText || ev.fullSummary || ev.pages?.[0]?.extract || '';
  const pageTitle = ev.pages?.[0]?.title || '';
  const coords    = ev.coordinates || ev.pages?.[0]?.coordinates;
  const people    = ev.peopleSummaries || [];
  const entities  = ev.entities || { people: [] };

  const keyword     = pageTitle || title.split(' ').slice(0,5).join(' ');
  // Use server-side query expansion if available — much richer than single keyword
  const queryExpansion = ev.queryExpansion || [keyword, ...curatedPeopleNames].filter(Boolean);
  const isSpace     = /nasa|apollo|space|astronaut|rocket|moon|mars|orbit|satellite|shuttle|gemini|iss|hubble/i.test(title+fullText);
  const isRoman     = /roman|caesar|augustus|empire|legion|senate|consul|gladiator|colosseum|carthage/i.test(title+fullText);
  const isMedieval  = year >= 500 && year < 1500;
  const hasRecording = year >= 1877;
  const hasNewsVideo = year >= 1950;
  const currencyMention = extractCurrencyMention(fullText);
  const archaicTerms    = extractArchaicTerms(title+' '+fullText);

  // Curated resources — handcrafted for specific events
  const curated = ev.curated || { videos: [], books: [], coins: [], context: null };

  // Key figure names — use enriched peopleSummaries first, fall back to entity extraction
  // peopleSummaries are Wikipedia-verified; entities.people is raw text extraction
  const titlePeople = people.length
    ? people.map(p => p.name).slice(0,3)
    : entities.people?.slice(0,3) || [];
  // Build fallback YouTube queries — use curated people names when available
  const curatedPeopleNames = curated.people?.map(p => p.name) || [];
  const fallbackQuery1 = curatedPeopleNames[0] || titlePeople[0] || keyword.split(' ').slice(0,3).join(' ');
  const fallbackQuery2 = curatedPeopleNames[1] || `${eraLabel(year)} history ${keyword.split(' ').slice(0,2).join(' ')}`;

  // Pre-create ordered slots — goodies fill their slot when ready
  // This guarantees consistent order regardless of API response timing
  const GOODIE_ORDER = [
    'g-video-curated', 'g-figures', 'g-images', 'g-met',
    'g-coins', 'g-yt-docs', 'g-yt-news', 'g-archive-video',
    'g-archive-audio', 'g-newspapers', 'g-primary', 'g-etymology',
    'g-thesaurus', 'g-life', 'g-music', 'g-books', 'g-inflation',
    'g-map', 'g-nasa', 'g-gdelt', 'g-guardian', 'g-newsdata', 'g-texts'
  ];
  container.innerHTML = `
    <div class="goodies-title">Pable's Goodies</div>
    <div class="goodies-reveal" id="goodies-grid">
      ${GOODIE_ORDER.map(id => `<div id="${id}"></div>`).join('')}
    </div>
  `;

  // Helper: fill a specific slot
  function fillSlot(slotId, icon, title, bodyHTML, sourceNote='') {
    const slot = document.getElementById(slotId);
    if (!slot) return;
    slot.innerHTML = '';
    const card = goodieCard(icon, title, bodyHTML, sourceNote);
    slot.appendChild(card);
  }

  const grid = document.getElementById('goodies-grid');

  // Merge curated people names into query list — these are the most precise
  const queryPeople = curatedPeopleNames.length ? curatedPeopleNames : titlePeople;
  // isModern flag — news APIs only useful for recent events
  const isModern = year >= 1950;
  const hasNewspaper = year >= 1770 && year <= 1963;

  // Fire all in parallel — each appends itself when ready
  const loaders = [
    // 0. Curated videos (specific known videos for this event)
    curated.videos?.length ? loadCuratedVideos(grid, curated.videos) : null,
    // 1. Key figures dossiers (people cards) — curated first, API fallback
    loadPeopleDossiers(grid, people, year, curated.people),
    // 2. Images — use full page title + specific figure names
    loadImages(grid, keyword, year, isSpace, queryPeople.map(n => n.includes(' ') ? n : keyword)),
    // 2b. Met Museum dedicated goodie
    loadMetArtifacts(grid, keyword, year, queryPeople),
    // 3. Coins — curated coins first, then API with curated people names
    (isRoman || isMedieval || curated.coins?.length) ? loadCoins(grid, keyword, queryPeople, isRoman, curated.coins) : null,
    // 4. YouTube documentaries (layered queries)
    // YouTube — use all query expansion variants for maximum coverage
    loadYouTubeDocs(grid,
      queryExpansion[0] || keyword,
      queryExpansion[1] || fallbackQuery1,
      queryExpansion[2] || fallbackQuery2,
      queryExpansion[3] || null
    ),
    // 5. YouTube news (post-1950)
    hasNewsVideo ? loadYouTubeNews(grid, keyword, fallbackQuery1) : null,
    // 6. Internet Archive video — use full query expansion
    loadArchiveVideo(grid, keyword, queryExpansion),
    // 7. Audio (post-1877) — use query expansion for better results
    hasRecording ? loadArchiveAudio(grid, keyword, queryExpansion) : null,
    // 8. Historic newspapers (1770–1963)
    hasNewspaper ? loadNewspapers(grid, keyword, year) : null,
    // 9. Primary sources / chronicles (pre-1600)
    year < 1600 ? loadPrimarySources(grid, keyword, year, queryPeople) : null,
    // 10. Etymology (archaic terms only)
    archaicTerms.length ? loadEtymology(grid, archaicTerms) : null,
    // 11. Thesaurus
    // Thesaurus only for words in our archaic set (not modern common words)
    (archaicTerms.length && ARCHAIC_WORDS.has(archaicTerms[0])) ? loadThesaurus(grid, archaicTerms[0]) : null,
    // 12. Life & Society context
    loadLifeAndSociety(grid, keyword, year, fullText, curatedPeopleNames),
    // 13. Music
    loadMusic(grid, year, keyword),
    // 14. Books (API results + curated known works)
    loadBooks(grid, keyword, title, queryPeople, year, curated.books),
    // 15. Inflation (only if currency mentioned)
    currencyMention ? loadInflation(grid, currencyMention, year) : null,
    // 16. Map
    coords ? loadMap(grid, coords, keyword, year, ev.infoboxMapUrl) : null,
    // 17. NASA imagery (space events)
    isSpace ? loadNASA(grid, keyword, year) : null,
    // 18. GDELT broadcast news clips (post-2009 events)
    year >= 2009 ? loadGDELT(grid, queryExpansion) : null,
    // 19. Guardian news coverage
    year >= 1999 ? loadGuardian(grid, queryExpansion) : null,
    // 20. NewsData.io historical news + video
    year >= 1950 ? loadNewsData(grid, queryExpansion) : null,
    // 21. Internet Archive texts & Magazine Rack
    loadArchiveTexts(grid, queryExpansion, year),
  ].filter(Boolean);

  await Promise.allSettled(loaders);

  if (!grid.children.length) {
    grid.innerHTML = `<div class="empty-state" style="padding:20px 24px">No additional resources found. Try the Wikipedia article linked above.</div>`;
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────
function goodieCard(icon, title, bodyHTML, sourceNote='') {
  const div = document.createElement('div');
  div.className = 'goodie-section';
  div.innerHTML = `
    <div class="goodie-section-header"><span class="goodie-icon">${icon}</span>${title}</div>
    <div class="goodie-body">
      ${bodyHTML}
      ${sourceNote?`<div class="goodie-source">${sourceNote}</div>`:''}
    </div>`;
  return div;
}
function appendGoodie(grid, icon, title, html, source='') {
  grid.appendChild(goodieCard(icon, title, html, source));
}
function extractCurrencyMention(text) {
  const pats = [/\$[\d,]+(?:\.\d+)?(?:\s?(?:million|billion|trillion))?/i,
    /£[\d,]+(?:\.\d+)?(?:\s?(?:million|billion))?/i,
    /[\d,]+\s(?:million|billion)?\s?(?:dollars?|pounds?|francs?|ducats?|shillings?|denarii|talents?)/i];
  for (const p of pats) { const m=text.match(p); if(m) return m[0]; }
  return null;
}
function extractArchaicTerms(text) {
  const words = text.toLowerCase().replace(/[^a-z\s]/g,'').split(/\s+/);
  const found = [];
  for (const w of words) {
    if (ARCHAIC_WORDS.has(w) && !found.includes(w)) { found.push(w); if(found.length>=4) break; }
  }
  return found;
}
function musicEpoch(year) {
  if (year < 1400)  return 'Medieval';
  if (year < 1600)  return 'Renaissance';
  if (year < 1750)  return 'Baroque';
  if (year < 1820)  return 'Classical';
  if (year < 1910)  return 'Romantic';
  return null;
}
function loadScript(src) {
  return new Promise(r => {
    if (document.querySelector(`script[src="${src}"]`)) return r();
    const s = document.createElement('script'); s.src=src; s.onload=r;
    document.head.appendChild(s);
  });
}
function loadCSS(href) {
  return new Promise(r => {
    if (document.querySelector(`link[href="${href}"]`)) return r();
    const l = document.createElement('link'); l.rel='stylesheet'; l.href=href; l.onload=r;
    document.head.appendChild(l);
  });
}

// ─── GOODIE 1: KEY FIGURES ────────────────────────────────────────────
// Uses curated people list when available; falls back to API entity extraction
// Filters strictly to human figures — never shows places or objects
async function loadPeopleDossiers(grid, people, year, curatedPeople=[]) {
  // If we have curated people definitions, fetch their Wikipedia summaries
  if (curatedPeople?.length) {
    const fetched = await Promise.all(curatedPeople.map(async p => {
      try {
        const res = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(p.wikiTitle)}`,
          { headers: { 'User-Agent': 'PableHistoryApp/3.0 (educational; robpoole24@gmail.com)' } }
        ).then(r => r.json());
        if (res.type === 'disambiguation' || !res.extract) return null;
        // Only show if Wikipedia confirms this is a person
        const desc = (res.description || '').toLowerCase();
        const isPerson = /king|queen|emperor|count|duke|prince|general|pope|sultan|president|founder|commander|lord|earl|baron|knight|ruler|monarch|leader|minister|chancellor|bishop|archbishop|cardinal|tsar|pharaoh|caliph|vizier|senator|consul|tribune|knight/.test(desc);
        if (!isPerson && !p.role) return null;
        return {
          name: res.title,
          role: p.role || res.description || '',
          extract: res.extract?.substring(0, 350) || '',
          thumbnail: res.thumbnail?.source || null,
          url: res.content_urls?.desktop?.page || null
        };
      } catch { return null; }
    }));
    const valid = fetched.filter(Boolean);
    if (valid.length) {
      const html = valid.map(p => `
        <div class="person-card">
          ${p.thumbnail
            ? `<img class="person-portrait" src="${toHttps(p.thumbnail)}" alt="${p.name}" onerror="this.style.display='none'"/>`
            : '<div class="person-portrait-placeholder">👤</div>'}
          <div class="person-info">
            <div class="person-name">${p.name}</div>
            <div class="person-role">${p.role}</div>
            <div class="person-extract">${p.extract}</div>
            ${p.url ? `<a href="${p.url}" target="_blank" class="archive-link">Wikipedia →</a>` : ''}
          </div>
        </div>`).join('');
      fillSlot('g-figures', '👑', 'Key Figures', html, 'Wikipedia');
      return;
    }
  }

  // Fallback: API-extracted people — filter strictly to humans
  if (!people.length) return;
  const PLACE_WORDS = /comune|municipality|city|town|village|country|region|district|province|county|kingdom|empire|battle|island|mountain|river|sea|ocean|war|island/i;
  const PERSON_WORDS = /king|queen|count|duke|prince|emperor|general|sultan|pope|ruler|president|founder|commander|lord|baron|leader|minister|bishop|archbishop|tsar|pharaoh|caliph|senator|consul|knight/i;
  const humanPeople = people.filter(p =>
    PERSON_WORDS.test(p.extract || '') && !PLACE_WORDS.test(p.extract?.split('.')[0] || '')
  ).slice(0, 3);
  if (!humanPeople.length) return;

  const html = humanPeople.map(p => `
    <div class="person-card">
      ${p.thumbnail
        ? `<img class="person-portrait" src="${p.thumbnail}" alt="${p.name}" onerror="this.style.display='none'"/>`
        : '<div class="person-portrait-placeholder">👤</div>'}
      <div class="person-info">
        <div class="person-name">${p.name}</div>
        <div class="person-extract">${p.extract || ''}</div>
        ${p.url ? `<a href="${p.url}" target="_blank" class="archive-link">Wikipedia →</a>` : ''}
      </div>
    </div>`).join('');
  fillSlot('g-figures', '👑', 'Key Figures', html, 'Wikipedia');
}

// ─── GOODIE 2: IMAGES ─────────────────────────────────────────────────
async function loadImages(grid, keyword, year, isSpace, people=[]) {
  const images = [];
  // Use specific figure names for medieval/ancient events — NOT the battle name
  // "Roger II of Sicily" returns relevant images; "Battle of Nocera" returns generic war images
  const isOldEvent = parseInt(year) < 1900;
  const queries = isOldEvent && people.length
    ? [...people.slice(0,2), keyword]   // figures first for old events
    : [keyword, ...people.slice(0,2)];  // event first for modern events

  const [wikiRes, dplaRes, siRes, euroRes] = await Promise.allSettled([
    Promise.all(queries.map(q => fetchWikimediaImages(q))),
    fetch(`/api/dpla?q=${encodeURIComponent(keyword)}&page_size=4`).then(r=>r.json()).catch(()=>({docs:[]})),
    fetch(`/api/smithsonian?q=${encodeURIComponent(keyword)}&rows=4`).then(r=>r.json()).catch(()=>({response:{rows:[]}})),
    year < 1900 ? fetch(`/api/europeana?q=${encodeURIComponent(keyword)}&rows=5`).then(r=>r.json()).catch(()=>({items:[]})) : Promise.resolve({items:[]}),
  ]);

  if (wikiRes.status==='fulfilled') {
    wikiRes.value.flat().forEach(i => images.push(i));
  }
  if (dplaRes.status==='fulfilled') {
    (dplaRes.value.docs||[]).filter(d=>d.object).slice(0,3).forEach(d=>images.push({
      url:d.object, caption:(d.sourceResource?.title?.[0]||'DPLA').substring(0,80), source:'DPLA'
    }));
  }
  if (siRes.status==='fulfilled') {
    (siRes.value.response?.rows||[])
      .filter(r=>r.content?.descriptiveNonRepeating?.online_media?.media?.[0]?.thumbnail)
      .slice(0,3).forEach(r=>images.push({
        url:toHttps(r.content.descriptiveNonRepeating.online_media.media[0].thumbnail),
        caption:(r.title||'Smithsonian').substring(0,80), source:'Smithsonian'
      }));
  }
  if (euroRes.status==='fulfilled') {
    (euroRes.value.items||[]).filter(i=>i.edmPreview?.[0]).slice(0,4).forEach(i=>images.push({
      url:i.edmPreview[0],
      caption:(Array.isArray(i.title)?i.title[0]:i.title||'Europeana').substring(0,80),
      source:'Europeana'
    }));
  }

  // Met Museum — public domain, high-res, era-matched
  const metImgs = await fetchMetMuseum(keyword, year, people);
  images.push(...metImgs);

  const display = images.filter((img,i,a)=>a.findIndex(x=>x.url===img.url)===i).slice(0,12);
  if (!display.length) return;

  const html = `<div class="images-grid">${display.map(img=>`
    <div class="image-item">
      <img src="${img.url}" alt="${img.caption}" loading="lazy" onerror="this.closest('.image-item').style.display='none'"/>
      <div class="image-caption">${img.caption}<span class="img-source">${img.source||''}</span></div>
    </div>`).join('')}</div>`;
  fillSlot('g-images','🖼','Images & Artwork',html,'The Met · Wikimedia Commons · DPLA · Smithsonian · Europeana');
}

async function fetchWikimediaImages(keyword) {
  try {
    const q = encodeURIComponent(keyword);
    const data = await fetch(`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${q}&gsrnamespace=6&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=400&format=json&origin=*&gsrlimit=8`).then(r=>r.json());
    return Object.values(data.query?.pages||{})
      .filter(p=>{
        const url = p.imageinfo?.[0]?.url || '';
        const title = (p.title||'').toLowerCase();
        if (!url || /\.(svg|gif)$/i.test(url)) return false;
        if (/flag|icon|button|logo|portrait.*cricket|cricket.*portrait|football|soccer|basketball|baseball|tennis/i.test(title)) return false;
        return true;
      })
      .slice(0,5).map(p=>({
        url:toHttps(p.imageinfo[0].url),
        caption:(p.imageinfo[0].extmetadata?.ImageDescription?.value||p.title||'').replace(/<[^>]+>/g,'').substring(0,80),
        source:'Wikimedia'
      }));
  } catch { return []; }
}

// Met Museum department IDs mapped to era/topic
// Full list: 3=Ancient Near East, 4=Arms & Armor, 6=Asian Art, 7=Cloisters,
//  9=Drawings & Prints, 10=Egyptian, 11=European Paintings, 12=European Sculpture,
//  13=Greek & Roman, 14=Islamic, 17=Medieval, 18=Musical Instruments, 21=Modern
function metDepartmentsForEvent(year, keyword) {
  const depts = [];
  const kw = (keyword||'').toLowerCase();
  const y  = parseInt(year) || 0;

  // Topic-specific overrides
  if (/egypt|pharaoh|pyramid|nile|cleopatra|ramesses|tutankhamun/i.test(kw)) depts.push(10);
  if (/greek|roman|caesar|augustus|gladiator|colosseum|sparta|athen|olymp/i.test(kw)) depts.push(13);
  if (/islam|ottoman|caliphate|mosque|sultan|saracen|moorish|arab/i.test(kw)) depts.push(14);
  if (/medieval|crusade|knight|castle|feudal|monastery|norman|byzantine/i.test(kw)) depts.push(17,7);
  if (/armor|sword|battle|siege|weapon|cannon|musket|lance|shield/i.test(kw)) depts.push(4);
  if (/music|instrument|harpsichord|lute|viol|trumpet|organ/i.test(kw)) depts.push(18);
  if (/china|japan|india|asia|buddhist|ming|tang|samurai|mongol/i.test(kw)) depts.push(6);

  // Era-based fallbacks if no topic match
  if (!depts.length) {
    if (y < -500)        depts.push(13, 10, 3);   // Classical antiquity + Egypt + ANE
    else if (y < 500)    depts.push(13, 12, 3);   // Roman + European + ANE
    else if (y < 1000)   depts.push(17, 7, 14);   // Medieval + Cloisters + Islamic
    else if (y < 1400)   depts.push(17, 7, 11);   // Medieval + Cloisters + European
    else if (y < 1600)   depts.push(11, 12, 9);   // European paintings + sculpture + drawings
    else if (y < 1800)   depts.push(11, 12, 9);   // Same
    else if (y < 1900)   depts.push(11, 21, 9);   // European + Modern + drawings
    else                 depts.push(21, 11, 9);   // Modern + European + drawings
  }
  return [...new Set(depts)].slice(0,3);
}

async function fetchMetMuseum(keyword, year, people=[]) {
  const BASE = 'https://collectionapi.metmuseum.org/public/collection/v1';
  const images = [];
  const y = parseInt(year) || 0;

  // Build search queries — event keyword + key people names
  const queries = [keyword, ...people.slice(0,2)].filter(Boolean);
  const deptIds = metDepartmentsForEvent(year, keyword);

  // Date range: bracket ±75 years around event, clamped to reasonable bounds
  const dateBegin = Math.max(y - 75, -3000);
  const dateEnd   = Math.min(y + 75,  2025);
  const dateParam = y !== 0 ? `&dateBegin=${dateBegin}&dateEnd=${dateEnd}` : '';
  const deptParam = deptIds.length ? `&departmentId=${deptIds.join('|')}` : '';

  for (const q of queries) {
    if (images.length >= 6) break;
    try {
      // Search with hasImages + isPublicDomain to ensure displayable results
      const searchUrl = `${BASE}/search?q=${encodeURIComponent(q)}&hasImages=true&isPublicDomain=true${deptParam}${dateParam}`;
      const search = await fetch(searchUrl).then(r=>r.json());
      const ids = (search.objectIDs || []).slice(0, 6);
      if (!ids.length) continue;

      // Fetch object details in parallel
      const objects = await Promise.all(
        ids.map(id => fetch(`${BASE}/objects/${id}`).then(r=>r.json()).catch(()=>null))
      );

      for (const obj of objects) {
        if (!obj || !obj.primaryImageSmall || images.length >= 8) continue;
        // Build a rich caption
        const parts = [obj.title, obj.artistDisplayName, obj.objectDate, obj.culture].filter(Boolean);
        const caption = parts.join(' · ').substring(0, 100);
        images.push({
          url:     toHttps(obj.primaryImageSmall),
          caption,
          source:  'The Met',
          metUrl:  obj.objectURL,
          dept:    obj.department
        });
      }
    } catch {}
  }
  return images;
}

// ─── GOODIE 2b: MET MUSEUM ARTIFACTS ────────────────────────────────
// Dedicated goodie showing artifacts, weapons, manuscripts, and art
// from The Met with full metadata and links to their collection pages
async function loadMetArtifacts(grid, keyword, year, people=[]) {
  const BASE = 'https://collectionapi.metmuseum.org/public/collection/v1';
  const y = parseInt(year) || 0;
  const deptIds = metDepartmentsForEvent(year, keyword);
  const dateBegin = Math.max(y - 100, -3000);
  const dateEnd   = Math.min(y + 100,  2025);
  const dateParam = y !== 0 ? `&dateBegin=${dateBegin}&dateEnd=${dateEnd}` : '';
  const deptParam = deptIds.length ? `&departmentId=${deptIds.join('|')}` : '';

  // Try isHighlight first (curator-selected important works), fall back to general
  const queries = [keyword, ...people.slice(0,1)].filter(Boolean);
  const artifacts = [];
  const seenIds   = new Set();

  for (const q of queries) {
    if (artifacts.length >= 6) break;
    for (const highlight of [true, false]) {
      if (artifacts.length >= 6) break;
      try {
        const highlightParam = highlight ? '&isHighlight=true' : '';
        const url = `${BASE}/search?q=${encodeURIComponent(q)}&hasImages=true&isPublicDomain=true${deptParam}${dateParam}${highlightParam}`;
        const search = await fetch(url).then(r=>r.json());
        const ids = (search.objectIDs||[]).filter(id=>!seenIds.has(id)).slice(0,5);
        if (!ids.length) continue;

        const objects = await Promise.all(
          ids.map(id => { seenIds.add(id); return fetch(`${BASE}/objects/${id}`).then(r=>r.json()).catch(()=>null); })
        );

        for (const obj of objects) {
          if (!obj || !obj.primaryImageSmall) continue;
          artifacts.push(obj);
          if (artifacts.length >= 6) break;
        }
      } catch {}
    }
  }

  if (!artifacts.length) return;

  const html = artifacts.map(obj => `
    <div class="met-artifact">
      <a href="${obj.objectURL||'#'}" target="_blank" class="met-img-link">
        <img src="${obj.primaryImageSmall}" alt="${obj.title||''}" loading="lazy"
          class="met-img" onerror="this.closest('.met-artifact').style.display='none'"/>
      </a>
      <div class="met-info">
        <div class="met-title">
          <a href="${obj.objectURL||'#'}" target="_blank">${(obj.title||'Untitled').substring(0,80)}</a>
        </div>
        ${obj.artistDisplayName ? `<div class="met-artist">${obj.artistDisplayName}${obj.artistDisplayBio?' · '+obj.artistDisplayBio.substring(0,50):''}</div>` : ''}
        <div class="met-meta">
          ${[obj.objectDate, obj.medium, obj.culture, obj.department].filter(Boolean).map(s=>s.substring(0,40)).join(' · ')}
        </div>
        ${obj.dimensions ? `<div class="met-dims">${obj.dimensions.substring(0,60)}</div>` : ''}
      </div>
    </div>`).join('');

  fillSlot('g-met','🏛️','The Met Collection',html,'The Metropolitan Museum of Art · Public Domain · metmuseum.org');
}

// ─── GOODIE 0: CURATED VIDEOS ────────────────────────────────────────
// Specific known videos for this event — always shown when matched
async function loadCuratedVideos(grid, videos) {
  if (!videos?.length) return;
  const html = videos.map(v => `
    <a href="https://youtube.com/watch?v=${v.id}" target="_blank" class="video-item">
      <img class="video-thumb-img"
        src="https://img.youtube.com/vi/${v.id}/mqdefault.jpg"
        alt="${v.title}" onerror="this.style.display='none'"/>
      <div>
        <div class="video-title">${v.title}</div>
        <div class="video-channel">${v.channel}</div>
        <div class="video-source">YouTube · ${v.type === 'short' ? 'Short' : v.type === 'speech' ? 'Primary Source' : 'Documentary'}</div>
      </div>
    </a>`).join('');
  fillSlot('g-video-curated', '🎬', 'Video — This Event', html, 'YouTube · Curated');
}

// ─── GOODIE 3: COINS ─────────────────────────────────────────────────
async function loadCoins(grid, keyword, people=[], isRoman=false, curatedCoins=[]) {
  const coinImages = [];

  // 0. Curated coins — specific known coins for this event (highest priority)
  if (curatedCoins?.length) {
    curatedCoins.forEach(c => coinImages.push(c));
    // If we have enough curated coins, skip API calls (they often return wrong results)
    if (coinImages.length >= 4) {
      const html = `
        <p class="goodie-context">Coinage from the rulers and regions involved in this event.</p>
        <div class="images-grid">${coinImages.map(c=>`
          <div class="image-item">
            <img src="${c.url}" alt="${c.caption}" loading="lazy" onerror="this.closest('.image-item').style.display='none'"/>
            <div class="image-caption">${c.caption}<span class="img-source">${c.source||''}</span></div>
          </div>`).join('')}</div>`;
      fillSlot('g-coins','🪙','Coins of the Era',html,'Curated · Wikimedia Commons');
      return;
    }
  }

  // 0b. OCRE for Roman events — most accurate ancient Roman coin source
  if (isRoman && coinImages.length < 4) {
    const romanQuery = people[0]?.split(' ')[0] || keyword.split(' ')[0];
    try {
      const data = await fetch(`/api/ocre?q=${encodeURIComponent(romanQuery)}`).then(r=>r.json());
      (data.results||[]).filter(c=>c.thumbnail).slice(0,4).forEach(c=>coinImages.push({
        url: c.thumbnail,
        caption: (c.label || 'Roman Imperial coin') + (c.date ? ` · ${c.date}` : ''),
        source: 'OCRE'
      }));
    } catch {}
  }

  // 1. Numista API — use emperor/ruler name not event name for better results
  // Response: { count, types: [{ id, title, issuer:{name}, min_year, max_year,
  //   obverse_thumbnail, reverse_thumbnail }] }
  // Use people names for coin search — much more accurate than event keywords
  // e.g. "Frederick Barbarossa" finds his coins; "Friedrich Barbarossa arrives at Niš" doesn't
  const coinPeople = people.length ? people : [keyword.split(' ').slice(0,3).join(' ')];
  const numistaQueries = [
    ...coinPeople.slice(0,2),
    // Also try first 2 words of keyword as fallback
    keyword.split(' ').slice(0,2).join(' ')
  ];
  for (const q of numistaQueries) {
    try {
      const data = await fetch(`/api/numista?q=${encodeURIComponent(q)}&count=6`).then(r=>r.json());
      (data.types||[]).forEach(t => {
        const label = [t.title, t.issuer?.name, t.min_year ? `${t.min_year}${t.max_year&&t.max_year!==t.min_year?'–'+t.max_year:''}` : ''].filter(Boolean).join(' · ');
        if (t.obverse_thumbnail) coinImages.push({ url: t.obverse_thumbnail, caption: label, source: 'Numista' });
        if (t.reverse_thumbnail) coinImages.push({ url: t.reverse_thumbnail, caption: label + ' (reverse)', source: 'Numista' });
      });
    } catch {}
    if (coinImages.length >= 4) break;
  }

  // 2. Wikimedia numismatic search — fills gaps
  if (coinImages.length < 4) {
    const wikiQueries = [
      ...people.slice(0,2).map(p => p + ' coin numismatic'),
      keyword.split(' ').slice(0,2).join(' ') + ' medieval coin'
    ];
    for (const q of wikiQueries) {
      const imgs = await fetchWikimediaImages(q);
      coinImages.push(...imgs);
      if (coinImages.length >= 6) break;
    }
  }

  // 3. OCRE — Roman empire coins (no key needed)
  if (isRoman && coinImages.length < 4) {
    try {
      const q = people[0] || keyword.split(' ')[0];
      const data = await fetch(`/api/ocre?q=${encodeURIComponent(q)}`).then(r=>r.json());
      (data.results||[]).filter(c=>c.thumbnail).slice(0,3).forEach(c=>coinImages.push({
        url: c.thumbnail,
        caption: c.label || 'Roman Imperial coin',
        source: 'OCRE'
      }));
    } catch {}
  }

  const display = coinImages.filter((c,i,a)=>a.findIndex(x=>x.url===c.url)===i).slice(0,8);
  if (!display.length) return;

  const html = `
    <p class="goodie-context">Coinage from the rulers and regions involved in this event — a direct window into the economy, iconography, and self-image of the period.</p>
    <div class="images-grid">${display.map(c=>`
      <div class="image-item">
        <img src="${c.url}" alt="${c.caption}" loading="lazy" onerror="this.closest('.image-item').style.display='none'"/>
        <div class="image-caption">${c.caption}<span class="img-source">${c.source||''}</span></div>
      </div>`).join('')}</div>`;
  fillSlot('g-coins','🪙','Coins of the Era',html,'Numista · Wikimedia Numismatic · OCRE (Roman Coins)');
}

// ─── GOODIE 4: YOUTUBE DOCS ───────────────────────────────────────────
async function loadYouTubeDocs(grid, keyword, fallback1, fallback2, fallback3=null) {
  try {
    const params = new URLSearchParams({ q: keyword, fallback1, fallback2, ...(fallback3?{fallback3}:{}), type:'docs' });
    const data = await fetch(`/api/youtube?${params}`).then(r=>r.json());
    const items = data.items||[];
    if (!items.length) return;
    const html = items.slice(0,5).map(v=>`
      <a href="https://youtube.com/watch?v=${v.id.videoId}" target="_blank" class="video-item">
        <img class="video-thumb-img" src="${v.snippet.thumbnails?.medium?.url||''}" alt="" onerror="this.style.display='none'"/>
        <div>
          <div class="video-title">${v.snippet.title.substring(0,90)}</div>
          <div class="video-channel">${v.snippet.channelTitle}</div>
          <div class="video-source">YouTube</div>
        </div>
      </a>`).join('');
    fillSlot('g-yt-docs','🎬','Documentaries & Educational Video',html,'YouTube Data API v3');
  } catch {}
}

// ─── GOODIE 5: YOUTUBE NEWS ──────────────────────────────────────────
async function loadYouTubeNews(grid, keyword, fallback1) {
  try {
    const params = new URLSearchParams({ q: keyword, fallback1, type:'news' });
    const data = await fetch(`/api/youtube?${params}`).then(r=>r.json());
    const items = (data.items||[]).filter(v=>
      /news|bbc|cnn|nbc|abc|cbs|pbs|reuters|ap\b|channel\s*4|itv|sky|report|footage/i
        .test(v.snippet.channelTitle+' '+v.snippet.title+' '+(v.snippet.description||''))
    );
    if (!items.length) return;
    const html = items.slice(0,4).map(v=>`
      <a href="https://youtube.com/watch?v=${v.id.videoId}" target="_blank" class="video-item">
        <img class="video-thumb-img" src="${v.snippet.thumbnails?.medium?.url||''}" alt="" onerror="this.style.display='none'"/>
        <div>
          <div class="video-title">${v.snippet.title.substring(0,90)}</div>
          <div class="video-channel">${v.snippet.channelTitle}</div>
          <div class="video-source">YouTube · News</div>
        </div>
      </a>`).join('');
    fillSlot('g-yt-news','📺','News Coverage',html,'YouTube Data API v3');
  } catch {}
}

// ─── GOODIE 6: ARCHIVE VIDEO ─────────────────────────────────────────
async function loadArchiveVideo(grid, keyword, queries=[]) {
  try {
    // Try multiple query variants for better coverage
    const searchTerms = queries.length ? queries : [keyword];
    let docs = [];
    for (const q of searchTerms.slice(0,3)) {
      const data = await fetch(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}+mediatype:movies&fl[]=identifier,title,description&sort[]=downloads+desc&rows=4&output=json`).then(r=>r.json());
      const found = data.response?.docs || [];
      for (const d of found) {
        if (!docs.find(x => x.identifier === d.identifier)) docs.push(d);
      }
      if (docs.length >= 5) break;
    }
    const data = { response: { docs } };
    const items = data.response?.docs||[];
    if (!items.length) return;
    const html = items.slice(0,4).map(v=>`
      <a href="https://archive.org/details/${v.identifier}" target="_blank" class="video-item">
        <div class="video-thumb-placeholder">▶</div>
        <div>
          <div class="video-title">${(v.title||'Untitled').substring(0,90)}</div>
          <div class="video-source">Internet Archive · Free</div>
        </div>
      </a>`).join('');
    fillSlot('g-archive-video','📽','Archival Film',html,'Internet Archive (archive.org)');
  } catch {}
}

// ─── GOODIE 7: ARCHIVE AUDIO ─────────────────────────────────────────
async function loadArchiveAudio(grid, keyword, queries=[]) {
  try {
    const searchTerms = queries.length ? queries : [keyword];
    let allItems = [];
    for (const q of searchTerms.slice(0,2)) {
      const data = await fetch(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}+mediatype:audio&fl[]=identifier,title&sort[]=downloads+desc&rows=4&output=json`).then(r=>r.json());
      const found = data.response?.docs || [];
      for (const d of found) {
        if (!allItems.find(x => x.identifier === d.identifier)) allItems.push(d);
      }
    }
    const items = allItems;
    if (!items.length) return;
    const audioItems = await Promise.all(items.slice(0,3).map(async item=>{
      try {
        const meta = await fetch(`https://archive.org/metadata/${item.identifier}`).then(r=>r.json());
        const file = (meta.files||[]).find(f=>/\.(mp3|ogg)$/i.test(f.name));
        return { title:item.title, identifier:item.identifier,
                 audioUrl:file?`https://archive.org/download/${item.identifier}/${file.name}`:null };
      } catch { return {title:item.title,identifier:item.identifier,audioUrl:null}; }
    }));
    const html = audioItems.map(a=>`
      <div class="audio-item">
        <div class="audio-title">${(a.title||'Untitled').substring(0,80)}</div>
        ${a.audioUrl
          ? `<audio controls preload="metadata" style="width:100%;margin-top:6px"><source src="/api/audio/proxy?url=${encodeURIComponent(a.audioUrl)}" type="audio/mpeg"></audio>`
          : `<a href="https://archive.org/details/${a.identifier}" target="_blank" class="archive-link">Listen on archive.org →</a>`}
      </div>`).join('');
    fillSlot('g-archive-audio','🔊','Voices & Recordings',html,'Internet Archive (archive.org)');
  } catch {}
}

// ─── GOODIE 8: NEWSPAPERS ────────────────────────────────────────────
async function loadNewspapers(grid, keyword, year) {
  try {
    // Strict date filter — only show papers contemporary with the event
    // (within 3 years before or 5 years after)
    const startYear = Math.max(year - 3, 1770);
    const endYear   = Math.min(year + 5, 1963);
    const data = await fetch(`https://www.loc.gov/collections/chronicling-america/?andtext=${encodeURIComponent(keyword)}&start_date=${startYear}-01-01&end_date=${endYear}-12-31&fo=json`).then(r=>r.json());
    const results = data.results||[];
    if (!results.length) return;
    const html = results.slice(0,4).map(r=>`
      <div class="newspaper-item">
        ${r.image_url?.[0]?`
          <a href="${r.url||'#'}" target="_blank" class="newspaper-page-link">
            <img src="${r.image_url[0]}" class="newspaper-thumb" alt="Newspaper page"
              onerror="this.style.display='none'" loading="lazy"/>
            <div class="newspaper-zoom">🔍 Click to read full page</div>
          </a>`:''}
        <div class="newspaper-title"><a href="${r.url||'#'}" target="_blank">${(r.title||'').substring(0,80)}</a></div>
        <div class="newspaper-meta">${r.date||''} · ${r.partof?.[0]||'Chronicling America'}</div>
        ${r.description?.[0]?`<div class="newspaper-snippet">${r.description[0].substring(0,160)}…</div>`:''}
      </div>`).join('');
    fillSlot('g-newspapers','📰','Historic Newspapers',html,'Chronicling America · Library of Congress · 1770–1963');
  } catch {}
}

// ─── GOODIE 9: PRIMARY SOURCES ───────────────────────────────────────
async function loadPrimarySources(grid, keyword, year, people=[]) {
  // For old events, search by figure names — much more accurate than event keyword
  // "Roger II" → real primary sources; "Battle of Nocera" → generic battle books
  const primaryQueries = people.length
    ? [...people.slice(0,2), ...keyword.split(' ').slice(0,2)]
    : keyword.split(' ').slice(0,3);
  const queries = [...new Set(primaryQueries)].slice(0,3);

  const books = [];
  const seen  = new Set();

  for (const q of queries) {
    try {
      const data = await fetch(`https://gutendex.com/books/?search=${encodeURIComponent(q)}`).then(r=>r.json());
      (data.results||[]).filter(b=>{
        // Require the search term to appear in the TITLE, not just author name
        const title = (b.title||'').toLowerCase();
        const qwords = q.toLowerCase().split(' ').filter(w=>w.length>4);
        return qwords.some(w => title.includes(w));
      }).forEach(b=>{
        if(seen.has(b.id)) return; seen.add(b.id);
        books.push({
          id:b.id, title:b.title,
          author:b.authors?.[0]?.name||'Unknown',
          url:`https://gutenberg.org/ebooks/${b.id}`,
          formats: b.formats
        });
      });
    } catch {}
  }

  // Also check Internet Archive texts
  try {
    const data = await fetch(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(keyword)}+mediatype:texts+date:[${year-100}+TO+${year+100}]&fl[]=identifier,title,creator&sort[]=downloads+desc&rows=4&output=json`).then(r=>r.json());
    (data.response?.docs||[]).forEach(b=>{
      books.push({ title:b.title, author:b.creator||'Unknown',
                   url:`https://archive.org/details/${b.identifier}`,
                   source:'Internet Archive' });
    });
  } catch {}

  if (!books.length) return;

  const html = books.slice(0,6).map(b=>`
    <div class="book-item">
      <div class="book-spine" style="background:#8B4513"></div>
      <div style="flex:1">
        <div class="book-title"><a href="${b.url}" target="_blank">${b.title}</a></div>
        <div class="book-author">${b.author}</div>
        <span class="book-type">${b.source||'Project Gutenberg'} · Free to Read</span>
        <a href="${b.url}" target="_blank" class="archive-link" style="font-size:11px;margin-top:4px;display:inline-block">📖 Read free →</a>
      </div>
    </div>`).join('');
  fillSlot('g-primary','📜','Primary Sources & Chronicles',html,'Project Gutenberg · Internet Archive');
}

// ─── GOODIE 10: ETYMOLOGY ────────────────────────────────────────────
async function loadEtymology(grid, terms) {
  const entries = await Promise.all(terms.map(async word=>{
    try {
      const data = await fetch(`/api/dictionary/${encodeURIComponent(word)}`).then(r=>r.json());
      if (!Array.isArray(data)||!data[0]||typeof data[0]==='string') return null;
      const entry = data[0];
      const etText = entry.et?.[0]?.[1]?.replace(/\{[^}]+\}/g,'').replace(/\*/g,'').trim();
      if (!etText) return null;
      return { word:entry.hwi?.hw?.replace(/\*/g,'')||word, pos:entry.fl||'',
               etymology:etText, definition:entry.shortdef?.[0]||'' };
    } catch { return null; }
  }));
  const valid = entries.filter(Boolean);
  if (!valid.length) return;
  const html = valid.map(e=>`
    <div class="word-item">
      <div><span class="word-term">${e.word}</span><span class="word-pos">${e.pos}</span></div>
      <div class="word-etymology">⟐ ${e.etymology}</div>
      ${e.definition?`<div class="word-definition">${e.definition}</div>`:''}
    </div>`).join('');
  fillSlot('g-etymology','📜','Words of the Era',html,'Merriam-Webster Collegiate Dictionary');
}

// ─── GOODIE 11: THESAURUS ────────────────────────────────────────────
async function loadThesaurus(grid, word) {
  try {
    const data = await fetch(`/api/thesaurus/${encodeURIComponent(word)}`).then(r=>r.json());
    if (!Array.isArray(data)||!data[0]||typeof data[0]==='string') return;
    const entry = data[0];
    const syns = entry.meta?.syns?.[0]?.slice(0,8)||[];
    const ants = entry.meta?.ants?.[0]?.slice(0,4)||[];
    if (!syns.length) return;
    const html = `
      <div class="word-term">${entry.hwi?.hw?.replace(/\*/g,'')||word}</div>
      <div style="margin-top:8px"><span class="word-pos">Synonyms</span>
        <div class="thes-words">${syns.map(s=>`<span class="thes-word">${s}</span>`).join('')}</div>
      </div>
      ${ants.length?`<div style="margin-top:8px"><span class="word-pos">Antonyms</span>
        <div class="thes-words">${ants.map(s=>`<span class="thes-word antonym">${s}</span>`).join('')}</div>
      </div>`:''}`;
    fillSlot('g-thesaurus','🔤','Period Thesaurus',html,'Merriam-Webster Thesaurus');
  } catch {}
}

// ─── GOODIE 12: LIFE & SOCIETY ───────────────────────────────────────
// Pull Wikipedia articles on the key places/regions for social context
async function loadLifeAndSociety(grid, keyword, year, fullText, curatedPeopleNames=[]) {
  // Build a set of context queries — things worth knowing about the world of this event
  // Use Wikipedia search (not direct title lookup) so we find real articles, not 404s
  const contextItems = [];

  // 1. Kingdom / Duchy / region — extract multi-word proper nouns that are places
  //    Pattern: "Kingdom of X", "Duchy of X", "County of X", "City of X", "Republic of X"
  const regionPat = /(Kingdom|Duchy|County|Principality|Republic|Empire|City|Emirate|Caliphate|Sultanate)\s+of\s+([A-Z][a-zA-Z\s]{2,20}?)(?=[,\.\s])/g;
  let m;
  while ((m = regionPat.exec(fullText)) !== null) {
    const region = `${m[1]} of ${m[2].trim()}`;
    if (!contextItems.find(c => c.query === region)) {
      contextItems.push({ label: region, query: region, type: 'place' });
      if (contextItems.length >= 2) break;
    }
  }

  // 2. If we have curated people, add social-context queries for their kingdoms/eras
  //    e.g. "Norman Sicily" for Roger II, "Medieval Capua" for Robert II of Capua
  if (contextItems.length < 2 && curatedPeopleNames.length) {
    // Build era-aware regional context queries
    const eraWord = year < 500 ? 'Ancient' : year < 1000 ? 'Early Medieval'
      : year < 1400 ? 'Medieval' : year < 1600 ? 'Renaissance' : '';
    // Extract the main geographic noun from keyword
    const geoWord = keyword.split(/\s+/).find(w =>
      w.length > 4 && /^[A-Z]/.test(w) &&
      !['Battle','War','Treaty','Siege','Death','Birth','Fall','Rise'].includes(w)
    );
    if (geoWord && eraWord) {
      contextItems.push({ label: `${eraWord} ${geoWord}`, query: `${eraWord} ${geoWord}`, type: 'context' });
    }
  }

  // 3. Fallback — use the event keyword itself searched via Wikipedia
  if (!contextItems.length) {
    contextItems.push({ label: keyword.split(' ').slice(0,3).join(' '), query: keyword, type: 'context' });
  }

  // Fetch Wikipedia summaries using SEARCH not direct title — avoids 404s
  const summaries = await Promise.all(contextItems.slice(0,2).map(async item => {
    try {
      // Search Wikipedia for best matching article
      const searchRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(item.query)}&srlimit=1&format=json&origin=*`
      ).then(r => r.json());

      const topResult = searchRes.query?.search?.[0];
      if (!topResult) return null;

      // Fetch summary for the actual article found
      const encoded = encodeURIComponent(topResult.title.replace(/ /g,'_'));
      const data = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
        { headers: { 'User-Agent': 'PableHistoryApp/3.0 (educational; robpoole24@gmail.com)' } }
      ).then(r => r.json());

      if (!data.extract || data.type === 'disambiguation') return null;

      // Sanity check — make sure the result is actually relevant
      // (search sometimes returns unrelated articles)
      const queryWords = item.query.toLowerCase().split(' ').filter(w => w.length > 3);
      const titleLower = data.title.toLowerCase();
      const relevant   = queryWords.some(w => titleLower.includes(w));
      if (!relevant) return null;

      return {
        label:     item.label,
        title:     data.title,
        extract:   data.extract.substring(0, 450),
        url:       data.content_urls?.desktop?.page,
        thumbnail: data.thumbnail?.source
      };
    } catch { return null; }
  }));

  const valid = summaries.filter(Boolean);
  if (!valid.length) return;

  const html = `
    <p class="goodie-context">The world behind this event — kingdoms, territories, and context.</p>
    ${valid.map(s => `
      <div class="society-item">
        ${s.thumbnail ? `<img src="${s.thumbnail}" class="society-thumb" onerror="this.style.display='none'" loading="lazy"/>` : ''}
        <div class="society-name">${s.title}</div>
        <div class="society-extract">${s.extract}</div>
        ${s.url ? `<a href="${s.url}" target="_blank" class="archive-link">Read more →</a>` : ''}
      </div>`).join('')}`;
  fillSlot('g-life', '🏘️', 'Life & Society', html, 'Wikipedia');
}

// ─── GOODIE 13: MUSIC ────────────────────────────────────────────────
async function loadMusic(grid, year, keyword) {
  const epoch = musicEpoch(year);

  // For early modern era (colonial/revolutionary), also search for fife and drum music
  const isColonialEra = year >= 1700 && year <= 1820;

  if (epoch) {
    // For colonial era, try fife and drum first via Archive
    if (isColonialEra) {
      try {
        const archiveData = await fetch(`https://archive.org/advancedsearch.php?q=(fife+drum+OR+"colonial+music"+OR+"revolutionary+war+music")+mediatype:audio&fl[]=identifier,title&sort[]=downloads+desc&rows=4&output=json`).then(r=>r.json());
        const colonialItems = archiveData.response?.docs || [];
        if (colonialItems.length) {
          const colonialAudio = await Promise.all(colonialItems.slice(0,3).map(async item=>{
            const meta = await fetch(`https://archive.org/metadata/${item.identifier}`).then(r=>r.json()).catch(()=>({files:[]}));
            const file = (meta.files||[]).find(f=>/\.mp3$/i.test(f.name));
            return file ? { title: item.title, identifier: item.identifier,
              audioUrl: `https://archive.org/download/${item.identifier}/${encodeURIComponent(file.name)}` } : null;
          }));
          const validColonial = colonialAudio.filter(Boolean);
          if (validColonial.length) {
            const html = validColonial.map(a=>`
              <div class="music-item">
                <div class="music-icon">🥁</div>
                <div style="flex:1">
                  <div class="music-title">${(a.title||'').substring(0,70)}</div>
                  <div class="music-composer">Colonial / Revolutionary Era</div>
                  <audio controls preload="metadata" style="width:100%;margin-top:4px">
                    <source src="/api/audio/proxy?url=${encodeURIComponent(a.audioUrl)}" type="audio/mpeg">
                  </audio>
                </div>
              </div>`).join('');
            fillSlot('g-music', '🥁', 'Music of the Colonial Era', html, 'Internet Archive');
            // Still continue to load classical composers below
          }
        }
      } catch {}
    }

    try {
      const data = await fetch(`https://api.openopus.org/composer/list/epoch/${epoch}.json`).then(r=>r.json());
      const allComposers = (data.composers||[]).filter(c=>{
        const born=parseInt(c.birth), died=parseInt(c.death)||9999;
        return born<=year+100 && died>=year-100;
      });
      if (!allComposers.length) return;

      // Shuffle to avoid always showing the same composers
      const shuffled = allComposers.sort(() => Math.random() - 0.5).slice(0, 8);
      // We'll try up to 8 and keep first 4 that have working audio
      const composers = shuffled;

      const withAudio = await Promise.all(composers.map(async c=>{
        try {
          const q  = encodeURIComponent(c.complete_name);
          const ar = await fetch(`https://archive.org/advancedsearch.php?q=${q}+mediatype:audio&fl[]=identifier,title&sort[]=downloads+desc&rows=4&output=json`).then(r=>r.json());
          // Try multiple items to find one with a real MP3
          for (const item of (ar.response?.docs||[])) {
            const meta = await fetch(`https://archive.org/metadata/${item.identifier}`).then(r=>r.json());
            const file = (meta.files||[]).find(f=>/\.mp3$/i.test(f.name) && f.name);
            if (file) {
              return { ...c,
                audioUrl: `https://archive.org/download/${item.identifier}/${encodeURIComponent(file.name)}`,
                audioTitle: item.title||null,
                archiveId: item.identifier
              };
            }
          }
          return {...c, audioUrl:null};
        } catch { return {...c,audioUrl:null}; }
      }));

      // Filter to composers with working audio, fall back to archive link, show max 4
      const validComposers = withAudio.filter(c => c).slice(0, 4);
      const html = validComposers.map(c=>`
        <div class="music-item">
          ${c.portrait?`<img src="${c.portrait}" class="composer-portrait" onerror="this.style.display='none'"/>`:'<div class="music-icon">♪</div>'}
          <div style="flex:1">
            <div class="music-title">${c.complete_name}</div>
            <div class="music-composer">${epoch} · ${c.birth?.substring(0,4)||'?'}–${c.death?.substring(0,4)||'present'}</div>
            ${c.audioUrl && c.audioUrl.endsWith('.mp3')
              ? `<div class="audio-label">${(c.audioTitle||'').substring(0,60)}</div>
                 <audio controls preload="metadata" style="width:100%;margin-top:4px"
                   onloadedmetadata="if(this.duration===0||isNaN(this.duration)){this.style.display='none';this.nextElementSibling.style.display='block'}"
                   ><source src="/api/audio/proxy?url=${encodeURIComponent(c.audioUrl)}" type="audio/mpeg"></audio>
                 <a href="${c.archiveId?'https://archive.org/details/'+c.archiveId:'#'}" target="_blank" class="archive-link" style="display:none">Listen on archive.org →</a>`
              : c.archiveId
                ? `<a href="https://archive.org/details/${c.archiveId}" target="_blank" class="archive-link">Listen on archive.org →</a>`
                : `<div class="music-note">Search IMSLP.org for free scores</div>`}
          </div>
        </div>`).join('');
      fillSlot('g-music','🎵',`Music of the ${epoch}`,html,'Open Opus · Internet Archive · IMSLP');
    } catch {}
  } else {
    // Post-1910 — MusicBrainz
    try {
      const data = await fetch(`https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(keyword)}&limit=4&fmt=json`,
        {headers:{'User-Agent':'PableHistoryApp/3.0 (educational; robpoole24@gmail.com)'}}).then(r=>r.json());
      const recs = data.recordings||[];
      if (!recs.length) return;
      const html = recs.map(r=>`
        <div class="music-item">
          <div class="music-icon">♪</div>
          <div style="flex:1">
            <div class="music-title">${r.title}</div>
            <div class="music-composer">${r['artist-credit']?.[0]?.artist?.name||'Various'}</div>
          </div>
        </div>`).join('');
      fillSlot('g-music','🎵','Music',html,'MusicBrainz');
    } catch {}
  }
}

// ─── GOODIE 14: BOOKS ────────────────────────────────────────────────
async function loadBooks(grid, keyword, eventTitle, people=[], year=0, curatedBooks=[]) {
  const books = [], seen = new Set();

  // 0. Curated books — specific known works for this event (always shown first)
  if (curatedBooks?.length) {
    curatedBooks.forEach(b => {
      seen.add(b.title?.toLowerCase());
      books.push({ ...b, source: 'Curated' });
    });
  }

  // Build targeted queries using figure names for old events
  // This prevents "Battle of X" returning generic "battle" books
  const isAncient = parseInt(year) < 1800;
  const bookQueries = isAncient && people.length
    ? [...people.slice(0,2), ...keyword.split(' ').slice(0,2)]
    : [keyword, ...people.slice(0,1)];
  const queries = [...new Set(bookQueries)].filter(Boolean);

  for (const q of queries) {
    // Open Library
    try {
      const data = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=6&fields=key,title,author_name,first_publish_year,cover_i,subject`).then(r=>r.json());
      (data.docs||[]).filter(b=>{
        const t=(b.title||'').toLowerCase();
        const qwords = q.toLowerCase().split(' ').filter(w=>w.length>4);
        // Must match in the actual title — subject tag matching caused false positives
        return qwords.some(w => t.includes(w));
      }).slice(0,3).forEach(b=>{
        const key=b.title?.toLowerCase(); if(seen.has(key)) return; seen.add(key);
        books.push({ title:b.title, author:b.author_name?.[0]||'Unknown', year:b.first_publish_year,
          coverUrl:b.cover_i?`https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg`:null,
          url:b.key?`https://openlibrary.org${b.key}`:null, source:'Open Library' });
      });
    } catch {}

    // Google Books
    try {
      const data = await fetch(`/api/books?q=${encodeURIComponent(q)}&maxResults=4`).then(r=>r.json());
      (data.items||[]).forEach(item=>{
        const vol=item.volumeInfo, t=(vol.title||'').toLowerCase();
        const qwords = q.toLowerCase().split(' ').filter(w=>w.length>3);
        if (!qwords.some(w => t.includes(w) || (vol.description||'').toLowerCase().includes(w))) return;
        const key=t; if(seen.has(key)) return; seen.add(key);
        books.push({ title:vol.title, author:vol.authors?.[0]||'Unknown',
          year:vol.publishedDate?.substring(0,4),
          coverUrl:toHttps(vol.imageLinks?.thumbnail)||null, url:vol.infoLink||null,
          source:'Google Books' });
      });
    } catch {}

    if (books.length >= 8) break;
  }

  if (!books.length) return;
  const colors = ['#8B4513','#4A3728','#2C1A0E','#A07840','#6B3A2A','#3D2B1A'];
  const html = books.slice(0,8).map((b,i)=>`
    <div class="book-item">
      <div class="book-cover">
        ${b.coverUrl
          ? `<img src="${b.coverUrl}" alt="${b.title}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\'book-cover-placeholder\' style=\'background:${colors[i%colors.length]}\'></div>'">`
          : `<div class="book-cover-placeholder" style="background:${colors[i%colors.length]}"></div>`}
      </div>
      <div style="flex:1">
        <div class="book-title">${b.url?`<a href="${b.url}" target="_blank">${b.title}</a>`:b.title}</div>
        ${b.url && (b.source==='Project Gutenberg'||b.source==='Open Library'||b.source==='Curated')
          ? `<a href="${b.url}" target="_blank" class="archive-link" style="font-size:11px">📖 Read free →</a>` : ''}
        <div class="book-author">${b.author}${b.year?` · ${b.year}`:''}</div>
        <div class="book-note" style="font-size:10px;opacity:0.6;margin-top:2px">${b.source}</div>
      </div>
    </div>`).join('');
  fillSlot('g-books','📚','Reading List',html,'Open Library · Google Books');
}

// ─── GOODIE 15: INFLATION ────────────────────────────────────────────
async function loadInflation(grid, mention, year) {
  if (year < 1913) {
    const anchors = {1:0.02,500:0.12,1000:0.20,1200:0.25,1400:0.28,1500:0.38,
      1600:0.55,1650:0.72,1700:0.85,1750:1.0,1770:1.12,1780:1.45,
      1800:1.60,1830:1.40,1850:1.50,1865:2.20,1880:1.45,1900:1.60,1910:1.80};
    const ys=Object.keys(anchors).map(Number).sort((a,b)=>a-b);
    const nearest=ys.reduce((p,c)=>Math.abs(c-year)<Math.abs(p-year)?c:p);
    const mult=Math.round(314/anchors[nearest]);
    fillSlot('g-inflation','💰','What It Cost — Then & Now',`
      <div class="money-display">
        <div class="money-mention">"${mention}"</div>
        <div class="money-original">as mentioned · ${year}</div>
        <div class="money-arrow">↓</div>
        <div class="money-modern">≈ ×${mult.toLocaleString()} in today's dollars</div>
        <div class="money-note">Historical price research anchors · pre-FRED era</div>
      </div>`,'Historical CPI anchors · BLS / MeasuringWorth research');
    return;
  }
  try {
    if (!cpiCache) {
      const data = await fetch('/api/fred/cpi').then(r=>r.json());
      cpiCache = data.observations||[];
    }
    const ev=cpiCache.find(o=>o.date.startsWith(String(year)));
    const mod=cpiCache[cpiCache.length-1];
    if (!ev||!mod||ev.value==='.'||mod.value==='.') return;
    const mult=(parseFloat(mod.value)/parseFloat(ev.value)).toFixed(1);
    fillSlot('g-inflation','💰','What It Cost — Then & Now',`
      <div class="money-display">
        <div class="money-mention">"${mention}"</div>
        <div class="money-original">as mentioned · ${year}</div>
        <div class="money-arrow">↓</div>
        <div class="money-modern">≈ ×${mult} in ${mod.date.substring(0,4)}</div>
        <div class="money-note">FRED CPIAUCSL Series · St. Louis Fed</div>
      </div>`,'Federal Reserve Bank of St. Louis · FRED');
  } catch {}
}

// ─── GOODIE 16: MAP ──────────────────────────────────────────────────
async function loadMap(grid, coords, keyword, year, infoboxMapUrl=null) {
  const lat=coords.lat, lon=coords.lon;
  const mapId=`map-${Date.now()}`;
  const card = goodieCard('🗺','Place on the Map',`
    ${infoboxMapUrl ? `
      <div style="margin-bottom:12px">
        <img src="${infoboxMapUrl}" style="width:100%;border-radius:2px;border:1px solid var(--gold)" alt="Historical map" loading="lazy"/>
        <div class="infobox-map-caption">Historical map · Wikipedia</div>
      </div>` : ''}
    <div id="${mapId}" style="height:260px;border-radius:2px;border:1px solid var(--gold)"></div>
    <div style="margin-top:8px;display:flex;gap:12px;flex-wrap:wrap">
      <a href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}&zoom=8" target="_blank" class="archive-link">OpenStreetMap →</a>
      <a href="https://www.davidrumsey.com/luna/servlet/view/search?q=${encodeURIComponent(keyword)}" target="_blank" class="archive-link">Historical Maps (Rumsey) →</a>
    </div>
  `,'OpenStreetMap · Leaflet.js · David Rumsey Historical Maps · Wikipedia');
  grid.appendChild(card);
  await Promise.all([
    loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'),
    loadCSS('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css')
  ]);
  setTimeout(()=>{
    try {
      const map=L.map(mapId,{scrollWheelZoom:false}).setView([lat,lon],7);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {attribution:'© OpenStreetMap',maxZoom:19}).addTo(map);
      L.marker([lat,lon]).addTo(map).bindPopup(`<b>${keyword}</b><br>${year}`).openPopup();
    } catch(e){console.error('Leaflet:',e);}
  },150);
}

// ─── GOODIE 17: NASA ─────────────────────────────────────────────────
async function loadNASA(grid, keyword, year) {
  try {
    const data = await fetch(`https://images-api.nasa.gov/search?q=${encodeURIComponent(keyword)}&media_type=image&page_size=4`).then(r=>r.json());
    const items=(data.collection?.items||[]).filter(i=>i.links?.[0]?.href).slice(0,4);
    if (!items.length) return;
    const html=`<div class="images-grid">${items.map(i=>`
      <div class="image-item">
        <img src="${i.links[0].href}" loading="lazy" onerror="this.closest('.image-item').style.display='none'"/>
        <div class="image-caption">${(i.data?.[0]?.title||'NASA').substring(0,60)}</div>
      </div>`).join('')}</div>`;
    fillSlot('g-nasa','🚀','NASA Imagery',html,'NASA Image and Video Library · nasa.gov');
  } catch {}
}

// ═══════════════════════════════════════════════════════════════════════
// ABOUT SECTION
// ═══════════════════════════════════════════════════════════════════════
function showAbout(pushHistory = true) {
  if (pushHistory) pushState('about');
  currentView = 'about';
  const content = document.getElementById('main-content');
  content.innerHTML = `
    <div class="about-container">
      <button class="back-btn" onclick="history.back()">← Back to Events</button>

      <!-- Tab bar -->
      <div class="about-tabs">
        <button class="about-tab active" id="tab-pable" onclick="switchAboutTab('pable')">Mr. Pable</button>
        <button class="about-tab" id="tab-app" onclick="switchAboutTab('app')">About the App</button>
      </div>

      <!-- MR. PABLE TAB -->
      <div id="about-pable" class="about-panel">
        <div class="pable-tribute">
          <div class="tribute-photo-wrap">
            <img src="mrpable.webp" alt="William John Pable Jr." class="tribute-photo"
              onerror="this.parentElement.innerHTML='<div class=\'tribute-photo-placeholder\'>W.P.</div>'"/>
          </div>
          <div class="tribute-name">William (Bill) John Pable, Jr.</div>
          <div class="tribute-dates">September 8, 1940 — October 8, 2025</div>
          <div class="tribute-titles">
            Senior Chief Petty Officer, U.S. Navy · U.S. Navy Reserve (20+ years)<br>
            8th Grade U.S. History & Social Studies · Webster Stanley Middle School, Oshkosh<br>
            30 years in the classroom · Assistant Principal
          </div>
        </div>

        <div class="tribute-bio">
          <p>Bill Pable was born in Oshkosh, Wisconsin and never really left — not because he had to stay, but because he chose to pour himself into it. He graduated from the University of Wisconsin–Oshkosh with a degree in Elementary Education, earned his Masters from UW–Madison, served his country as a Navy Senior Chief Petty Officer, and then spent thirty years doing what he was built for: teaching.</p>

          <p>His 8th grade U.S. History classroom at Webster Stanley Middle School was not a passive place. He brought Colonial America alive with records, coins, battleground maps, period music, and a stack of assignments he called "Goodies" — thirty pages of immersive work due in three weeks. Overwhelming for some. A challenge the rest of us still remember.</p>

          <p>Outside the classroom, Bill was an avid golfer, an organist and pianist, a fisherman, a Packers fan, and a piano tuner throughout Northeast Wisconsin in retirement. He and his wife Joan — "the neighbor girl" he married in 1968 and kept for 57 years — loved traveling to Europe and Australia, and spent winters as snowbirds in Fort Myers, Florida.</p>

          <p>He passed away on October 8, 2025, after a long illness. He was 85.</p>

          <p>This app is dedicated to him. Pable's Goodies lives on.</p>
        </div>

        <a href="https://www.thenorthwestern.com/obituaries/pwix1300874" target="_blank" class="tribute-obit-link">
          Read his obituary in The Northwestern →
        </a>

        <!-- Paul Harvey section -->
        <div class="harvey-section">
          <div class="harvey-header">
            <div class="harvey-icon">📻</div>
            <div>
              <div class="harvey-title">And Now — The Rest of the Story</div>
              <div class="harvey-sub">Paul Harvey · A classroom favorite of Mr. Pable's</div>
            </div>
          </div>
          <div class="harvey-bio">
            <p>For decades, Paul Harvey's radio broadcasts reached 24 million listeners a day on more than 1,200 stations. His signature segment — <em>The Rest of the Story</em> — told the hidden backstory behind famous names and events, always ending with the reveal of who you'd been listening to all along.</p>
            <p>Mr. Pable played Harvey's segments in his classroom. If you've ever heard that voice — that cadence, those deliberate pauses — you understand why a history teacher loved it. Harvey had a gift for making history feel personal, surprising, and just a little miraculous.</p>
            <p>Harvey described himself as an independent, but his worldview leaned conservative — a conservatism of an earlier era, rooted in patriotism and plain-spoken values, before the word came to mean something different. Mr. Pable shared that sensibility. They both believed in the dignity of the American story, earnestly told.</p>
          </div>
          <a href="https://www.youtube.com/watch?v=QiOuE5yeJV0&list=PL1g6RlLtWFQAOdz-jIX0dKhJWhu_4bAcb"
            target="_blank" class="harvey-playlist-btn">
            🎙 Listen to Paul Harvey's The Rest of the Story →
          </a>
        </div>
      </div>

      <!-- APP TAB -->
      <div id="about-app" class="about-panel" style="display:none">
        <div class="app-about-section">
          <div class="app-about-logo">
            <img src="pablemainlogo.png" alt="Pable" style="width:160px;height:auto"/>
          </div>
          <h2 class="app-about-title">Pable — The History App Full of Goodies</h2>
          <p class="app-about-body">Pable is a free, ad-free history app that presents each day's most historically significant events across all of human history — from ancient Rome to the Space Age — with an immersive set of primary sources, images, video, music, books, maps, and archival materials we call Pable's Goodies.</p>

          <h3 class="app-about-subhead">Privacy & Data</h3>
          <p class="app-about-body">Pable collects no personal data, requires no account, displays no advertisements, and does not track your usage. Events are cached server-side and served to all users identically. No user data is stored, transmitted, or sold. Ever.</p>

          <h3 class="app-about-subhead">Data Sources</h3>
          <p class="app-about-body">Pable aggregates publicly available data from Wikipedia, the Digital Public Library of America, the Smithsonian Institution, Europeana, NASA, the Library of Congress (Chronicling America), Internet Archive, YouTube, Open Library, Project Gutenberg, MusicBrainz, Open Opus, OCRE, Numista, the St. Louis Fed FRED database, and Merriam-Webster. All content remains the property of its respective sources.</p>

          <h3 class="app-about-subhead">Contact</h3>
          <p class="app-about-body">
            Pable is a product of Altruistic Apps.<br>
            <a href="mailto:contactaltruisticapps@gmail.com" class="archive-link">contactaltruisticapps@gmail.com</a><br>
            <a href="https://www.altruisticapps.com" target="_blank" class="archive-link">altruisticapps.com →</a>
          </p>

          <h3 class="app-about-subhead">Terms of Service</h3>
          <p class="app-about-body">Pable is provided as-is for educational and personal use. Content is sourced from public APIs and is subject to the terms of each respective data provider. Altruistic Apps makes no warranties regarding the accuracy or completeness of third-party content.</p>
        </div>
      </div>
    </div>
  `;
}

function switchAboutTab(tab) {
  document.getElementById('about-pable').style.display = tab==='pable' ? 'block' : 'none';
  document.getElementById('about-app').style.display   = tab==='app'   ? 'block' : 'none';
  document.getElementById('tab-pable').classList.toggle('active', tab==='pable');
  document.getElementById('tab-app').classList.toggle('active',   tab==='app');
}

// ─── GOODIE 18: GDELT BROADCAST NEWS ─────────────────────────────────
// TV news clips from CNN, NBC, BBC, PBS etc — post-2009 events only
async function loadGDELT(grid, queries) {
  try {
    // Try each query variant until we get results
    for (const q of queries.slice(0, 3)) {
      const data = await fetch(`/api/gdelt/tv?q=${encodeURIComponent(q)}&maxrecords=5`).then(r=>r.json());
      const clips = data.clips || data.items || [];
      if (!clips.length) continue;

      const html = clips.slice(0, 5).map(c => `
        <a href="${c.url || c.previewUrl || '#'}" target="_blank" class="video-item">
          ${c.preview_url || c.thumbnail
            ? `<img class="video-thumb-img" src="${toHttps(c.preview_url || c.thumbnail)}" alt="" onerror="this.style.display='none'"/>`
            : '<div class="video-thumb-placeholder">📺</div>'}
          <div>
            <div class="video-title">${(c.show || c.title || 'News Clip').substring(0,80)}</div>
            <div class="video-channel">${c.station || c.network || 'Broadcast News'}</div>
            <div class="video-source">GDELT · Internet Archive TV Archive</div>
          </div>
        </a>`).join('');
      fillSlot('g-gdelt', '📡', 'Broadcast News Coverage', html, 'GDELT Project · TV News Archive (2009–2024)');
      return;
    }
  } catch {}
}

// ─── GOODIE 19: THE GUARDIAN ─────────────────────────────────────────
async function loadGuardian(grid, queries) {
  try {
    for (const q of queries.slice(0, 3)) {
      // Try video content first, then general articles
      for (const tag of ['type/video', '']) {
        const params = new URLSearchParams({ q, pageSize: 5, ...(tag ? { tag } : {}) });
        const data = await fetch(`/api/guardian?${params}`).then(r=>r.json());
        const results = data.response?.results || [];
        if (!results.length) continue;

        const html = results.map(r => `
          <div class="newspaper-item">
            ${r.fields?.thumbnail
              ? `<a href="${r.webUrl}" target="_blank">
                  <img src="${toHttps(r.fields.thumbnail)}" class="newspaper-thumb" style="height:80px;object-fit:cover" onerror="this.style.display='none'" loading="lazy"/>
                </a>`
              : ''}
            <div class="newspaper-title"><a href="${r.webUrl}" target="_blank">${r.fields?.headline || r.webTitle}</a></div>
            <div class="newspaper-meta">${r.webPublicationDate?.substring(0,10) || ''} · The Guardian</div>
            ${r.fields?.trailText ? `<div class="newspaper-snippet">${r.fields.trailText.replace(/<[^>]+>/g,'').substring(0,120)}…</div>` : ''}
          </div>`).join('');
        fillSlot('g-guardian', '📰', 'The Guardian', html, 'The Guardian Open Platform');
        return;
      }
    }
  } catch {}
}

// ─── GOODIE 20: NEWSDATA.IO ───────────────────────────────────────────
async function loadNewsData(grid, queries) {
  try {
    for (const q of queries.slice(0, 2)) {
      const data = await fetch(`/api/newsdata?q=${encodeURIComponent(q)}`).then(r=>r.json());
      const articles = (data.results || []).filter(a => a.title && a.link);
      if (!articles.length) continue;

      // Separate video articles from text
      const videoArticles = articles.filter(a => a.video_url);
      const textArticles  = articles.filter(a => !a.video_url).slice(0, 4);
      const display = [...videoArticles.slice(0, 2), ...textArticles].slice(0, 5);

      const html = display.map(a => `
        <div class="newspaper-item">
          ${a.image_url ? `<img src="${toHttps(a.image_url)}" class="newspaper-thumb" style="height:70px;object-fit:cover;margin-bottom:6px" onerror="this.style.display='none'" loading="lazy"/>` : ''}
          <div class="newspaper-title">
            <a href="${a.video_url || a.link}" target="_blank">
              ${a.video_url ? '▶ ' : ''}${(a.title || '').substring(0,90)}
            </a>
          </div>
          <div class="newspaper-meta">${a.pubDate?.substring(0,10) || ''} · ${a.source_id || 'NewsData'}</div>
          ${a.description ? `<div class="newspaper-snippet">${a.description.substring(0,120)}…</div>` : ''}
        </div>`).join('');
      fillSlot('g-newsdata', '🗞️', 'News Coverage', html, 'NewsData.io');
      return;
    }
  } catch {}
}

// ─── GOODIE 21: INTERNET ARCHIVE TEXTS & MAGAZINE RACK ───────────────
// Searches print media — magazines (NatGeo, Life, Time), books, pamphlets
async function loadArchiveTexts(grid, queries, year) {
  try {
    for (const q of queries.slice(0, 3)) {
      // Search Magazine Rack first for richer publications
      const [magData, textData] = await Promise.allSettled([
        fetch(`/api/archive/texts?q=${encodeURIComponent(q)}&collection=magazine_rack&rows=4`).then(r=>r.json()),
        fetch(`/api/archive/texts?q=${encodeURIComponent(q)}&rows=4`).then(r=>r.json()),
      ]);

      const mags  = magData.status  === 'fulfilled' ? magData.value.response?.docs  || [] : [];
      const texts = textData.status === 'fulfilled' ? textData.value.response?.docs || [] : [];

      // Merge, deduplicate, prefer magazines
      const seen = new Set();
      const items = [];
      for (const item of [...mags, ...texts]) {
        if (!seen.has(item.identifier) && item.title) {
          seen.add(item.identifier);
          items.push(item);
        }
      }
      if (!items.length) continue;

      const html = items.slice(0, 6).map(item => `
        <div class="book-item">
          <div class="book-cover">
            <a href="https://archive.org/details/${item.identifier}" target="_blank">
              <img src="https://archive.org/services/img/${item.identifier}"
                style="width:48px;height:64px;object-fit:cover;border:1px solid var(--gold)"
                onerror="this.parentElement.innerHTML='<div class=\'book-cover-placeholder\' style=\'background:var(--brown)\'></div>'"
                loading="lazy"/>
            </a>
          </div>
          <div style="flex:1">
            <div class="book-title">
              <a href="https://archive.org/details/${item.identifier}" target="_blank">
                ${(item.title || 'Untitled').substring(0,80)}
              </a>
            </div>
            <div class="book-author">${(item.creator || '').substring(0,50)}${item.date ? ' · ' + item.date.substring(0,4) : ''}</div>
            <span class="book-type">Internet Archive · Free to Read</span>
          </div>
        </div>`).join('');

      const hasMags = mags.length > 0;
      fillSlot('g-texts', '📖', hasMags ? 'Magazines & Print Media' : 'Historical Texts & Documents', html,
        'Internet Archive · ' + (hasMags ? 'Magazine Rack · ' : '') + 'Open Library');
      return;
    }
  } catch {}
}
