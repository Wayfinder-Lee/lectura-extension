/**
 * LECTURA Extension — Settings Page
 */
import { MSG, DEFAULT_PROMPTS } from '../shared/constants.js';

let settings = {};

const READING_SITES = [
  { name: 'Reuters', url: 'https://www.reuters.com', desc: '全球通讯社，中立快速' },
  { name: 'BBC News', url: 'https://www.bbc.com/news', desc: '英式英语，全球覆盖' },
  { name: 'The Guardian', url: 'https://www.theguardian.com', desc: '深度调查报道' },
  { name: 'NPR', url: 'https://www.npr.org', desc: '美国公共广播，免费' },
  { name: 'USA Today', url: 'https://www.usatoday.com', desc: '简明美式英语' },
  { name: 'Psychology Today', url: 'https://www.psychologytoday.com', desc: '心理学通俗文章' },
  { name: 'Aeon', url: 'https://aeon.co', desc: '哲学/科学/心理深度长文' },
  { name: 'The Conversation', url: 'https://www.theconversation.com', desc: '学术作者通俗解读' },
  { name: 'Smithsonian Magazine', url: 'https://www.smithsonianmag.com', desc: '历史/科学/文化' },
  { name: 'Reader\'s Digest', url: 'https://www.rd.com', desc: '短文趣事，中阶友好' },
  { name: 'BBC Learning English', url: 'https://www.bbc.co.uk/learningenglish', desc: '英语学习专区' },
  { name: 'VOA Learning English', url: 'https://learningenglish.voanews.com', desc: '慢速英语+音频' },
  { name: 'Breaking News English', url: 'https://breakingnewsenglish.com', desc: '6级难度可调' },
  { name: 'Arts & Letters Daily', url: 'https://www.aldaily.com', desc: '精选全网好文链接' },
  { name: 'Project Gutenberg', url: 'https://www.gutenberg.org', desc: '7万+免费电子书' }
];

async function init() {
  await loadSettings();
  renderReadingList();
  loadDictStats(); // fire-and-forget with retry
  populateForm();
  setupEventListeners();
}

async function loadSettings() {
  try {
    const res = await chrome.runtime.sendMessage({ type: MSG.GET_SETTINGS });
    if (res.success) settings = { ...res.settings };
  } catch (e) { console.error('loadSettings:', e); }
}

async function loadDictStats() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_DICT_STATS' });
    if (res.success?.stats) {
      document.getElementById('dictStatus').textContent = res.stats.initialized ? '✅ 已就绪' : '⚠ 未初始化';
      document.getElementById('dictWordCount').textContent = res.stats.wordCount
        ? res.stats.wordCount.toLocaleString() + ' 词' : '—';
    } else {
      document.getElementById('dictStatus').textContent = '⚠ 状态未知';
    }
  } catch (e) {
    document.getElementById('dictStatus').textContent = '❌ 查询失败';
    console.error('loadDictStats:', e);
  }
}

function renderReadingList() {
  const container = document.getElementById('readingList');
  if (!container) return;
  container.innerHTML = READING_SITES.map(s => `
    <div class="reading-item">
      <a href="${s.url}" target="_blank" rel="noopener">${s.name}</a>
      <div class="reading-desc">${s.desc}</div>
    </div>
  `).join('');
}

function populateForm() {
  const radio = document.querySelector(`input[name="phoneticType"][value="${settings.phoneticType || 'uk'}"]`);
  if (radio) radio.checked = true;
  document.getElementById('fontSize').value = settings.fontSize || 'medium';

  document.getElementById('autoLLM').checked = settings.autoLLM !== false;
  document.getElementById('llmProvider').value = settings.llmProvider || 'deepseek';
  document.getElementById('llmApiKey').value = settings.llmApiKey || '';
  document.getElementById('llmEndpoint').value = settings.llmEndpoint || '';
  document.getElementById('llmModel').value = settings.llmModel || 'gpt-4o-mini';
  toggleCustomEndpoint();

  const prompts = settings.llmPrompts || DEFAULT_PROMPTS;
  document.getElementById('promptWordLookup').value = JSON.stringify(prompts.wordLookup, null, 2);
  document.getElementById('promptMoreExamples').value = JSON.stringify(prompts.moreExamples, null, 2);
  document.getElementById('promptSentence').value = JSON.stringify(prompts.sentenceTranslate, null, 2);
}

