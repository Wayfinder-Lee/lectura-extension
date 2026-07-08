import { STORE, SCHEMA_VERSION } from '../shared/constants.js';

/**
 * Storage manager: wraps chrome.storage.local with typed helpers.
 */

// ─── Settings ───────────────────────────────────────────────

export async function getSettings() {
  const result = await chrome.storage.local.get(STORE.SETTINGS);
  return result[STORE.SETTINGS] || getDefaultSettings();
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ [STORE.SETTINGS]: settings });
}

function getDefaultSettings() {
  return {
    phoneticType: 'uk',
    fontSize: 'medium',
    cardSize: 'medium',
    hideDefinitions: false,
    autoLLM: true,
    llmProvider: 'deepseek',
    llmApiKey: '',
    llmEndpoint: 'https://api.deepseek.com',
    llmModel: 'deepseek-v4-flash'
  };
}

// ─── Words (saved items) ────────────────────────────────────

export async function getAllWords() {
  const result = await chrome.storage.local.get(STORE.WORDS);
  return result[STORE.WORDS] || {};
}

export async function getWordOrder() {
  const result = await chrome.storage.local.get(STORE.WORD_ORDER);
  return result[STORE.WORD_ORDER] || [];
}

export async function getWord(wordId) {
  const words = await getAllWords();
  return words[wordId] || null;
}

export async function saveWord(wordData) {
  const words = await getAllWords();
  words[wordData.id] = wordData;
  await chrome.storage.local.set({ [STORE.WORDS]: words });
  return wordData;
}

export async function updateWord(wordId, changes) {
  const words = await getAllWords();
  if (words[wordId]) {
    words[wordId] = { ...words[wordId], ...changes, updatedAt: Date.now() };
    await chrome.storage.local.set({ [STORE.WORDS]: words });
  }
  return words[wordId] || null;
}

export async function deleteWord(wordId) {
  const words = await getAllWords();
  delete words[wordId];
  await chrome.storage.local.set({ [STORE.WORDS]: words });

  // Also remove from order
  const order = await getWordOrder();
  const newOrder = order.filter(id => id !== wordId);
  await chrome.storage.local.set({ [STORE.WORD_ORDER]: newOrder });

  // Clean up associated highlights
  await cleanHighlights(wordId);
}

export async function addToOrder(wordId) {
  const order = await getWordOrder();
  if (!order.includes(wordId)) {
    order.unshift(wordId); // newest first
    await chrome.storage.local.set({ [STORE.WORD_ORDER]: order });
  }
}

export async function reorderItems(wordIds) {
  await chrome.storage.local.set({ [STORE.WORD_ORDER]: wordIds });
}

/**
 * Get all words as an ordered array.
 * @returns {Promise<Array<object>>}
 */
export async function getOrderedWords() {
  const [words, order] = await Promise.all([getAllWords(), getWordOrder()]);
  const result = [];

  // Add items in order
  for (const id of order) {
    if (words[id]) {
      result.push(words[id]);
    }
  }

  // Append any items not in the order list
  for (const [id, word] of Object.entries(words)) {
    if (!order.includes(id)) {
      result.push(word);
    }
  }

  return result;
}

/**
 * Get all words that are of type 'word' (for highlight trie building).
 * @returns {Promise<Array<{ id: string, text: string, color: string|null, mastered: boolean }>>}
 */
export async function getHighlightWords() {
  const words = await getAllWords();
  return Object.values(words)
    .filter(w => w.type === 'word')
    .map(w => ({
      id: w.id,
      text: w.text,
      color: w.color || null,
      mastered: w.mastered || false
    }));
}

// ─── Highlights (XPath anchors per page) ────────────────────

export async function saveHighlight(itemId, url, anchorData) {
  const highlights = await getAllHighlights();
  const key = `${itemId}|${hashUrl(url)}`;
  highlights[key] = {
    itemId,
    url,
    anchors: [anchorData], // we can store multiple anchors per page
    updatedAt: Date.now()
  };
  await chrome.storage.local.set({ [STORE.HIGHLIGHTS]: highlights });
}

export async function getHighlightsForUrl(url) {
  const highlights = await getAllHighlights();
  const urlHash = hashUrl(url);
  const result = [];

  for (const [key, value] of Object.entries(highlights)) {
    if (key.endsWith(`|${urlHash}`)) {
      result.push(value);
    }
  }
  return result;
}

async function getAllHighlights() {
  const result = await chrome.storage.local.get(STORE.HIGHLIGHTS);
  return result[STORE.HIGHLIGHTS] || {};
}

async function cleanHighlights(wordId) {
  const highlights = await getAllHighlights();
  const prefix = `${wordId}|`;
  for (const key of Object.keys(highlights)) {
    if (key.startsWith(prefix)) {
      delete highlights[key];
    }
  }
  await chrome.storage.local.set({ [STORE.HIGHLIGHTS]: highlights });
}

// ─── Schema & Migration ─────────────────────────────────────

export async function getSchemaVersion() {
  const result = await chrome.storage.local.get(STORE.SCHEMA_VERSION);
  return result[STORE.SCHEMA_VERSION] || 0;
}

export async function setSchemaVersion(version) {
  await chrome.storage.local.set({ [STORE.SCHEMA_VERSION]: version });
}

export async function runMigrations() {
  const version = await getSchemaVersion();
  if (version < SCHEMA_VERSION) {
    // Future migrations go here
    await setSchemaVersion(SCHEMA_VERSION);
  }
}

// ─── Bulk Operations ────────────────────────────────────────

export async function exportAllData() {
  const [words, order, settings, highlights] = await Promise.all([
    getAllWords(),
    getWordOrder(),
    getSettings(),
    getAllHighlights()
  ]);

  // Settings are safe to export (no API secrets)
  const safeSettings = { ...settings };

  return {
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    words,
    wordOrder: order,
    settings: safeSettings,
    highlights,
    count: Object.keys(words).length
  };
}

export async function importData(data) {
  if (!data || !data.words) {
    throw new Error('无效的导入数据');
  }

  // Merge words
  const existing = await getAllWords();
  const merged = { ...existing, ...data.words };

  // Merge order (new items first)
  const existingOrder = await getWordOrder();
  const newIds = Object.keys(data.words).filter(id => !existingOrder.includes(id));
  const mergedOrder = [...newIds, ...existingOrder];

  await chrome.storage.local.set({
    [STORE.WORDS]: merged,
    [STORE.WORD_ORDER]: mergedOrder
  });

  return { count: Object.keys(data.words).length, total: Object.keys(merged).length };
}

// ─── Helpers ────────────────────────────────────────────────

function hashUrl(url) {
  let hash = 5381;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) + hash) + url.charCodeAt(i);
    hash = hash & hash;
  }
  return (hash >>> 0).toString(16);
}
