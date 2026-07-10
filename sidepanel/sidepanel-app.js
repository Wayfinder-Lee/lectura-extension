/**
 * LECTURA Extension — Side Panel Application
 * Loaded dynamically by sidepanel.js bootstrap.
 */

import { MSG, MACARON_COLORS } from '../shared/constants.js';
import { initCardList, render, setColorFilter, getColorFilter, getSelectedIds, clearSelection } from './card-list.js';
import { initContextMenu, show as showContextMenu } from './context-menu.js';
import { exportAsJson, exportAsCsv, exportAsAnki } from './export.js';

let items = [];
let settings = { phoneticType: 'us', fontSize: 'medium', cardSize: 'medium', hideDefinitions: false };
let batchMode = false;
let selectedItemId = null;
let masteryFilter = 'all'; // 'all' | 'mastered' | 'unmastered'
let filterVisible = false;
let highlightsOn = true;

// ─── Init ──────────────────────────────────────────────────

async function init() {
  initCardList(document.getElementById('cardList'), {
    onCardClick: () => {},
    onMastered: toggleMastered,
    onDelete: handleDelete,
    onContextMenu: (itemId, item, x, y) => showContextMenu(itemId, x, y),
    onDragEnd: handleReorder
  });

  initContextMenu({
    onDelete: handleDelete,
    onColorChange: handleColorChange,
    onRemoveColor: (id) => handleColorChange(id, null),
    onEdit: showEditModal,
    onRefresh: handleRefresh,
    onMoreExamples: handleMoreExamples
  });

  setupToolbar();
  setupBatchBar();
  setupEditModal();

  await loadSettings();
  await loadItems();
  applySettings();
  renderColorFilter();

  chrome.runtime.onMessage.addListener(handleIncomingMessage);
  chrome.storage.onChanged.addListener(handleStorageChange);

  console.log('✅ LECTURA 侧边栏就绪 —', items.length, '项');
}

// ─── Data ──────────────────────────────────────────────────

async function loadSettings() {
  try {
    const res = await chrome.runtime.sendMessage({ type: MSG.GET_SETTINGS });
    if (res.success) settings = { ...settings, ...res.settings };
  } catch (err) { console.error('loadSettings:', err); }
}

async function loadItems() {
  try {
    const res = await chrome.runtime.sendMessage({ type: MSG.GET_ALL_ITEMS });
    if (res.success) {
      items = res.items || [];
      const filtered = applyFilters(items);
      render(filtered, { hideDefinitions: settings.hideDefinitions, phoneticType: settings.phoneticType, batchMode });
    }
  } catch (err) { console.error('loadItems:', err); }
}

function applyFilters(list) {
  const colorFilter = getColorFilter();
  return list.filter(item => {
    // Mastery filter
    if (masteryFilter === 'mastered' && !item.mastered) return false;
    if (masteryFilter === 'unmastered' && item.mastered) return false;
    // Color filter
    if (colorFilter && item.color !== colorFilter) return false;
    return true;
  });
}

// ─── Color Filter ──────────────────────────────────────────

function renderColorFilter() {
  const container = document.getElementById('colorFilter');
  if (!container) return;
  const current = getColorFilter();

  let html = `<button class="filter-dot rainbow-all ${!current ? 'active' : ''}"
                     data-color="" title="全部颜色">全部</button>`;
  html += MACARON_COLORS.map(c => `
    <button class="filter-dot ${current === c.hex ? 'active' : ''}"
            data-color="${c.hex}" style="background:${c.hex}"
            title="筛选 ${c.name}"></button>
  `).join('');

  container.innerHTML = html;
  container.querySelectorAll('.filter-dot').forEach(btn => {
    btn.addEventListener('click', () => {
      const color = btn.dataset.color || null;
      setColorFilter(color);
      loadItems();
      renderColorFilter();
    });
  });
}

// ─── Toolbar ───────────────────────────────────────────────

