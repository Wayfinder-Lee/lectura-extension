/**
 * Card List: renders cards, drag-to-reorder, batch selection, color filter.
 */

import { createCard } from './card.js';

let items = [];
let cardElements = new Map();
let options = {};
let listeners = {};
let selectedIds = new Set();
let colorFilter = null; // null = show all, or hex string

export function initCardList(container, callbacks = {}) {
  listeners = callbacks;

  container.addEventListener('click', handleCardClick);
  container.addEventListener('contextmenu', handleContextMenu);
  container.addEventListener('dragover', handleDragOver);
  container.addEventListener('drop', handleDrop);

  return { render, setColorFilter, getSelectedIds, destroy };
}

function destroy() {
  const container = document.getElementById('cardList');
  if (container) {
    container.removeEventListener('click', handleCardClick);
    container.removeEventListener('contextmenu', handleContextMenu);
    container.removeEventListener('dragover', handleDragOver);
    container.removeEventListener('drop', handleDrop);
  }
}

// ─── Render ────────────────────────────────────────────────

export function render(itemList, displayOptions = {}) {
  items = itemList;
  options = displayOptions;
  cardElements = new Map();

  const container = document.getElementById('cardList');
  if (!container) return;

  container.querySelectorAll('.card').forEach(c => c.remove());

  // Apply color filter
  const filtered = colorFilter
    ? items.filter(i => i.color === colorFilter)
    : items;

  const emptyState = document.getElementById('emptyState');
  if (emptyState) {
    emptyState.style.display = filtered.length === 0 ? '' : 'none';
  }

  const countEl = document.getElementById('itemCount');
  if (countEl) {
    countEl.textContent = colorFilter
      ? `${filtered.length} / ${items.length} 项`
      : `${items.length} 项`;
  }

  for (const item of filtered) {
    const card = createCard(item, {
      ...options,
      isSelected: selectedIds.has(item.id),
      onDelete: listeners.onDelete
    });
    container.appendChild(card);
    cardElements.set(item.id, card);
  }
}

// ─── Color Filter ──────────────────────────────────────────

export function setColorFilter(hex) {
  colorFilter = hex;
  render(items, options);
}

export function getColorFilter() {
  return colorFilter;
}

// ─── Selection ─────────────────────────────────────────────

export function getSelectedIds() {
  return [...selectedIds];
}

export function clearSelection() {
  selectedIds.clear();
  // Update visual state
  for (const [id, card] of cardElements) {
    card.classList.remove('is-selected');
  }
}

// ─── Event Handlers ────────────────────────────────────────

function handleCardClick(e) {
  const card = e.target.closest('.card');
  if (!card) return;
  const itemId = card.dataset.itemId;
  if (!itemId) return;

  // Mastered ribbon
  if (e.target.closest('.card-ribbon')) {
    const item = items.find(i => i.id === itemId);
    if (item && listeners.onMastered) {
      listeners.onMastered(itemId, !item.mastered);
    }
    return;
  }

  // Source link
  if (e.target.closest('.card-source-link')) return;

  // Batch mode: toggle selection by clicking card
  if (options.batchMode) {
    e.preventDefault();
    if (selectedIds.has(itemId)) {
      selectedIds.delete(itemId);
      card.classList.remove('is-selected');
    } else {
      selectedIds.add(itemId);
      card.classList.add('is-selected');
    }
    return;
  }

  // Normal mode: card click
  const item = items.find(i => i.id === itemId);
  if (item && listeners.onCardClick) {
    listeners.onCardClick(itemId, item);
  }
}

function handleContextMenu(e) {
  const card = e.target.closest('.card');
  if (!card) return;
  e.preventDefault();
  const itemId = card.dataset.itemId;
  if (!itemId) return;
  const item = items.find(i => i.id === itemId);
  if (item && listeners.onContextMenu) {
    listeners.onContextMenu(itemId, item, e.clientX, e.clientY);
  }
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function handleDrop(e) {
  e.preventDefault();
  const dragId = e.dataTransfer.getData('text/plain');
  if (!dragId) return;

  const target = e.target.closest('.card');
  if (!target) return;
  const targetId = target.dataset.itemId;
  if (!targetId || targetId === dragId) return;

  const fromIndex = items.findIndex(i => i.id === dragId);
  let toIndex = items.findIndex(i => i.id === targetId);
  if (fromIndex === -1 || toIndex === -1) return;

  // Adjust for insertion position (before vs after target)
  const insertAfter = target.classList.contains('drag-after');
  if (insertAfter && toIndex > fromIndex) {
    // If inserting after and target is below, adjust index
  } else if (!insertAfter && toIndex < fromIndex) {
    // If inserting before and target is above
  } else if (insertAfter) {
    toIndex += 1;
  }

  // Clean up indicators
  document.querySelectorAll('.drag-before, .drag-after').forEach(el => {
    el.classList.remove('drag-before', 'drag-after');
  });

  // Reorder
  const newItems = [...items];
  const [moved] = newItems.splice(fromIndex, 1);
  newItems.splice(toIndex, 0, moved);
  items = newItems;

  if (listeners.onDragEnd) {
    listeners.onDragEnd(fromIndex, toIndex);
  }
}
