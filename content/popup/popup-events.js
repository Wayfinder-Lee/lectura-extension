/**
 * Popup event handlers: binds click events to popup buttons.
 *
 * Called after popup content is rendered into the Shadow DOM.
 */

import { MACARON_COLORS } from '../../shared/constants.js';

/**
 * Bind event handlers to the popup's interactive elements.
 * @param {ShadowRoot} root - The popup's ShadowRoot
 * @param {object} callbacks - Handler callbacks
 * @param {Function} callbacks.onSave - (color: string|null) => void — called on ☆ click
 * @param {Function} callbacks.onSaveImmediate - (color: string) => void — called on color circle click (immediate save)
 * @param {Function} callbacks.onBaseFormClick - (baseForm: string) => void — called when base form button clicked
 * @param {Function} callbacks.onColorSelect - (color: string|null) => void
 * @param {Function} callbacks.onAddExample - () => void — called on "+此例句" click
 * @param {Function} callbacks.onDelete - () => void — called on trash button click
 * @param {Function} callbacks.onMastered - () => void
 * @param {Function} callbacks.onColorChange - (color: string|null) => void
 * @param {Function} callbacks.onClose - () => void
 */
export function createPopupEventHandlers(root, callbacks = {}) {
  const {
    onSave,
    onSaveImmediate,
    onBaseFormClick,
    onAddExample,
    onDelete,
    onColorSelect,
    onMastered,
    onColorChange,
    onClose
  } = callbacks;

  // Add example button
  const addExampleBtn = root.querySelector('.lectura-btn-add-example');
  if (addExampleBtn && onAddExample) {
    addExampleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onAddExample();
    });
  }

  // Delete button (trash icon)
  const deleteBtn = root.querySelector('.lectura-btn-delete');
  if (deleteBtn && onDelete) {
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onDelete();
    });
  }

  // Base form button
  const baseFormBtn = root.querySelector('.lectura-baseform-btn');
  if (baseFormBtn && onBaseFormClick) {
    baseFormBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const baseForm = baseFormBtn.dataset.baseform;
      if (baseForm) onBaseFormClick(baseForm);
    });
  }

  // Close button
  const closeBtn = root.querySelector('.lectura-popup-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onClose) onClose();
    });
  }

  // Save (star) button — save without color
  const saveBtn = root.querySelector('.lectura-btn-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onSave) onSave(null);
    });
  }

  // Manual add button (shown when dictionary lookup fails)
  const manualAddBtn = root.querySelector('.lectura-btn-add-manual');
  if (manualAddBtn) {
    manualAddBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onSave) onSave(null);
    });
  }

  // Color circles — immediate save (new word) or color change (saved word)
  const circles = root.querySelectorAll('.lectura-color-circle');
  circles.forEach(circle => {
    circle.addEventListener('click', (e) => {
      e.stopPropagation();
      const color = circle.dataset.color;

      // If onSaveImmediate exists (new word popup), save immediately with this color
      if (onSaveImmediate) {
        circle.classList.add('is-selected');
        onSaveImmediate(color);
        return;
      }

      // Otherwise (saved word popup), change color
      if (onColorChange) {
        circles.forEach(c => c.classList.remove('is-selected'));
        circle.classList.add('is-selected');
        onColorChange(color);
      }
    });
  });

  // Mastered ribbon button
  const masteredBtn = root.querySelector('.lectura-btn-mastered-ribbon');
  if (masteredBtn) {
    masteredBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onMastered) onMastered();
    });
  }

  // Prevent popup clicks from propagating to document
  const popup = root.querySelector('.lectura-popup');
  if (popup) {
    popup.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }
}

/**
 * Create document-level click handler to close popup on outside click.
 * @param {ShadowRoot} root - The popup's ShadowRoot (host element)
 * @param {Function} onClose
 * @returns {{ destroy: Function }}
 */
export function createOutsideClickListener(onClose) {
  function handler(e) {
    // Check if click is on the popup host element or inside it
    const host = document.getElementById('lectura-popup-root');
    if (!host || host.style.display === 'none') return;

    // If click is inside the host (shadow DOM), don't close
    if (host.contains(e.target) || host === e.target) return;

    if (onClose) onClose();
  }

  document.addEventListener('click', handler, true);
  return {
    destroy() {
      document.removeEventListener('click', handler, true);
    }
  };
}

/**
 * Create keyboard handler (Escape to close).
 * @param {Function} onClose
 * @returns {{ destroy: Function }}
 */
export function createKeyboardHandler(onClose) {
  function handler(e) {
    if (e.key === 'Escape') {
      const host = document.getElementById('lectura-popup-root');
      if (!host || host.style.display === 'none') return;
      if (onClose) onClose();
    }
  }

  document.addEventListener('keydown', handler, true);
  return {
    destroy() {
      document.removeEventListener('keydown', handler, true);
    }
  };
}
