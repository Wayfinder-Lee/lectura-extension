/**
 * Card component: renders a single word/sentence card in the side panel.
 */

import { escapeHtml, truncate } from '../shared/utils.js';
import { getCardBorderColor } from '../shared/colors.js';

/**
 * Highlight all occurrences of a word (case-insensitive) in text.
 * Returns HTML string with matched words wrapped in <span class="source-highlight">.
 */
function highlightWordInText(text, word) {
  if (!text || !word) return escapeHtml(text || '');
  const escaped = escapeHtml(text);
  const lowerText = text.toLowerCase();
  const lowerWord = word.toLowerCase();
  const wordLen = word.length;
  let result = '';
  let lastIdx = 0;

  for (let i = 0; i <= lowerText.length - wordLen; i++) {
    // Check word boundary
    const isStart = i === 0 || /\W/.test(lowerText[i - 1]);
    const isEnd = i + wordLen >= lowerText.length || /\W/.test(lowerText[i + wordLen]);
    if (isStart && isEnd && lowerText.slice(i, i + wordLen) === lowerWord) {
      result += escaped.slice(lastIdx, i);
      result += `<span class="source-highlight">${escaped.slice(i, i + wordLen)}</span>`;
      lastIdx = i + wordLen;
      i = i + wordLen - 1; // skip past the word (loop will increment)
    }
  }
  result += escaped.slice(lastIdx);
  return result;
}

/**
 * Create a card DOM element from word data.
 */