function setupToolbar() {
  const el = (id) => document.getElementById(id);
  if (!el('btnToggleDefs')) return console.error('Toolbar elements missing!');

  el('btnToggleDefs').addEventListener('click', () => {
    settings.hideDefinitions = !settings.hideDefinitions;
    el('btnToggleDefs').querySelector('.icon-defs-on').style.display = settings.hideDefinitions ? 'none' : '';
    el('btnToggleDefs').querySelector('.icon-defs-off').style.display = settings.hideDefinitions ? '' : 'none';
    applySettings(); saveSettings();
    render(items, { hideDefinitions: settings.hideDefinitions, phoneticType: settings.phoneticType, batchMode });
  });

  el('btnBatch').addEventListener('click', () => {
    batchMode = !batchMode;
    clearSelection();
    el('batchBar').style.display = batchMode ? '' : 'none';
    el('btnBatch').classList.toggle('active', batchMode);
    render(items, { hideDefinitions: settings.hideDefinitions, phoneticType: settings.phoneticType, batchMode });
  });

  el('btnFilter').addEventListener('click', () => {
    filterVisible = !filterVisible;
    document.getElementById('filterBar').classList.toggle('visible', filterVisible);
    el('btnFilter').classList.toggle('active', filterVisible);
  });

  // Mastery filter chips
  document.querySelectorAll('#masteryFilter .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#masteryFilter .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      masteryFilter = chip.dataset.mastery;
      loadItems();
    });
  });

  // Learn page
  document.getElementById('btnLearn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('learn/learn.html') });
  });

  // Reading mode (toggle)
  let isReadingMode = false;
  el('btnReadingMode').addEventListener('click', async () => {
    isReadingMode = !isReadingMode;
    el('btnReadingMode').title = isReadingMode ? '退出阅读模式' : '进入阅读模式';
    el('btnReadingMode').classList.toggle('active', isReadingMode);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: isReadingMode ? 'ENTER_READING_MODE' : 'EXIT_READING_MODE' });
    }
  });

  // Highlight toggle — sends to active tab
  el('btnToggleHighlights').addEventListener('click', async () => {
    highlightsOn = !highlightsOn;
    el('btnToggleHighlights').querySelector('.icon-highlights-on').style.display = highlightsOn ? '' : 'none';
    el('btnToggleHighlights').querySelector('.icon-highlights-off').style.display = highlightsOn ? 'none' : '';
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_HIGHLIGHTS' });
    }
  });

  // Add card button
  document.getElementById('btnAddCard').addEventListener('click', () => {
    const word = prompt('输入要添加的单词：');
    if (word && word.trim()) {
      addWordManually(word.trim());
    }
  });

  el('btnExport').addEventListener('click', showExportMenu);
  el('btnSettings').addEventListener('click', () => chrome.runtime.openOptionsPage());
}

function setupBatchBar() {
  const el = (id) => document.getElementById(id);
  if (!el('btnBatchDelete')) return;

  el('btnBatchDelete').addEventListener('click', async () => {
    const ids = getSelectedIds();
    if (ids.length === 0 || !confirm(`删除选中的 ${ids.length} 项？`)) return;
    await chrome.runtime.sendMessage({ type: MSG.BATCH_OPERATION, payload: { operation: 'delete', wordIds: ids } });
    clearSelection();
    exitBatchMode();
    await loadItems();
  });

  el('btnBatchMaster').addEventListener('click', async () => {
    const ids = getSelectedIds();
    if (ids.length === 0) return;
    await chrome.runtime.sendMessage({ type: MSG.BATCH_OPERATION, payload: { operation: 'master', wordIds: ids } });
    await loadItems();
  });

  el('btnBatchUnmaster').addEventListener('click', async () => {
    const ids = getSelectedIds();
    if (ids.length === 0) return;
    await chrome.runtime.sendMessage({ type: MSG.BATCH_OPERATION, payload: { operation: 'unmaster', wordIds: ids } });
    await loadItems();
  });

  el('btnBatchCancel').addEventListener('click', exitBatchMode);
}

