import { MACARON_COLORS } from './constants.js';

/**
 * Convert hex color to rgba with opacity.
 * @param {string} hex - Hex color string (e.g., '#FFB3BA')
 * @param {number} opacity - Opacity value 0-1
 * @returns {string} rgba() string
 */
export function hexToRgba(hex, opacity = 1) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Get a macaron color by index (wraps around).
 * @param {number} index
 * @returns {{ hex: string, name: string }}
 */
export function getMacaronColor(index) {
  return MACARON_COLORS[index % MACARON_COLORS.length];
}

/**
 * Find a macaron color entry by hex value.
 * @param {string} hex
 * @returns {{ hex: string, name: string } | undefined}
 */
export function findMacaronColor(hex) {
  return MACARON_COLORS.find(c => c.hex.toUpperCase() === hex.toUpperCase());
}

/**
 * Get highlight background color for a word.
 * Mastered: no background (transparent) — don't distract reading.
 * Unmastered: very light tint of the macaron color.
 * @param {string|null} colorHex - The macaron color hex, or null
 * @param {boolean} mastered - Whether the word is mastered
 * @returns {string} CSS background value
 */
export function getHighlightBg(colorHex, mastered) {
  if (mastered) return 'transparent';
  if (!colorHex) return 'rgba(255, 230, 100, 0.18)'; // default yellow, very light
  return hexToRgba(colorHex, 0.2);
}

/**
 * Get highlight underline style.
 * Mastered: dashed gray underline (subtle self-testing cue).
 * Unmastered: solid underline in the word's color (learning aid).
 * @param {boolean} mastered
 * @param {string|null} colorHex
 * @returns {{ decoration: string, color: string }}
 */
export function getHighlightUnderline(mastered, colorHex) {
  if (mastered) {
    return { decoration: 'underline dashed', color: '#bbb' };
  }
  return { decoration: 'underline solid', color: colorHex || '#e6a817' };
}

/**
 * Get the border color for a card's color indicator.
 * @param {string|null} colorHex
 * @returns {string} CSS border-color value
 */
export function getCardBorderColor(colorHex) {
  return colorHex || '#e0e0e0';
}
