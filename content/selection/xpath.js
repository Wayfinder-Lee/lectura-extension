/**
 * XPath and text-quote anchor utilities for highlight persistence.
 *
 * Generates three types of anchors for each selection:
 *   1. XPath anchor — precise DOM position
 *   2. Text-quote anchor — 32-char context + exact text match
 *   3. CSS selector anchor — nearest identifiable ancestor
 */

import { LIMITS } from '../../shared/constants.js';

/**
 * Get the XPath of a DOM node.
 * @param {Node} node
 * @returns {string} XPath string
 */
export function getXPath(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const parent = node.parentNode;
    const siblings = Array.from(parent.childNodes).filter(n => n.nodeType === Node.TEXT_NODE);
    const index = siblings.indexOf(node);
    return getXPath(parent) + `/text()[${index + 1}]`;
  }

  if (node === document.body) {
    return '/html/body';
  }

  if (node === document.documentElement) {
    return '/html';
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  let path = '';
  let current = node;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let segment = current.tagName.toLowerCase();

    if (current.id) {
      segment = `*[@id="${current.id}"]`;
      path = '/' + segment + path;
      break; // ID is unique, stop here
    }

    // Add position among siblings of same tag
    const parent = current.parentNode;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        c => c.tagName === current.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        segment += `[${index}]`;
      }
    }

    path = '/' + segment + path;
    current = current.parentNode;
  }

  return path;
}

/**
 * Resolve an XPath to a DOM node.
 * @param {string} xpath
 * @param {Document} doc
 * @returns {Node|null}
 */
export function resolveXPath(xpath, doc = document) {
  try {
    const result = doc.evaluate(
      xpath,
      doc,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    return result.singleNodeValue;
  } catch (err) {
    console.warn('XPath resolution failed:', xpath, err);
    return null;
  }
}

/**
 * Generate all three anchor types for a selection range.
 * @param {Range} range
 * @param {string} text - The selected text
 * @returns {object} Anchor data
 */
export function generateAnchors(range, text) {
  const startContainer = range.startContainer;
  const endContainer = range.endContainer;
  const startOffset = range.startOffset;
  const endOffset = range.endOffset;

  // 1. XPath anchors
  const xpathStart = getXPath(startContainer);
  const xpathEnd = getXPath(endContainer);

  // 2. Text-quote anchor
  const contextBefore = getTextContext(startContainer, startOffset, -LIMITS.CONTEXT_CHARS);
  const contextAfter = getTextContext(endContainer, endOffset, LIMITS.CONTEXT_CHARS);

  // 3. CSS selector anchor
  const cssSelector = getNearestSelector(range.commonAncestorContainer);

  return {
    xpathStart,
    xpathEnd,
    offsetStart: startOffset,
    offsetEnd: endOffset,
    textQuote: text,
    contextBefore,
    contextAfter,
    cssSelector
  };
}

/**
 * Resolve anchors to a Range, trying each strategy in order.
 * @param {object} anchor - Anchor data from generateAnchors()
 * @param {Document} doc
 * @returns {Range|null}
 */
export function resolveAnchors(anchor, doc = document) {
  // Strategy 1: XPath
  const range = resolveByXPath(anchor, doc);
  if (range) return range;

  // Strategy 2: Text quote + context
  const range2 = resolveByTextQuote(anchor, doc);
  if (range2) return range2;

  // Strategy 3: CSS selector container
  const range3 = resolveBySelector(anchor, doc);
  if (range3) return range3;

  return null;
}

/**
 * Try to resolve by XPath + offsets.
 */
function resolveByXPath(anchor, doc) {
  try {
    const startNode = resolveXPath(anchor.xpathStart, doc);
    const endNode = resolveXPath(anchor.xpathEnd, doc);

    if (!startNode || !endNode) return null;

    const startOffset = Math.min(anchor.offsetStart, startNode.textContent?.length || 0);
    const endOffset = Math.min(anchor.offsetEnd, endNode.textContent?.length || 0);

    const range = doc.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
  } catch (err) {
    return null;
  }
}

/**
 * Try to resolve by finding the exact text quote with context verification.
 */
function resolveByTextQuote(anchor, doc) {
  if (!anchor.textQuote) return null;

  const walker = doc.createTreeWalker(
    doc.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const content = node.textContent;
    let searchFrom = 0;

    while (true) {
      const index = content.indexOf(anchor.textQuote, searchFrom);
      if (index === -1) break;

      // Verify context
      const before = content.slice(Math.max(0, index - LIMITS.CONTEXT_CHARS), index);
      const after = content.slice(index + anchor.textQuote.length, index + anchor.textQuote.length + LIMITS.CONTEXT_CHARS);

      const beforeMatch = fuzzyMatch(before, anchor.contextBefore);
      const afterMatch = fuzzyMatch(after, anchor.contextAfter);

      if (beforeMatch && afterMatch) {
        try {
          const range = doc.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + anchor.textQuote.length);
          return range;
        } catch (err) {
          return null;
        }
      }

      searchFrom = index + 1;
    }
  }

  return null;
}

/**
 * Try to resolve by CSS selector container, then search within.
 */
function resolveBySelector(anchor, doc) {
  if (!anchor.cssSelector) return null;

  try {
    const container = doc.querySelector(anchor.cssSelector);
    if (!container) return null;

    // Search all text within this container
    const walker = doc.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const index = node.textContent.indexOf(anchor.textQuote);
      if (index !== -1) {
        const range = doc.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + anchor.textQuote.length);
        return range;
      }
    }
  } catch (err) {
    return null;
  }

  return null;
}

/**
 * Get a CSS selector for the nearest identifiable ancestor.
 */
function getNearestSelector(node) {
  let current = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;

  while (current && current !== document.body && current !== document.documentElement) {
    if (current.id) {
      return `#${current.id}`;
    }
    // Look for unique class combinations
    if (current.classList && current.classList.length > 0) {
      const selector = [...current.classList].map(c => `.${CSS.escape(c)}`).join('');
      const matches = document.querySelectorAll(selector);
      if (matches.length === 1) {
        return selector;
      }
    }
    current = current.parentNode;
  }

  return null;
}

/**
 * Get text context around a position in a text node.
 */
function getTextContext(node, offset, charCount) {
  if (!node || node.nodeType !== Node.TEXT_NODE) return '';
  const text = node.textContent;

  if (charCount < 0) {
    // Before
    const start = Math.max(0, offset + charCount);
    return text.slice(start, offset);
  } else {
    // After
    const end = Math.min(text.length, offset + charCount);
    return text.slice(offset, end);
  }
}

/**
 * Simple fuzzy match: check if two strings share significant overlap.
 */
function fuzzyMatch(actual, expected) {
  if (actual === expected) return true;
  if (!actual || !expected) return true; // one side is empty, still match
  // Check if they share at least 50% of words
  const actualWords = new Set(actual.split(/\s+/).filter(Boolean));
  const expectedWords = expected.split(/\s+/).filter(Boolean);
  if (expectedWords.length === 0) return true;

  let matches = 0;
  for (const w of expectedWords) {
    if (actualWords.has(w)) matches++;
  }
  return matches / expectedWords.length >= 0.5;
}
