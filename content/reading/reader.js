/**
 * LECTURA Reading Mode — 3-layer architecture
 *   Layer 1: Fixed toolbar | Layer 2: Paper background | Layer 3: Centered content
 */

const FONT_SIZES = [16, 20, 24, 28, 32, 36, 42];
const LINE_HEIGHTS = [1.3, 1.5, 1.65, 1.8, 2.0, 2.2, 2.5];
const PARA_SPACINGS = [0, 4, 8, 12, 20, 32, 48];
const CONTENT_WIDTHS = [520, 600, 680, 760, 860, 960, 1080];
const FONT_WEIGHTS = [
  { val: '300', label: '细' }, { val: '400', label: '常规' }, { val: '600', label: '粗' }, { val: '700', label: '特粗' },
];
const PAPERS = [
  { k: 'white',  l: '白色', bg: '#ffffff', text: '#1c1917' },
  { k: 'cream',  l: '米色', bg: '#faf8f0', text: '#1c1917' },
  { k: 'warm',   l: '暖黄', bg: '#fdf6e3', text: '#1c1917' },
  { k: 'gray',   l: '浅灰', bg: '#f5f5f4', text: '#1c1917' },
  { k: 'dark',   l: '深灰', bg: '#1e1e1e', text: '#e0e0e0' },
  { k: 'navy',   l: '深蓝', bg: '#1a1d2e', text: '#d0d4e8' },
  { k: 'forest', l: '墨绿', bg: '#1a2e1a', text: '#d0e8d0' },
];

const FONTS = {
  calibri: "Calibri, 'Trebuchet MS', sans-serif",
  sitka: "Sitka, 'Palatino Linotype', serif",
  georgia: "Georgia, 'Times New Roman', serif"
};

const state = {
  fontFamily: 'sitka', fontSizeIdx: 3, lineHeightIdx: 3,
  paragraphSpacingIdx: 3, widthIdx: 3,
  fontWeight: '400', textAlign: 'justify', indent: false, paper: 'cream'
};

let originalHTML = null;

// ─── Enter / Exit ───────────────────────────────────────────

export function enterReadingMode() {
  if (document.querySelector('.lectura-reader')) return;
  originalHTML = document.body.innerHTML;
  const content = extractContent();
  document.body.innerHTML = buildHTML(content);
  loadCSS();
  applyAll();
  bindEvents();
  window.__lecturaReadingMode = true;
  setTimeout(async () => {
    try { const app = await import('../app.js'); if (app.reinitContentScript) await app.reinitContentScript(); }
    catch (e) { console.warn('Reader reinit:', e); }
  }, 300);
}

export function exitReadingMode() {
  window.__lecturaReadingMode = false;
  if (originalHTML) { document.body.innerHTML = originalHTML; originalHTML = null; }
  setTimeout(async () => {
    try { const app = await import('../app.js'); if (app.reinitContentScript) await app.reinitContentScript(); }
    catch (e) { console.warn('Exit reinit:', e); }
  }, 300);
}

// ─── Font-size based classification (live page scan) ────────

