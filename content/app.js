/**
 * LECTURA Extension — Content Script Application
 *
 * Loaded dynamically by content.js bootstrap.
 * Orchestrates selection detection, popup display, highlighting.
 */

import { MSG, LIMITS } from '../shared/constants.js';
import { classifyText, countWords, generateId, now } from '../shared/utils.js';
import { createSelectionDetector, getSourceSentence } from './selection/detector.js';
import { generateAnchors } from './selection/xpath.js';
import { showNewWordPopup, showSavedWordPopup, showSentencePopup, showLoading, showError, hidePopup, isPopupVisible } from './popup/popup-ui.js';
import { createOutsideClickListener, createKeyboardHandler } from './popup/popup-events.js';
import { highlightAll, clearAllHighlights, rehighlight, updateHighlightStyle, getHighlightData } from './highlight/highlighter.js';
import { startObserver, updateWords, stopObserver, detectSpaNavigation } from './highlight/observer.js';
import { initBubble, showBubble, hideBubble, destroyBubble } from './bubble.js';

// ─── State ──────────────────────────────────────────────────

let savedWords = [];
let savedWordMap = new Map();
let phoneticType = 'us';
let selectionMode = 'direct'; // 'direct' | 'bubble' | 'off'
let selectionDetector = null;
let outsideClickListener = null;
let keyboardHandler = null;
let spaDetector = null;
let isQuerying = false;
let pendingWordData = null; // stored for bubble mode

// ─── Initialization ─────────────────────────────────────────

async function init() {
  try {
    // Load settings from storage
    const settingsRes = await chrome.runtime.sendMessage({ type: MSG.GET_SETTINGS });
    if (settingsRes.success) {
      phoneticType = settingsRes.settings.phoneticType || 'us';
      selectionMode = settingsRes.settings.selectionMode || 'direct';
    }

    // Init bubble for bubble mode
    if (selectionMode === 'bubble') {
      initBubble(onBubbleTriggered);
      window.addEventListener('scroll', hideBubble, { passive: true, capture: true });
      // Hide bubble when clicking outside (blank area, etc.)
      document.addEventListener('click', (e) => {
        if (!e.target.closest('#lectura-bubble') && !e.target.closest('.lectura-hl, .lectura-mastered')) {
          const sel = window.getSelection();
          if (!sel || sel.isCollapsed) {
            hideBubble();
            pendingWordData = null;
          }
        }
      }, true);
    }

    // Load highlight data for this page
    const highlightRes = await chrome.runtime.sendMessage({ type: MSG.GET_HIGHLIGHT_DATA });
    if (highlightRes.success) {
      savedWords = highlightRes.words || [];
      buildWordMap();
    }

    // Apply highlights
    if (savedWords.length > 0) {
      await highlightAll(savedWords);
    }

    // Set up selection detection
    selectionDetector = createSelectionDetector(onTextSelected, onTextDeselected);

    // Set up click handler for existing highlights
    document.addEventListener('click', onHighlightClick, true);

    // Set up popup close handlers (outside click + Escape key)
    outsideClickListener = createOutsideClickListener(handlePopupClose);
    keyboardHandler = createKeyboardHandler(handlePopupClose);

    // Set up dynamic content observer (SPA, infinite scroll)
    startObserver(savedWords);

    // SPA navigation detection
    spaDetector = detectSpaNavigation(onSpaNavigate);

    console.log('✅ LECTURA 就绪 —', savedWords.length, '个高亮词');
  } catch (err) {
    console.error('❌ LECTURA 初始化失败:', err.message, err.stack);
  }
}

// ─── Word Map ───────────────────────────────────────────────

function buildWordMap() {
  savedWordMap = new Map();
  for (const w of savedWords) {
    savedWordMap.set(w.id, w);
  }
}

// ─── Selection Handling ─────────────────────────────────────

