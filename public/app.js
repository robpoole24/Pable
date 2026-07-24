/* ═══════════════════════════════════════════════════════════════════════════
   PABLE v2 — Frontend
   
   20 daily events, weighted by historical significance & era diversity.
   Each event has up to 20 Goodies, shown only when content is found.
   Keyed APIs → /api/* proxy. Keyless → direct browser calls.
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── State ────────────────────────────────────────────────────────────────
let todayEvents   = [];
let selectedEvent = null;
let sealBroken    = false;
let cpiCache      = null;

// ─── Constants ────────────────────────────────────────────────────────────
const ARCHAIC_WORDS = new Set([
  'henceforth','whereupon','hitherto','thereof','whereby','herein',
  'forthwith','thenceforth','henceforward','whence','thither','hither',
  'methinks','perchance','forsooth','prithee','haply','mayhaps',
  'sennight','fortnight','league','furlong','farthing','groat',
  'musket','arquebus','trebuchet','ballista','catapult','phalanx',
  'centurion','praetor','consul','tribune','legate','prefect',
  'serf','vassal','liege','fealty','suzerainty','fiefdom',
  'redcoat','minuteman','dragoon','hussar','cuirassier','pikeman',
  'galleon','brigantine','frigate','carrack','privateer','corsair',
  'apotheosis','hegemony','satrap','vizier','caliph','emir',
  'inquisition','heresy','crusade','indulgence','schism','papal',
  'plague','pestilence','pox','miasma','humour','phlebotomy',
  'alchemy','astrolabe','armillary','quadrant','sextant',
  'parchment','vellum','illuminated','codex','papyrus','manuscript'
]);

const STOP_WORDS = new Set([
  'about','after','again','against','along','already','also','although',
  'always','among','another','around','became','because','been','before',
  'being','between','both','comes','could','during','each','either',
  'enough','every','first','following','found','from','give','given',
  'goes','going','having','however','include','including','into',
  'known','large','later','least','less','like','made','make','many',
  'more','most','much','must','near','never','next','none','north',
  'noted','often','once','only','onto','other','over','part','place',
  'same','several','since','small','some','south','still','such',
  'than','that','their','them','then','there','these','they','this',
  'those','through','time','under','until','upon','used','very',
  'want','were','what','when','where','while','which','will','with',
  'within','would','year','years','your'
]);

// Pre-1800 origin words worth noting etymologically
const ETYMOLOGY_WORTHY = new Set([
  'assassin','algebra','alcohol','admiral','alchemy','almanac',
  'arsenal','artichoke','assassinate','average','checkmate',
  'cipher','coffee','cotton','crimson','elixir','gauze',
  'hazard','magazine','monsoon','muslin','orange','safari',
  'sequin','sherbet','sofa','sugar','syrup','tariff','zenith',
  'berserk','blunder','bylaw','husband','law','outlaw','ransack',
  'skull','slaughter','thrall','window','anger','cake','die',
  'egg','flat','get','give','ill','knife','leg','loan',
  'melee','skirmish','platoon','battalion','colonel','sergeant',
  'lieutenant','captain','general','admiral','navy','cavalry',
  'infantry','militia','garrison','siege','rampart','bastion',
  'castle','manor','guild','charter','parliament','jury','verdict',
  'liberty','republic','democracy','tyranny','empire','senate',
  'consul','dictator','tribune','patrician','plebeian','gladiator'
]);

// ─── Init ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadTodayEvents();
});

function enterApp() {
  const splash = document.getElementById('splash');
  const appEl  = document.getElementById('app');
  splash.classList.add('hidden');
  setTimeout(() => {
    splash.style.display = 'none';
    appEl.style.display  = 'block';
    renderApp();
  }, 500);
}

// ─── RENDER SHELL ─────────────────────────────────────────────────────────
function renderApp() {
  const today     = new Date();
  const monthName = today.toLocaleString('en-US', { month: 'long' });
  const day       = today.getDate();
  const year      = today.getFullYear();

  document.getElementById('app').innerHTML = `
    <div class="pable-root">
      <div class="pable-header">
        <div class="pable-header-eyebrow">A Living History</div>
        <h1 class="pable-wordmark">Pable</h1>
        <div class="pable-header-sub">History as Mr. Pable taught it — deep, demanding, and alive</div>
      </div>
      <div class="pable-date-banner">This Day in History — ${monthName} ${day}, ${year}</div>
      <div id="main-content"></div>
    </div>
  `;
  renderEventList();
}

// ─── LOAD EVENTS ──────────────────────────────────────────────────────────
async function loadTodayEvents() {
  try {
    const res = await fetch('/api/events/today');
    todayEvents = await res.json();
    if (document.getElementById('main-content')) renderEventList();
  } catch (e) {
    console.error('Failed to load events:', e);
  }
}

// ─── EVENT LIST ───────────────────────────────────────────────────────────
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
      Events · Wikipedia On This Day API<br>
      Images · Wikimedia Commons · DPLA · Smithsonian · Europeana · NASA<br>
      Video · YouTube Data API · Internet Archive<br>
      Newspapers · Chronicling America (Library of Congress, 1770–1963)<br>
      Etymology & Thesaurus · Merriam-Webster<br>
      Books · Open Library · Google Books · Project Gutenberg<br>
      Music · Open Opus · MusicBrainz · Internet Archive Audio<br>
      Inflation · FRED CPIAUCSL Series (St. Louis Fed)<br>
      Maps · OpenStreetMap · Leaflet · David Rumsey Historical Maps
    </div>
  `;

  document.querySelectorAll('.event-card').forEach((card, i) => {
    card.addEventListener('click', () => openEvent(todayEvents[i]));
  });
}

function eraLabel(year) {
  const y = parseInt(year) || 0;
  if (y < 500)   return 'Ancient';
  if (y < 1000)  return 'Early Medieval';
  if (y < 1400)  return 'Medieval';
  if (y < 1600)  return 'Renaissance';
  if (y < 1776)  return 'Early Modern';
  if (y < 1900)  return 'Modern';
  if (y < 1950)  return 'Early 20th C.';
  if (y < 2000)  return 'Late 20th C.';
  return 'Contemporary';
}

function eventCardHTML(ev, i) {
  const year    = ev.year || '?';
  const title   = ev.text?.replace(/\[\[.*?\]\]/g, '') || 'Historical Event';
  const extract = ev.pages?.[0]?.extract || '';
  const thumb   = ev.pages?.[0]?.thumbnail?.source || '';
  const era     = eraLabel(year);

  return `
    <div class="event-card" data-index="${i}">
      <div class="event-card-inner">
        ${thumb ? `<img class="event-card-thumb" src="${thumb}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
        <div class="event-card-year font-18c">${year}</div>
        <div class="event-card-era">${era}</div>
        <div class="event-card-title font-18c">${title.substring(0, 120)}</div>
        <div class="event-card-teaser">${extract.substring(0, 180)}${extract.length > 180 ? '…' : ''}</div>
        <div class="event-card-open-hint">Open the Goodies ↓</div>
      </div>
    </div>
  `;
}

// ─── OPEN EVENT ───────────────────────────────────────────────────────────
function openEvent(ev) {
  selectedEvent = ev;
  sealBroken    = false;

  const year    = ev.year || '?';
  const title   = ev.text?.replace(/\[\[.*?\]\]/g, '') || 'Historical Event';
  const extract = ev.pages?.[0]?.extract || '';
  const wikiUrl = ev.pages?.[0]?.content_urls?.desktop?.page || '';
  const popCult = ev.pages?.[0]?.extract_html || '';

  // Find "In popular culture" in wikitext if extract is long enough
  const sections = extract.split(/\n\n+/);
  const leadText = sections.slice(0, 3).join('\n\n');

  document.getElementById('main-content').innerHTML = `
    <div class="event-expanded">
      <div class="event-expanded-header">
        <div class="event-expanded-era">${eraLabel(year)}</div>
        <div class="event-expanded-year font-18c">${year}</div>
        <div class="event-expanded-title font-18c">${title}</div>
      </div>

      <button class="back-btn" id="back-btn">← All Events</button>

      <div class="event-summary">
        <p>${leadText.replace(/\n/g, '</p><p>')}</p>
        ${wikiUrl ? `<a class="wiki-link" href="${wikiUrl}" target="_blank">Full Wikipedia article →</a>` : ''}
      </div>

      <div class="seal-wrapper">
        <svg id="wax-seal" width="90" height="90" viewBox="0 0 90 90" class="seal-svg">
          <circle cx="45" cy="45" r="42" fill="#8B1A1A"/>
          <circle cx="45" cy="45" r="37" fill="none" stroke="#C0392B" stroke-width="1.5"/>
          ${Array.from({length:12},(_,i)=>{
            const r=i*30*Math.PI/180,x1=45+42*Math.cos(r),y1=45+42*Math.sin(r),
                  x2=45+35*Math.cos(r+.26),y2=45+35*Math.sin(r+.26);
            return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#C0392B" stroke-width="1" opacity="0.4"/>`;
          }).join('')}
          <text x="45" y="55" text-anchor="middle" font-family="'USDeclaration',cursive" font-size="34" fill="#F8F2E6">P</text>
        </svg>
        <div class="seal-label" id="seal-label">Break the Seal — Open the Goodies</div>
      </div>

      <div id="goodies-container"></div>
    </div>
  `;

  document.getElementById('back-btn').addEventListener('click', () => {
    selectedEvent = null; sealBroken = false;
    renderEventList();
  });

  document.getElementById('wax-seal').addEventListener('click', breakSeal);
}

function breakSeal() {
  if (sealBroken) return;
  sealBroken = true;
  const seal = document.getElementById('wax-seal');
  seal.classList.add('broken');
  seal.style.cursor = 'default';
  const crack = document.createElementNS('http://www.w3.org/2000/svg','polyline');
  crack.setAttribute('points','45,3 50,20 42,38 52,58 45,87');
  crack.setAttribute('stroke','#F8F2E6');
  crack.setAttribute('stroke-width','2');
  crack.setAttribute('fill','none');
  crack.setAttribute('opacity','0.8');
  seal.appendChild(crack);
  document.getElementById('seal-label').textContent = 'Goodies Opened';
  loadAllGoodies(selectedEvent);
}

// ─── LOAD ALL GOODIES ─────────────────────────────────────────────────────
async function loadAllGoodies(ev) {
  const container  = document.getElementById('goodies-container');
  const year       = parseInt(ev.year) || new Date().getFullYear();
  const title      = ev.text?.replace(/\[\[.*?\]\]/g, '') || '';
  const extract    = ev.pages?.[0]?.extract || '';
  const pageTitle  = ev.pages?.[0]?.title || '';
  const coords     = ev.pages?.[0]?.coordinates;
  const isSpace    = /nasa|apollo|space|astronaut|rocket|moon|mars|orbit|satellite|shuttle|gemini|mercury mission|iss|hubble/i.test(title + extract);
  const isAncient  = year < 1400;
  const hasNewspaper = year >= 1770 && year <= 1963;
  const hasRecording = year >= 1877;
  const hasNewsVideo = year >= 1950;
  const currencyMention = extractCurrencyMention(extract);

  // Extract archaic terms from event text
  const archaicTerms = extractArchaicTerms(title + ' ' + extract);

  container.innerHTML = `
    <div class="goodies-title font-18c">Pable's Goodies</div>
    <div class="goodies-grid" id="goodies-grid"></div>
  `;

  // All goodies load independently and append themselves
  const grid = document.getElementById('goodies-grid');
  const keyword = pageTitle || title.split(' ').slice(0,5).join(' ');

  // Fire all in parallel — each renders when ready
  const loaders = [
    loadImages(grid, keyword, year, isSpace),
    loadYouTubeDocs(grid, keyword, year),
    hasNewsVideo  ? loadYouTubeNews(grid, keyword, year)        : null,
    loadArchiveVideo(grid, keyword),
    hasRecording  ? loadArchiveAudio(grid, keyword)             : null,
    hasNewspaper  ? loadNewspapers(grid, keyword, year)         : null,
    isAncient     ? loadPrimarySources(grid, keyword, year)     : null,
    archaicTerms.length ? loadEtymology(grid, archaicTerms)    : null,
    archaicTerms.length ? loadThesaurus(grid, archaicTerms[0]) : null,
    loadMusic(grid, year, keyword),
    loadBooks(grid, keyword, title),
    currencyMention ? loadInflation(grid, currencyMention, year, extract) : null,
    coords ? loadMap(grid, coords, keyword, year) : null,
    isSpace ? loadNASA(grid, keyword, year) : null,
  ].filter(Boolean);

  await Promise.allSettled(loaders);

  // If nothing rendered, show a message
  if (!grid.children.length) {
    grid.innerHTML = `<div class="empty-state" style="padding:20px">No additional resources found for this event.</div>`;
  }
}

// ─── GOODIE HELPERS ───────────────────────────────────────────────────────
function goodieCard(icon, title, bodyHTML, sourceNote = '') {
  const div = document.createElement('div');
  div.className = 'goodie-section';
  div.innerHTML = `
    <div class="goodie-section-header">
      <span class="goodie-icon">${icon}</span>${title}
    </div>
    <div class="goodie-body">
      ${bodyHTML}
      ${sourceNote ? `<div class="goodie-source">${sourceNote}</div>` : ''}
    </div>
  `;
  return div;
}

function appendGoodie(grid, icon, title, bodyHTML, sourceNote = '') {
  grid.appendChild(goodieCard(icon, title, bodyHTML, sourceNote));
}

function extractCurrencyMention(text) {
  const patterns = [
    /\$[\d,]+(?:\.\d+)?(?:\s?(?:million|billion|trillion))?/i,
    /£[\d,]+(?:\.\d+)?(?:\s?(?:million|billion|trillion))?/i,
    /[\d,]+(?:\.\d+)?\s(?:million|billion)?\s?(?:dollars?|pounds?|francs?|ducats?|shillings?)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return null;
}

function extractArchaicTerms(text) {
  const words = text.toLowerCase().replace(/[^a-z\s]/g,'').split(/\s+/);
  const found = [];
  for (const w of words) {
    if ((ARCHAIC_WORDS.has(w) || ETYMOLOGY_WORTHY.has(w)) && !found.includes(w)) {
      found.push(w);
      if (found.length >= 4) break;
    }
  }
  return found;
}

function musicEpoch(year) {
  if (year < 1000)  return 'Medieval';
  if (year < 1400)  return 'Medieval';
  if (year < 1600)  return 'Renaissance';
  if (year < 1750)  return 'Baroque';
  if (year < 1820)  return 'Classical';
  if (year < 1910)  return 'Romantic';
  return null; // Use MusicBrainz/Archive for 20th century+
}

// ─── GOODIE: IMAGES ───────────────────────────────────────────────────────
async function loadImages(grid, keyword, year, isSpace) {
  const images = [];

  const [wikiImgs, dplaImgs, siImgs, euroImgs] = await Promise.allSettled([
    fetchWikimediaImages(keyword),
    fetch(`/api/dpla?q=${encodeURIComponent(keyword)}&page_size=4`).then(r=>r.json()).catch(()=>({docs:[]})),
    fetch(`/api/smithsonian?q=${encodeURIComponent(keyword)}&rows=4`).then(r=>r.json()).catch(()=>({response:{rows:[]}})),
    year < 1900 ? fetch(`/api/europeana?q=${encodeURIComponent(keyword)}&rows=4`).then(r=>r.json()).catch(()=>({items:[]})) : Promise.resolve({items:[]}),
  ]);

  if (wikiImgs.status==='fulfilled') images.push(...wikiImgs.value);

  if (dplaImgs.status==='fulfilled') {
    (dplaImgs.value.docs||[]).filter(d=>d.object).slice(0,3).forEach(d=>images.push({
      url: d.object,
      caption: (d.sourceResource?.title?.[0]||'DPLA Collection').substring(0,80),
      source:'DPLA'
    }));
  }

  if (siImgs.status==='fulfilled') {
    (siImgs.value.response?.rows||[])
      .filter(r=>r.content?.descriptiveNonRepeating?.online_media?.media?.[0]?.thumbnail)
      .slice(0,3).forEach(r=>images.push({
        url: r.content.descriptiveNonRepeating.online_media.media[0].thumbnail,
        caption:(r.title||'Smithsonian').substring(0,80),
        source:'Smithsonian'
      }));
  }

  if (euroImgs.status==='fulfilled') {
    (euroImgs.value.items||[]).filter(i=>i.edmPreview?.[0]).slice(0,3).forEach(i=>images.push({
      url: i.edmPreview[0],
      caption:(Array.isArray(i.title)?i.title[0]:i.title||'Europeana').substring(0,80),
      source:'Europeana'
    }));
  }

  const display = images.filter((img,i,a)=>a.findIndex(x=>x.url===img.url)===i).slice(0,8);
  if (!display.length) return;

  const html = `<div class="images-grid">
    ${display.map(img=>`
      <div class="image-item">
        <img src="${img.url}" alt="${img.caption}" loading="lazy"
          onerror="this.closest('.image-item').style.display='none'"/>
        <div class="image-caption">${img.caption}<span class="img-source">${img.source||''}</span></div>
      </div>`).join('')}
  </div>`;
  appendGoodie(grid,'🖼','Period Images',html,'Wikimedia Commons · DPLA · Smithsonian · Europeana');
}

async function fetchWikimediaImages(keyword) {
  try {
    const q = encodeURIComponent(keyword);
    const data = await fetch(`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${q}&gsrnamespace=6&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=400&format=json&origin=*&gsrlimit=8`).then(r=>r.json());
    return Object.values(data.query?.pages||{})
      .filter(p=>p.imageinfo?.[0]?.url && !/\.(svg|gif)$/i.test(p.imageinfo[0].url) && !/flag|icon|logo|button|seal/i.test(p.title||''))
      .slice(0,5)
      .map(p=>({
        url:p.imageinfo[0].url,
        caption:(p.imageinfo[0].extmetadata?.ImageDescription?.value||p.title||'').replace(/<[^>]+>/g,'').substring(0,80),
        source:'Wikimedia'
      }));
  } catch { return []; }
}

// ─── GOODIE: YOUTUBE DOCUMENTARY ──────────────────────────────────────────
async function loadYouTubeDocs(grid, keyword, year) {
  try {
    const data = await fetch(`/api/youtube?q=${encodeURIComponent(keyword)}&type=documentary`).then(r=>r.json());
    const items = data.items||[];
    if (!items.length) return;

    const html = items.slice(0,4).map(v=>`
      <a href="https://youtube.com/watch?v=${v.id.videoId}" target="_blank" class="video-item">
        <img class="video-thumb-img" src="${v.snippet.thumbnails?.medium?.url||''}" alt=""
          onerror="this.style.display='none'"/>
        <div>
          <div class="video-title">${v.snippet.title.substring(0,80)}</div>
          <div class="video-channel">${v.snippet.channelTitle}</div>
          <div class="video-source">YouTube</div>
        </div>
      </a>`).join('');
    appendGoodie(grid,'🎬','Documentaries & Educational Video',html,'YouTube Data API v3');
  } catch {}
}

// ─── GOODIE: YOUTUBE NEWS ─────────────────────────────────────────────────
async function loadYouTubeNews(grid, keyword, year) {
  try {
    const data = await fetch(`/api/youtube?q=${encodeURIComponent(keyword)}&type=news`).then(r=>r.json());
    const items = (data.items||[]).filter(v=>/news|report|cnn|bbc|nbc|abc|cbs|pbs|reuters|ap /i.test(v.snippet.channelTitle+' '+v.snippet.title));
    if (!items.length) return;

    const html = items.slice(0,3).map(v=>`
      <a href="https://youtube.com/watch?v=${v.id.videoId}" target="_blank" class="video-item">
        <img class="video-thumb-img" src="${v.snippet.thumbnails?.medium?.url||''}" alt=""
          onerror="this.style.display='none'"/>
        <div>
          <div class="video-title">${v.snippet.title.substring(0,80)}</div>
          <div class="video-channel">${v.snippet.channelTitle}</div>
          <div class="video-source">YouTube · News Coverage</div>
        </div>
      </a>`).join('');
    appendGoodie(grid,'📺','News Coverage',html,'YouTube Data API v3');
  } catch {}
}

// ─── GOODIE: INTERNET ARCHIVE VIDEO ───────────────────────────────────────
async function loadArchiveVideo(grid, keyword) {
  try {
    const data = await fetch(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(keyword)}+mediatype:movies&fl[]=identifier,title,description&sort[]=downloads+desc&rows=5&output=json`).then(r=>r.json());
    const items = data.response?.docs||[];
    if (!items.length) return;

    const html = items.slice(0,4).map(v=>`
      <a href="https://archive.org/details/${v.identifier}" target="_blank" class="video-item">
        <div class="video-thumb-placeholder">▶</div>
        <div>
          <div class="video-title">${(v.title||'Untitled').substring(0,80)}</div>
          <div class="video-source">Internet Archive · Free to watch</div>
        </div>
      </a>`).join('');
    appendGoodie(grid,'📽','Archival Film & Documentary',html,'Internet Archive (archive.org)');
  } catch {}
}

// ─── GOODIE: INTERNET ARCHIVE AUDIO ──────────────────────────────────────
async function loadArchiveAudio(grid, keyword) {
  try {
    const data = await fetch(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(keyword)}+mediatype:audio&fl[]=identifier,title&sort[]=downloads+desc&rows=4&output=json`).then(r=>r.json());
    const items = data.response?.docs||[];
    if (!items.length) return;

    // Fetch audio file URLs
    const audioItems = await Promise.all(items.slice(0,3).map(async item=>{
      try {
        const meta = await fetch(`https://archive.org/metadata/${item.identifier}`).then(r=>r.json());
        const file = (meta.files||[]).find(f=>/\.(mp3|ogg)$/i.test(f.name));
        return { title:item.title, identifier:item.identifier,
                 audioUrl: file ? `https://archive.org/download/${item.identifier}/${file.name}` : null };
      } catch { return { title:item.title, identifier:item.identifier, audioUrl:null }; }
    }));

    const html = audioItems.map(a=>`
      <div class="audio-item">
        <div class="audio-title">${(a.title||'Untitled').substring(0,80)}</div>
        ${a.audioUrl
          ? `<audio controls preload="none" style="width:100%;margin-top:6px"><source src="${a.audioUrl}"></audio>`
          : `<a href="https://archive.org/details/${a.identifier}" target="_blank" class="archive-link">Listen on archive.org →</a>`}
      </div>`).join('');
    appendGoodie(grid,'🔊','Voices & Recordings',html,'Internet Archive (archive.org)');
  } catch {}
}

// ─── GOODIE: HISTORIC NEWSPAPERS ─────────────────────────────────────────
async function loadNewspapers(grid, keyword, year) {
  try {
    const endYear = Math.min(year + 2, 1963);
    const data = await fetch(`https://www.loc.gov/collections/chronicling-america/?andtext=${encodeURIComponent(keyword)}&start_date=${year-1}-01-01&end_date=${endYear}-12-31&fo=json`).then(r=>r.json());
    const results = data.results||[];
    if (!results.length) return;

    const html = results.slice(0,4).map(r=>`
      <div class="newspaper-item">
        ${r.image_url?.[0] ? `
          <a href="${r.url||'#'}" target="_blank" class="newspaper-page-link">
            <img src="${r.image_url[0]}" class="newspaper-thumb" alt="Newspaper page"
              onerror="this.style.display='none'" loading="lazy"/>
            <div class="newspaper-zoom">🔍 Click to read</div>
          </a>` : ''}
        <div class="newspaper-title">
          <a href="${r.url||'#'}" target="_blank">${(r.title||'Untitled').substring(0,80)}</a>
        </div>
        <div class="newspaper-meta">${r.date||''} · ${r.partof?.[0]||'Chronicling America'}</div>
        ${r.description?.[0] ? `<div class="newspaper-snippet">${r.description[0].substring(0,150)}…</div>` : ''}
      </div>`).join('');
    appendGoodie(grid,'📰','Historic Newspapers',html,'Chronicling America · Library of Congress · 1770–1963');
  } catch {}
}

// ─── GOODIE: PRIMARY SOURCES (ancient/medieval) ───────────────────────────
async function loadPrimarySources(grid, keyword, year) {
  try {
    const data = await fetch(`https://gutendex.com/books/?search=${encodeURIComponent(keyword)}&topic=history`).then(r=>r.json());
    const books = data.results||[];
    if (!books.length) return;

    const html = books.slice(0,4).map(b=>`
      <div class="book-item">
        <div class="book-spine" style="background:#8B4513"></div>
        <div style="flex:1">
          <div class="book-title">
            <a href="https://gutenberg.org/ebooks/${b.id}" target="_blank">${b.title}</a>
          </div>
          <div class="book-author">${b.authors?.[0]?.name||'Unknown'}</div>
          <span class="book-type">Primary Source · Free to Read</span>
        </div>
      </div>`).join('');
    appendGoodie(grid,'📜','Primary Sources',html,'Project Gutenberg (gutenberg.org) · Free public domain texts');
  } catch {}
}

// ─── GOODIE: ETYMOLOGY ────────────────────────────────────────────────────
async function loadEtymology(grid, terms) {
  const entries = await Promise.all(terms.map(async word => {
    try {
      const data = await fetch(`/api/dictionary/${encodeURIComponent(word)}`).then(r=>r.json());
      if (!Array.isArray(data)||!data[0]||typeof data[0]==='string') return null;
      const entry = data[0];
      const etText = entry.et?.[0]?.[1]
        ? entry.et[0][1].replace(/\{[^}]+\}/g,'').replace(/\*/g,'').trim()
        : null;
      if (!etText) return null;
      return {
        word: entry.hwi?.hw?.replace(/\*/g,'')||word,
        pos:  entry.fl||'',
        etymology: etText,
        definition: entry.shortdef?.[0]||''
      };
    } catch { return null; }
  }));

  const valid = entries.filter(Boolean);
  if (!valid.length) return;

  const html = valid.map(e=>`
    <div class="word-item">
      <div><span class="word-term">${e.word}</span><span class="word-pos">${e.pos}</span></div>
      <div class="word-etymology">⟐ ${e.etymology}</div>
      ${e.definition ? `<div class="word-definition">${e.definition}</div>` : ''}
    </div>`).join('');
  appendGoodie(grid,'📜','Words of the Era',html,'Merriam-Webster Collegiate Dictionary');
}

