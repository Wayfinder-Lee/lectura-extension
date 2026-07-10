/**
 * LECTURA Extension — Background Service Worker
 *
 * Central message router connecting:
 *   Content Scripts ←→ Service Worker ←→ Side Panel
 *   Service Worker → Local ECDICT Dictionary (IndexedDB)
 *   Service Worker → chrome.storage.local
 */

import { MSG, DEFAULT_PROMPTS } from '../shared/constants.js';
import { lookupWord, getWordForms, getDictStats, loadDictionary, resetDictionary } from './dictionary.js';
import { chatCompletion, parseWordResponse, parseTranslationResponse } from './llm.js';
import {
  getSettings, saveSettings,
  getAllWords, getOrderedWords, getHighlightWords,
  saveWord, updateWord, deleteWord, addToOrder, reorderItems,
  exportAllData, importData, runMigrations
} from './storage.js';

// ─── Lifecycle ───────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  await runMigrations();

  // Pre-load the dictionary into IndexedDB
  const dictResult = await loadDictionary();
  console.log(`LECTURA: Dictionary init — ${dictResult.count || 0} words, cached=${dictResult.cached || false}`);

  // Set side panel to open on action click
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch(err => console.warn('Side panel setup:', err));

  // Set up selection mode context menu (right-click extension icon)
  setupContextMenu();
});

function setupContextMenu() {
  // Remove existing to avoid duplicates on re-install
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'selection-direct',
      title: '✅ 开启选择取词',
      type: 'radio',
      contexts: ['action'],
      checked: true
    });
    chrome.contextMenus.create({
      id: 'selection-bubble',
      title: '💬 开启取词气泡',
      type: 'radio',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      id: 'selection-off',
      title: '⏸ 关闭取词',
      type: 'radio',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      id: 'separator',
      type: 'separator',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      id: 'open-learn',
      title: '📖 学习词汇',
      contexts: ['action']
    });
  });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === 'open-learn') {
    chrome.tabs.create({ url: chrome.runtime.getURL('learn/learn.html') });
    return;
  }
  const modeMap = {
    'selection-direct': 'direct',
    'selection-bubble': 'bubble',
    'selection-off': 'off'
  };
  const mode = modeMap[info.menuItemId];
  if (mode) {
    const settings = await getSettings();
    settings.selectionMode = mode;
    await saveSettings(settings);
    notifyAllTabs('SELECTION_MODE_CHANGED', { mode });
  }
});

// ─── Message Router ─────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(err => {
    console.error('SW message error:', err);
    sendResponse({ success: false, error: err.message });
  });
  return true;
});