function onTextSelected({ text, type, wordCount, rect, range }) {
  if (isQuerying) return;
  if (selectionMode === 'off') return;

  const savedRange = range.cloneRange();

  // Check if clicking on an existing highlight
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const container = sel.getRangeAt(0).startContainer;
    if (container?.parentNode) {
      const data = getHighlightData(container.parentNode);
      if (data) return;
    }
  }

  if (text.length < LIMITS.MIN_WORD_LENGTH) return;

  if (selectionMode === 'bubble') {
    // Bubble mode: show floating bubble, defer popup to click
    pendingWordData = { text, type, wordCount, rect, range: savedRange };
    showBubble(rect.left, rect.top, rect.width);
    return;
  }

  // Direct mode
  if (type === 'word') {
    handleWordSelection(text, rect, savedRange);
  } else {
    handleSentenceSelection(text, rect, savedRange);
  }
}

function onBubbleTriggered() {
  if (!pendingWordData) return;
  const { text, type, rect, range } = pendingWordData;
  pendingWordData = null;
  // Delay to let the click event finish — otherwise outside-click handler closes popup immediately
  setTimeout(() => {
    if (type === 'word') {
      handleWordSelection(text, rect, range);
    } else {
      handleSentenceSelection(text, rect, range);
    }
  }, 100);
}

function onTextDeselected() {
  // Small delay — might be mid-double-click, selection will restore
  setTimeout(() => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim().length >= LIMITS.MIN_WORD_LENGTH) {
      return; // selection restored, don't hide
    }
    hideBubble();
    pendingWordData = null;
  }, 150);
}

// ─── Word Selection ─────────────────────────────────────────

async function handleWordSelection(word, rect, range) {
  // Capture the sentence context for "+此例句" use
  lastCapturedSentence = getSourceSentence(range).sentence;

  // Check if already saved — get full data from storage
  const existing = findExistingWord(word);
  if (existing) {
    // Fetch full word data for definitions
    const res = await chrome.runtime.sendMessage({ type: MSG.GET_ALL_ITEMS });
    let fullWord = res.success ? res.items.find(i => i.id === existing.id) : null;
    if (!fullWord) fullWord = existing;

    // Refresh definitions if empty
    if (fullWord.type === 'word' && (!fullWord.definitions || fullWord.definitions.length === 0)) {
      const lookupRes = await chrome.runtime.sendMessage({
        type: MSG.QUERY_WORD, payload: { text: fullWord.text, type: 'word' }
      });
      if (lookupRes.success && lookupRes.data?.definitions?.length > 0) {
        fullWord = { ...fullWord, definitions: lookupRes.data.definitions };
      }
    }

    showSavedWordPopup(
      { x: rect.left, y: rect.top, width: rect.width },
      fullWord, phoneticType,
      {
        onMastered: () => toggleMastered(existing.id),
        onColorChange: (color) => changeColor(existing.id, color),
        onAddExample: () => addExampleSentence(existing.id, range?.commonAncestorContainer?.parentNode),
        onDelete: () => deleteWord(existing.id),
        onClose: handlePopupClose
      }
    );
    return;
  }

  // Query local dictionary
  isQuerying = true;
  showLoading({ x: rect.left, y: rect.top, width: rect.width }, {
    onSave: (color) => addManualCard(word, range, color),
    onSaveImmediate: (color) => addManualCard(word, range, color)
  });

  const result = await chrome.runtime.sendMessage({
    type: MSG.QUERY_WORD,
    payload: { text: word, type: 'word' }
  });

  isQuerying = false;
  if (!isPopupVisible()) return;

  if (result.success) {
    showNewWordPopup(
      { x: rect.left, y: rect.top, width: rect.width },
      word, result.data, phoneticType,
      {
        onSave: (color) => saveWordFromPopup(word, result.data, range, color),
        onSaveImmediate: (color) => saveWordFromPopup(word, result.data, range, color),
        onBaseFormClick: (baseForm) => reQueryWord(baseForm, rect),
        onClose: handlePopupClose
      }
    );
  } else {
    showError(
      { x: rect.left, y: rect.top, width: rect.width },
      result.error || '未找到该词',
      true,
      {
        onSave: (color) => addManualCard(word, range, color),
        onSaveImmediate: (color) => addManualCard(word, range, color),
        onClose: handlePopupClose
      }
    );
  }
}

// ─── Sentence Selection ─────────────────────────────────────