export function createCard(item, options = {}) {
  const { hideDefinitions = false, phoneticType = 'us', batchMode = false, isSelected = false } = options;

  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.itemId = item.id;
  if (item.mastered) card.classList.add('is-mastered');
  if (isSelected) card.classList.add('is-selected');

  const isWord = item.type === 'word';

  // Color bar
  const colorBar = document.createElement('div');
  colorBar.className = 'card-color-bar';
  colorBar.style.setProperty('--card-color', getCardBorderColor(item.color));
  card.appendChild(colorBar);

  // Drag handle
  const dragHandle = document.createElement('div');
  dragHandle.className = 'card-drag-handle';
  dragHandle.textContent = '⋮⋮';
  dragHandle.draggable = true;
  dragHandle.title = '拖动排序';
  // Drag events on the handle
  dragHandle.addEventListener('dragstart', (e) => {
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.id);
  });
  dragHandle.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    // Clean up all insertion indicators
    document.querySelectorAll('.drag-before, .drag-after').forEach(el => {
      el.classList.remove('drag-before', 'drag-after');
    });
  });
  card.appendChild(dragHandle);

  // Drag over — show insertion indicator
  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    // Don't show indicator on self
    const dragging = document.querySelector('.card.dragging');
    if (!dragging || dragging === card) return;

    // Determine if inserting before or after based on mouse position
    const rect = card.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    card.classList.remove('drag-before', 'drag-after');
    card.classList.add(e.clientY < midY ? 'drag-before' : 'drag-after');
  });

  card.addEventListener('dragleave', () => {
    card.classList.remove('drag-before', 'drag-after');
  });

  // Main content
  const content = document.createElement('div');
  content.className = 'card-content';

  // Word
  const wordEl = document.createElement('div');
  wordEl.className = 'card-word';
  if (isWord) {
    wordEl.textContent = item.text;
  } else {
    // Sentence: show full text with hover-to-expand
    wordEl.textContent = item.text;
    wordEl.classList.add('card-sentence-text');
    wordEl.title = '悬停查看完整句子';
  }
  content.appendChild(wordEl);

  // Source link for sentences
  if (!isWord && item.sourceUrl) {
    const link = document.createElement('a');
    link.className = 'card-source-link';
    link.textContent = '🔗 来源网页';
    link.title = item.sourceUrl;
    link.style.cssText = 'font-size:0.8em;display:inline-block;margin-top:2px;';
    link.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.tabs.create({ url: item.sourceUrl });
    });
    content.appendChild(link);
  }

  // Meta line
  const meta = document.createElement('div');
  meta.className = 'card-meta';

  if (isWord) {
    if (item.pos) {
      const posEl = document.createElement('span');
      posEl.className = 'card-pos';
      posEl.textContent = item.pos;
      meta.appendChild(posEl);
    }

    const phonetic = item.phonetic || item.phoneticUk || item.phoneticUs || '';
    if (phonetic) {
      const phoneticEl = document.createElement('span');
      phoneticEl.className = 'card-phonetic';
      phoneticEl.textContent = `/${phonetic}/`;
      meta.appendChild(phoneticEl);
    }

    if (item.examType) {
      const examEl = document.createElement('span');
      examEl.className = 'card-exam';
      examEl.textContent = item.examType;
      examEl.style.cssText = 'color:#e67e22;font-size:0.8em;font-weight:600;';
      meta.appendChild(examEl);
    }
  } else {
    const typeLabel = document.createElement('span');
    typeLabel.className = 'card-pos';
    typeLabel.textContent = '句子';
    meta.appendChild(typeLabel);
  }
  content.appendChild(meta);

  // Definitions — for both words and sentences
  if (item.definitions && item.definitions.length > 0) {
    const defsEl = document.createElement('div');
    defsEl.className = 'card-definitions';
    if (hideDefinitions) defsEl.classList.add('hidden');
    // Each definition on its own line, like popup
    item.definitions.slice(0, 5).forEach((def, i) => {
      const line = document.createElement('div');
      line.className = 'card-def-line';
      line.textContent = def;
      defsEl.appendChild(line);
    });
    content.appendChild(defsEl);
  }

  // Source sentences — numbered list
  let sentences = item.sourceSentences || [];
  if (sentences.length === 0 && item.sourceSentence) {
    sentences = [{ text: item.sourceSentence, url: item.sourceUrl, title: item.sourceTitle }];
  }

  if (sentences.length > 0) {
    const sourceEl = document.createElement('div');
    sourceEl.className = 'card-source';
    if (hideDefinitions) sourceEl.classList.add('hidden');

    sentences.forEach((sent, idx) => {
      const line = document.createElement('div');
      line.className = 'card-source-line';

      const num = document.createElement('span');
      num.className = 'card-source-num';
      num.textContent = `${idx + 1}. `;
      line.appendChild(num);

      // Highlight the word (and inflected forms) in the sentence
      const highlightedText = highlightWordInText(sent.text, item.text);
      const textSpan = document.createElement('span');
      textSpan.innerHTML = highlightedText;
      line.appendChild(textSpan);

      if (sent.url) {
        const link = document.createElement('a');
        link.className = 'card-source-link';
        link.textContent = ' 🔗';
        link.title = (sent.title || '') + '\n' + sent.url;
        link.addEventListener('click', (e) => {
          e.stopPropagation();
          chrome.tabs.create({ url: sent.url });
        });
        line.appendChild(link);
      }

      sourceEl.appendChild(line);
    });

    content.appendChild(sourceEl);
  }

  // Note
  if (item.note) {
    const noteEl = document.createElement('div');
    noteEl.className = 'card-note';
    noteEl.textContent = '📝 ' + item.note;
    noteEl.style.cssText = 'font-size:0.85em;color:#888;margin-top:6px;font-style:italic;';
    content.appendChild(noteEl);
  }

  // Trash button (top-right of content area)
  const trashBtn = document.createElement('button');
  trashBtn.className = 'card-trash-btn';
  trashBtn.title = '删除';
  trashBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6"/><path d="M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  `;
  trashBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (typeof options.onDelete === 'function') {
      options.onDelete(item.id);
    }
  });
  card.appendChild(trashBtn);

  card.appendChild(content);

  // Mastered ribbon (right side)
  const ribbon = document.createElement('div');
  ribbon.className = 'card-ribbon';
  if (item.mastered) ribbon.classList.add('is-mastered');
  ribbon.title = item.mastered ? '已掌握 (点击取消)' : '标记为已掌握';

  // Checkmark SVG
  ribbon.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  `;

  // Click-spread animation
  ribbon.addEventListener('click', (e) => {
    const rect = ribbon.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Remove old ripple
    const oldRipple = ribbon.querySelector('.ribbon-ripple');
    if (oldRipple) oldRipple.remove();

    // Create ripple element
    const ripple = document.createElement('span');
    ripple.className = 'ribbon-ripple';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    ribbon.appendChild(ripple);

    // Trigger animation
    requestAnimationFrame(() => ripple.classList.add('spread'));
    setTimeout(() => ripple.remove(), 350);
  });

  card.appendChild(ribbon);

  // Hover reveal for hidden definitions (words + sentences)
  if (hideDefinitions) {
    card.addEventListener('mouseenter', () => {
      const defs = card.querySelector('.card-definitions');
      const source = card.querySelector('.card-source');
      if (defs) defs.classList.remove('hidden');
      if (source) source.classList.remove('hidden');
    });
    card.addEventListener('mouseleave', () => {
      const defs = card.querySelector('.card-definitions');
      const source = card.querySelector('.card-source');
      if (defs) defs.classList.add('hidden');
      if (source) source.classList.add('hidden');
    });
  }

  return card;
}

export function updateCardVisuals(card, changes) {
  if (changes.mastered !== undefined) {
    card.classList.toggle('is-mastered', changes.mastered);
    const ribbon = card.querySelector('.card-ribbon');
    if (ribbon) {
      ribbon.classList.toggle('is-mastered', changes.mastered);
      ribbon.title = changes.mastered ? '已掌握 (点击取消)' : '标记为已掌握';
    }
  }
  if (changes.color !== undefined) {
    const bar = card.querySelector('.card-color-bar');
    if (bar) bar.style.setProperty('--card-color', getCardBorderColor(changes.color));
  }
  if (changes.text !== undefined) {
    const wordEl = card.querySelector('.card-word');
    if (wordEl) wordEl.textContent = changes.text;
  }
}