// ─── GOODIE: THESAURUS ────────────────────────────────────────────────────
async function loadThesaurus(grid, word) {
  try {
    const data = await fetch(`/api/thesaurus/${encodeURIComponent(word)}`).then(r=>r.json());
    if (!Array.isArray(data)||!data[0]||typeof data[0]==='string') return;
    const entry = data[0];
    const syns  = entry.meta?.syns?.[0]?.slice(0,8)||[];
    const ants  = entry.meta?.ants?.[0]?.slice(0,4)||[];
    if (!syns.length) return;

    const html = `
      <div class="word-term">${entry.hwi?.hw?.replace(/\*/g,'')||word}</div>
      <div style="margin-top:8px">
        <span class="word-pos">Synonyms</span>
        <div class="thes-words">${syns.map(s=>`<span class="thes-word">${s}</span>`).join('')}</div>
      </div>
      ${ants.length ? `<div style="margin-top:8px">
        <span class="word-pos">Antonyms</span>
        <div class="thes-words">${ants.map(s=>`<span class="thes-word antonym">${s}</span>`).join('')}</div>
      </div>` : ''}`;
    appendGoodie(grid,'🔤','Period Thesaurus',html,'Merriam-Webster Thesaurus');
  } catch {}
}

// ─── GOODIE: MUSIC ────────────────────────────────────────────────────────
async function loadMusic(grid, year, keyword) {
  const epoch = musicEpoch(year);

  if (epoch) {
    // Pre-1910: Open Opus — composers alive at the time
    try {
      const data = await fetch(`https://api.openopus.org/composer/list/epoch/${epoch}.json`).then(r=>r.json());
      const composers = (data.composers||[]).filter(c=>{
        const born = parseInt(c.birth);
        const died = parseInt(c.death)||9999;
        return born <= year+50 && died >= year-50;
      }).slice(0,5);

      if (!composers.length && epoch !== 'Medieval') return;

      // For each composer, try to find a playable recording on Internet Archive
      const withAudio = await Promise.all(composers.slice(0,4).map(async c=>{
        try {
          const q  = encodeURIComponent(c.complete_name);
          const ar = await fetch(`https://archive.org/advancedsearch.php?q=${q}+mediatype:audio&fl[]=identifier,title&rows=1&output=json`).then(r=>r.json());
          const item = ar.response?.docs?.[0];
          if (!item) return {...c, audioUrl:null, audioTitle:null};
          const meta = await fetch(`https://archive.org/metadata/${item.identifier}`).then(r=>r.json());
          const file = (meta.files||[]).find(f=>/\.(mp3|ogg)$/i.test(f.name));
          return {
            ...c,
            audioUrl: file ? `https://archive.org/download/${item.identifier}/${file.name}` : null,
            audioTitle: item.title||null,
            archiveId: item.identifier
          };
        } catch { return {...c, audioUrl:null}; }
      }));

      const html = withAudio.map(c=>`
        <div class="music-item">
          ${c.portrait ? `<img src="${c.portrait}" class="composer-portrait" onerror="this.style.display='none'"/>` : '<div class="music-icon">♪</div>'}
          <div style="flex:1">
            <div class="music-title">${c.complete_name}</div>
            <div class="music-composer">${epoch} · ${c.birth?.substring(0,4)||'?'}–${c.death?.substring(0,4)||'present'}</div>
            ${c.audioUrl
              ? `<div class="audio-label">${c.audioTitle?.substring(0,60)||'Recording'}</div>
                 <audio controls preload="none" style="width:100%;margin-top:4px"><source src="${c.audioUrl}"></audio>`
              : c.archiveId
                ? `<a href="https://archive.org/details/${c.archiveId}" target="_blank" class="archive-link">Listen on archive.org →</a>`
                : `<div class="music-note">Search IMSLP for scores and recordings</div>`}
          </div>
        </div>`).join('');
      appendGoodie(grid,'🎵',`Music of the ${epoch} Era`,html,'Open Opus · Internet Archive · IMSLP');
    } catch {}
  } else {
    // Post-1910: MusicBrainz + Archive audio
    try {
      const q    = encodeURIComponent(`${keyword} ${year}`);
      const data = await fetch(`https://musicbrainz.org/ws/2/recording?query=${q}&limit=4&fmt=json`,
        {headers:{'User-Agent':'PableHistoryApp/2.0 (educational; robpoole24@gmail.com)'}}).then(r=>r.json());
      const recs = data.recordings||[];
      if (!recs.length) return;

      // Try to find playable audio for each
      const withAudio = await Promise.all(recs.slice(0,3).map(async rec=>{
        try {
          const sq  = encodeURIComponent(rec.title);
          const ar  = await fetch(`https://archive.org/advancedsearch.php?q=${sq}+mediatype:audio&fl[]=identifier&rows=1&output=json`).then(r=>r.json());
          const id  = ar.response?.docs?.[0]?.identifier;
          if (!id) return {...rec, audioUrl:null};
          const meta = await fetch(`https://archive.org/metadata/${id}`).then(r=>r.json());
          const file = (meta.files||[]).find(f=>/\.(mp3|ogg)$/i.test(f.name));
          return {...rec, audioUrl: file ? `https://archive.org/download/${id}/${file.name}` : null, archiveId:id};
        } catch { return {...rec, audioUrl:null}; }
      }));

      const html = withAudio.map(r=>`
        <div class="music-item">
          <div class="music-icon">♪</div>
          <div style="flex:1">
            <div class="music-title">${r.title}</div>
            <div class="music-composer">${r['artist-credit']?.[0]?.artist?.name||'Various'} · ${r['first-release-date']?.substring(0,4)||''}</div>
            ${r.audioUrl
              ? `<audio controls preload="none" style="width:100%;margin-top:4px"><source src="${r.audioUrl}"></audio>`
              : r.archiveId
                ? `<a href="https://archive.org/details/${r.archiveId}" target="_blank" class="archive-link">Listen on archive.org →</a>`
                : ''}
          </div>
        </div>`).join('');
      appendGoodie(grid,'🎵','Music of the Period',html,'MusicBrainz · Internet Archive');
    } catch {}
  }
}