async function handleSentenceSelection(text, rect, range) {
  const wc = countWords(text);
  // Only translate sentences ≤100 words to avoid token waste
  if (wc <= 100) {
    showLoading({ x: rect.left, y: rect.top, width: rect.width },
      { onSave: (color) => saveSentenceFromPopup(text, null, range, color),
        onSaveImmediate: (color) => saveSentenceFromPopup(text, null, range, color) });
    const result = await chrome.runtime.sendMessage({
      type: MSG.QUERY_WORD, payload: { text, type: 'sentence' }
    });
    if (!isPopupVisible()) return;
    const translation = result.success ? result.data?.translation : null;
    showSentencePopup(
      { x: rect.left, y: rect.top, width: rect.width },
      text, translation,
      {
        onSave: (color) => saveSentenceFromPopup(text, translation, range, color),
        onColorSelect: () => {},
        onClose: handlePopupClose
      }
    );
  } else {
    // Long text: skip translation, save directly
    showSentencePopup(
      { x: rect.left, y: rect.top, width: rect.width },
      text, null,
      {
        onSave: (color) => saveSentenceFromPopup(text, '', range, color),
        onColorSelect: () => {},
        onClose: handlePopupClose
      }
    );
  }
}

// ─── Save Operations ────────────────────────────────────────

async function saveWordFromPopup(word, dictData, range, color) {
  try {
    let sentence = '', offsetStart = 0, offsetEnd = 0, anchors = {};
    if (range) {
      const src = getSourceSentence(range);
      sentence = src.sentence;
      offsetStart = src.offsetStart;
      offsetEnd = src.offsetEnd;
      anchors = generateAnchors(range, word);
    }

    const wordData = {
      id: generateId(),
      text: word,
      type: 'word',
      wordCount: 1,
      phonetic: dictData.phonetic || '',
      pos: dictData.pos || '',
      definitions: dictData.definitions || [],
      examType: dictData.examType || '',
      color: color || null,
      mastered: false,
      sourceSentence: sentence,
      sourceUrl: window.location.href,
      sourceTitle: document.title || '',
      sourceSentences: [{ text: sentence, url: window.location.href, title: document.title || '' }],
      sourceSentenceOffset: { start: offsetStart, end: offsetEnd },
      note: '',
      extraExamples: dictData.examples || [],
      anchors: anchors,
      createdAt: now(),
      updatedAt: now()
    };

    console.log('LECTURA: Saving word:', wordData.text, 'color:', wordData.color);

    const res = await chrome.runtime.sendMessage({
      type: MSG.SAVE_WORD,
      payload: wordData
    });

    console.log('LECTURA: Save result:', res);

    if (res.success) {
      savedWords.push({ id: wordData.id, text: word, color: wordData.color, mastered: false });
      buildWordMap();
      await highlightAll(savedWords);
    } else {
      console.error('LECTURA: Save failed:', res.error);
    }
  } catch (err) {
    console.error('LECTURA: saveWordFromPopup error:', err.message, err.stack);
  }

  hidePopup();
}

async function saveSentenceFromPopup(text, translation, range, color) {
  const wordData = {
    id: generateId(),
    text: text,
    type: 'sentence',
    wordCount: countWords(text),
    definitions: translation ? [translation] : [],
    translation: '',
    color: color || null,
    mastered: false,
    sourceUrl: window.location.href,
    sourceTitle: document.title || '',
    note: '',
    createdAt: now(),
    updatedAt: now()
  };

  const res = await chrome.runtime.sendMessage({
    type: MSG.SAVE_WORD,
    payload: wordData
  });

  if (res.success) {
    hidePopup();
  }
}

async function toggleMastered(wordId) {
  const word = savedWordMap.get(wordId);
  if (!word) return;

  const newMastered = !word.mastered;
  await chrome.runtime.sendMessage({
    type: MSG.MARK_MASTERED,
    payload: { wordId, mastered: newMastered }
  });

  word.mastered = newMastered;
  updateHighlightStyle(wordId, newMastered, word.color);
  hidePopup();
}

async function deleteWord(wordId) {
  await chrome.runtime.sendMessage({
    type: MSG.DELETE_WORD,
    payload: { wordId }
  });
  // Remove from local cache
  savedWords = savedWords.filter(w => w.id !== wordId);
  savedWordMap.delete(wordId);
  buildWordMap();
  clearAllHighlights();
  await highlightAll(savedWords);
  hidePopup();
}

