/**
 * Popup UI: Creates and manages the frosted-glass popup overlay.
 *
 * Uses Shadow DOM for style isolation from the host page.
 * The popup is a fixed-position element near the text selection.
 */

import { HIGHLIGHT, POPUP } from '../../shared/constants.js';
import { clamp } from '../../shared/utils.js';
import { renderNewWordPopup, renderSavedWordPopup, renderSentencePopup, renderLoading, renderError } from './popup-templates.js';
import { createPopupEventHandlers } from './popup-events.js';

let popupHost = null;
let popupRoot = null;
let currentState = null; // { mode: 'new-word'|'saved-word'|'sentence'|'loading'|'error', ... }

/**
 * Initialize the popup host element (called once).
 */
export function initPopup() {
  if (popupHost) return;

  // Create host element
  popupHost = document.createElement('div');
  popupHost.id = HIGHLIGHT.POPUP_CONTAINER_ID;
  popupHost.style.cssText = 'position:fixed;z-index:2147483647;display:none;';

  // Create Shadow DOM
  popupRoot = popupHost.attachShadow({ mode: 'open' });

  // Inject styles into Shadow DOM
  const style = document.createElement('style');
  style.textContent = getPopupStyles();
  popupRoot.appendChild(style);

  // Content container
  const content = document.createElement('div');
  content.className = 'lectura-popup';
  popupRoot.appendChild(content);

  document.body.appendChild(popupHost);
}

/**
 * Show the popup with dictionary data for a NEW (unsaved) word.
 * @param {{ x: number, y: number, width: number }} position - Selection rect
 * @param {string} word - The word text
 * @param {object} dictData - Dictionary API result
 * @param {string} phoneticType - 'us' or 'uk'
 * @param {object} callbacks - { onSave, onColorSelect, onClose }
 */
export function showNewWordPopup(position, word, dictData, phoneticType, callbacks) {
  ensureInitialized();
  const html = renderNewWordPopup(dictData, word, phoneticType);
  setContent(html);
  currentState = { mode: 'new-word', word, dictData, phoneticType, callbacks };
  bindEvents(callbacks);
  positionPopup(position);
  show();
}

/**
 * Show the popup for an ALREADY SAVED word (clicked on highlight).
 * @param {{ x: number, y: number, width: number }} position
 * @param {object} wordData - Saved word data from storage
 * @param {string} phoneticType
 * @param {object} callbacks - { onMastered, onColorChange, onClose }
 */
export function showSavedWordPopup(position, wordData, phoneticType, callbacks) {
  ensureInitialized();
  const html = renderSavedWordPopup(wordData, phoneticType);
  setContent(html);
  currentState = { mode: 'saved-word', wordData, phoneticType, callbacks };
  bindEvents(callbacks);
  positionPopup(position);
  show();
}

/**
 * Show the popup for a sentence.
 * @param {{ x: number, y: number, width: number }} position
 * @param {string} text
 * @param {string|null} translation
 * @param {object} callbacks - { onSave, onColorSelect, onClose }
 */
export function showSentencePopup(position, text, translation, callbacks) {
  ensureInitialized();
  const html = renderSentencePopup(text, translation);
  setContent(html);
  currentState = { mode: 'sentence', text, translation, callbacks };
  bindEvents(callbacks);
  positionPopup(position);
  show();
}

/**
 * Show loading state.
 * @param {{ x: number, y: number, width: number }} position
 */
export function showLoading(position, callbacks = {}) {
  ensureInitialized();
  setContent(renderLoading());
  currentState = { mode: 'loading', callbacks };
  if (callbacks.onSave || callbacks.onSaveImmediate) bindEvents(callbacks);
  positionPopup(position);
  show();
}

/**
 * Show error state.
 * @param {{ x: number, y: number, width: number }} position
 * @param {string} message
 */
export function showError(position, message, showAddButton = false, callbacks = {}) {
  ensureInitialized();
  setContent(renderError(message, showAddButton));
  currentState = { mode: 'error', callbacks };
  if (showAddButton) bindEvents(callbacks);
  positionPopup(position);
  show();
}

/**
 * Hide the popup.
 */
export function hidePopup() {
  if (popupHost) {
    popupHost.style.display = 'none';
    currentState = null;
  }
}

/**
 * Check if popup is currently visible.
 * @returns {boolean}
 */
export function isPopupVisible() {
  return popupHost && popupHost.style.display !== 'none';
}

/**
 * Get the current popup state.
 * @returns {object|null}
 */
export function getPopupState() {
  return currentState;
}

/**
 * Update popup content in-place (for refresh).
 */
export function updateContent(html) {
  if (!popupRoot) return;
  const content = popupRoot.querySelector('.lectura-popup');
  if (content) {
    content.innerHTML = html;
  }
}