function classifyByFontSize() {
  const container = document.querySelector('article') || document.querySelector('main') || document.body;
  if (!container) return;

  const sizeMap = new Map();
  const colorSamples = []; // collect body-sized text colors
  const textEls = [];

  container.querySelectorAll('p, div, span, h1, h2, h3, h4, h5, h6, li, td, th, figcaption, cite, small, em, i, b, strong, label, dt, dd, pre, blockquote').forEach(el => {
    const text = el.textContent.trim();
    if (text.length < 3) return;
    const style = window.getComputedStyle(el);
    const fs = Math.round(parseFloat(style.fontSize));
    const color = style.color; // e.g. "rgb(28, 25, 23)"
    if (fs > 0 && fs < 100) {
      sizeMap.set(fs, (sizeMap.get(fs) || 0) + text.length);
      textEls.push({ el, fs, text, color });
    }
  });

  if (textEls.length < 5) return;

  // Find modal font-size → body baseline
  let bodySize = 16, maxWeight = 0;
  for (const [size, weight] of sizeMap) {
    if (weight > maxWeight) { maxWeight = weight; bodySize = size; }
  }

  // Collect lightness values for body-sized text to find "normal" text darkness
  const bodyColors = textEls.filter(t => t.fs === bodySize).map(t => t.color);
  let avgLightness = 50; // default
  if (bodyColors.length > 0) {
    const lightnesses = bodyColors.map(c => {
      const m = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (!m) return 50;
      // Relative luminance (perceived lightness)
      const r = parseInt(m[1]) / 255, g = parseInt(m[2]) / 255, b = parseInt(m[3]) / 255;
      return Math.sqrt(0.299 * r * r + 0.587 * g * g + 0.114 * b * b) * 100;
    });
    avgLightness = lightnesses.reduce((a, b) => a + b, 0) / lightnesses.length;
  }

  function getLightness(colorStr) {
    const m = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!m) return 50;
    const r = parseInt(m[1]) / 255, g = parseInt(m[2]) / 255, b = parseInt(m[3]) / 255;
    return Math.sqrt(0.299 * r * r + 0.587 * g * g + 0.114 * b * b) * 100;
  }

  // Photo credit keyword pattern
  const CREDIT_RE = /courtesy|handout|photo\s*(by|credit|graph)|image\s*(by|credit|via)|getty|reuters|afp\s|ap\sphoto|shutterstock|istock|unsplash|via\s(getty|reuters)/i;
  // Name/Organization format: "Atif Anzar/Lucknow Heritage Walks", "John Smith/The Times"
  const BYLINE_RE = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\s*\/\s*[A-Z]/;
  // Short text ending with a copyright/credit symbol or organization name
  const COPYRIGHT_RE = /©|\(c\)|\b(?:photo|image|picture)\b/i;

  // Classify
  textEls.forEach(({ el, fs, text, color }) => {
    if (el.hasAttribute('data-lectura-role')) return;

    if (fs < bodySize - 1) {
      el.setAttribute('data-lectura-role', 'caption');
    } else if (fs > bodySize + 2) {
      el.setAttribute('data-lectura-role', 'heading');
    } else {
      // Same font-size as body — check color and content
      const lightness = getLightness(color);
      const isFaded = lightness > avgLightness + 12; // significantly lighter than body text
      const isCredit = CREDIT_RE.test(text) && text.length < 200;

      const isByline = BYLINE_RE.test(text) && text.length < 120;
      const isCopyright = COPYRIGHT_RE.test(text) && text.length < 100;

      if (isCredit || isByline || isCopyright || (isFaded && text.length < 200)) {
        el.setAttribute('data-lectura-role', 'caption');
      } else {
        el.setAttribute('data-lectura-role', 'body');
      }
    }
  });
}

// ─── Content Extraction ─────────────────────────────────────

function extractContent() {
  classifyByFontSize();

  const article = document.querySelector('article');
  if (article) return clean(article.cloneNode(true));

  const main = document.querySelector('main');
  if (main) return clean(main.cloneNode(true));

  const body = document.body.cloneNode(true);
  body.querySelectorAll('script, style, nav, footer, header, aside, iframe, [role="navigation"], [role="banner"], .nav, .sidebar, .footer, .header, .ad, .comments, .related').forEach(el => el.remove());

  let bestEl = body, bestScore = 0;
  body.querySelectorAll('div, section, main, article').forEach(el => {
    const s = el.textContent.trim().length + el.querySelectorAll('p').length * 200;
    if (s > bestScore) { bestScore = s; bestEl = el; }
  });
  return clean(bestEl.cloneNode(true));
}