// ─── GOODIE: BOOKS ────────────────────────────────────────────────────────
async function loadBooks(grid, keyword, eventTitle) {
  // Strategy: search specifically for books ABOUT this event
  // Use intitle: qualifier + subject to ensure relevance
  const searchTerms = [
    `intitle:"${keyword.split(' ').slice(0,3).join(' ')}"`,
    `subject:"${keyword.split(' ').slice(0,2).join(' ')}"`
  ];

  const [olRes, gbRes, gutRes] = await Promise.allSettled([
    fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(keyword)}&limit=6&fields=key,title,author_name,first_publish_year,cover_i,subject&subject=${encodeURIComponent(keyword.split(' ')[0])}`).then(r=>r.json()),
    fetch(`/api/books?q=${encodeURIComponent(searchTerms[0])}&maxResults=6`).then(r=>r.json()),
    fetch(`https://gutendex.com/books/?search=${encodeURIComponent(keyword)}`).then(r=>r.json()),
  ]);

  const books = [];
  const seenTitles = new Set();

  // Open Library — filter by relevance
  if (olRes.status==='fulfilled') {
    (olRes.value.docs||[]).filter(b=>{
      const t = (b.title||'').toLowerCase();
      const kwords = keyword.toLowerCase().split(' ').filter(w=>w.length>3);
      return kwords.some(w=>t.includes(w));
    }).slice(0,4).forEach(b=>{
      const key = b.title?.toLowerCase();
      if (seenTitles.has(key)) return;
      seenTitles.add(key);
      books.push({
        title:b.title, author:b.author_name?.[0]||'Unknown',
        year:b.first_publish_year,
        coverUrl:b.cover_i?`https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg`:null,
        url:b.key?`https://openlibrary.org${b.key}`:null,
        type:'Non-Fiction', source:'Open Library'
      });
    });
  }

  // Google Books — relevance filter
  if (gbRes.status==='fulfilled') {
    (gbRes.value.items||[]).forEach(item=>{
      const vol = item.volumeInfo;
      const t   = (vol.title||'').toLowerCase();
      const kwords = keyword.toLowerCase().split(' ').filter(w=>w.length>3);
      if (!kwords.some(w=>t.includes(w))) return;
      const key = t;
      if (seenTitles.has(key)) return;
      seenTitles.add(key);
      books.push({
        title:vol.title, author:vol.authors?.[0]||'Unknown',
        year:vol.publishedDate?.substring(0,4),
        coverUrl:vol.imageLinks?.thumbnail||null,
        url:vol.infoLink||null,
        type:vol.categories?.[0]||'Non-Fiction', source:'Google Books'
      });
    });
  }

  // Gutenberg — primary sources / fiction
  if (gutRes.status==='fulfilled') {
    (gutRes.value.results||[]).slice(0,2).forEach(b=>{
      const key = b.title?.toLowerCase();
      if (seenTitles.has(key)) return;
      seenTitles.add(key);
      books.push({
        title:b.title, author:b.authors?.[0]?.name||'Unknown',
        coverUrl:b.formats?.['image/jpeg']||null,
        url:`https://gutenberg.org/ebooks/${b.id}`,
        type:'Free to Read (Public Domain)', source:'Project Gutenberg'
      });
    });
  }

  if (!books.length) return;

  const colors = ['#8B4513','#4A3728','#2C1A0E','#A07840','#6B3A2A','#3D2B1A'];
  const html = books.slice(0,8).map((b,i)=>`
    <div class="book-item">
      <div class="book-cover">
        ${b.coverUrl
          ? `<img src="${b.coverUrl}" alt="${b.title}" loading="lazy"
              onerror="this.parentElement.innerHTML='<div class=\'book-cover-placeholder\' style=\'background:${colors[i%colors.length]}\'></div>'">`
          : `<div class="book-cover-placeholder" style="background:${colors[i%colors.length]}"></div>`}
      </div>
      <div style="flex:1">
        <div class="book-title">
          ${b.url?`<a href="${b.url}" target="_blank">${b.title}</a>`:b.title}
        </div>
        <div class="book-author">${b.author}${b.year?` · ${b.year}`:''}</div>
        <span class="book-type">${b.type}</span>
        <div class="book-note" style="font-size:10px;opacity:0.6;margin-top:2px">${b.source}</div>
      </div>
    </div>`).join('');
  appendGoodie(grid,'📚','Reading List',html,'Open Library · Google Books · Project Gutenberg');
}

