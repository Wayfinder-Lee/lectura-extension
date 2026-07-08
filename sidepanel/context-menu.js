/**
 * Context Menu: Right-click menu for card operations.
 */

import { renderColorDots } from './color-picker.js';

let menu = null;
let currentItemId = null;
let callbacks = {};

/**
 * Initialize the context menu.
 * @param {object} cb - Callbacks
 * @param {Function} cb.onDelete - (itemId) => void
 * @param {Function} cb.onColorChange - (itemId, color) => void
 * @param {Function} cb.onRemoveColor - (itemId) => void
 * @param {Function} cb.onEdit - (itemId) => void
 * @param {Function} cb.onRefresh - (itemId) => void
 * @param {Function} cb.onMoreExamples - (itemId) => void
 */
export function initContextMenu(cb = {}) {
  callbacks = cb;
  menu = document.getElementById('contextMenu');

  if (!menu) return;

  // Color dots
  const colorsContainer = document.getElementById('contextColors');
  if (colorsContainer) {
    colorsContainer.innerHTML = renderColorDots(null, 'color-dot');
    colorsContainer.addEventListener('click', (e) => {
      const dot = e.target.closest('.color-dot');
      if (!dot || !currentItemId) return;
      const color = dot.dataset.color;
      if (callbacks.onColorChange) callbacks.onColorChange(currentItemId, color);
      hide();
    });
  }

  // Action items
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.context-item');
    if (!item || !currentItemId) return;

    const action = item.dataset.action;
    switch (action) {
      case 'delete':
        if (callbacks.onDelete) callbacks.onDelete(currentItemId);
        break;
      case 'edit':
        if (callbacks.onEdit) callbacks.onEdit(currentItemId);
        break;
      case 'refresh':
        if (callbacks.onRefresh) callbacks.onRefresh(currentItemId);
        break;
      case 'more-examples':
        if (callbacks.onMoreExamples) callbacks.onMoreExamples(currentItemId);
        break;
      case 'remove-color':
        if (callbacks.onRemoveColor) callbacks.onRemoveColor(currentItemId);
        break;
    }
    hide();
  });

  // Hide on outside click
  document.addEventListener('click', (e) => {
    if (menu && !menu.contains(e.target)) {
      hide();
    }
  });
}

/**
 * Show the context menu at a position.
 * @param {string} itemId
 * @param {number} x - Client X
 * @param {number} y - Client Y
 */
export function show(itemId, x, y) {
  if (!menu) return;
  currentItemId = itemId;

  // Clamp position to viewport
  const menuWidth = 180;
  const menuHeight = 280; // approximate
  const maxX = window.innerWidth - menuWidth - 8;
  const maxY = window.innerHeight - menuHeight - 8;

  menu.style.left = `${Math.max(8, Math.min(x, maxX))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, maxY))}px`;
  menu.style.display = '';
}

/**
 * Hide the context menu.
 */
export function hide() {
  if (menu) {
    menu.style.display = 'none';
    currentItemId = null;
  }
}
