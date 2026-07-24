require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// ─── Helper ───────────────────────────────────────────────────────────────
function missingKey(res, name) {
  return res.status(500).json({ error: `${name} API key not configured` });
}

// ─── DPLA ─────────────────────────────────────────────────────────────────
// Search millions of items from U.S. libraries, archives, and museums
app.get('/api/dpla', async (req, res) => {
  const key = process.env.DPLA_API_KEY;
  if (!key) return missingKey(res, 'DPLA');
  const { q, page_size = 6 } = req.query;
  try {
    const url = `https://api.dp.la/v2/items?q=${encodeURIComponent(q)}&page_size=${page_size}&api_key=${key}`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── NASA APOD ────────────────────────────────────────────────────────────
// Astronomy Picture of the Day — pass a date (YYYY-MM-DD) or omit for today
app.get('/api/nasa/apod', async (req, res) => {
  const key = process.env.NASA_API_KEY;
  if (!key) return missingKey(res, 'NASA');
  const { date } = req.query;
  try {
    const dateParam = date ? `&date=${date}` : '';
    const url = `https://api.nasa.gov/planetary/apod?api_key=${key}${dateParam}`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Smithsonian ──────────────────────────────────────────────────────────
// Search artifacts across all Smithsonian museums
app.get('/api/smithsonian', async (req, res) => {
  const key = process.env.SMITHSONIAN_API_KEY;
  if (!key) return missingKey(res, 'Smithsonian');
  const { q, rows = 6, type = 'edanmdm' } = req.query;
  try {
    const url = `https://api.si.edu/openaccess/api/v1.0/search?q=${encodeURIComponent(q)}&rows=${rows}&api_key=${key}`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Europeana ────────────────────────────────────────────────────────────
// Search 50M+ cultural heritage items from European museums and archives
app.get('/api/europeana', async (req, res) => {
  const key = process.env.EUROPEANA_API_KEY;
  if (!key) return missingKey(res, 'Europeana');
  const { q, rows = 6 } = req.query;
  try {
    const url = `https://api.europeana.eu/record/v2/search.json?wskey=${key}&query=${encodeURIComponent(q)}&rows=${rows}&media=true&thumbnail=true`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── FRED Inflation ───────────────────────────────────────────────────────
// Fetch CPI observations between two dates for inflation calculation
// Series: CPIAUCSL (monthly CPI for All Urban Consumers)
app.get('/api/fred/cpi', async (req, res) => {
  const key = process.env.FRED_API_KEY;
  if (!key) return missingKey(res, 'FRED');
  const { start, end } = req.query;
  // Default: full available range for maximum flexibility
  const startDate = start || '1913-01-01';
  const endDate = end || new Date().toISOString().split('T')[0];
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=CPIAUCSL&api_key=${key}&file_type=json&observation_start=${startDate}&observation_end=${endDate}&frequency=a`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Merriam-Webster Dictionary ───────────────────────────────────────────
// Definitions and etymologies
app.get('/api/dictionary/:word', async (req, res) => {
  const key = process.env.MERRIAM_WEBSTER_DICTIONARY_API_KEY;
  if (!key) return missingKey(res, 'Merriam-Webster Dictionary');
  const { word } = req.params;
  try {
    const url = `https://www.dictionaryapi.com/api/v3/references/collegiate/json/${encodeURIComponent(word)}?key=${key}`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Merriam-Webster Thesaurus ────────────────────────────────────────────
app.get('/api/thesaurus/:word', async (req, res) => {
  const key = process.env.MERRIAM_WEBSTER_THESAURUS_API_KEY;
  if (!key) return missingKey(res, 'Merriam-Webster Thesaurus');
  const { word } = req.params;
  try {
    const url = `https://www.dictionaryapi.com/api/v3/references/thesaurus/json/${encodeURIComponent(word)}?key=${key}`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Google Books ─────────────────────────────────────────────────────────
// Book metadata, covers, preview links
app.get('/api/books', async (req, res) => {
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  if (!key) return missingKey(res, 'Google Books');
  const { q, maxResults = 5 } = req.query;
  try {
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=${maxResults}&key=${key}`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    keys: {
      dpla: !!process.env.DPLA_API_KEY,
      nasa: !!process.env.NASA_API_KEY,
      smithsonian: !!process.env.SMITHSONIAN_API_KEY,
      europeana: !!process.env.EUROPEANA_API_KEY,
      fred: !!process.env.FRED_API_KEY,
      mw_dictionary: !!process.env.MERRIAM_WEBSTER_DICTIONARY_API_KEY,
      mw_thesaurus: !!process.env.MERRIAM_WEBSTER_THESAURUS_API_KEY,
      google_books: !!process.env.GOOGLE_BOOKS_API_KEY,
    }
  });
});

// ─── Catch-all: serve frontend ────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Pable running on port ${PORT}`);
});