function clean(el) {
  // Step 0: Tag + content-based caption detection (runs on clone, always reliable)
  const CR = /courtesy|handout|photo\s*(by|credit|graph)|image\s*(by|credit|via)|getty|reuters|afp\s|ap\sphoto|shutterstock|istock|unsplash|via\s(getty|reuters)/i;
  const BR = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\s*\/\s*[A-Z]/;
  const CP = /©|\(c\)|\b(?:photo|image|picture)\s*(by|credit)/i;

  el.querySelectorAll('figcaption').forEach(n => n.classList.add('reader-caption'));
  el.querySelectorAll('p, div, span, cite, small').forEach(n => {
    const t = n.textContent.trim();
    if (t.length > 3 && t.length < 200 && (CR.test(t) || BR.test(t) || CP.test(t))) {
      n.classList.add('reader-caption');
    }
  });

  // Step 1: Apply font-size classification from live scan
  el.querySelectorAll('[data-lectura-role]').forEach(n => {
    const r = n.getAttribute('data-lectura-role');
    if (r === 'caption') n.classList.add('reader-caption');
    else if (r === 'heading') n.classList.add('reader-subhead');
    n.removeAttribute('data-lectura-role');
  });

  // Step 2: Remove unwanted
  el.querySelectorAll('script, style, iframe, button, input, select, form, noscript, [aria-hidden="true"]').forEach(n => n.remove());

  // Step 3: Strip styling (keep reader-* classes)
  el.querySelectorAll('*').forEach(n => {
    n.removeAttribute('style');
    n.removeAttribute('bgcolor');
    n.removeAttribute('color');
    n.removeAttribute('align');
    n.removeAttribute('valign');
    n.removeAttribute('width');
    n.removeAttribute('height');
    n.removeAttribute('border');
    n.removeAttribute('cellpadding');
    n.removeAttribute('cellspacing');
    const isC = n.classList.contains('reader-caption');
    const isH = n.classList.contains('reader-subhead');
    n.removeAttribute('class');
    if (isC) n.classList.add('reader-caption');
    if (isH) n.classList.add('reader-subhead');
    if (!n.id) n.removeAttribute('id');
    const keep = ['href', 'src', 'alt', 'title', 'target', 'rel', 'colspan', 'rowspan', 'type'];
    for (const attr of [...n.attributes]) {
      if (!keep.includes(attr.name) && !attr.name.startsWith('data-') && !attr.name.startsWith('aria-'))
        n.removeAttribute(attr.name);
    }
  });

  // Step 4: Unwrap empties
  el.querySelectorAll('div, span, section').forEach(n => {
    if (!n.textContent.trim() && !n.querySelector('img, video, svg, canvas, br, hr')) n.replaceWith(...n.childNodes);
  });

  // Step 5: div→p for leaf text containers
  el.querySelectorAll('div').forEach(div => {
    const t = div.textContent.trim().length;
    const kids = div.querySelectorAll('div, p, h1, h2, h3, h4, h5, h6, ul, ol, table, figure, img').length;
    if (t > 50 && kids === 0 && !div.querySelector('img, video, svg')) {
      const p = document.createElement('p');
      p.innerHTML = div.innerHTML;
      if (div.classList.contains('reader-caption')) p.classList.add('reader-caption');
      if (div.classList.contains('reader-subhead')) p.classList.add('reader-subhead');
      div.replaceWith(p);
    }
  });

  return el.innerHTML;
}

// ─── Build HTML ─────────────────────────────────────────────

function buildHTML(content) {
  return `<div class="lectura-reader" data-paper="${state.paper}">
  <div class="lectura-reader-toolbar">
    <button class="lectura-reader-toolbar-btn" id="btnSettings">
      <svg width="18" height="18" viewBox="0 0 30 30" fill="none" stroke="currentColor" stroke-width="2.5"><text x="3" y="22" font-size="14" font-weight="bold" font-family="serif">A</text><text x="16" y="28" font-size="8" font-weight="bold" font-family="serif">A</text></svg>格式
    </button>
    <div class="lectura-reader-toolbar-spacer"></div>
    <button class="lectura-reader-exit-btn" id="btnExit">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>退出
    </button>
  </div>
  <div class="lectura-reader-settings" id="settingsPopover">${buildSettings()}</div>
  <div class="lectura-reader-content" id="readerContent">${content}</div></div>`;
}

