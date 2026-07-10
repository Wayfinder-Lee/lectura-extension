/**
 * LECTURA — Link Shield
 * Hold Alt to temporarily disable link clicks for text selection.
 */

const SHIELD_KEY = 'Alt';
let isShieldActive = false;

// CSS to disable links
const SHIELD_STYLE_ID = 'lectura-link-shield-style';
const SHIELD_CSS = `
  html.lectura-shield a,
  html.lectura-shield a * {
    pointer-events: none !important;
    cursor: text !important;
  }
`;

function enableShield() {
  if (isShieldActive) return;
  isShieldActive = true;
  document.documentElement.classList.add('lectura-shield');
  if (!document.getElementById(SHIELD_STYLE_ID)) {
    const style = document.createElement('style');
    style.id = SHIELD_STYLE_ID;
    style.textContent = SHIELD_CSS;
    document.head.appendChild(style);
  }
}

function disableShield() {
  if (!isShieldActive) return;
  isShieldActive = false;
  document.documentElement.classList.remove('lectura-shield');
}

document.addEventListener('keydown', (e) => {
  if (e.key === SHIELD_KEY && !e.repeat) {
    enableShield();
  }
});

document.addEventListener('keyup', (e) => {
  if (e.key === SHIELD_KEY) {
    disableShield();
  }
});

// Also disable on blur (user switched windows while holding Alt)
window.addEventListener('blur', () => {
  disableShield();
});