// ─── GOODIE: INFLATION ────────────────────────────────────────────────────
async function loadInflation(grid, currencyMention, year, extract) {
  if (year < 1913) {
    // Pre-FRED hardcoded anchors (BLS/historical research)
    const anchors = {
      1: 0.02, 100: 0.05, 500: 0.12, 1000: 0.20, 1400: 0.28,
      1500: 0.38, 1600: 0.55, 1650: 0.72, 1700: 0.85, 1750: 1.0,
      1765: 1.08, 1770: 1.12, 1776: 1.20, 1780: 1.45, 1790: 1.30,
      1800: 1.60, 1812: 1.95, 1830: 1.40, 1850: 1.50, 1865: 2.20,
      1880: 1.45, 1900: 1.60, 1910: 1.80
    };
    const modernCPI = 314;
    const years     = Object.keys(anchors).map(Number).sort((a,b)=>a-b);
    const nearest   = years.reduce((p,c)=>Math.abs(c-year)<Math.abs(p-year)?c:p);
    const multiplier = (modernCPI / anchors[nearest]).toFixed(0);

    appendGoodie(grid,'💰','What It Cost — Then & Now',`
      <div class="money-display">
        <div class="money-mention">"${currencyMention}"</div>
        <div class="money-original">as mentioned in the historical record</div>
        <div class="money-arrow">↓</div>
        <div class="money-modern">≈ ×${Number(multiplier).toLocaleString()} in today's dollars</div>
        <div class="money-note">Based on historical price research anchors — pre-FRED era</div>
      </div>
      <div class="money-context">Purchasing power comparison across ${2024-year} years</div>
    `,'Historical CPI anchors (BLS / MeasuringWorth research)');
    return;
  }

  // Post-1913: real FRED data
  try {
    if (!cpiCache) {
      const data = await fetch('/api/fred/cpi').then(r=>r.json());
      cpiCache = data.observations||[];
    }
    const eventObs  = cpiCache.find(o=>o.date.startsWith(String(year)));
    const modernObs = cpiCache[cpiCache.length-1];
    if (!eventObs||!modernObs||eventObs.value==='.'||modernObs.value==='.') return;

    const ratio      = parseFloat(modernObs.value)/parseFloat(eventObs.value);
    const multiplier = ratio.toFixed(1);
    const modernYear = modernObs.date.substring(0,4);

    appendGoodie(grid,'💰','What It Cost — Then & Now',`
      <div class="money-display">
        <div class="money-mention">"${currencyMention}"</div>
        <div class="money-original">as mentioned — ${year}</div>
        <div class="money-arrow">↓</div>
        <div class="money-modern">≈ ×${multiplier} in ${modernYear} dollars</div>
        <div class="money-note">×${multiplier} multiplier · FRED CPIAUCSL Series</div>
      </div>
      <div class="money-context">Every dollar spent in ${year} had the purchasing power of $${multiplier} today.</div>
    `,'FRED CPIAUCSL · St. Louis Federal Reserve Bank');
  } catch {}
}

