/**
 * LECTURA Extension — Content Script Bootstrap
 *
 * Minimal non-module loader that dynamically imports the main app.
 * This avoids ES module compatibility issues in content scripts.
 */
(async () => {
  try {
    const appUrl = chrome.runtime.getURL('content/app.js');
    const module = await import(appUrl);
    module.default();
  } catch (err) {
    console.error('❌ LECTURA 加载失败:', err.message, err.stack);
  }
})();
