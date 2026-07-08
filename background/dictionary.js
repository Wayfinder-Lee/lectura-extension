/**
 * Local Dictionary Engine — ECDICT backed, IndexedDB powered.
 *
 * On first install, loads the filtered ECDICT JSON into IndexedDB.
 * All subsequent lookups query IndexedDB directly (<5ms, fully offline).
 *
 * Data source: skywind3000/ECDICT (MIT License)
 *   - ~50,000-60,000 words filtered by BNC/COCA/Collins/exam tags
 */

const DB_NAME = 'lectura-dict';
const DB_VERSION = 1;
const STORE_NAME = 'words';
const META_STORE = 'meta';

let dbPromise = null;

// ─── Database Initialization ────────────────────────────────

/**
 * Open (or create) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create word store (keyed by lowercase word)
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'w' });
        store.createIndex('word', 'w', { unique: true });
      }

      // Create metadata store for tracking init state
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      console.error('IndexedDB open error:', event.target.error);
      reject(event.target.error);
    };
  });

  return dbPromise;
}

/**
 * Check if the dictionary has been initialized (data loaded).
 * @returns {Promise<boolean>}
 */
async function isInitialized() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(META_STORE, 'readonly');
      const store = tx.objectStore(META_STORE);
      const req = store.get('initialized');
      req.onsuccess = () => resolve(req.result?.value === true);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/**
 * Load the ECDICT JSON data into IndexedDB.
 * This is called once on first install/update.
 *
 * @returns {Promise<{ success: boolean, count: number, error?: string }>}
 */
export async function loadDictionary() {
  try {
    const initialized = await isInitialized();
    if (initialized) {
      const count = await getWordCount();
      return { success: true, count, cached: true };
    }

    console.log('LECTURA: Loading dictionary into IndexedDB...');

    // Fetch the bundled JSON file
    const dictUrl = chrome.runtime.getURL('shared/ecdict-filtered.json');
    const response = await fetch(dictUrl);

    if (!response.ok) {
      return { success: false, error: `词典文件加载失败: HTTP ${response.status}` };
    }

    const data = await response.json();
    const words = data.words || {};
    const entries = Object.entries(words);

    console.log(`LECTURA: Inserting ${entries.length} words into IndexedDB...`);

    const db = await openDB();

    // Insert in batches to avoid blocking
    const BATCH_SIZE = 2000;
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);

      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        for (const [word, entry] of batch) {
          // Ensure the word key is set
          store.put({ w: word, ...entry });
        }

        tx.oncomplete = resolve;
        tx.onerror = (e) => {
          console.error('Batch insert error:', e.target.error);
          reject(e.target.error);
        };
      });

      if (i % 10000 === 0) {
        console.log(`  Loaded ${Math.min(i + BATCH_SIZE, entries.length)}/${entries.length}...`);
      }
    }

    // Mark as initialized
    await new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, 'readwrite');
      const store = tx.objectStore(META_STORE);
      store.put({ key: 'initialized', value: true });
      store.put({ key: 'wordCount', value: entries.length });
      store.put({ key: 'version', value: data.version || 1 });
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });

    console.log(`LECTURA: Dictionary loaded — ${entries.length} words`);
    return { success: true, count: entries.length };
  } catch (err) {
    console.error('LECTURA: Dictionary load failed:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Get the total word count in the dictionary.
 * @returns {Promise<number>}
 */
async function getWordCount() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const count = await new Promise((resolve) => {
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    });
    return count;
  } catch {
    return 0;
  }
}

// ─── Word Lookup ────────────────────────────────────────────

/**
 * Look up a word in the local dictionary.
 * Also checks inflection map for word variants (past tense, plural, etc.).
 *
 * @param {string} word - The word to look up (case-insensitive)
 * @returns {Promise<{ found: boolean, data?: object }>}
 */
