/**
 * Highlighter: Walks DOM text nodes and wraps saved words in highlight spans.
 *
 * Uses the WordTrie for O(n) single-pass matching — walks each text node's
 * characters through the trie once, regardless of how many saved words exist.
 */

import { WordTrie } from '../../shared/trie.js';
import { HIGHLIGHT, LIMITS } from '../../shared/constants.js';
import { getHighlightBg, getHighlightUnderline } from '../../shared/colors.js';
import { escapeHtml } from '../../shared/utils.js';

// Inflection map cache (lazy loaded from ecdict-inflections.json)
let inflectionMap = null;

async function loadInflectionMap() {
  if (inflectionMap) return inflectionMap;
  try {
    const url = chrome.runtime.getURL('shared/ecdict-inflections.json');
    const res = await fetch(url);
    if (res.ok) {
      inflectionMap = await res.json();
    } else {
      inflectionMap = {};
    }
  } catch {
    inflectionMap = {};
  }
  return inflectionMap;
}

/**
 * Highlight all saved words in the document, including inflected forms.
 * @param {Array<{ id: string, text: string, color: string|null, mastered: boolean, type?: string }>} words
 * @returns {Promise<number>} Number of highlights applied
 */
export async function highlightAll(words) {
  if (!words || words.length === 0) return 0;

  // Load inflection map for matching word variants
  const imap = await loadInflectionMap();

  // Expand words with inflection forms
  const trie = new WordTrie();
  for (const w of words) {
    // Words are already filtered by getHighlightWords (type === 'word' only)
    trie.insert(w.text.toLowerCase(), w.id, w.color, w.mastered);
    // Also add known inflected forms that map to this word
    for (const [form, base] of Object.entries(imap)) {
      if (base === w.text.toLowerCase()) {
        trie.insert(form, w.id, w.color, w.mastered);
      }
    }
  }

  if (trie.size === 0) return 0;

  let count = 0;

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        // Skip script/style/noscript content
        if (node.parentNode) {
          const tag = node.parentNode.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEXTAREA') {
            return NodeFilter.FILTER_REJECT;
          }
        }
        // Skip nodes inside our own highlights or popup
        if (node.parentNode && (
          node.parentNode.classList?.contains(HIGHLIGHT.BASE_CLASS) ||
          node.parentNode.classList?.contains(HIGHLIGHT.MASTERED_CLASS) ||
          node.parentNode.id === HIGHLIGHT.POPUP_CONTAINER_ID ||
          node.parentNode.closest?.(`#${HIGHLIGHT.POPUP_CONTAINER_ID}`)
        )) {
          return NodeFilter.FILTER_REJECT;
        }
        // Skip empty or very long text nodes
        const text = node.textContent?.trim();
        if (!text || text.length > LIMITS.MAX_TEXT_NODE_LENGTH) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const textNodes = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }

  for (const node of textNodes) {
    const matches = trie.findMatches(node.textContent);
    if (matches.length > 0) {
      count += applyHighlights(node, matches);
    }
  }

  return count;
}

/**
 * Apply highlight spans to matches within a single text node.
 * Works backwards to preserve text offsets.
 *
 * @param {Text} textNode
 * @param {Array<{ start: number, end: number, itemId: string, color: string|null, mastered: boolean, text: string }>} matches
 * @returns {number} Number of highlights applied
 */
function applyHighlights(textNode, matches) {
  if (matches.length === 0) return 0;

  // Sort by start position, descending (work backwards)
  const sorted = [...matches].sort((a, b) => b.start - a.start);
  let count = 0;

  for (const match of sorted) {
    try {
      const range = document.createRange();
      range.setStart(textNode, match.start);
      range.setEnd(textNode, match.end);

      const span = createHighlightSpan(match);
      range.surroundContents(span);
      count++;
    } catch (err) {
      // Range may be invalid if the DOM was modified — skip this match
      console.debug('Highlight apply failed:', match.text, err.message);
    }
  }

  return count;
}

/**
 * Create a highlight span element.
 * @param {object} match
 * @returns {HTMLSpanElement}
 */
function createHighlightSpan(match) {
  const span = document.createElement('span');
  span.className = match.mastered ? HIGHLIGHT.MASTERED_CLASS : HIGHLIGHT.BASE_CLASS;
  // Respect global highlight toggle state
  if (window.__lecturaHighlightsVisible === false) {
    span.classList.add('lectura-hidden');
  }
  span.dataset.itemId = match.itemId;
  span.dataset.color = match.color || '';
  span.dataset.mastered = match.mastered ? '1' : '0';

  const bgColor = getHighlightBg(match.color, match.mastered);
  const ul = getHighlightUnderline(match.mastered, match.color);

  span.style.cssText = `
    background-color: ${bgColor};
    text-decoration: ${ul.decoration};
    text-underline-offset: 3px;
    text-decoration-color: ${ul.color};
    border-radius: 2px;
    padding: 1px 0;
    cursor: pointer;
    transition: background-color 0.2s ease;
  `;

  span.addEventListener('mouseenter', function () {
    if (match.mastered) {
      this.style.backgroundColor = 'rgba(0,0,0,0.04)';
    } else {
      this.style.backgroundColor = getHighlightBg(match.color, false);
      this.style.filter = 'brightness(0.92)';
    }
  });

  span.addEventListener('mouseleave', function () {
    this.style.backgroundColor = bgColor;
    this.style.filter = '';
  });

  return span;
}

/**
 * Clear all highlights from the document.
 */
export function clearAllHighlights() {
  const highlights = document.querySelectorAll(`.${HIGHLIGHT.BASE_CLASS}, .${HIGHLIGHT.MASTERED_CLASS}`);
  highlights.forEach(span => {
    const parent = span.parentNode;
    if (parent) {
      // Replace span with its text content
      const text = document.createTextNode(span.textContent);
      parent.replaceChild(text, span);
      // Normalize to merge adjacent text nodes
      parent.normalize();
    }
  });
}

/**
 * Re-highlight: clear existing and re-apply with new word data.
 * @param {Array<object>} words
 * @returns {number} Count of highlights applied
 */
export function rehighlight(words) {
  clearAllHighlights();
  return highlightAll(words);
}

/**
 * Update a single word's highlight style (e.g., after master/unmaster).
 * @param {string} itemId
 * @param {boolean} mastered
 * @param {string|null} color
 */
export function updateHighlightStyle(itemId, mastered, color) {
  const spans = document.querySelectorAll(`[data-item-id="${itemId}"]`);
  const bgColor = getHighlightBg(color, mastered);
  const ul = getHighlightUnderline(mastered, color);

  spans.forEach(span => {
    span.className = mastered ? HIGHLIGHT.MASTERED_CLASS : HIGHLIGHT.BASE_CLASS;
    span.dataset.mastered = mastered ? '1' : '0';
    span.style.backgroundColor = bgColor;
    span.style.textDecoration = ul.decoration;
    span.style.textDecorationColor = ul.color;
    if (color) {
      span.dataset.color = color;
    }
  });
}

/**
 * Get the word data for a highlighted span element.
 * @param {HTMLElement} span
 * @returns {{ itemId: string, text: string, color: string|null, mastered: boolean } | null}
 */
export function getHighlightData(span) {
  if (!span || (!span.classList.contains(HIGHLIGHT.BASE_CLASS) && !span.classList.contains(HIGHLIGHT.MASTERED_CLASS))) {
    return null;
  }

  return {
    itemId: span.dataset.itemId,
    text: span.textContent?.trim() || '',
    color: span.dataset.color || null,
    mastered: span.dataset.mastered === '1'
  };
}
