/* ═══════════════════════════════════════════════════════════════════════
   PABLE — music.js
   Music of the time AND the place of each event.

   1. Work out the musical world: century + region (Norman England, Tang
      China, Revolutionary America, Ottoman court…) → named styles
      (Byzantine chant, troubadours, Cantigas de Santa Maria, Tudor
      consorts, fife & drum, ragtime…) instead of one bucket per 300 years.
   2. Composers who were actually working then (Wikidata: composers aged
      ~15–70 at the event), preferring ones from the same region.
   3. Recordings you can play right in the card:
        Wikimedia Commons — freely licensed performances of those composers
                            and of the named styles (chant, estampies…)
        Internet Archive 78rpm — real records from the event's year
                            (1895–1925, public domain in the US)
   4. Performances & reconstructions on YouTube (ancient lyre, Seikilos
      epitaph, Machaut, Purcell…). Searches are per style, not per event,
      and kept for a year — most events cost no quota at all.
   Each event shows a different slice of the pool (picked by the event),
   so two medieval events no longer play the same two songs.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';
const S = require('./sources');
const { getJSON, topic, sparql, ytSearch, norm, pool, uniq } = S._lib;
const enc = encodeURIComponent;

// ── Where in the world ───────────────────────────────────────────────────
const REGION_RULES = [
  ['byzantine', /\b(byzantine|constantinople|eastern roman)\b/],
  ['ottoman', /\b(ottoman|turkey|turkish|anatolia|seljuk)\b/],
  ['islamic', /\b(caliphate|abbasid|umayyad|fatimid|mamluk|ayyubid|egypt|egyptian|syria|iraq|baghdad|damascus|cairo|arab|arabia|morocco|tunisia|persia|persian|iran|safavid|saladin)\b/],
  ['british', /\b(england|english|britain|british|scotland|scottish|wales|welsh|ireland|irish|united kingdom|anglo saxon|tudor|elizabethan|victorian|london)\b/],
  ['french', /\b(france|french|frankish|franks|gaul|burgundy|burgundian|paris|normandy|aquitaine|provence)\b/],
  ['iberian', /\b(spain|spanish|castile|aragon|portugal|portuguese|iberia|iberian|al andalus|andalusia|cordoba|granada|navarre|catalonia|barcelona)\b/],
  ['italian', /\b(italy|italian|venice|venetian|florence|florentine|milan|genoa|naples|sicily|papal states|lombard|lombardy|tuscany)\b/],
  ['german', /\b(germany|german|holy roman empire|prussia|prussian|austria|austrian|habsburg|hapsburg|bavaria|saxony|swiss|switzerland|bohemia|hungary|hungarian|vienna)\b/],
  ['nordic', /\b(norway|norwegian|sweden|swedish|denmark|danish|iceland|viking|vikings|norse|finland)\b/],
  ['russian', /\b(russia|russian|muscovy|kievan rus|novgorod|ukraine|poland|polish|lithuania)\b/],
  ['chinese', /\b(china|chinese|tang dynasty|song dynasty|ming|qing|han dynasty|yuan dynasty|mongol|mongols)\b/],
  ['japanese', /\b(japan|japanese|shogun|shogunate|samurai|edo|kyoto|heian|kamakura)\b/],
  ['indian', /\b(india|indian|mughal|delhi|bengal|maratha|vijayanagara)\b/],
  ['american', /\b(united states|american|america|thirteen colonies|virginia|massachusetts|confederate|union army|continental army|new york|pennsylvania)\b/],
  ['mesoamerican', /\b(aztec|aztecs|maya|mayan|inca|incas|mexico|mexican|peru|tenochtitlan)\b/],
  ['african', /\b(ethiopia|mali|songhai|ghana empire|zulu|kongo|benin|nigeria|kenya|africa|african)\b/],
];
function regionOf(places, text) {
  const score = {};
  const p = ' ' + norm(places.join(' . ')) + ' ', t = ' ' + norm(text).slice(0, 5000) + ' ';
  for (const [r, re] of REGION_RULES) {
    const a = (p.match(new RegExp(re.source, 'g')) || []).length, b = (t.match(new RegExp(re.source, 'g')) || []).length;
    if (a || b) score[r] = a * 3 + b;
  }
  const best = Object.entries(score).sort((x, y) => y[1] - x[1])[0];
  return best ? best[0] : 'european';
}
function isAncientGreek(text) { return /\b(greece|greek|athens|athenian|sparta|spartan|macedon|macedonian|alexander the great|hellenistic|ptolem|seleucid)\b/.test(norm(text)); }
function isRoman(text) { return /\b(rome|roman|caesar|augustus|legion|senate|consul|carthage|pompey|gaul)\b/.test(norm(text)); }

// ── The styles of that time and place ────────────────────────────────────
// Each style: label (shown), yt (one YouTube search, shared by every event
// in that style), commons (Wikimedia Commons audio searches)
const st = (label, yt, commons = []) => ({ label, yt, commons });
function stylesFor(y, region, text) {
  const R = region;
  const out = [];
  const western = ['british', 'french', 'iberian', 'italian', 'german', 'nordic', 'european', 'american', 'russian'].includes(R);
  const maritime = /\b(navy|naval|ship|ships|sail|sailing|sailor|whaling|fleet|pirate|pirates|voyage|harbor|harbour)\b/.test(norm(text));
  if (y < -1000) {
    out.push(R === 'islamic' && /egypt/.test(norm(text)) ? st('Music of ancient Egypt', 'ancient Egyptian music reconstruction', ['ancient Egyptian music'])
      : st('Music of the ancient Near East', 'Hurrian hymn ancient Mesopotamian music reconstruction', ['Hurrian hymn']));
  } else if (y < 500) {
    if (R === 'chinese') out.push(st('Music of ancient China', 'ancient Chinese guqin music reconstruction', ['guqin']));
    else if (R === 'indian') out.push(st('Music of ancient India', 'ancient Indian Sama Veda chant music', ['Sama Veda']));
    else if (isAncientGreek(text) && !(y > -150 && isRoman(text))) out.push(st('Music of ancient Greece', 'ancient Greek music reconstruction Seikilos Delphic hymn', ['Seikilos', 'Delphic Hymn', 'ancient Greek music']));
    else if (R === 'islamic' && /egypt/.test(norm(text))) out.push(st('Music of ancient Egypt', 'ancient Egyptian music reconstruction', ['ancient Egyptian music']));
    else out.push(st('Music of ancient Rome', 'ancient Roman music reconstruction', ['Mesomedes', 'ancient Roman music']));
    if (y > 300 && R !== 'chinese' && R !== 'indian') out.push(st('Early Christian chant', 'early Christian chant Ambrosian chant', ['Ambrosian chant']));
  } else if (y < 1000) {
    const m = {
      byzantine: st('Byzantine chant', 'Byzantine chant medieval', ['Byzantine chant']),
      nordic: st('Music of the Viking Age', 'Viking age music reconstruction lyre', ['Viking music']),
      british: y < 1066 ? st('Anglo-Saxon music', 'Anglo-Saxon music lyre reconstruction', ['Anglo-Saxon']) : null,
      islamic: st('Early Arabic music', 'early medieval Arabic music oud', ['Arabic music oud']),
      iberian: st('Mozarabic & Visigothic chant', 'Mozarabic chant', ['Mozarabic chant']),
      chinese: st('Tang dynasty music', 'Tang dynasty music reconstruction', ['Tang dynasty music']),
      japanese: st('Gagaku court music', 'gagaku Japanese court music', ['gagaku']),
      indian: st('Music of early medieval India', 'ancient Indian classical music veena', ['veena']),
    }[R];
    if (m) out.push(m);
    out.push(st('Gregorian chant', 'Gregorian chant early medieval', ['Gregorian chant']));
  } else if (y < 1300) {
    const m = {
      french: [st('Troubadours & trouvères', 'troubadour songs 12th century medieval', ['troubadour', 'Bernart de Ventadorn']), st('Notre-Dame school (Léonin & Pérotin)', 'Perotin Notre Dame school organum', ['Pérotin', 'organum'])],
      iberian: [st('Cantigas de Santa Maria', 'Cantigas de Santa Maria medieval', ['Cantigas de Santa Maria'])],
      german: [st('Minnesang & Hildegard of Bingen', 'Minnesang medieval German song', ['Hildegard von Bingen', 'Minnesang'])],
      british: y < 1100 ? [st('Anglo-Saxon & Norman music', 'Anglo-Saxon Norman medieval music 11th century', ['Anglo-Saxon', 'Gregorian chant'])] : [st('Medieval English song', 'Sumer is icumen in medieval English music', ['Sumer is icumen in', 'medieval English music'])],
      italian: [st('Medieval Italian laude', 'laude medieval Italian music Cortona', ['lauda'])],
      byzantine: [st('Byzantine chant', 'Byzantine chant medieval', ['Byzantine chant'])],
      islamic: [st('Andalusian & Arabic court music', 'medieval Andalusian music Arabic', ['Andalusian music'])],
      nordic: [st('Medieval Nordic songs', 'medieval Scandinavian music Nordic ballad', ['Scandinavian medieval music'])],
      chinese: [st('Song dynasty music', 'Song dynasty music guqin', ['guqin'])],
      japanese: [st('Heian & Kamakura music', 'Heian period music biwa gagaku', ['biwa', 'gagaku'])],
      russian: [st('Old Russian znamenny chant', 'znamenny chant', ['znamenny'])],
    }[R] || [st('Music of the Crusades era', 'medieval music crusades era 12th century', ['medieval music'])];
    out.push(...m);
    if (western) out.push(st('Medieval dances (estampies)', 'medieval estampie dance music', ['estampie']));
  } else if (y < 1450) {
    const m = {
      french: st('Ars nova (Guillaume de Machaut)', 'Guillaume de Machaut ars nova', ['Machaut']),
      italian: st('Trecento (Francesco Landini)', 'Trecento music Landini', ['Landini', 'Trecento']),
      iberian: st('Llibre Vermell de Montserrat', 'Llibre Vermell de Montserrat', ['Llibre Vermell']),
      british: st('Medieval English carols', 'medieval English carols 15th century Agincourt carol', ['Agincourt carol', 'medieval carol']),
      german: st('Late medieval German song', 'Oswald von Wolkenstein medieval music', ['Oswald von Wolkenstein']),
      ottoman: st('Early Ottoman court music', 'Ottoman music medieval Anatolian', ['Ottoman music']),
      islamic: st('Persian & Arabic court music', 'medieval Persian music', ['Persian music']),
      chinese: st('Yuan & Ming music', 'Ming dynasty music', ['guqin']),
      japanese: st('Noh theatre music', 'Noh music Japan', ['Noh']),
      byzantine: st('Late Byzantine chant', 'Byzantine chant Koukouzeles', ['Byzantine chant']),
    }[R] || st('Late medieval music', 'late medieval music 14th century', ['medieval music']);
    out.push(m);
    if (western) out.push(st('Medieval dance music', 'medieval dance music saltarello estampie', ['saltarello']));
  } else if (y < 1600) {
    const m = {
      british: st('Tudor music', 'Tudor music Henry VIII Byrd Tallis', ['Tallis', 'William Byrd', 'Greensleeves']),
      french: st('French Renaissance chansons', 'French Renaissance chanson Janequin', ['Janequin', 'chanson']),
      italian: st('Italian Renaissance (Palestrina & madrigals)', 'Italian Renaissance madrigal Palestrina', ['Palestrina', 'madrigal']),
      german: st('German Renaissance', 'German Renaissance music Praetorius', ['Praetorius']),
      iberian: st('Spanish Renaissance (Cancionero de Palacio)', 'Cancionero de Palacio Spanish Renaissance music', ['Cancionero de Palacio', 'Tomás Luis de Victoria']),
      ottoman: st('Ottoman court music', 'Ottoman classical music 16th century', ['Ottoman music']),
      indian: y >= 1526 ? st('Mughal court music', 'Mughal court music Tansen dhrupad', ['dhrupad']) : null,
      chinese: st('Ming dynasty music', 'Ming dynasty music', ['guqin']),
      japanese: st('Muromachi & Noh music', 'Noh music Japan', ['Noh']),
      mesoamerican: st('Aztec & Inca music', 'Aztec music reconstruction pre-Columbian', ['Aztec music']),
      russian: st('Russian Orthodox chant', 'znamenny chant Russian', ['znamenny']),
    }[R] || st('Franco-Flemish polyphony (Josquin)', 'Josquin des Prez Renaissance polyphony', ['Josquin']);
    out.push(m);
    if (western || R === 'mesoamerican') out.push(st('Renaissance dance music', 'Renaissance dance music Susato', ['Tielman Susato', 'pavane', 'galliard']));
  } else if (y < 1750) {
    const m = {
      british: st('English Baroque (Purcell & Handel)', 'Henry Purcell baroque', ['Purcell', 'Handel']),
      french: st('French Baroque (Lully & Rameau)', 'Lully Rameau French baroque', ['Lully', 'Rameau', 'Couperin']),
      italian: st('Italian Baroque (Monteverdi to Vivaldi)', 'Italian baroque Vivaldi Corelli', ['Vivaldi', 'Corelli', 'Monteverdi']),
      german: st('German Baroque (Bach & Telemann)', 'Bach Telemann baroque', ['Bach', 'Telemann', 'Buxtehude']),
      iberian: st('Spanish Baroque guitar', 'Gaspar Sanz baroque guitar', ['Gaspar Sanz']),
      american: st('Colonial American music', 'colonial American music 18th century', ['colonial American music']),
      ottoman: st('Ottoman classical music', 'Ottoman classical music Dimitrie Cantemir', ['Cantemir']),
      japanese: st('Edo period music (shamisen & koto)', 'Edo period music koto shamisen', ['koto']),
      chinese: st('Qing dynasty music', 'Qing dynasty court music', ['guqin']),
      russian: st('Russian Baroque', 'Russian baroque choral music', ['Bortniansky']),
    }[R] || st('Baroque music', 'baroque music', ['baroque']);
    out.push(m);
    if (['british', 'american', 'european'].includes(R)) out.push(st('Folk & dance tunes of the 1600s–1700s', 'English Dancing Master Playford tunes', ['Playford']));
  } else if (y < 1820) {
    const m = {
      american: st('Revolutionary-era fife & drum', 'Revolutionary War fife and drum music', ['Yankee Doodle', 'fife and drum']),
      british: st('Georgian England', 'Georgian era music 18th century England', ['Handel', 'Thomas Arne']),
      french: y >= 1789 && y <= 1799 ? st('Songs of the French Revolution', 'French Revolution songs Ça ira Marseillaise', ['La Marseillaise', 'Ça ira']) : st('Classical-era France', 'French classical era music 18th century', ['Gossec']),
      german: st('Viennese Classical (Haydn, Mozart, Beethoven)', 'Haydn Mozart classical era', ['Mozart', 'Haydn', 'Beethoven']),
      italian: st('Italian opera & classical era', 'Paisiello Cimarosa classical era opera', ['Cimarosa', 'Rossini']),
      russian: st('Classical-era Russia', 'Bortniansky choral', ['Bortniansky']),
    }[R] || st('Classical era music', 'classical era music Mozart Haydn', ['Mozart', 'Haydn']);
    out.push(m);
    if (maritime) out.push(st('Sea shanties', 'traditional sea shanty 18th century', ['sea shanty']));
  } else if (y < 1895) {
    const m = {
      american: y >= 1855 && y <= 1870 ? st('Songs of the American Civil War', 'American Civil War songs period', ['Battle Hymn of the Republic', 'When Johnny Comes Marching Home'])
        : st('19th-century American songs', 'Stephen Foster 19th century American song', ['Stephen Foster']),
      british: st('Victorian music hall & parlour songs', 'Victorian music hall songs', ['Arthur Sullivan', 'music hall']),
      french: st('French Romantic music', 'Berlioz Chopin French romantic', ['Berlioz', 'Chopin', 'Offenbach']),
      german: st('German Romantic music', 'Schubert Schumann Brahms romantic', ['Schubert', 'Schumann', 'Brahms']),
      italian: st('Italian opera (Verdi & Rossini)', 'Verdi Rossini opera', ['Verdi', 'Rossini']),
      russian: st('Russian Romantic music', 'Tchaikovsky Glinka Russian romantic', ['Tchaikovsky', 'Glinka']),
      nordic: st('Nordic Romantic music', 'Grieg nordic romantic music', ['Grieg']),
    }[R] || st('Romantic era music', 'romantic era classical music', ['Chopin', 'Liszt']);
    out.push(m);
  } else if (y <= 1925) {
    out.push(st(`Records from ${y}`, `${y} music recording`, []));
    if (y <= 1918 && y >= 1897) out.push(st('Ragtime', 'ragtime original recording', ['Scott Joplin']));
    if (y >= 1914 && y <= 1918) out.push(st('Songs of the First World War', 'World War I songs original recordings', ['Over There']));
    if (y >= 1919) out.push(st('The Jazz Age', 'early jazz 1920s original recording', ['jazz 1920s']));
  } else {
    const adj = { french: 'French', german: 'German', italian: 'Italian', iberian: 'Spanish', russian: 'Russian', chinese: 'Chinese', japanese: 'Japanese', indian: 'Indian', islamic: 'Arabic', ottoman: 'Turkish', nordic: 'Swedish', mesoamerican: 'Mexican', african: 'African' }[R];
    out.push(st(`Music of ${y}`, `${adj ? adj + ' ' : ''}popular songs of ${y}`, []));
  }
  return out.filter(Boolean).slice(0, 3);
}

// ── Picks that differ from event to event ────────────────────────────────
function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function pick(arr, n, seed) { return [...arr].sort((a, b) => hash(seed + (a.id || a.url || a.name)) - hash(seed + (b.id || b.url || b.name))).slice(0, n); }

// ── Composers of the time (Wikidata) ─────────────────────────────────────
async function composersFor(y, region) {
  if (y < 600) return [];                         // too few named composers to be useful
  const band = Math.round(y / 10) * 10;
  return topic('composers', `${band}`, async () => {
    const rows = await sparql(`SELECT ?c ?cLabel ?b ?d ?img ?article ?countryLabel ?links WHERE {
      ?c wdt:P106 wd:Q36834 ; wdt:P569 ?b ; wikibase:sitelinks ?links .
      FILTER(?links > 12)
      FILTER(YEAR(?b) >= ${band - 70} && YEAR(?b) <= ${band - 12})
      OPTIONAL { ?c wdt:P570 ?d } OPTIONAL { ?c wdt:P18 ?img } OPTIONAL { ?c wdt:P27 ?country }
      ?article schema:about ?c ; schema:isPartOf <https://en.wikipedia.org/> .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } ORDER BY DESC(?links) LIMIT 80`);
    const byId = new Map();
    for (const r of rows) {
      const id = r.c.value.split('/').pop();
      const died = r.d ? parseInt(r.d.value, 10) : null;
      if (died != null && died < band - 5) continue;
      const cur = byId.get(id) || { id, name: r.cLabel?.value, born: parseInt(r.b.value, 10), died,
        portrait: r.img ? r.img.value.replace(/^http:/, 'https:') + '?width=200' : null, url: r.article?.value, countries: [], links: parseInt(r.links?.value || '0', 10) };
      if (r.countryLabel?.value && !cur.countries.includes(r.countryLabel.value)) cur.countries.push(r.countryLabel.value);
      byId.set(id, cur);
    }
    return [...byId.values()].filter(c => c.name && !/^Q\d+$/.test(c.name)).slice(0, 40);
  }).then(list => {
    // Prefer composers from the same part of the world
    const ranked = (list || []).map(c => ({ c, local: regionOf(c.countries, '') === region }))
      .sort((a, b) => (b.local - a.local) || (b.c.links - a.c.links)).map(x => x.c);
    return ranked;
  }).catch(e => { S.note('composers', e.message); return []; });
}

// ── Recordings on Wikimedia Commons (freely licensed) ────────────────────
async function commonsAudio(q, limit = 10) {
  return topic('commons-audio', q, async () => {
    const d = await getJSON(`https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&generator=search&gsrnamespace=6&gsrlimit=${limit}`
      + `&gsrsearch=${enc('filetype:audio ' + q)}&prop=videoinfo&viprop=url|derivatives|extmetadata|mime&viextmetadatafilter=Artist|LicenseShortName|ObjectName`);
    const out = [];
    for (const p of d.query?.pages || []) {
      const vi = p.videoinfo?.[0];
      if (!vi || /midi/.test(vi.mime || '') || /\.midi?$/i.test(p.title)) continue;            // skip synthesized MIDI
      if (/pronunciation|spoken|wikipedia|^File:(LL-|En-|De-|Fr-)/i.test(p.title)) continue;     // skip spoken-word files
      const mp3 = (vi.derivatives || []).find(x => /audio\/mpeg/.test(x.type || ''))?.src;
      const meta = vi.extmetadata || {};
      const strip = (h) => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      out.push({ url: mp3 || vi.url, title: strip(meta.ObjectName?.value) || p.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' '),
        performer: strip(meta.Artist?.value).slice(0, 80), license: meta.LicenseShortName?.value || '', source: 'Wikimedia Commons',
        link: vi.descriptionurl || `https://commons.wikimedia.org/wiki/${enc(p.title)}` });
    }
    return out;
  }).catch(e => { S.note('commons audio', e.message); return []; });
}

// ── 78rpm records from the event's year (Internet Archive, 1895–1925) ───
async function records78(y) {
  return topic('78rpm', String(y), async () => {
    const d = await getJSON(`https://archive.org/advancedsearch.php?q=${enc(`collection:78rpm AND year:[${y - 1} TO ${y + 1}]`)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=year&sort[]=downloads+desc&rows=24&output=json`);
    const docs = d.response?.docs || [];
    const items = await pool(docs.slice(0, 16), 4, async doc => {
      const meta = await getJSON(`https://archive.org/metadata/${enc(doc.identifier)}`);
      const f = (meta.files || []).find(x => /\.mp3$/i.test(x.name) && !/_sample/i.test(x.name));
      if (!f) return null;
      const creator = Array.isArray(doc.creator) ? doc.creator[0] : doc.creator;
      return { url: `https://archive.org/download/${doc.identifier}/${encodeURIComponent(f.name)}`, title: doc.title, performer: creator || '',
        year: doc.year, license: 'Public domain (US)', source: 'Internet Archive · Great 78 Project', link: `https://archive.org/details/${doc.identifier}`, proxy: true };
    });
    return items.filter(Boolean);
  }).catch(e => { S.note('78rpm', e.message); return []; });
}

// ── YouTube performances, filtered for the real thing ────────────────────
const MUSICAL = /\b(music|song|songs|chant|hymn|ballad|dance|melody|lyre|harp|lute|oud|madrigal|motet|mass|anthem|march|symphony|concerto|sonata|carol|fife|shanty|reconstruct\w*|ensemble|instrument\w*|guqin|gagaku|koto|shamisen|sitar|raga|ragtime|jazz|organum|estampie|opera|aria|quartet|recording|record|78 ?rpm|phonograph|choir|choral|cantiga|troubadour|psalm)\b/i;
const NOT_PERIOD = /\b(reaction|reacts|tutorial|lesson|how to play|top \d+|ranking|meme|lofi|lo-fi|beats|fantasy|tavern|ambient|epic music|game|minecraft|skyrim|witcher|dnd|d&d|sleep|study|relax\w*|asmr|cover by|remix|8 ?bit|cyberpunk|synthwave|trap)\b/i;
async function musicVideos(styles, seed) {
  const vids = []; let pending = false;
  for (const s of styles) {
    try {
      const items = await ytSearch(s.yt, {});
      const good = items.filter(v => MUSICAL.test(v.title + ' ' + (v.desc || '')) && !NOT_PERIOD.test(v.title));
      for (const v of pick(good, 4, seed)) if (!vids.some(x => x.id === v.id)) vids.push({ id: v.id, title: v.title, channel: v.channel, thumb: v.thumb, style: s.label });
    } catch (e) { if (e instanceof S.QuotaError) { pending = true; break; } S.note('music youtube', e.message); }
  }
  return { videos: vids.slice(0, 8), pending };
}

// ── Everything for one event ─────────────────────────────────────────────
async function musicFor(ev, ctx, { videosOnly = false, noVideos = false } = {}) {
  const y = ctx.year;
  const text = [ev.text, ev.fullSummary || '', (ev.fullText || '').slice(0, 3000), ctx.period?.strong?.join(' ')].join(' ');
  const region = regionOf(ctx.places || [], text);
  const styles = stylesFor(y, region, text);
  const seed = ctx.key + '|' + y;
  const { videos, pending } = noVideos ? { videos: [], pending: false } : await musicVideos(styles, seed);
  if (videosOnly) return { videos, pending };

  let composers = [], recordings = [];
  if (y > 1895 && y <= 1925) recordings = pick(await records78(y), 5, seed);

  if (y >= 600 && y <= 1925) {
    const all = await composersFor(y, region);
    composers = pick(all.slice(0, 10), 4, seed);
    // A recording for each composer when Commons has one
    const per = await pool(composers, 3, c => commonsAudio(`"${c.name}"`, 8));
    composers = composers.map((c, i) => ({ ...c, recording: pick(per[i] || [], 1, seed)[0] || null }));
  }
  // Recordings of the styles themselves (chant, estampies, Seikilos…)
  if (recordings.length < 5) {
    const terms = uniq(styles.flatMap(s => s.commons)).slice(0, 4);
    const found = (await pool(terms, 2, t => commonsAudio(/\s/.test(t) ? `"${t}"` : t, 10))).flat().filter(Boolean);
    const taken = new Set(composers.map(c => c.recording?.url).filter(Boolean));
    recordings.push(...pick(found.filter(r => !taken.has(r.url)), 5 - recordings.length, seed));
  }
  return { label: styles.map(s => s.label).join(' · '), region, styles: styles.map(s => s.label), composers, recordings, videos, pending };
}

module.exports = { musicFor, _test: { regionOf, stylesFor } };