function setupEventListeners() {
  document.querySelectorAll('input[name="phoneticType"]').forEach(r => r.addEventListener('change', saveAll));
  document.getElementById('fontSize').addEventListener('change', saveAll);
  document.getElementById('autoLLM').addEventListener('change', saveAll);
  document.getElementById('llmProvider').addEventListener('change', () => { toggleCustomEndpoint(); saveAll(); });
  document.getElementById('llmApiKey').addEventListener('change', saveAll);
  document.getElementById('llmEndpoint').addEventListener('change', saveAll);
  document.getElementById('llmModel').addEventListener('change', saveAll);
  document.getElementById('promptWordLookup').addEventListener('change', saveAll);
  document.getElementById('promptMoreExamples').addEventListener('change', saveAll);
  document.getElementById('promptSentence').addEventListener('change', saveAll);
  document.getElementById('btnResetWordPrompt').addEventListener('click', () => { document.getElementById('promptWordLookup').value = JSON.stringify(DEFAULT_PROMPTS.wordLookup, null, 2); saveAll(); });
  document.getElementById('btnResetExamplesPrompt').addEventListener('click', () => { document.getElementById('promptMoreExamples').value = JSON.stringify(DEFAULT_PROMPTS.moreExamples, null, 2); saveAll(); });
  document.getElementById('btnResetSentencePrompt').addEventListener('click', () => { document.getElementById('promptSentence').value = JSON.stringify(DEFAULT_PROMPTS.sentenceTranslate, null, 2); saveAll(); });

  document.getElementById('btnReloadDict').addEventListener('click', async () => {
    const btn = document.getElementById('btnReloadDict'), result = document.getElementById('reloadResult');
    btn.disabled = true; btn.textContent = '加载中...'; result.textContent = '';
    const res = await chrome.runtime.sendMessage({ type: 'RESET_DICT' });
    if (res.success) { result.textContent = '已重新加载！'; result.className = 'test-result success'; await loadDictStats(); }
    else { result.textContent = '失败: ' + (res.error || ''); result.className = 'test-result error'; }
    btn.disabled = false; btn.textContent = '重新加载词典';
  });

  document.getElementById('btnExportData').addEventListener('click', async () => {
    const res = await chrome.runtime.sendMessage({ type: MSG.EXPORT_DATA });
    if (res.success?.data) {
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `lectura-export-${formatDate()}.json`; document.body.appendChild(a); a.click(); a.remove();
    }
  });
  document.getElementById('btnImportData').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', handleImport);
  document.getElementById('btnClearData').addEventListener('click', async () => {
    if (!confirm('确定清除所有数据？不可撤销！')) return;
    if (!confirm('再次确认')) return;
    await chrome.storage.local.clear();
    await chrome.runtime.sendMessage({ type: MSG.SAVE_SETTINGS, payload: getDefaultSettings() });
    settings = getDefaultSettings();
    populateForm();
    alert('已清除。');
  });
}

function toggleCustomEndpoint() {
  const provider = document.getElementById('llmProvider').value;
  document.getElementById('customEndpointGroup').style.display = provider === 'custom' ? '' : 'none';

  // Auto-fill endpoint and model for known providers
  const presets = {
    deepseek: { endpoint: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
    openai: { endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    anthropic: { endpoint: '', model: 'claude-haiku-4-5-20251001' }
  };
  const preset = presets[provider];
  if (preset && !document.getElementById('llmEndpoint').value.startsWith('http')) {
    document.getElementById('llmEndpoint').value = preset.endpoint || '';
  }
  if (preset) {
    document.getElementById('llmModel').value = preset.model;
  }
}

async function saveAll() {
  settings.phoneticType = document.querySelector('input[name="phoneticType"]:checked')?.value || 'uk';
  settings.fontSize = document.getElementById('fontSize').value;
  settings.autoLLM = document.getElementById('autoLLM').checked;
  settings.llmProvider = document.getElementById('llmProvider').value;
  settings.llmApiKey = document.getElementById('llmApiKey').value.trim();
  settings.llmEndpoint = document.getElementById('llmEndpoint').value.trim();
  settings.llmModel = document.getElementById('llmModel').value.trim();
  try {
    settings.llmPrompts = {
      wordLookup: JSON.parse(document.getElementById('promptWordLookup').value),
      moreExamples: JSON.parse(document.getElementById('promptMoreExamples').value),
      sentenceTranslate: JSON.parse(document.getElementById('promptSentence').value)
    };
  } catch (e) { settings.llmPrompts = settings.llmPrompts || DEFAULT_PROMPTS; }
  await chrome.runtime.sendMessage({ type: MSG.SAVE_SETTINGS, payload: settings });
}

async function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.words) throw new Error('无效格式');
    const res = await chrome.runtime.sendMessage({ type: MSG.IMPORT_DATA, payload: data });
    if (res.success) alert(`导入 ${res.count} 项，共 ${res.total} 项`);
    else alert('失败: ' + res.error);
  } catch (err) { alert('导入失败: ' + err.message); }
  e.target.value = '';
}

function getDefaultSettings() {
  return { phoneticType: 'uk', fontSize: 'medium', cardSize: 'medium', hideDefinitions: false, autoLLM: true, llmProvider: 'deepseek', llmApiKey: '', llmEndpoint: 'https://api.deepseek.com', llmModel: 'deepseek-v4-flash' };
}
function formatDate() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
init();