/**
 * Clean up the popup (remove from DOM).
 */
export function destroyPopup() {
  if (popupHost && popupHost.parentNode) {
    popupHost.parentNode.removeChild(popupHost);
  }
  popupHost = null;
  popupRoot = null;
  currentState = null;
}

// ─── Private Helpers ────────────────────────────────────────

function ensureInitialized() {
  if (!popupHost) initPopup();
}

function setContent(html) {
  const content = popupRoot.querySelector('.lectura-popup');
  if (content) {
    content.innerHTML = html;
  }
}

function positionPopup(rect) {
  const content = popupRoot.querySelector('.lectura-popup');
  if (!content) return;

  const popupWidth = POPUP.MAX_WIDTH;
  // Temporarily show to measure height
  const wasHidden = popupHost.style.display === 'none';
  if (wasHidden) popupHost.style.display = 'block';
  const popupHeight = content.offsetHeight || 200;
  if (wasHidden) popupHost.style.display = 'none';

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const gap = POPUP.GAP;

  // Measure available space above and below the selection
  const spaceAbove = rect.y - gap;
  const spaceBelow = viewportHeight - (rect.y + rect.height) - gap;

  let top;
  // Prefer above, fall back to below if not enough space
  if (spaceAbove >= popupHeight || spaceAbove >= spaceBelow) {
    top = rect.y - popupHeight - gap;
  } else {
    top = rect.y + rect.height + gap;
  }

  // Center horizontally over the selection
  let left = rect.x + rect.width / 2 - popupWidth / 2;

  // Clamp to viewport
  left = clamp(left, 8, viewportWidth - popupWidth - 8);
  top = clamp(top, 8, viewportHeight - popupHeight - 8);

  popupHost.style.top = `${top}px`;
  popupHost.style.left = `${left}px`;
}

function show() {
  popupHost.style.display = 'block';
}

function bindEvents(callbacks) {
  const content = popupRoot.querySelector('.lectura-popup');
  if (!content) return;

  // Remove old listeners by cloning (simple approach)
  const newContent = content.cloneNode(true);
  content.parentNode.replaceChild(newContent, content);

  createPopupEventHandlers(popupRoot, callbacks);
}

/**
 * Frosted glass popup styles (injected into Shadow DOM).
 */