// ─── GOODIE: MAP ──────────────────────────────────────────────────────────
async function loadMap(grid, coords, keyword, year) {
  const lat = coords.lat;
  const lon = coords.lon;
  const mapId = `leaflet-map-${Date.now()}`;
  const rumseyQ = encodeURIComponent(keyword);

  // Append card first so we can init Leaflet into it
  const card = goodieCard('🗺','Place on the Map',`
    <div id="${mapId}" style="height:260px;border-radius:2px;border:1px solid var(--gold)"></div>
    <div style="margin-top:8px;display:flex;gap:12px;flex-wrap:wrap">
      <a href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}&zoom=8" target="_blank" class="archive-link">OpenStreetMap →</a>
      <a href="https://www.davidrumsey.com/luna/servlet/view/search?q=${rumseyQ}" target="_blank" class="archive-link">Historical Maps (Rumsey) →</a>
    </div>
  `,'OpenStreetMap · Leaflet · David Rumsey Historical Maps');
  grid.appendChild(card);

  // Load Leaflet dynamically
  if (!window.L) {
    await Promise.all([
      loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'),
      loadCSS('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css')
    ]);
  }

  setTimeout(()=>{
    try {
      const map = L.map(mapId,{scrollWheelZoom:false}).setView([lat,lon],7);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
        attribution:'© OpenStreetMap',maxZoom:19
      }).addTo(map);
      L.marker([lat,lon]).addTo(map).bindPopup(`<b>${keyword}</b><br>${year}`).openPopup();
    } catch(e){ console.error('Leaflet error:',e); }
  },100);
}

