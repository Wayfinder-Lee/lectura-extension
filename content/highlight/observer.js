/**
 * MutationObserver for dynamic content (SPA pages, infinite scroll, etc.).
 *
 * Watches for DOM changes and re-scans affected subtrees for saved words.
 * Debounced to avoid performance issues from rapid mutations.
 */

import { highlightAll } from './highlighter.js';
import { HIGHLIGHT, DEBOUNCE } from '../../shared/constants.js';

let observer = null;
let pendingWords = null;
let debounceTimer = null;

/**
 * Start observing DOM mutations to re-highlight dynamic content.
 * @param {Array<object>} words - Current word list for highlighting
 */
export function startObserver(words) {
  if (observer) {
    stopObserver();
  }

  pendingWords = words;

  observer = new MutationObserver((mutations) => {
    // Collect affected subtrees
    const affectedNodes = new Set();

    for (const mutation of mutations) {
      // Added nodes
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          affectedNodes.add(node);
        }
      }
      // Character data changes on text nodes
      if (mutation.type === 'characterData' && mutation.target.parentNode) {
        // Skip our own highlight spans
        if (!mutation.target.parentNode.classList?.contains(HIGHLIGHT.BASE_CLASS) &&
            !mutation.target.parentNode.classList?.contains(HIGHLIGHT.MASTERED_CLASS)) {
          affectedNodes.add(mutation.target.parentNode);
        }
      }
    }

    if (affectedNodes.size === 0) return;

    // Debounce to accumulate rapid mutations
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      // Re-highlight on affected nodes
      if (pendingWords && pendingWords.length > 0) {
        highlightAll(pendingWords).then(newCount => {
          if (newCount > 0) {
            console.debug(`LECTURA: Added ${newCount} highlights from mutation`);
          }
        });
      }
    }, DEBOUNCE.MUTATION);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

/**
 * Update the word list used for highlighting.
 * @param {Array<object>} words
 */
export function updateWords(words) {
  pendingWords = words;
}

/**
 * Stop observing DOM mutations.
 */
export function stopObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  clearTimeout(debounceTimer);
  pendingWords = null;
}

/**
 * Set up SPA navigation detection.
 * Intercepts history.pushState/replaceState and listens for popstate.
 * @param {Function} onNavigate - Called when SPA navigation detected
 * @returns {{ destroy: Function }}
 */
export function detectSpaNavigation(onNavigate) {
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    setTimeout(() => onNavigate(), 100); // wait for DOM updates
  };

  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    setTimeout(() => onNavigate(), 100);
  };

  window.addEventListener('popstate', () => {
    setTimeout(() => onNavigate(), 100);
  });

  return {
    destroy() {
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    }
  };
}
