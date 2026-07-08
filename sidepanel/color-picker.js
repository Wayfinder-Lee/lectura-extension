/**
 * Color picker component — shared between popup and side panel.
 */

import { MACARON_COLORS } from '../shared/constants.js';

/**
 * Render macaron color dots as HTML.
 * @param {string|null} selectedColor - Currently selected hex color
 * @param {string} dotClass - CSS class for each dot
 * @returns {string} HTML string
 */
export function renderColorDots(selectedColor = null, dotClass = 'color-dot') {
  return MACARON_COLORS.map(color => {
    const isSelected = selectedColor && selectedColor.toUpperCase() === color.hex.toUpperCase();
    return `
      <button class="${dotClass} ${isSelected ? 'is-selected' : ''}"
              data-color="${color.hex}"
              style="background: ${color.hex}"
              title="${color.name}${isSelected ? ' (已选)' : ''}">
      </button>
    `;
  }).join('');
}

/**
 * Get a macaron color hex by index.
 * @param {number} index
 * @returns {string} Hex color
 */
export function getColorByIndex(index) {
  return MACARON_COLORS[index % MACARON_COLORS.length].hex;
}

/**
 * Get all macaron colors.
 * @returns {Array<{ hex: string, name: string }>}
 */
export function getMacaronColors() {
  return MACARON_COLORS;
}