function getPopupStyles() {
  return `
    :host {
      all: initial;
    }

    .lectura-popup {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 14px;
      color: #1a1a1a;
      background: rgba(255, 255, 255, 0.88);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.5);
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
      padding: 16px 18px;
      width: ${POPUP.MAX_WIDTH}px;
      max-width: calc(100vw - 16px);
      max-height: ${POPUP.MAX_HEIGHT}px;
      overflow-y: auto;
      box-sizing: border-box;
      animation: lectura-fade-in 0.15s ease-out;
    }

    @keyframes lectura-fade-in {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .lectura-popup-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 8px;
    }

    .lectura-popup-word {
      font-size: 22px;
      font-weight: 700;
      color: #1a1a2e;
      letter-spacing: 0.3px;
      word-break: break-word;
    }

    .lectura-popup-word.lectura-sentence {
      font-size: 15px;
      font-weight: 500;
      line-height: 1.5;
    }

    .lectura-popup-close {
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      border: none;
      background: rgba(0, 0, 0, 0.06);
      border-radius: 50%;
      font-size: 14px;
      color: #666;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s, color 0.15s;
      margin-left: 8px;
    }

    .lectura-popup-close:hover {
      background: rgba(0, 0, 0, 0.12);
      color: #333;
    }

    .lectura-popup-meta {
      display: flex;
      gap: 10px;
      align-items: center;
      margin-bottom: 10px;
      flex-wrap: wrap;
      font-size: 13px;
    }

    .lectura-pos {
      color: #6366f1;
      font-weight: 600;
      background: rgba(99, 102, 241, 0.08);
      padding: 2px 8px;
      border-radius: 6px;
    }

    .lectura-phonetic {
      color: #666;
      font-family: "Lucida Sans Unicode", "Arial Unicode MS", sans-serif;
    }

    .lectura-exam {
      color: #e67e22;
      font-weight: 600;
      background: rgba(230, 126, 34, 0.08);
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 12px;
    }

    .lectura-collins {
      color: #f59e0b;
      font-size: 12px;
    }

    .lectura-baseform-btn {
      color: #6366f1;
      font-size: 12px;
      font-weight: 500;
      background: rgba(99, 102, 241, 0.08);
      border: 1px solid rgba(99, 102, 241, 0.2);
      border-radius: 12px;
      padding: 2px 10px;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
    }

    .lectura-baseform-btn:hover {
      background: rgba(99, 102, 241, 0.18);
      border-color: rgba(99, 102, 241, 0.4);
    }

    .lectura-wordcount {
      color: #888;
      font-size: 12px;
    }

    .lectura-popup-defs {
      margin-bottom: 10px;
    }

    .lectura-def-item {
      padding: 6px 0;
      border-bottom: 1px solid rgba(0, 0, 0, 0.05);
      color: #333;
      line-height: 1.5;
    }

    .lectura-def-item:last-child {
      border-bottom: none;
    }

    .lectura-def-empty {
      color: #aaa;
      font-style: italic;
      padding: 8px 0;
    }

    .lectura-popup-source {
      display: flex;
      gap: 6px;
      align-items: flex-start;
      padding: 8px 10px;
      background: rgba(0, 0, 0, 0.03);
      border-radius: 8px;
      margin-bottom: 10px;
      font-size: 12px;
      color: #666;
      line-height: 1.4;
    }

    .lectura-popup-error-inline {
      color: #e74c3c;
      font-size: 13px;
      padding: 6px 0;
    }

    .lectura-popup-actions {
      margin-top: 4px;
    }

    .lectura-actions-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }

    .lectura-btn-save {
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      border: none;
      background: rgba(99, 102, 241, 0.1);
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
    }

    .lectura-btn-save:hover {
      background: rgba(99, 102, 241, 0.2);
      transform: scale(1.08);
    }

    .lectura-star {
      font-size: 22px;
      color: #6366f1;
      line-height: 1;
    }

    /* Delete button (trash icon) */
    .lectura-btn-delete {
      flex-shrink: 0;
      width: 36px;
      height: 36px;
      border: none;
      background: transparent;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #bbb;
      transition: all 0.15s;
    }

    .lectura-btn-delete:hover {
      background: #fef2f2;
      color: #ef4444;
    }

    /* Mastered ribbon button (popup) */
    .lectura-btn-mastered-ribbon {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 14px;
      border: none;
      border-radius: 8px;
      background: #f5f5f5;
      color: #999;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: all 0.2s ease;
    }

    .lectura-btn-mastered-ribbon:hover {
      background: #e5e5e5;
      color: #666;
    }

    .lectura-btn-mastered-ribbon.is-mastered {
      background: #22c55e;
      color: white;
    }

    .lectura-btn-mastered-ribbon.is-mastered:hover {
      background: #16a34a;
    }

    .lectura-colors {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .lectura-color-circle {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 2px solid transparent;
      cursor: pointer;
      transition: all 0.15s;
      padding: 0;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    }

    .lectura-color-circle:hover {
      transform: scale(1.2);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    }

    .lectura-color-circle.is-selected {
      border-color: #333;
      box-shadow: 0 0 0 2px white, 0 0 0 4px #333;
      transform: scale(1.15);
    }


    /* Loading spinner */
    .lectura-popup-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 24px;
      color: #888;
      font-size: 14px;
    }

    .lectura-spinner {
      width: 20px;
      height: 20px;
      border: 2px solid rgba(99, 102, 241, 0.2);
      border-top-color: #6366f1;
      border-radius: 50%;
      animation: lectura-spin 0.6s linear infinite;
    }

    @keyframes lectura-spin {
      to { transform: rotate(360deg); }
    }

    /* Add example button */
    .lectura-btn-add-example {
      display: flex;
      align-items: center;
      gap: 3px;
      padding: 5px 10px;
      border: none;
      border-radius: 8px;
      background: #f0f0ff;
      color: #6366f1;
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
      transition: all 0.15s;
      white-space: nowrap;
    }

    .lectura-btn-add-example:hover {
      background: #e0e0ff;
    }

    /* Manual add button */
    .lectura-btn-add-manual {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 8px 16px;
      border: none;
      border-radius: 20px;
      background: rgba(99, 102, 241, 0.1);
      color: #6366f1;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.15s;
    }

    .lectura-btn-add-manual:hover {
      background: rgba(99, 102, 241, 0.2);
    }

    /* LLM badge */
    .lectura-llm-badge {
      display: inline-block;
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 8px;
      background: rgba(99, 102, 241, 0.1);
      color: #6366f1;
      margin-bottom: 6px;
    }

    /* Examples section */
    .lectura-popup-examples {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid rgba(0,0,0,0.06);
    }

    .lectura-examples-title {
      font-size: 11px;
      font-weight: 600;
      color: #888;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .lectura-example-item {
      margin-bottom: 8px;
    }

    .lectura-example-en {
      font-size: 13px;
      color: #333;
      font-style: italic;
      line-height: 1.4;
    }

    .lectura-example-zh {
      font-size: 12px;
      color: #888;
      margin-top: 2px;
    }

    /* Error state */
    .lectura-popup-error {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      color: #e74c3c;
      font-size: 13px;
    }
  `;
}
