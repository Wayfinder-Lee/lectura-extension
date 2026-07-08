import { WORD_THRESHOLD } from './constants.js';

/**
 * Generate a simple unique ID (not RFC UUID but sufficient for this use case).
 * @returns {string} A unique ID string
 */
export function generateId() {
  return 'w_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

/**
 * Count words in a text string (splits on whitespace).
 * @param {string} text
 * @returns {number} Number of words
 */
export function countWords(text) {
  return text.trim().split(/\s+/).length;
}

/**
 * Classify selected text as 'word' or 'sentence'.
 * @param {string} text
 * @returns {'word' | 'sentence'}
 */
export function classifyText(text) {
  return countWords(text) <= WORD_THRESHOLD ? 'word' : 'sentence';
}

/**
 * Create a debounced version of a function.
 * @param {Function} fn
 * @param {number} delay - Milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Simple hash function for URL strings (djb2).
 * @param {string} str
 * @returns {string} Hex hash
 */
export function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return (hash >>> 0).toString(16);
}

/**
 * Generate a storage key for highlight data (itemId + URL hash).
 * @param {string} itemId
 * @param {string} url
 * @returns {string}
 */
export function highlightKey(itemId, url) {
  return `${itemId}|${hashString(url)}`;
}

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string} Escaped string
 */
export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Clamp a value between min and max.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Strip HTML tags from a string.
 * @param {string} html
 * @returns {string} Plain text
 */
export function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}

/**
 * Truncate text to a maximum length with ellipsis.
 * @param {string} text
 * @param {number} maxLen
 * @returns {string}
 */
export function truncate(text, maxLen) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

/**
 * Get the current timestamp in milliseconds.
 * @returns {number}
 */
export function now() {
  return Date.now();
}
