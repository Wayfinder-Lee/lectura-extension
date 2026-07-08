/**
 * Highlight Restorer: Restores text highlights on page load using stored XPath anchors.
 *
 * Triple-anchor fallback strategy:
 *   1. XPath → precise DOM position
 *   2. Text quote + context → fuzzy search
 *   3. CSS selector container → broad search
 */

import { resolveAnchors } from '../selection/xpath.js';
import { getHighlightBg, getHighlightUnderline } from '../../shared/colors.js';
import { HIGHLIGHT } from '../../shared/constants.js';

/**
 * Restore a single highlight from stored anchor data.
 * @param {object} anchorData - From chrome.storage.local highlights
 * @param {string} itemId - The word's storage ID
 * @param {string|null} color - Macaron color
 * @param {boolean} mastered - Whether mastered
 * @returns {boolean} Whether the highlight was successfully applied
 */
export function restoreHighlight(anchorData, itemId, color, mastered) {
  if (!anchorData || !anchorData.anchors || anchorData.anchors.length === 0) {
    return false;
  }

  for (const anchor of anchorData.anchors) {
    const range = resolveAnchors(anchor, document);
    if (range) {
      try {
        const span = document.createElement('span');
        span.className = mastered ? HIGHLIGHT.MASTERED_CLASS : HIGHLIGHT.BASE_CLASS;
        span.dataset.itemId = itemId;
        span.dataset.color = color || '';
        span.dataset.mastered = mastered ? '1' : '0';

        const bgColor = getHighlightBg(color, mastered);
        const ul = getHighlightUnderline(mastered, color);

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

        range.surroundContents(span);
        return true;
      } catch (err) {
        console.debug('Restore highlight failed for', itemId, err.message);
      }
    }
  }

  return false;
}

/**
 * Restore all highlights for the current page URL.
 * @param {Array<object>} highlightEntries - From getHighlightsForUrl()
 * @param {Map<string, { color: string|null, mastered: boolean }>} wordMetaMap - itemId → metadata
 * @returns {number} Number of highlights successfully restored
 */
export function restoreAllHighlights(highlightEntries, wordMetaMap) {
  let count = 0;

  for (const entry of highlightEntries) {
    const meta = wordMetaMap.get(entry.itemId);
    if (!meta) continue;

    const success = restoreHighlight(entry, entry.itemId, meta.color, meta.mastered);
    if (success) count++;
  }

  return count;
}