export async function lookupWord(word) {
  if (!word || word.trim().length === 0) {
    return { found: false };
  }

  const query = word.trim().toLowerCase();

  // Ensure dictionary is loaded
  const initResult = await loadDictionary();
  if (!initResult.success) {
    return { found: false, error: initResult.error };
  }

  try {
    const db = await openDB();

    // Try direct lookup
    let result = await queryWord(db, query);
    if (result) {
      return { found: true, data: formatEntry(result, word) };
    }

    // Try capitalized (proper nouns)
    if (query !== word.trim()) {
      result = await queryWord(db, word.trim());
      if (result) {
        return { found: true, data: formatEntry(result, word) };
      }
    }

    // Try inflection map (walked → walk, took → take)
    const baseForm = await lookupInflection(query);
    if (baseForm && baseForm !== query) {
      result = await queryWord(db, baseForm);
      if (result) {
        return { found: true, data: formatEntry(result, word, baseForm) };
      }
    }

    return { found: false };
  } catch (err) {
    console.error('LECTURA: Word lookup error:', err);
    return { found: false, error: err.message };
  }
}

/**
 * Query a single word from IndexedDB.
 */
function queryWord(db, word) {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(word.toLowerCase());
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

/**
 * Look up a word in the inflection map.
 * Handles plural → singular, past tense → base form, etc.
 */
async function lookupInflection(word) {
  try {
    const url = chrome.runtime.getURL('shared/ecdict-inflections.json');
    // Cache the inflection map in memory after first load
    if (!lookupInflection._map) {
      const response = await fetch(url);
      if (response.ok) {
        lookupInflection._map = await response.json();
      } else {
        lookupInflection._map = {};
      }
    }
    return lookupInflection._map[word] || null;
  } catch {
    return null;
  }
}

/**
 * Format a raw IndexedDB entry into the popup-friendly dictionary data.
 *
 * @param {object} entry - Raw entry from IndexedDB
 * @param {string} originalWord - The word as typed by user
 * @param {string|null} baseForm - Base form if this was an inflected lookup
 * @returns {object} Formatted dictionary data
 */
function formatEntry(entry, originalWord, baseForm = null) {
  return {
    word: originalWord,
    baseForm: baseForm,
    phonetic: entry.p || '',
    definitions: entry.d || [],
    pos: entry.s || '',
    examType: (entry.t || []).map(tag => formatExamTag(tag)).filter(Boolean).join(', '),
    examTags: entry.t || [],
    collins: entry.c || '',
    oxford: entry.o || false,
    bncRank: entry.b || '',
    cocaRank: entry.f || '',
    exchange: entry.e || ''
  };
}

/**
 * Format an exam tag code to human-readable label.
 */
function formatExamTag(tag) {
  const labels = {
    'zk': '中考',
    'gk': '高考',
    'cet4': 'CET-4',
    'cet6': 'CET-6',
    'toefl': 'TOEFL',
    'ielts': 'IELTS',
    'gre': 'GRE',
    '考研': '考研',
    '专四': 'TEM-4',
    '专八': 'TEM-8'
  };
  return labels[tag] || tag.toUpperCase();
}

// ─── Inflection-based suggestions ───────────────────────────

/**
 * Get word forms (past tense, plural, etc.) for a given base word.
 * @param {string} word
 * @returns {Promise<string[]>}
 */
export async function getWordForms(word) {
  const result = await lookupWord(word);
  if (!result.found || !result.data.exchange) return [];

  const forms = [];
  const exchange = result.data.exchange;
  const parts = exchange.split('/');

  const labels = {
    'p': '过去式',
    'd': '过去分词',
    'i': '现在分词',
    '3': '三单',
    's': '复数',
    'r': '比较级',
    't': '最高级'
  };

  for (const part of parts) {
    const [code, ...formParts] = part.split(':');
    const form = formParts.join(':');
    if (form && labels[code]) {
      forms.push(`${form} (${labels[code]})`);
    }
  }

  return forms;
}

// ─── Stats ──────────────────────────────────────────────────

/**
 * Get dictionary statistics.
 * @returns {Promise<{ wordCount: number, initialized: boolean }>}
 */
export async function getDictStats() {
  const initialized = await isInitialized();
  const count = initialized ? await getWordCount() : 0;
  return { wordCount: count, initialized };
}

/**
 * Reset and reload the dictionary.
 */
export async function resetDictionary() {
  try {
    const db = await openDB();

    // Clear word store
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });

    // Clear meta
    await new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, 'readwrite');
      tx.objectStore(META_STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });

    dbPromise = null;
    lookupInflection._map = null;

    console.log('LECTURA: Dictionary reset');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
