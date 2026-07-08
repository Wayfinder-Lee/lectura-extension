// Message types for cross-context communication
export const MSG = {
  // Content Script → Service Worker
  QUERY_WORD: 'QUERY_WORD',
  SAVE_WORD: 'SAVE_WORD',
  MARK_MASTERED: 'MARK_MASTERED',
  DELETE_WORD: 'DELETE_WORD',
  GET_HIGHLIGHT_DATA: 'GET_HIGHLIGHT_DATA',

  // Service Worker → Content Script
  QUERY_RESULT: 'QUERY_RESULT',
  HIGHLIGHTS_UPDATED: 'HIGHLIGHTS_UPDATED',
  WORD_SAVED: 'WORD_SAVED',

  // Side Panel → Service Worker
  GET_ALL_ITEMS: 'GET_ALL_ITEMS',
  UPDATE_ITEM: 'UPDATE_ITEM',
  REORDER_ITEMS: 'REORDER_ITEMS',
  DELETE_ITEM: 'DELETE_ITEM',
  FETCH_EXAMPLES: 'FETCH_EXAMPLES',
  GET_SETTINGS: 'GET_SETTINGS',
  SAVE_SETTINGS: 'SAVE_SETTINGS',
  BATCH_OPERATION: 'BATCH_OPERATION',
  EXPORT_DATA: 'EXPORT_DATA',
  IMPORT_DATA: 'IMPORT_DATA',

  // Service Worker → Side Panel
  ITEMS_DATA: 'ITEMS_DATA',
  SETTINGS_DATA: 'SETTINGS_DATA',
  STORAGE_CHANGED: 'STORAGE_CHANGED'
};

// Word classification threshold
export const WORD_THRESHOLD = 6; // ≤6 = word, ≥7 = sentence

// Storage keys
export const STORE = {
  WORDS: 'words',
  WORD_ORDER: 'wordOrder',
  SETTINGS: 'settings',
  HIGHLIGHTS: 'highlights',
  SCHEMA_VERSION: 'schemaVersion'
};

// Current schema version for migrations
export const SCHEMA_VERSION = 1;

// Macaron color palette (hex values)
export const MACARON_COLORS = [
  { hex: '#FFB3BA', name: 'Pink' },
  { hex: '#FFDFBA', name: 'Peach' },
  { hex: '#FFFFBA', name: 'Yellow' },
  { hex: '#BAFFC9', name: 'Mint' },
  { hex: '#BAE1FF', name: 'Sky Blue' },
  { hex: '#E8BAFF', name: 'Lavender' }
];

// Highlight styles
export const HIGHLIGHT = {
  NORMAL_OPACITY: 0.35,
  MASTERED_OPACITY: 0.12,
  BASE_CLASS: 'lectura-hl',
  MASTERED_CLASS: 'lectura-mastered',
  POPUP_CONTAINER_ID: 'lectura-popup-root',
  MAX_Z_INDEX: 2147483647
};

// Popup dimensions
export const POPUP = {
  MAX_WIDTH: 380,
  MIN_WIDTH: 280,
  MAX_HEIGHT: 500,
  GAP: 12 // px gap from selection
};

// API configuration
export const API = {
  DICT_URL: 'https://openapi.youdao.com/v2/dict',
  TRANS_URL: 'https://openapi.youdao.com/api',
  TIMEOUT: 8000 // ms
};

// Debounce timings (ms)
export const DEBOUNCE = {
  SELECTION: 200,
  MUTATION: 300,
  STORAGE_SYNC: 500
};

// Default LLM prompts (editable in settings)
export const DEFAULT_PROMPTS = {
  wordLookup: [
    { role: 'system', content: '你是一个专业的英汉词典助手。请严格按JSON格式返回结果，不要添加任何解释。' },
    { role: 'user', content: `请查询单词 "{{word}}"，返回以下JSON格式（只返回JSON）：
{
  "phonetic": "音标（{{UKUS}}IPA格式不要加斜杠，如 'sepəreit）",
  "definitions": ["词性缩写. 释义", "词性缩写. 释义"],
  "examType": "考试类型（CET-4, CET-6, TOEFL, IELTS, GRE, 中考, 高考, 考研 等，选最合适的，不知则留空）",
  "examples": [
    { "en": "英文例句1", "zh": "中文翻译1" },
    { "en": "英文例句2", "zh": "中文翻译2" }
  ]
}
注意：
- 音标不要加前后斜杠
- 每个释义前必须带词性缩写（如 n. v. adj. adv. vi. vt. 等），多个释义分行
- 如果单词有多个词性，每个词性单独一行释义
- 如果单词不存在，返回 { "error": "未找到" }` }
  ],

  moreExamples: [
    { role: 'system', content: '你是一个专业的英语例句生成助手。请严格按照JSON格式返回结果。' },
    { role: 'user', content: `请为单词 "{{word}}" 生成3个实用的英文例句及中文翻译。已知释义：{{definitions}}。
返回JSON格式（只返回JSON）：
{
  "examples": [
    { "en": "例句1", "zh": "翻译1" },
    { "en": "例句2", "zh": "翻译2" },
    { "en": "例句3", "zh": "翻译3" }
  ]
}` }
  ],

  sentenceTranslate: [
    { role: 'system', content: '你是一个专业的英中翻译助手。请将英文句子翻译成流畅的中文。只返回翻译结果，不要解释。' },
    { role: 'user', content: '请将以下英文句子翻译成中文：\n\n"{{text}}"' }
  ]
};

// Limits
export const LIMITS = {
  MIN_WORD_LENGTH: 2,       // minimum chars for word highlighting
  MAX_TEXT_NODE_LENGTH: 10000, // skip text nodes longer than this
  CONTEXT_CHARS: 32,         // chars before/after for text-quote anchoring
  MAX_ITEMS: 5000            // soft limit for saved items
};