async function changeColor(wordId, color) {
  const word = savedWordMap.get(wordId);
  if (!word) return;

  await chrome.runtime.sendMessage({
    type: MSG.UPDATE_ITEM,
    payload: { wordId, changes: { color } }
  });

  word.color = color;
  updateHighlightStyle(wordId, word.mastered, color);
}

// ─── Highlight Click Handling ───────────────────────────────

function onHighlightClick(e) {
  const span = e.target.closest('.lectura-hl, .lectura-mastered');
  if (!span) return;

  const data = getHighlightData(span);
  if (!data) return;

  e.stopPropagation();
  e.preventDefault();

  chrome.runtime.sendMessage({ type: MSG.GET_ALL_ITEMS }).then(async res => {
    if (!res.success) return;
    let fullWord = res.items.find(item => item.id === data.itemId);
    if (!fullWord) return;

    // If definitions are empty, refresh from dictionary
    if (fullWord.type === 'word' && (!fullWord.definitions || fullWord.definitions.length === 0)) {
      const lookupRes = await chrome.runtime.sendMessage({
        type: MSG.QUERY_WORD,
        payload: { text: fullWord.text, type: 'word' }
      });
      if (lookupRes.success && lookupRes.data?.definitions?.length > 0) {
        fullWord = { ...fullWord, definitions: lookupRes.data.definitions };
      }
    }

    const rect = span.getBoundingClientRect();
    showSavedWordPopup(
      { x: rect.left, y: rect.top, width: rect.width },
      fullWord, phoneticType,
      {
        onMastered: () => toggleMastered(data.itemId),
        onColorChange: (color) => changeColor(data.itemId, color),
        onAddExample: () => addExampleSentence(data.itemId, span),
        onDelete: () => deleteWord(data.itemId),
        onClose: handlePopupClose
      }
    );
  });
}

// ─── Message Listener ───────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MSG.HIGHLIGHTS_UPDATED) {
    const words = message.payload.words || [];
    savedWords = words;
    buildWordMap();
    rehighlight(words).then(count => {
      updateWords(words);
    });
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'SELECTION_MODE_CHANGED') {
    selectionMode = message.payload.mode;
    if (selectionMode === 'bubble') {
      initBubble(onBubbleTriggered);
    } else {
      hideBubble();
    }
    console.log('LECTURA: Selection mode →', selectionMode);
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'TOGGLE_HIGHLIGHTS') {
    toggleAllHighlights();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'ENTER_READING_MODE') {
    import('./reading/reader.js').then(m => m.enterReadingMode());
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'EXIT_READING_MODE') {
    import('./reading/reader.js').then(m => m.exitReadingMode());
    sendResponse({ success: true });
    return true;
  }

  return false;
});

// ─── SPA Navigation ─────────────────────────────────────────

function onSpaNavigate() {
  setTimeout(async () => {
    const res = await chrome.runtime.sendMessage({ type: MSG.GET_HIGHLIGHT_DATA });
    if (res.success) {
      savedWords = res.words || [];
      buildWordMap();
      await highlightAll(savedWords);
    }
  }, 500);
}

// ─── Helpers ────────────────────────────────────────────────

function findExistingWord(text) {
  const lower = text.toLowerCase();
  for (const w of savedWords) {
    if (w.text.toLowerCase() === lower) {
      return savedWordMap.get(w.id);
    }
  }
  return null;
}

async function reQueryWord(baseForm, rect) {
  isQuerying = true;
  showLoading({ x: rect.left, y: rect.top, width: rect.width });

  const result = await chrome.runtime.sendMessage({
    type: MSG.QUERY_WORD,
    payload: { text: baseForm, type: 'word' }
  });

  isQuerying = false;
  if (!isPopupVisible()) return;

  if (result.success) {
    showNewWordPopup(
      { x: rect.left, y: rect.top, width: rect.width },
      baseForm, result.data, phoneticType,
      {
        onSave: (color) => saveWordFromPopup(baseForm, result.data, null, color),
        onSaveImmediate: (color) => saveWordFromPopup(baseForm, result.data, null, color),
        onBaseFormClick: (bf) => reQueryWord(bf, rect),
        onClose: handlePopupClose
      }
    );
  } else {
    showError(
      { x: rect.left, y: rect.top, width: rect.width },
      result.error || '未找到该词',
      true,
      {
        onSave: (color) => addManualCard(word, range, color),
        onSaveImmediate: (color) => addManualCard(word, range, color),
        onClose: handlePopupClose
      }
    );
  }
}