function exitBatchMode() {
  batchMode = false;
  clearSelection();
  document.getElementById('batchBar').style.display = 'none';
  const btnBatch = document.getElementById('btnBatch');
  if (btnBatch) btnBatch.classList.remove('active');
  render(items, { hideDefinitions: settings.hideDefinitions, phoneticType: settings.phoneticType, batchMode: false });
  // Note: filter bar stays open if filter was already visible
}

// ─── Card Operations ────────────────────────────────────────

async function toggleMastered(itemId, mastered) {
  await chrome.runtime.sendMessage({ type: MSG.MARK_MASTERED, payload: { wordId: itemId, mastered } });
  const item = items.find(i => i.id === itemId);
  if (item) item.mastered = mastered;
}

async function handleDelete(itemId) {
  if (!confirm('确定删除？')) return;
  await chrome.runtime.sendMessage({ type: MSG.DELETE_ITEM, payload: { wordId: itemId } });
  await loadItems();
}

async function handleColorChange(itemId, color) {
  await chrome.runtime.sendMessage({ type: MSG.UPDATE_ITEM, payload: { wordId: itemId, changes: { color } } });
  const item = items.find(i => i.id === itemId);
  if (item) item.color = color;
  render(items, { hideDefinitions: settings.hideDefinitions, phoneticType: settings.phoneticType, batchMode });
}

async function handleRefresh(itemId) {
  const item = items.find(i => i.id === itemId);
  if (!item || item.type !== 'word') return;

  const res = await chrome.runtime.sendMessage({
    type: 'REFRESH_DEFINITIONS',
    payload: { word: item.text }
  });

  if (res.success && res.changes) {
    // Update only phonetic, pos, definitions, examType
    await chrome.runtime.sendMessage({
      type: MSG.UPDATE_ITEM,
      payload: { wordId: itemId, changes: res.changes }
    });
    await loadItems();
  } else if (res.askLLM) {
    if (confirm('离线词典未收录该词，是否使用 LLM 生成释义？')) {
      const llmRes = await chrome.runtime.sendMessage({
        type: MSG.QUERY_WORD,
        payload: { text: item.text, type: 'word' }
      });
      if (llmRes.success) {
        await chrome.runtime.sendMessage({
          type: MSG.UPDATE_ITEM,
          payload: {
            wordId: itemId,
            changes: {
              phonetic: llmRes.data.phonetic || '',
              pos: llmRes.data.pos || '',
              definitions: llmRes.data.definitions || [],
              examType: llmRes.data.examType || '',
              definitions_source: 'llm'
            }
          }
        });
        await loadItems();
      } else {
        alert('LLM 查询失败: ' + (llmRes.error || ''));
      }
    }
  } else {
    alert('刷新失败: ' + (res.error || '未知错误'));
  }
}