async function handleMessage(message, sender) {
  const { type, payload } = message;

  switch (type) {

    // ── Dictionary Query (from content script popup) ──────
    case MSG.QUERY_WORD: {
      if (payload.type === 'word') {
        // Step 1: Local ECDICT lookup
        const localResult = await lookupWord(payload.text);
        if (localResult.found) {
          return { success: true, data: localResult.data, source: 'ecdict' };
        }

        // Step 2: LLM fallback (if configured and auto-LLM enabled)
        const settings = await getSettings();
        if (settings.llmApiKey && settings.autoLLM !== false) {
          const prompts = settings.llmPrompts || DEFAULT_PROMPTS;
          const wordPrompt = await substituteTemplate(prompts.wordLookup, { word: payload.text });
          const llmResult = await chatCompletion(wordPrompt);
          if (llmResult.success) {
            const parsed = parseWordResponse(llmResult.data);
            if (parsed && !parsed.error) {
              return {
                success: true,
                data: {
                  word: payload.text,
                  phonetic: parsed.phonetic || '',
                  pos: '',  // LLM definitions already include pos prefixes
                  definitions: parsed.definitions || [],
                  examType: parsed.examType || '',
                  examples: parsed.examples || [],
                  definitions_source: 'llm'
                },
                source: 'llm'
              };
            }
          }
        }

        return { success: false, error: localResult.error || '未找到该词' };
      } else {
        // Sentence: try LLM translation
        const settings = await getSettings();
        if (settings.llmApiKey) {
          const prompts = settings.llmPrompts || DEFAULT_PROMPTS;
          const transPrompt = await substituteTemplate(prompts.sentenceTranslate, { text: payload.text });
          const llmResult = await chatCompletion(transPrompt);
          if (llmResult.success) {
            const translation = parseTranslationResponse(llmResult.data);
            return { success: true, data: { translation }, source: 'llm' };
          }
        }
        return { success: false, error: '句子可直接保存' };
      }
    }

    // ── Save Word / Sentence (from content script popup) ──
    case MSG.SAVE_WORD: {
      const wordData = payload;
      await saveWord(wordData);
      await addToOrder(wordData.id);

      notifyAllTabs(MSG.HIGHLIGHTS_UPDATED, { words: await getHighlightWords() });
      notifySidePanel(MSG.STORAGE_CHANGED, { action: 'added', item: wordData });

      return { success: true, item: wordData };
    }

    // ── Mark as Mastered ──────────────────────────────────
    case MSG.MARK_MASTERED: {
      const { wordId, mastered } = payload;
      await updateWord(wordId, { mastered });

      const updated = (await getAllWords())[wordId];
      notifyAllTabs(MSG.HIGHLIGHTS_UPDATED, { words: await getHighlightWords() });
      notifySidePanel(MSG.STORAGE_CHANGED, { action: 'updated', item: updated });

      return { success: true, item: updated };
    }

    // ── Delete Word ───────────────────────────────────────
    case MSG.DELETE_WORD: {
      const { wordId } = payload;
      await deleteWord(wordId);

      notifyAllTabs(MSG.HIGHLIGHTS_UPDATED, { words: await getHighlightWords() });
      notifySidePanel(MSG.STORAGE_CHANGED, { action: 'deleted', wordId });

      return { success: true };
    }

    // ── Get Highlight Data (from content script on page load)
    case MSG.GET_HIGHLIGHT_DATA: {
      const words = await getHighlightWords();
      return { success: true, words };
    }

    // ── Get All Items (from side panel) ───────────────────
    case MSG.GET_ALL_ITEMS: {
      const items = await getOrderedWords();
      return { success: true, items };
    }

    // ── Update Item (from side panel) ─────────────────────
    case MSG.UPDATE_ITEM: {
      const { wordId, changes } = payload;
      const updated = await updateWord(wordId, changes);

      if (changes.mastered !== undefined || changes.color !== undefined || changes.text !== undefined) {
        notifyAllTabs(MSG.HIGHLIGHTS_UPDATED, { words: await getHighlightWords() });
      }
      notifySidePanel(MSG.STORAGE_CHANGED, { action: 'updated', item: updated });

      return { success: true, item: updated };
    }

    // ── Reorder Items ─────────────────────────────────────
    case MSG.REORDER_ITEMS: {
      const { wordIds } = payload;
      await reorderItems(wordIds);
      return { success: true };
    }

    // ── Delete Item (from side panel) ─────────────────────
    case MSG.DELETE_ITEM: {
      const { wordId } = payload;
      await deleteWord(wordId);

      notifyAllTabs(MSG.HIGHLIGHTS_UPDATED, { words: await getHighlightWords() });
      notifySidePanel(MSG.STORAGE_CHANGED, { action: 'deleted', wordId });

      return { success: true };
    }

    // ── Fetch Word Forms / Refresh from local dict ────────
    // ── Refresh Definitions (update phonetic, examType, definitions only) ──
    case 'REFRESH_DEFINITIONS': {
      const { word } = payload;
      // Step 1: Local dictionary
      const localResult = await lookupWord(word);
      if (localResult.found) {
        return {
          success: true,
          source: 'ecdict',
          changes: {
            phonetic: localResult.data.phonetic || '',
            pos: localResult.data.pos || '',
            definitions: localResult.data.definitions || [],
            examType: localResult.data.examType || '',
            definitions_source: undefined
          }
        };
      }
      // Step 2: LLM if configured
      const settings = await getSettings();
      if (settings.llmApiKey) {
        return { success: true, source: 'ask_llm', changes: null, askLLM: true };
      }
      return { success: false, error: '词典未收录，且未配置 LLM' };
    }

    // ── Learning ──────────────────────────────────────
    case 'UPDATE_LEARNING': {
      const { wordId, level, todayProgress, todayDate, mastered, lastStudyDate } = payload;
      await updateWord(wordId, {
        level, todayProgress, todayDate,
        mastered: mastered !== undefined ? mastered : undefined,
        lastStudyDate
      });
      return { success: true };
    }

    case MSG.FETCH_EXAMPLES: {
      const { word, definitions } = payload;
      const settings = await getSettings();
      if (settings.llmApiKey) {
        const prompts = settings.llmPrompts || DEFAULT_PROMPTS;
        const examplePrompt = await substituteTemplate(prompts.moreExamples, {
          word,
          definitions: (definitions || []).join('; ') || '未知'
        });
        const llmResult = await chatCompletion(examplePrompt);
        if (llmResult.success) {
          const parsed = parseWordResponse(llmResult.data);
          if (parsed && parsed.examples) {
            return { success: true, data: { examples: parsed.examples } };
          }
        }
        return { success: false, error: llmResult.error };
      }
      return { success: false, error: '请先配置 LLM API Key' };
    }

    // ── Dictionary Stats ──────────────────────────────────
    case 'GET_DICT_STATS': {
      const stats = await getDictStats();
      return { success: true, stats };
    }

    // ── Reset Dictionary ──────────────────────────────────
    case 'RESET_DICT': {
      const result = await resetDictionary();
      if (result.success) {
        await loadDictionary();
      }
      return result;
    }

    // ── Settings ──────────────────────────────────────────
    case MSG.GET_SETTINGS: {
      const settings = await getSettings();
      return { success: true, settings };
    }

    case MSG.SAVE_SETTINGS: {
      await saveSettings(payload);
      return { success: true };
    }

    // ── Batch Operations ──────────────────────────────────
    case MSG.BATCH_OPERATION: {
      const { operation, wordIds, value } = payload;
      const words = await getAllWords();

      for (const wordId of wordIds) {
        if (words[wordId]) {
          switch (operation) {
            case 'delete':
              await deleteWord(wordId);
              break;
            case 'master':
              await updateWord(wordId, { mastered: true });
              break;
            case 'unmaster':
              await updateWord(wordId, { mastered: false });
              break;
            case 'color':
              await updateWord(wordId, { color: value });
              break;
          }
        }
      }

      notifyAllTabs(MSG.HIGHLIGHTS_UPDATED, { words: await getHighlightWords() });
      notifySidePanel(MSG.STORAGE_CHANGED, { action: 'batch', operation });

      return { success: true };
    }

    // ── Export / Import ───────────────────────────────────
    case MSG.EXPORT_DATA: {
      const data = await exportAllData();
      return { success: true, data };
    }

    case MSG.IMPORT_DATA: {
      const result = await importData(payload);
      notifyAllTabs(MSG.HIGHLIGHTS_UPDATED, { words: await getHighlightWords() });
      notifySidePanel(MSG.STORAGE_CHANGED, { action: 'imported' });
      return { success: true, ...result };
    }

    default:
      return { success: false, error: `Unknown message type: ${type}` };
  }
}

// ─── Broadcasting ────────────────────────────────────────────

async function notifyAllTabs(type, payload) {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && tab.url && tab.url.startsWith('http')) {
        chrome.tabs.sendMessage(tab.id, { type, payload }).catch(() => {});
      }
    }
  } catch (err) {
    // Ignore — tabs may not be accessible
  }
}

function notifySidePanel(type, payload) {
  chrome.runtime.sendMessage({ type, payload }).catch(() => {});
}

// ─── Prompt Template Substitution ────────────────────────────

async function substituteTemplate(templateMessages, vars) {
  const settings = await getSettings();
  const allVars = {
    ...vars,
    UKUS: settings.phoneticType === 'us' ? '美式' : '英式'
  };
  return templateMessages.map(msg => ({
    role: msg.role,
    content: msg.content.replace(/\{\{(\w+)\}\}/g, (_, key) => allVars[key] || '')
  }));
}

// ─── Side Panel Control ──────────────────────────────────────

// ─── Keyboard Shortcut ──────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-side-panel') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.windowId) {
      try {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      } catch {
        // Side panel might already be open — no close API, so we just open
      }
    }
  }
});

// ─── Action Click ───────────────────────────────────────────

chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (err) {
    console.warn('Could not open side panel:', err);
  }
});
