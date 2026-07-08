/**
 * HTML templates for the popup overlay.
 * Renders different content for words vs sentences, and for new vs saved items.
 */

import { MACARON_COLORS } from '../../shared/constants.js';
import { escapeHtml } from '../../shared/utils.js';

/**
 * Render the full popup HTML for a word that's NOT yet saved (new lookup).
 * @param {object} dictData - Dictionary API result
 * @param {string} word - The word text
 * @param {string} phoneticType - 'us' or 'uk'
 * @returns {string} HTML string
 */
export function renderNewWordPopup(dictData, word, phoneticType) {
  // ECDICT provides a single phonetic field (primarily UK IPA)
  const phonetic = dictData.phonetic || '';

  return `
    <div class="lectura-popup-header">
      <span class="lectura-popup-word">${escapeHtml(word)}</span>
      ${dictData.baseForm ? `<button class="lectura-baseform-btn" data-baseform="${escapeHtml(dictData.baseForm)}" title="查询原形">← ${escapeHtml(dictData.baseForm)}</button>` : ''}
      <button class="lectura-popup-close" aria-label="关闭" title="关闭 (Esc)">✕</button>
    </div>
    <div class="lectura-popup-meta">
      ${dictData.pos ? `<span class="lectura-pos">${escapeHtml(dictData.pos)}</span>` : ''}
      ${phonetic ? `<span class="lectura-phonetic">/${escapeHtml(phonetic)}/</span>` : ''}
      ${dictData.examType ? `<span class="lectura-exam">${escapeHtml(dictData.examType)}</span>` : ''}
      ${dictData.collins ? `<span class="lectura-collins" title="柯林斯 ${dictData.collins} 星">⭐${escapeHtml(dictData.collins)}</span>` : ''}
      ${dictData.definitions_source === 'llm' ? '<span class="lectura-llm-badge">🤖 LLM</span>' : ''}
    </div>
    <div class="lectura-popup-defs">
      ${renderDefinitions(dictData.definitions)}
    </div>
    ${dictData.examples?.length ? renderLLMExamples(dictData.examples) : ''}
    ${renderErrorMessage(dictData)}
    <div class="lectura-popup-actions">
      <div class="lectura-actions-row">
        <button class="lectura-btn-save" title="收藏">
          <span class="lectura-star">☆</span>
        </button>
        <div class="lectura-colors">
          ${renderColorCircles()}
        </div>
      </div>
    </div>
  `;
}

