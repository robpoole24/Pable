/* ═══════════════════════════════════════════════════════════════════════
   PABLE — curation.js
   
   Handcrafted resources for specific historical events.
   Keyed by Wikipedia page title (exact match or substring).
   These supplement API results — they always appear when the event matches.
   
   Add entries here when:
   - A specific primary source chronicle exists for the event
   - A known YouTube video covers the event well
   - A specific book is the definitive work on the topic
   - A known coin or artifact should be surfaced
   ═══════════════════════════════════════════════════════════════════════ */

const CURATED = [

  // ── Battle of Nocera, 1132 ────────────────────────────────────────────
  {
    match: ['Battle of Nocera', 'Nocera', 'Roger II of Sicily', 'Ranulf II'],
    videos: [
      {
        id: 'iONwQ4Nu5_8',
        title: 'Battle of Nocera — Roger II of Sicily',
        channel: 'History Short',
        type: 'short'
      },
      {
        id: 'leAjd3fcdhE',
        title: 'Roger II and the Kingdom of Sicily',
        channel: 'History Documentary',
        type: 'documentary'
      }
    ],
    books: [
      {
        title: 'The History of the Most Serene Roger, First King of Sicily',
        author: 'Alexander of Telese (trans. Graham A. Loud)',
        type: 'Primary Source Chronicle',
        note: 'Written under Roger II\'s patronage — details his early mainland campaigns including the 1132 setback at Nocera.',
        url: 'https://www.manchesterhive.com/display/9781526112750/9781526112750.00009.xml'
      },
      {
        title: 'Chronicle of Falco of Benevento (Chronicon Beneventanum)',
        author: 'Falco of Benevento',
        type: 'Primary Source Chronicle',
        note: 'Written by a contemporary notary from nearby Benevento — an unsparing local perspective on the civil wars and Roger II\'s defeat.',
        url: null
      },
      {
        title: 'Roger II and the Creation of the Kingdom of Sicily',
        author: 'Graham A. Loud',
        type: 'Non-Fiction',
        note: 'The scholarly standard. Deep analysis of the political landscape, baronial revolts, and military engagements like Nocera.',
        url: 'https://openlibrary.org/search?q=Roger+II+Kingdom+Sicily+Loud'
      },
      {
        title: 'The Normans in Sicily',
        author: 'John Julius Norwich',
        type: 'Non-Fiction',
        note: 'Narrative history of the Hauteville family and the intense struggle between Roger II and his rebellious vassals.',
        url: 'https://openlibrary.org/search?q=Normans+Sicily+Norwich'
      }
    ],
    coins: [
      {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Roger_II_Ducalis.jpg/320px-Roger_II_Ducalis.jpg',
        caption: 'Roger II Ducalis — gold coin of Roger II of Sicily',
        source: 'Wikimedia Commons'
      },
      {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Tari_of_Roger_II_of_Sicily.jpg/320px-Tari_of_Roger_II_of_Sicily.jpg',
        caption: 'Tari of Roger II — gold quarter-dinar, minted in Sicily',
        source: 'Wikimedia Commons'
      }
    ],
    context: `The Battle of Nocera was fought on July 24, 1132, near the city of Nocera dei Pagani in southern Italy. Roger II of Sicily, attempting to consolidate Norman control over the Italian mainland, faced a coalition of rebellious barons led by Count Ranulf II of Alife and Prince Robert II of Capua. The rebels, supported by Pope Innocent II's rival claimant Anacletus II, massed their forces near Benevento. Roger marched his royal army to relieve Nocera, but was decisively defeated — one of only two major military reverses of his reign. The defeat forced Roger to temporarily withdraw to Sicily, but he would return within years to crush the rebellion and establish the unified Kingdom of Sicily in 1130, one of medieval Europe's most sophisticated states.`
  },

  // ── Apollo 11 Moon Landing ────────────────────────────────────────────
  {
    match: ['Apollo 11', 'Moon landing', 'Neil Armstrong'],
    videos: [
      { id: 'hqI3goW3BZU', title: 'We Choose to Go to the Moon — JFK Full Speech', channel: 'NASA', type: 'speech' },
      { id: 'S9HdPi9Ikhk', title: 'Apollo 11: One Giant Leap for Mankind', channel: 'National Geographic', type: 'documentary' }
    ],
    books: [
      { title: 'First Man: The Life of Neil A. Armstrong', author: 'James R. Hansen', type: 'Non-Fiction', note: 'The authorized biography — basis for the 2018 film.', url: 'https://openlibrary.org/search?q=First+Man+Neil+Armstrong+Hansen' },
      { title: 'Carrying the Fire', author: 'Michael Collins', type: 'Non-Fiction', note: 'Widely considered the best astronaut memoir ever written.', url: 'https://openlibrary.org/search?q=Carrying+Fire+Collins+astronaut' }
    ]
  },

  // ── Boston Massacre ───────────────────────────────────────────────────
  {
    match: ['Boston Massacre'],
    videos: [
      { id: 'Tz1B7ZMGJXA', title: 'The Boston Massacre — History', channel: 'History Channel', type: 'documentary' }
    ],
    books: [
      { title: 'John Adams', author: 'David McCullough', type: 'Non-Fiction', note: 'The massacre trial is covered in gripping detail.', url: 'https://openlibrary.org/search?q=John+Adams+McCullough' },
      { title: 'April Morning', author: 'Howard Fast', type: 'Fiction', note: 'A 15-year-old witnesses the Revolution — fast, visceral, historically careful.', url: 'https://openlibrary.org/search?q=April+Morning+Howard+Fast' }
    ]
  },

  // ── Magna Carta ───────────────────────────────────────────────────────
  {
    match: ['Magna Carta'],
    books: [
      { title: 'Magna Carta', author: 'David Starkey', type: 'Non-Fiction', note: 'The definitive popular history of the document and its legacy.', url: 'https://openlibrary.org/search?q=Magna+Carta+Starkey' }
    ]
  },

  // ── Julius Caesar ─────────────────────────────────────────────────────
  {
    match: ['Julius Caesar', 'Assassination of Julius Caesar', 'Ides of March'],
    books: [
      { title: 'The Gallic War (Commentarii de Bello Gallico)', author: 'Julius Caesar', type: 'Primary Source — Free to Read', note: 'Caesar\'s own account of his campaigns. Translated text freely available.', url: 'https://www.gutenberg.org/ebooks/10657' },
      { title: 'Caesar: A Biography', author: 'Christian Meier', type: 'Non-Fiction', note: 'The scholarly standard on Caesar\'s life and political world.', url: 'https://openlibrary.org/search?q=Caesar+Biography+Meier' },
      { title: 'Parallel Lives (Life of Caesar)', author: 'Plutarch', type: 'Primary Source — Free to Read', note: 'Plutarch\'s biography written 100 years after Caesar\'s death. Foundational.', url: 'https://www.gutenberg.org/ebooks/674' }
    ]
  },

  // ── Alexander the Great ───────────────────────────────────────────────
  {
    match: ['Alexander the Great', 'Alexander III of Macedon'],
    books: [
      { title: 'Anabasis of Alexander', author: 'Arrian', type: 'Primary Source — Free to Read', note: 'The most reliable ancient account of Alexander\'s campaigns, written by a Greek historian.', url: 'https://www.gutenberg.org/ebooks/46976' },
      { title: 'Alexander the Great', author: 'Robin Lane Fox', type: 'Non-Fiction', note: 'Still the gold standard popular biography, 50 years on.', url: 'https://openlibrary.org/search?q=Alexander+Great+Robin+Lane+Fox' }
    ]
  }

];

/**
 * Find curated resources for a given event.
 * @param {string} eventTitle - The Wikipedia page title or event text
 * @param {string[]} peopleNames - Key figure names extracted from the event
 * @returns {object} - { videos, books, coins, context } — any may be empty/null
 */
function getCurated(eventTitle, peopleNames = []) {
  const searchText = [eventTitle, ...peopleNames].join(' ').toLowerCase();
  
  for (const entry of CURATED) {
    const matched = entry.match.some(term => 
      searchText.includes(term.toLowerCase())
    );
    if (matched) {
      return {
        videos:  entry.videos  || [],
        books:   entry.books   || [],
        coins:   entry.coins   || [],
        context: entry.context || null
      };
    }
  }
  return { videos: [], books: [], coins: [], context: null };
}

module.exports = { getCurated };