let highlightsVisible = true;
// Store the last captured sentence for later "+此例句" use
let lastCapturedSentence = '';

async function addExampleSentence(wordId, highlightSpan = null) {
  const res = await chrome.runtime.sendMessage({ type: MSG.GET_ALL_ITEMS });
  if (!res.success) return;
  const item = res.items.find(i => i.id === wordId);
  if (!item) return;

  const sourceSentences = [...(item.sourceSentences || [])];
  const currentUrl = window.location.href;

  let sentenceText = '';
  if (highlightSpan?.nodeType === Node.ELEMENT_NODE) {
    sentenceText = getSentenceAroundElement(highlightSpan);
  } else if (lastCapturedSentence) {
    sentenceText = lastCapturedSentence;
  }
  if (!sentenceText || sentenceText.length < 3) {
    sentenceText = item.sourceSentence || item.text;
  }

  sourceSentences.push({
    text: sentenceText,
    url: currentUrl,
    title: document.title || ''
  });

  await chrome.runtime.sendMessage({
    type: MSG.UPDATE_ITEM,
    payload: { wordId, changes: { sourceSentences } }
  });
  hidePopup();
}

/** Extract the full sentence around a highlighted word element */
function getSentenceAroundElement(el) {
  // Walk up to find a block-level container
  let container = el.closest('p, div, li, td, th, article, section, blockquote, h1, h2, h3, h4, h5, h6');
  if (!container) container = el.parentNode;
  if (!container) return '';

  const fullText = container.textContent || '';
  const wordText = el.textContent?.trim() || '';

  // Find the word in the full text
  const idx = fullText.indexOf(wordText);
  if (idx === -1) return fullText.slice(0, 200).trim();

  // Find sentence start
  let start = idx;
  while (start > 0) {
    const ch = fullText[start - 1];
    if (ch === '.' || ch === '!' || ch === '?' || ch === '。' || ch === '！' || ch === '？' || ch === '\n') break;
    start--;
  }

  // Find sentence end
  let end = idx + wordText.length;
  while (end < fullText.length) {
    const ch = fullText[end];
    if (ch === '.' || ch === '!' || ch === '?' || ch === '。' || ch === '！' || ch === '？' || ch === '\n') {
      end++; // include punctuation
      break;
    }
    end++;
  }

  return fullText.slice(start, end).trim();
}

async function addManualCard(word, range, color) {
  const wordData = {
    id: generateId(),
    text: word,
    type: 'word',
    wordCount: 1,
    phonetic: '',
    pos: '',
    definitions: [],
    examType: '',
    color: color || null,
    mastered: false,
    sourceSentence: '',
    sourceUrl: window.location.href,
    sourceTitle: document.title || '',
    note: '',
    extraExamples: [],
    createdAt: now(),
    updatedAt: now()
  };

  if (range) {
    try {
      const src = getSourceSentence(range);
      wordData.sourceSentence = src.sentence;
      wordData.sourceSentenceOffset = { start: src.offsetStart, end: src.offsetEnd };
    } catch (e) { /* ignore */ }
  }

  await chrome.runtime.sendMessage({ type: MSG.SAVE_WORD, payload: wordData });
  hidePopup();
}

function toggleAllHighlights() {
  highlightsVisible = !highlightsVisible;
  window.__lecturaHighlightsVisible = highlightsVisible;
  const spans = document.querySelectorAll('.lectura-hl, .lectura-mastered');
  spans.forEach(span => {
    span.classList.toggle('lectura-hidden', !highlightsVisible);
  });
  console.log('LECTURA: Highlights', highlightsVisible ? 'visible' : 'hidden');
}

function handlePopupClose() {
  hidePopup();
}

// ─── Cleanup ────────────────────────────────────────────────

window.addEventListener('beforeunload', () => {
  if (selectionDetector) selectionDetector.destroy();
  if (outsideClickListener) outsideClickListener.destroy();
  if (keyboardHandler) keyboardHandler.destroy();
  if (spaDetector) spaDetector.destroy();
  destroyBubble();
  stopObserver();
});

// ─── Start ──────────────────────────────────────────────────

export default init;
export { init as reinitContentScript };