async function addWordManually(word) {
  // Send a query to look up the word, then save
  const res = await chrome.runtime.sendMessage({ type: MSG.QUERY_WORD, payload: { text: word, type: 'word' } });
  const wordData = {
    id: 'w_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9),
    text: word,
    type: 'word',
    wordCount: 1,
    phonetic: res.success ? (res.data.phonetic || '') : '',
    pos: res.success ? (res.data.pos || '') : '',
    definitions: res.success ? (res.data.definitions || []) : [],
    examType: res.success ? (res.data.examType || '') : '',
    color: null,
    mastered: false,
    sourceSentence: '',
    sourceUrl: '',
    sourceTitle: '',
    sourceSentences: [],
    note: '',
    extraExamples: res.success ? (res.data.examples || []) : [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await chrome.runtime.sendMessage({ type: MSG.SAVE_WORD, payload: wordData });
  await loadItems();
  if (!res.success) {
    alert(`已添加 "${word}"，请在卡片上右键编辑补充释义。`);
  }
}

async function handleMoreExamples(itemId) {
  await handleRefresh(itemId);
}

async function handleReorder(fromIndex, toIndex) {
  const newItems = [...items];
  const [moved] = newItems.splice(fromIndex, 1);
  newItems.splice(toIndex, 0, moved);
  items = newItems;
  render(items, { hideDefinitions: settings.hideDefinitions, phoneticType: settings.phoneticType, batchMode });

  await chrome.runtime.sendMessage({
    type: MSG.REORDER_ITEMS,
    payload: { wordIds: items.map(i => i.id) }
  });
}

// ─── Edit Modal ─────────────────────────────────────────────

function setupEditModal() {
  const el = (id) => document.getElementById(id);
  if (!el('btnSaveEdit')) return;
  el('btnSaveEdit').addEventListener('click', handleSaveEdit);
  el('btnCancelEdit').addEventListener('click', hideEditModal);
  el('editModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hideEditModal();
  });
}

function showEditModal(itemId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;
  selectedItemId = itemId;
  document.getElementById('editText').value = item.text || '';
  document.getElementById('editPhonetic').value = item.phonetic || '';
  document.getElementById('editPos').value = item.pos || '';
  document.getElementById('editExamType').value = item.examType || '';
  document.getElementById('editDefs').value = (item.definitions || []).join('\n');

  // Format sourceSentences as: sentence | url (one per line)
  const sentences = item.sourceSentences || [];
  if (sentences.length === 0 && item.sourceSentence) {
    sentences.push({ text: item.sourceSentence, url: item.sourceUrl || '' });
  }
  document.getElementById('editExamples').value = sentences
    .map(s => s.text + (s.url ? ' | ' + s.url : ''))
    .join('\n');

  document.getElementById('editNote').value = item.note || '';
  document.getElementById('editModal').style.display = '';
}

function hideEditModal() {
  document.getElementById('editModal').style.display = 'none';
  selectedItemId = null;
}

async function handleSaveEdit() {
  if (!selectedItemId) return;
  const exampleLines = document.getElementById('editExamples').value.split('\n').filter(Boolean);
  const sourceSentences = exampleLines.map(line => {
    const separatorIdx = line.lastIndexOf(' | ');
    if (separatorIdx > 0) {
      return { text: line.slice(0, separatorIdx).trim(), url: line.slice(separatorIdx + 3).trim(), title: '' };
    }
    return { text: line.trim(), url: '', title: '' };
  });

  const changes = {
    text: document.getElementById('editText').value.trim(),
    phonetic: document.getElementById('editPhonetic').value.trim(),
    pos: document.getElementById('editPos').value.trim(),
    examType: document.getElementById('editExamType').value.trim(),
    definitions: document.getElementById('editDefs').value.split('\n').filter(Boolean),
    sourceSentences: sourceSentences,
    note: document.getElementById('editNote').value.trim()
  };
  await chrome.runtime.sendMessage({ type: MSG.UPDATE_ITEM, payload: { wordId: selectedItemId, changes } });
  hideEditModal();
  await loadItems();
}

// ─── Export ─────────────────────────────────────────────────

function showExportMenu() {
  const format = prompt('导出格式:\n1. JSON\n2. CSV\n3. Anki CSV\n\n输入 1/2/3:', '1');
  if (format === '1') exportAsJson(items);
  else if (format === '2') exportAsCsv(items);
  else if (format === '3') exportAsAnki(items);
}

// ─── Settings ───────────────────────────────────────────────

function applySettings() { document.body.dataset.font = settings.fontSize; }
async function saveSettings() {
  await chrome.runtime.sendMessage({ type: MSG.SAVE_SETTINGS, payload: settings });
}

// ─── Messages ──────────────────────────────────────────────

function handleIncomingMessage(msg) {
  if (msg.type === MSG.STORAGE_CHANGED) loadItems();
}
function handleStorageChange(changes, area) {
  if (area === 'local' && (changes.words || changes.wordOrder)) loadItems();
}

// ─── Start ──────────────────────────────────────────────────

init();
