/* ═══════════════════════════════════════════════════════════════════════
   PABLE — curation.js
   Handcrafted resources for specific historical events.
   Keyed by Wikipedia page title or event text (case-insensitive substring).
   ═══════════════════════════════════════════════════════════════════════ */

const CURATED = [

  // ── Battle of Nocera, 1132 ────────────────────────────────────────────
  {
    match: ['Battle of Nocera', 'Ranulf II of Alife'],
    people: [
      {
        name: 'Roger II of Sicily',
        role: 'King of Sicily · Norman ruler and military commander',
        wikiTitle: 'Roger_II_of_Sicily'
      },
      {
        name: 'Ranulf II, Count of Alife',
        role: 'Leader of the baronial rebellion against Roger II',
        wikiTitle: 'Ranulf_II,_Count_of_Alife'
      },
      {
        name: 'Robert II of Capua',
        role: 'Prince of Capua · Allied rebel commander',
        wikiTitle: 'Robert_II_of_Capua'
      }
    ],
    videos: [
      {
        id: 'iONwQ4Nu5_8',
        title: 'The Battle of Nocera — Roger II of Sicily',
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
        note: 'Written under Roger II\'s patronage. Details his early mainland campaigns including the 1132 defeat at Nocera.',
        url: 'https://www.manchesterhive.com/display/9781526112750/9781526112750.00009.xml'
      },
      {
        title: 'Chronicle of Falco of Benevento (Chronicon Beneventanum)',
        author: 'Falco of Benevento',
        type: 'Primary Source Chronicle',
        note: 'Written by a contemporary notary from nearby Benevento. An unsparing local perspective on Roger II\'s defeat.',
        url: null
      },
      {
        title: 'Roger II and the Creation of the Kingdom of Sicily',
        author: 'Graham A. Loud',
        type: 'Non-Fiction',
        note: 'The scholarly standard. Deep analysis of the baronial revolts and military engagements including Nocera.',
        url: 'https://openlibrary.org/search?q=Roger+II+Kingdom+Sicily+Loud'
      },
      {
        title: 'The Normans in Sicily',
        author: 'John Julius Norwich',
        type: 'Non-Fiction',
        note: 'Narrative history of the Hauteville dynasty and the struggle between Roger II and his vassals.',
        url: 'https://openlibrary.org/search?q=Normans+Sicily+Norwich'
      }
    ],
    coins: [
      {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Roger_II_tari_gold_coin_Palermo_with_Arabic_inscriptions.jpg/320px-Roger_II_tari_gold_coin_Palermo_with_Arabic_inscriptions.jpg',
        caption: 'Gold Tari of Roger II of Sicily, minted Palermo, 1130–1154. Arabic inscription: "King Roger the Magnificent, powerful through Allah." Reverse: Greek "IC XC NI KA" (Jesus Christ Conquers).',
        source: 'Wikimedia Commons'
      },
      {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/Normanni%2C_emissioni_in_argento_o_bronzo%2C_118_ducale_di_ruggero_II%2C_zecca_di_palermo%2C_con_pantocrator%2C_1140-1154.jpg/320px-Normanni%2C_emissioni_in_argento_o_bronzo%2C_118_ducale_di_ruggero_II%2C_zecca_di_palermo%2C_con_pantocrator%2C_1140-1154.jpg',
        caption: 'Silver Ducalis of Roger II — Byzantine-style cup-shaped coin, Palermo mint, 1140–1154. Obverse: Christ Pantocrator. The ducalis was the first coin of its type in western Europe.',
        source: 'Wikimedia Commons'
      },
      {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Palermo%2C_ducalis_di_ruggiero_II_d%27altavilla%2C_1130-1154.JPG/320px-Palermo%2C_ducalis_di_ruggiero_II_d%27altavilla%2C_1130-1154.JPG',
        caption: 'Ducalis of Roger II d\'Altavilla, Palermo, 1130–1154. The reverse shows Roger II and his son standing — an assertion of dynastic legitimacy.',
        source: 'Wikimedia Commons'
      }
    ],
    context: `The Battle of Nocera was fought on July 24, 1132, near Nocera dei Pagani in southern Italy. Roger II of Sicily — brilliant, multilingual, and ruling one of medieval Europe's most sophisticated states — faced a coalition of rebellious Norman barons led by Count Ranulf II of Alife and Prince Robert II of Capua, backed by Pope Innocent II's rival claimant Anacletus II. The rebels massed near Benevento while Roger marched his royal army north. At Nocera, Roger was decisively defeated — one of only two major military reverses of his entire reign. He withdrew to Sicily, but returned within years to crush the rebellion. By 1139, Roger II stood undisputed ruler of a unified kingdom stretching from Sicily to Naples, encompassing Norman, Arab, Greek, and Jewish populations in a state of extraordinary cultural sophistication.`
  },

  // ── Apollo 11 ─────────────────────────────────────────────────────────
  {
    match: ['Apollo 11', 'Moon landing', 'Neil Armstrong'],
    videos: [
      { id: 'hqI3goW3BZU', title: 'JFK — We Choose to Go to the Moon (Full Speech)', channel: 'NASA', type: 'speech' },
      { id: 'S9HdPi9Ikhk', title: 'Apollo 11: One Giant Leap for Mankind', channel: 'National Geographic', type: 'documentary' }
    ],
    books: [
      { title: 'First Man: The Life of Neil A. Armstrong', author: 'James R. Hansen', type: 'Non-Fiction', note: 'The authorized biography.', url: 'https://openlibrary.org/search?q=First+Man+Neil+Armstrong' },
      { title: 'Carrying the Fire', author: 'Michael Collins', type: 'Non-Fiction', note: 'Widely considered the finest astronaut memoir ever written.', url: 'https://openlibrary.org/search?q=Carrying+Fire+Collins' }
    ]
  },

  // ── Julius Caesar ─────────────────────────────────────────────────────
  {
    match: ['Julius Caesar', 'Assassination of Julius Caesar', 'Ides of March'],
    books: [
      { title: 'Commentarii de Bello Gallico (Gallic Wars)', author: 'Julius Caesar', type: 'Primary Source — Free to Read', url: 'https://www.gutenberg.org/ebooks/10657', note: 'Caesar\'s own account of his campaigns — one of the greatest military memoirs ever written.' },
      { title: 'Parallel Lives — Life of Caesar', author: 'Plutarch', type: 'Primary Source — Free to Read', url: 'https://www.gutenberg.org/ebooks/674', note: 'Foundational biography written 100 years after Caesar\'s death.' }
    ]
  },


  // ── Arch of Constantine, 315 ──────────────────────────────────────────
  {
    match: ['Arch of Constantine', 'Constantine', 'Milvian Bridge', 'Maxentius'],
    people: [
      {
        name: 'Constantine I',
        role: 'Roman Emperor · First Christian emperor of Rome',
        wikiTitle: 'Constantine_the_Great'
      },
      {
        name: 'Maxentius',
        role: 'Roman Emperor · Defeated at the Battle of Milvian Bridge',
        wikiTitle: 'Maxentius'
      }
    ],
    videos: [
      { id: 'vvDcrzeBRyM', title: 'The Arch of Constantine — Rome', channel: 'History Channel', type: 'documentary' },
      { id: 'wqB4lYFtO7E', title: 'Arch of Constantine Explained', channel: 'toldinstone', type: 'documentary' },
      { id: 'uJLXyBzMci0', title: 'Ancient Roman Music — Synaulia', channel: 'Synaulia', type: 'music' }
    ],
    books: [
      {
        title: 'Constantine: Roman Emperor, Christian Victor',
        author: 'Paul Stephenson',
        type: 'Non-Fiction',
        note: 'The definitive modern biography of Constantine — his military campaigns, conversion, and legacy.',
        url: 'https://openlibrary.org/search?q=Constantine+Roman+Emperor+Christian+Victor+Stephenson'
      },
      {
        title: 'The Life of Constantine (Vita Constantini)',
        author: 'Eusebius of Caesarea',
        type: 'Primary Source — Free to Read',
        note: 'Written by a contemporary bishop — the first biography of a Roman emperor, covering his victory at Milvian Bridge.',
        url: 'https://www.gutenberg.org/ebooks/45976'
      },
      {
        title: 'In Hoc Signo: Constantine, Christianity and the Roman Empire',
        author: 'Various Scholars',
        type: 'Non-Fiction',
        note: 'Examines how Constantine's conversion and the Arch reshaped Western civilization.',
        url: 'https://openlibrary.org/search?q=Constantine+Christianity+Roman+Empire'
      }
    ],
    coins: [
      {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Coin_of_Constantine_I.jpg/320px-Coin_of_Constantine_I.jpg',
        caption: 'Gold solidus of Constantine I, c. 313 CE — minted shortly before the Arch was completed. Obverse: Constantine helmeted. Reverse: Sol Invictus.',
        source: 'Wikimedia Commons'
      },
      {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Constantine_I_Solidus_Trier_313_obverse.jpg/320px-Constantine_I_Solidus_Trier_313_obverse.jpg',
        caption: 'Solidus of Constantine I, Trier mint, 313 CE — the year of the Edict of Milan granting religious tolerance.',
        source: 'Wikimedia Commons'
      }
    ],
    context: `On July 25, 315 CE, the Arch of Constantine was dedicated near the Colosseum in Rome — one of the largest and best-preserved Roman triumphal arches, built to commemorate Constantine I's victory over Maxentius at the Battle of Milvian Bridge on October 28, 312 CE. The battle was a turning point in world history: Constantine, who reportedly saw a vision of a Christian cross before the battle with the words "In this sign, conquer," defeated Maxentius who drowned in the Tiber during the rout. Constantine went on to issue the Edict of Milan in 313 CE, granting religious tolerance across the empire, effectively beginning Christianity's rise to become the dominant religion of Western civilization. The arch itself is a masterpiece of spoliation — it incorporates sculptural reliefs taken from monuments of Trajan, Hadrian, and Marcus Aurelius, recut to show Constantine's features.`
  },

  // ── Alexander the Great ───────────────────────────────────────────────
  {
    match: ['Alexander the Great', 'Alexander III of Macedon'],
    books: [
      { title: 'Anabasis of Alexander', author: 'Arrian', type: 'Primary Source — Free to Read', url: 'https://www.gutenberg.org/ebooks/46976', note: 'The most reliable ancient account of Alexander\'s campaigns.' },
      { title: 'Alexander the Great', author: 'Robin Lane Fox', type: 'Non-Fiction', url: 'https://openlibrary.org/search?q=Alexander+Great+Robin+Lane+Fox', note: 'The gold standard popular biography.' }
    ]
  }
];

function getCurated(eventTitle, peopleNames = []) {
  const searchText = [eventTitle, ...peopleNames].join(' ').toLowerCase();
  for (const entry of CURATED) {
    if (entry.match.some(term => searchText.includes(term.toLowerCase()))) {
      return {
        people:  entry.people  || [],
        videos:  entry.videos  || [],
        books:   entry.books   || [],
        coins:   entry.coins   || [],
        context: entry.context || null
      };
    }
  }
  return { people: [], videos: [], books: [], coins: [], context: null };
}

module.exports = { getCurated };