function renderLLMExamples(examples) {
  if (!examples || examples.length === 0) return '';
  return `
    <div class="lectura-popup-examples">
      <div class="lectura-examples-title">例句</div>
      ${examples.map(ex => `
        <div class="lectura-example-item">
          <div class="lectura-example-en">${escapeHtml(ex.en)}</div>
          <div class="lectura-example-zh">${escapeHtml(ex.zh)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Render the full popup HTML for a word that IS already saved.
 * @param {object} wordData - Saved word data from storage
 * @param {string} phoneticType
 * @returns {string} HTML string
 */
export function renderSavedWordPopup(wordData, phoneticType) {
  const phonetic = wordData.phonetic || wordData.phoneticUk || wordData.phoneticUs || '';

  return `
    <div class="lectura-popup-header">
      <span class="lectura-popup-word">${escapeHtml(wordData.text)}</span>
      <button class="lectura-popup-close" aria-label="关闭" title="关闭 (Esc)">✕</button>
    </div>
    <div class="lectura-popup-meta">
      ${wordData.pos ? `<span class="lectura-pos">${escapeHtml(wordData.pos)}</span>` : ''}
      ${phonetic ? `<span class="lectura-phonetic">/${escapeHtml(phonetic)}/</span>` : ''}
      ${wordData.examType ? `<span class="lectura-exam">${escapeHtml(wordData.examType)}</span>` : ''}
    </div>
    <div class="lectura-popup-defs">
      ${renderDefinitions(wordData.definitions)}
    </div>
    <div class="lectura-popup-source">
      <span class="lectura-source-label">📄</span>
      <span class="lectura-source-text">${escapeHtml(truncateSource(wordData.sourceSentence))}</span>
    </div>
    <div class="lectura-popup-actions">
      <div class="lectura-actions-row">
        <button class="lectura-btn-delete" title="删除">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
        <div class="lectura-colors">
          ${renderColorCircles(wordData.color)}
        </div>
        <button class="lectura-btn-add-example" title="添加当前例句">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span>此例句</span>
        </button>
        <button class="lectura-btn-mastered-ribbon ${wordData.mastered ? 'is-mastered' : ''}" title="${wordData.mastered ? '取消已掌握' : '标记为已掌握'}">
          ${wordData.mastered ? `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            <span>已掌握</span>
          ` : `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>未掌握</span>
          `}
        </button>
      </div>
    </div>
  `;
}

/**
 * Render the popup for a sentence (no dictionary data).
 * @param {string} text - The sentence text
 * @param {string|null} translation - Translation if available
 * @returns {string} HTML string
 */
export function renderSentencePopup(text, translation) {
  const definitions = translation ? [translation] : [];
  return `
    <div class="lectura-popup-header">
      <span class="lectura-popup-word lectura-sentence">${escapeHtml(truncateSource(text))}</span>
      <button class="lectura-popup-close" aria-label="关闭" title="关闭 (Esc)">✕</button>
    </div>
    <div class="lectura-popup-meta">
      <span class="lectura-pos">句子</span>
      <span class="lectura-wordcount">7+ 词</span>
    </div>
    <div class="lectura-popup-defs">
      ${renderDefinitions(definitions) || '<div class="lectura-def-empty">句子将被保存到侧边栏</div>'}
    </div>
    <div class="lectura-popup-actions">
      <div class="lectura-actions-row">
        <button class="lectura-btn-save" title="收藏句子">
          <span class="lectura-star">☆</span>
        </button>
        <div class="lectura-colors">
          ${renderColorCircles()}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render a loading state.
 * @returns {string} HTML string
 */
export function renderLoading() {
  return `
    <div class="lectura-popup-loading">
      <div class="lectura-spinner"></div>
      <span>查询中...</span>
    </div>
    <div class="lectura-popup-actions">
      <div class="lectura-actions-row">
        <button class="lectura-btn-save" title="收藏（无释义）">
          <span class="lectura-star">☆</span>
        </button>
        <div class="lectura-colors">
          ${renderColorCircles()}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render an error state.
 * @param {string} message
 * @returns {string} HTML string
 */
export function renderError(message, showAddButton = false) {
  return `
    <div class="lectura-popup-error">
      <span class="lectura-error-icon">⚠️</span>
      <span class="lectura-error-msg">${escapeHtml(message)}</span>
    </div>
    ${showAddButton ? `
    <div class="lectura-popup-actions">
      <div class="lectura-actions-row">
        <button class="lectura-btn-add-manual" title="手动添加卡片">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span>手动添加</span>
        </button>
        <div class="lectura-colors">
          ${renderColorCircles()}
        </div>
      </div>
    </div>
    ` : ''}
  `;
}

// ─── Helpers ────────────────────────────────────────────────

function renderDefinitions(explains) {
  if (!explains || explains.length === 0) {
    return '<div class="lectura-def-empty">暂无释义</div>';
  }
  return explains.map(exp => `<div class="lectura-def-item">${escapeHtml(exp)}</div>`).join('');
}

function renderErrorMessage(dictData) {
  if (dictData._error) {
    return `<div class="lectura-popup-error-inline">⚠️ ${escapeHtml(dictData._error)}</div>`;
  }
  return '';
}

function renderColorCircles(selectedColor = null) {
  return MACARON_COLORS.map(color => {
    const isSelected = selectedColor && selectedColor.toUpperCase() === color.hex.toUpperCase();
    return `
      <button class="lectura-color-circle ${isSelected ? 'is-selected' : ''}"
              data-color="${color.hex}"
              style="background: ${color.hex}"
              title="${color.name}${isSelected ? ' (已选)' : ''}"
              aria-label="${color.name}">
      </button>
    `;
  }).join('');
}

function truncateSource(text) {
  if (!text) return '';
  return text.length > 80 ? text.slice(0, 77) + '...' : text;
}
