/**
 * LECTURA Extension — Side Panel Bootstrap
 */
(async () => {
  try {
    const appUrl = chrome.runtime.getURL('sidepanel/sidepanel-app.js');
    await import(appUrl);
    console.log('✅ LECTURA 侧边栏就绪');
  } catch (err) {
    console.error('❌ LECTURA 侧边栏加载失败:', err.message, err.stack);
  }
})();