function loadScript(src) {
  return new Promise(resolve=>{
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve;
    document.head.appendChild(s);
  });
}
function loadCSS(href) {
  return new Promise(resolve=>{
    if (document.querySelector(`link[href="${href}"]`)) return resolve();
    const l = document.createElement('link');
    l.rel='stylesheet'; l.href=href; l.onload=resolve;
    document.head.appendChild(l);
  });
}

// ─── GOODIE: NASA ─────────────────────────────────────────────────────────
async function loadNASA(grid, keyword, year) {
  try {
    const [imgData, apodData] = await Promise.allSettled([
      fetch(`https://images-api.nasa.gov/search?q=${encodeURIComponent(keyword)}&media_type=image&page_size=4`).then(r=>r.json()),
      year >= 1995 ? fetch(`/api/nasa/apod`).then(r=>r.json()) : Promise.resolve(null)
    ]);

    const items = imgData.status==='fulfilled'
      ? (imgData.value.collection?.items||[]).filter(i=>i.links?.[0]?.href).slice(0,4)
      : [];

    if (!items.length && !apodData.value) return;

    let html = '';
    if (apodData.status==='fulfilled' && apodData.value?.url) {
      html += `<div style="margin-bottom:12px">
        <img src="${apodData.value.url}" style="width:100%;border-radius:2px;border:1px solid var(--gold)" alt="NASA APOD"/>
        <div class="image-caption">${apodData.value.title||'NASA Astronomy Picture of the Day'}</div>
      </div>`;
    }
    html += `<div class="images-grid">${items.map(i=>`
      <div class="image-item">
        <img src="${i.links[0].href}" loading="lazy" onerror="this.closest('.image-item').style.display='none'"/>
        <div class="image-caption">${(i.data?.[0]?.title||'NASA').substring(0,60)}</div>
      </div>`).join('')}</div>`;
    appendGoodie(grid,'🚀','NASA Imagery',html,'NASA Image and Video Library · nasa.gov');
  } catch {}
}

// ─── RENDER HELPERS ───────────────────────────────────────────────────────
function musicEpoch(year) {
  if (year < 1400)  return 'Medieval';
  if (year < 1600)  return 'Renaissance';
  if (year < 1750)  return 'Baroque';
  if (year < 1820)  return 'Classical';
  if (year < 1910)  return 'Romantic';
  return null;
}
