/**
 * LECTURA — Selection Bubble
 * Minimal frosted-glass circle with "学习" text.
 * Appears near selected text; clicking it triggers dictionary popup.
 */

let bubbleEl = null;
let onBubbleClick = null;

export function initBubble(clickHandler) {
  onBubbleClick = clickHandler;
  if (!bubbleEl) createBubble();
}

export function showBubble(x, y, width) {
  if (!bubbleEl) createBubble();
  const size = 46;
  const left = Math.max(8, Math.min(window.innerWidth - size - 8, x + width / 2 - size / 2));
  const top = Math.max(8, y - size - 10);
  bubbleEl.style.left = left + 'px';
  bubbleEl.style.top = top + 'px';
  bubbleEl.style.display = 'flex';
  bubbleEl.style.transform = 'scale(1)';
}

export function hideBubble() {
  if (bubbleEl) {
    bubbleEl.style.display = 'none';
    bubbleEl.style.transform = 'scale(0.8)';
  }
}

export function destroyBubble() {
  if (bubbleEl?.parentNode) bubbleEl.parentNode.removeChild(bubbleEl);
  bubbleEl = null;
}

function createBubble() {
  bubbleEl = document.createElement('div');
  bubbleEl.id = 'lectura-bubble';
  bubbleEl.innerHTML = `
    <span class="lectura-bubble-text">学习</span>
  `;
  const style = document.createElement('style');
  style.textContent = `
    #lectura-bubble {
      position: fixed;
      z-index: 2147483646;
      width: 46px; height: 46px;
      border-radius: 50%;
      background: rgba(255,255,255,0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      box-shadow: 0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08);
      display: none;
      align-items: center; justify-content: center;
      cursor: pointer;
      transition: transform 0.15s ease, opacity 0.15s ease;
      border: 1px solid rgba(255,255,255,0.6);
    }
    #lectura-bubble:hover {
      transform: scale(1.08) !important;
      box-shadow: 0 6px 20px rgba(0,0,0,0.16);
    }
    .lectura-bubble-text {
      font-size: 12px;
      font-weight: 600;
      color: #6366f1;
      font-family: system-ui, -apple-system, sans-serif;
      user-select: none;
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(bubbleEl);

  bubbleEl.addEventListener('click', (e) => {
    e.stopPropagation();
    hideBubble();
    if (onBubbleClick) onBubbleClick();
  });
}
