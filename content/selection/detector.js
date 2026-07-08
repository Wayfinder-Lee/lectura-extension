/**
 * Selection detector: monitors text selection on the page.
 *
 * Classifies selection as 'word' (≤6 words) or 'sentence' (≥7 words),
 * extracts position and context info, and emits events.
 */

import { classifyText, countWords } from '../../shared/utils.js';
import { DEBOUNCE, WORD_THRESHOLD } from '../../shared/constants.js';

// Re-export classify for convenience
export { classifyText };

/**
 * @callback SelectionCallback
 * @param {{ text: string, type: 'word'|'sentence', wordCount: number, rect: DOMRect, range: Range }} selectionData
 */

/**
 * Create a selection detector.
 * @param {SelectionCallback} onSelect - Called when user selects text
 * @param {Function} onDeselect - Called when selection is cleared
 * @returns {{ destroy: Function }}
 */
export function createSelectionDetector(onSelect, onDeselect) {
  let lastSelectionText = '';
  let deselectionTimer = null;
  let isMouseDown = false;

  // Track mouse state to know when user is actively selecting
  document.addEventListener('mousedown', () => { isMouseDown = true; }, { passive: true });

  // On mouseup: user has finished selecting — process immediately
  function handleMouseUp() {
    isMouseDown = false;
    // Small delay to let the browser finalize the selection
    requestAnimationFrame(() => {
      processSelection();
    });
  }

  // On selectionchange: only detect deselection (clearing text).
  // We do NOT trigger the popup here — that's mouseup's job.
  // But we also handle keyboard-only selection (Shift+Arrow) via debounce.
  function handleSelectionChange() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      // Selection was cleared — debounce before reporting deselection
      clearTimeout(deselectionTimer);
      deselectionTimer = setTimeout(() => {
        if (lastSelectionText) {
          lastSelectionText = '';
          onDeselect();
        }
      }, 300);
      return;
    }

    // If mouse is still down, user is still selecting — don't process yet
    if (isMouseDown) return;

    // Keyboard selection (no mousedown/mouseup) — use debounce
    clearTimeout(deselectionTimer);
    deselectionTimer = setTimeout(() => {
      processSelection();
    }, 400);
  }

  function processSelection() {
    const selection = window.getSelection();

    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      if (lastSelectionText) {
        lastSelectionText = '';
        onDeselect();
      }
      return;
    }

    const text = selection.toString().trim();
    if (!text || text.length < 2) {
      if (lastSelectionText) {
        lastSelectionText = '';
        onDeselect();
      }
      return;
    }

    // Don't re-trigger for the same selection
    if (text === lastSelectionText) return;
    lastSelectionText = text;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const type = classifyText(text);
    const wordCount = countWords(text);

    onSelect({ text, type, wordCount, rect, range });
  }

  document.addEventListener('mouseup', handleMouseUp, { passive: true });
  document.addEventListener('selectionchange', handleSelectionChange, { passive: true });

  return {
    destroy() {
      clearTimeout(deselectionTimer);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('selectionchange', handleSelectionChange);
    }
  };
}

/**
 * Get the sentence context surrounding the selection.
 * @param {Range} range
 * @returns {{ sentence: string, offsetStart: number, offsetEnd: number }}
 */
export function getSourceSentence(range) {
  // Expand range to encompass the full sentence
  const container = range.commonAncestorContainer;
  let fullText = '';

  if (container.nodeType === Node.TEXT_NODE) {
    fullText = container.textContent;
  } else {
    fullText = container.textContent || '';
  }

  // Find sentence boundaries around the selected text
  const selectedText = range.toString();
  const startIdx = fullText.indexOf(selectedText);

  if (startIdx === -1) {
    return { sentence: selectedText, offsetStart: 0, offsetEnd: selectedText.length };
  }

  // Find sentence start (previous . ! ? or beginning)
  let sentStart = startIdx;
  while (sentStart > 0) {
    const char = fullText[sentStart - 1];
    if (char === '.' || char === '!' || char === '?' || char === '\n') {
      break;
    }
    sentStart--;
  }

  // Find sentence end (next . ! ? or end)
  let sentEnd = startIdx + selectedText.length;
  while (sentEnd < fullText.length) {
    const char = fullText[sentEnd];
    if (char === '.' || char === '!' || char === '?') {
      sentEnd++; // include the punctuation
      break;
    }
    if (char === '\n') break;
    sentEnd++;
  }

  const sentence = fullText.slice(sentStart, sentEnd).trim();
  const offsetStart = startIdx - sentStart;
  const offsetEnd = offsetStart + selectedText.length;

  return { sentence, offsetStart, offsetEnd };
}