function iconSVG(p) { return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`; }

function buildSettings() {
  const fs = FONT_SIZES[state.fontSizeIdx], lh = LINE_HEIGHTS[state.lineHeightIdx];
  const ps = PARA_SPACINGS[state.paragraphSpacingIdx], cw = CONTENT_WIDTHS[state.widthIdx];
  return `<div class="settings-section">
  <div class="settings-label">${iconSVG('<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>')} 字体</div>
  <div class="settings-row">${['calibri','sitka','georgia'].map(k => `<button class="chip-btn ${state.fontFamily===k?'active':''}" data-act="fontFamily" data-val="${k}">${k==='calibri'?'Calibri':k==='sitka'?'Sitka':'Georgia'}</button>`).join('')}</div>
</div>
<div class="settings-section">
  <div class="settings-label">${iconSVG('<text x="2" y="17" font-size="10" font-weight="bold">A</text><text x="13" y="22" font-size="5" font-weight="bold">A</text>')} 字号 <span class="slider-val">${fs}px</span></div>
  ${buildSlider('fontSizeIdx', FONT_SIZES, state.fontSizeIdx)}
</div>
<div class="settings-section">
  <div class="settings-label">${iconSVG('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>')} 字重</div>
  <div class="settings-row">${FONT_WEIGHTS.map(w => `<button class="chip-btn ${state.fontWeight===w.val?'active':''}" data-act="fontWeight" data-val="${w.val}">${w.label}</button>`).join('')}</div>
</div>
<div class="settings-section settings-divider">
  <div class="settings-label">${iconSVG('<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="4" y1="14" x2="20" y2="14"/><line x1="4" y1="18" x2="16" y2="18"/>')} 行高 <span class="slider-val">${lh.toFixed(2)}</span></div>
  ${buildSlider('lineHeightIdx', LINE_HEIGHTS, state.lineHeightIdx)}
</div>
<div class="settings-section">
  <div class="settings-label">${iconSVG('<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="18" x2="4" y2="18"/><line x1="8" y1="14" x2="20" y2="14"/>')} 段距 <span class="slider-val">${ps}px</span></div>
  ${buildSlider('paraSpacingIdx', PARA_SPACINGS, state.paragraphSpacingIdx)}
</div>
<div class="settings-section">
  <div class="settings-label">${iconSVG('<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="6" y="6" width="12" height="12" rx="1"/>')} 宽度 <span class="slider-val">${cw}px</span></div>
  ${buildSlider('widthIdx', CONTENT_WIDTHS, state.widthIdx)}
</div>
<div class="settings-section settings-divider">
  <div class="settings-label">${iconSVG('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>')} 版式</div>
  <div class="settings-row">
    <button class="chip-btn ${state.indent?'active':''}" data-act="indent">首行缩进</button>
    <button class="chip-btn ${state.textAlign==='justify'?'active':''}" data-act="textAlign">${state.textAlign==='justify'?'两端对齐':'左对齐'}</button>
    <button class="icon-btn" data-act="reset" title="重置" style="margin-left:auto;">${iconSVG('<polyline points="1 4 1 10 7 10"/><path d="M3.5 17.5A9 9 0 1 0 2 12"/>')}</button>
  </div>
</div>
<div class="settings-section">
  <div class="settings-label">${iconSVG('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 3v18"/>')} 纸张</div>
  <div class="settings-row">${PAPERS.map(p => `<button class="paper-swatch ${state.paper===p.k?'active':''}" data-act="paper" data-val="${p.k}" style="background:${p.bg}" title="${p.l}"></button>`).join('')}</div>
</div>`;
}

function buildSlider(act, values, activeIdx) {
  return `<div class="tick-slider">
    <input type="range" class="reader-range" data-act="${act}" min="0" max="${values.length-1}" step="1" value="${activeIdx}">
    <div class="tick-labels">${values.map(v => `<span>${v>=1000?(v/1000).toFixed(1)+'k':v}</span>`).join('')}</div></div>`;
}

function loadCSS() {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('content/reading/reader.css');
  document.head.appendChild(link);
}

// ─── Events ─────────────────────────────────────────────────

function bindEvents() {
  document.getElementById('btnExit').addEventListener('click', exitReadingMode);
  const popover = document.getElementById('settingsPopover');
  document.getElementById('btnSettings').addEventListener('click', (e) => { e.stopPropagation(); popover.classList.toggle('open'); });
  document.addEventListener('click', (e) => { if (!e.target.closest('#settingsPopover') && !e.target.closest('#btnSettings')) popover.classList.remove('open'); });

  popover.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const a = btn.dataset.act;
    if (a === 'fontFamily') state.fontFamily = btn.dataset.val;
    else if (a === 'fontWeight') state.fontWeight = btn.dataset.val;
    else if (a === 'indent') state.indent = !state.indent;
    else if (a === 'textAlign') state.textAlign = state.textAlign==='justify'?'left':'justify';
    else if (a === 'paper') state.paper = btn.dataset.val;
    else if (a === 'reset') Object.assign(state, { fontFamily:'sitka', fontSizeIdx:3, lineHeightIdx:3, paragraphSpacingIdx:3, widthIdx:3, fontWeight:'400', textAlign:'justify', indent:false, paper:'cream' });
    applyAll(); refreshUI();
  });

  popover.addEventListener('input', (e) => {
    const s = e.target.closest('.reader-range'); if (!s) return;
    const idx = parseInt(s.value), a = s.dataset.act;
    if (a === 'fontSizeIdx') state.fontSizeIdx = idx;
    else if (a === 'lineHeightIdx') state.lineHeightIdx = idx;
    else if (a === 'paraSpacingIdx') state.paragraphSpacingIdx = idx;
    else if (a === 'widthIdx') state.widthIdx = idx;
    applyAll();
    const vals = a==='fontSizeIdx'?FONT_SIZES:a==='lineHeightIdx'?LINE_HEIGHTS:a==='paraSpacingIdx'?PARA_SPACINGS:CONTENT_WIDTHS;
    const v = vals[idx], label = a==='lineHeightIdx'?v.toFixed(2):v+'px';
    const sec = s.closest('.settings-section'); if (sec) { const ve = sec.querySelector('.slider-val'); if (ve) ve.textContent = label; }
  });
}

function refreshUI() {
  const p = document.getElementById('settingsPopover'); if (!p) return;
  p.querySelectorAll('[data-act="fontFamily"],[data-act="fontWeight"]').forEach(b => b.classList.toggle('active', b.dataset.val === (b.dataset.act==='fontFamily'?state.fontFamily:state.fontWeight)));
  p.querySelectorAll('[data-act="fontSizeIdx"],[data-act="lineHeightIdx"],[data-act="paraSpacingIdx"],[data-act="widthIdx"]').forEach(s => {
    const a = s.dataset.act;
    s.value = a==='fontSizeIdx'?state.fontSizeIdx:a==='lineHeightIdx'?state.lineHeightIdx:a==='paraSpacingIdx'?state.paragraphSpacingIdx:state.widthIdx;
  });
  p.querySelectorAll('[data-act="indent"]').forEach(b => b.classList.toggle('active', state.indent));
  p.querySelectorAll('[data-act="textAlign"]').forEach(b => { b.classList.toggle('active', state.textAlign==='justify'); b.textContent = state.textAlign==='justify'?'两端对齐':'左对齐'; });
  p.querySelectorAll('.paper-swatch').forEach(s => s.classList.toggle('active', s.dataset.val === state.paper));
  ['fontSizeIdx','lineHeightIdx','paraSpacingIdx','widthIdx'].forEach(a => {
    const vals = a==='fontSizeIdx'?FONT_SIZES:a==='lineHeightIdx'?LINE_HEIGHTS:a==='paraSpacingIdx'?PARA_SPACINGS:CONTENT_WIDTHS;
    const v = vals[a==='fontSizeIdx'?state.fontSizeIdx:a==='lineHeightIdx'?state.lineHeightIdx:a==='paraSpacingIdx'?state.paragraphSpacingIdx:state.widthIdx];
    const label = a==='lineHeightIdx'?v.toFixed(2):v+'px';
    const s = p.querySelector(`[data-act="${a}"]`); if (!s) return;
    const sec = s.closest('.settings-section'); if (sec) { const ve = sec.querySelector('.slider-val'); if (ve) ve.textContent = label; }
  });
  document.querySelector('.lectura-reader')?.setAttribute('data-paper', state.paper);
}

// ─── Apply ──────────────────────────────────────────────────

function applyAll() {
  const content = document.getElementById('readerContent'), reader = document.querySelector('.lectura-reader');
  if (!content || !reader) return;

  const font = FONTS[state.fontFamily] || FONTS.sitka;
  const fs = FONT_SIZES[state.fontSizeIdx], lh = LINE_HEIGHTS[state.lineHeightIdx];
  const ps = PARA_SPACINGS[state.paragraphSpacingIdx], cw = CONTENT_WIDTHS[state.widthIdx];
  const paper = PAPERS.find(p => p.k === state.paper) || PAPERS[0];
  const px = Math.max(16, (window.innerWidth - cw) / 2);

  reader.setAttribute('data-paper', state.paper);
  reader.style.background = paper.bg;

  content.style.cssText = `font-family:${font};font-size:${fs}px;font-weight:${state.fontWeight};line-height:${lh};max-width:${cw}px;padding-left:${px}px;padding-right:${px}px;color:${paper.text};`;

  const indentVal = state.indent ? '2em' : '0';
  content.querySelectorAll('p, div, li, blockquote').forEach(el => {
    el.style.marginBottom = ps + 'px';
    el.style.textAlign = state.textAlign;
    el.style.textIndent = indentVal;
  });
  // Final caption detection: elements after images that have credit-like content
  const CR = /courtesy|handout|photo\s*(by|credit|graph)|image\s*(by|credit|via)|getty|reuters|afp\b|ap\b.*photo|shutterstock|istock|unsplash/i;
  const BR = /^[A-Z][a-z]+(?:\s+\S+){1,4}\s*\/\s*[A-Z]/;
  content.querySelectorAll('p, div, span').forEach(el => {
    if (el.classList.contains('reader-caption') || el.closest('.reader-caption')) return;
    const t = el.textContent.trim();
    if (!t || t.length < 3 || t.length > 250) return;
    // Check if preceded by an image (any ancestor's previous sibling has img)
    let nearImg = false;
    let p = el;
    for (let i = 0; i < 3 && p; i++) {
      let s = p.previousElementSibling;
      for (let j = 0; j < 3 && s; j++) {
        if (s.tagName === 'IMG' || s.tagName === 'PICTURE' || s.querySelector('img')) { nearImg = true; break; }
        s = s.previousElementSibling;
      }
      if (nearImg) break;
      p = p.parentElement;
    }
    if (nearImg && (CR.test(t) || BR.test(t) || t.length < 80)) {
      el.classList.add('reader-caption');
    }
  });

  content.querySelectorAll('*').forEach(el => {
    const inCaption = el.closest('.reader-caption');
    const inSubhead = el.closest('.reader-subhead');

    if (el.classList.contains('reader-caption') || inCaption) {
      el.style.setProperty('color', '#78716c', 'important');
      el.style.setProperty('font-size', (fs * 0.78) + 'px', 'important');
      el.style.setProperty('font-style', 'italic', 'important');
      el.style.setProperty('line-height', '1.5', 'important');
      el.style.fontFamily = font;
      el.style.fontWeight = '400';
    } else if (el.classList.contains('reader-subhead') || inSubhead) {
      el.style.color = paper.text;
      el.style.fontWeight = '700';
    } else {
      el.style.color = paper.text;
      el.style.fontFamily = font;
      el.style.fontSize = fs + 'px';
      el.style.fontWeight = state.fontWeight;
      el.style.lineHeight = lh;
    }
  });
  const headingScales = { H1:2, H2:1.6, H3:1.3, H4:1.1, H5:1, H6:0.95 };
  content.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => { h.style.fontSize = (fs * (headingScales[h.tagName]||1)) + 'px'; });
  content.classList.toggle('indent', state.indent);
  content.classList.toggle('justify', state.textAlign === 'justify');
}
