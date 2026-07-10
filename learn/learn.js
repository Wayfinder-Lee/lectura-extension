/**
 * LECTURA Learning Engine v2
 */

let items = [], queue = [], currentIdx = -1, currentFlipped = false;
let spellMode = false, spellSubmitted = false;
let learnMode = 'random', cardCount = 15, manualSelected = new Set();
let view = 'learn', stats = { correct: 0, wrong: 0, partial: 0 };
let spaceHandler = null;

async function init() {
  await loadItems();
  document.querySelectorAll('.topbar-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.topbar-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      showView(tab.dataset.view);
    });
  });
  document.getElementById('btnClose').addEventListener('click', () => {
    if (queue.length > 0) returnToMenu(); else window.close();
  });
  showView('learn');
}

async function loadItems() {
  const res = await chrome.runtime.sendMessage({ type: 'GET_ALL_ITEMS' });
  items = (res.success ? res.items : []).filter(i => i.type === 'word');
  items.forEach(item => {
    if (!item.level && item.level !== 0) item.level = 0;
    if (!item.todayDate) item.todayDate = '';
    if (!item.todayProgress && item.todayProgress !== 0) item.todayProgress = 0;
  });
}

// ─── View Switching ────────────────────────────────────────

function showView(v) {
  view = v;
  document.getElementById('viewLearn').style.display = v === 'learn' ? '' : 'none';
  document.getElementById('viewAchieve').style.display = v === 'achieve' ? '' : 'none';
  document.getElementById('topbarTabs').style.display = '';
  if (v === 'learn') renderModeSelect();
  if (v === 'achieve') renderAchievement();
}

function returnToMenu() {
  queue = [];
  currentIdx = -1;
  currentFlipped = false;
  spellSubmitted = false;
  document.getElementById('cardStage').style.display = 'none';
  document.getElementById('learnNav').style.display = 'none';
  document.getElementById('progressArea').style.display = 'none';
  document.getElementById('topbarTabs').style.display = '';
  document.getElementById('btnClose').title = '关闭';
  document.getElementById('modeSelect').style.display = 'flex';
  document.getElementById('modeOptions').innerHTML = '';
  learnMode = 'random'; // reset to avoid auto-start
  renderModeSelect();
}

// ─── Mode Selection ────────────────────────────────────────

function renderModeSelect() {
  document.getElementById('modeSelect').style.display = 'flex';
  document.getElementById('modeOptions').innerHTML = '';
  const el = document.getElementById('modeSelect');
  el.innerHTML = `
    <div class="mode-card ${learnMode==='random'?'selected':''}" data-mode="random">
      <div class="mode-icon">🔀</div><div class="mode-title">随机乱序</div><div class="mode-desc">从未掌握词中随机推送</div>
    </div>
    <div class="mode-card ${learnMode==='manual'?'selected':''}" data-mode="manual">
      <div class="mode-icon">📋</div><div class="mode-title">手动选择</div><div class="mode-desc">从列表中选择要学习的词</div>
    </div>
    <div class="mode-card ${learnMode==='today'?'selected':''}" data-mode="today">
      <div class="mode-icon">🆕</div><div class="mode-title">今日新词</div><div class="mode-desc">只学习今天收藏的词</div>
    </div>`;
  el.querySelectorAll('.mode-card').forEach(card => {
    card.addEventListener('click', () => { learnMode = card.dataset.mode; renderModeSelect(); });
  });
  if (learnMode === 'random') renderRandomOptions();
  else if (learnMode === 'manual') renderManualTable();
  else if (learnMode === 'today') renderTodayTable();
}

function renderRandomOptions() {
  const el = document.getElementById('modeOptions');
  const available = items.filter(i => i.level < 10).length;
  el.innerHTML = `
    <div style="max-width:400px;margin:0 auto;padding:8px 20px;">
      <div class="count-slider"><span>推送数量</span><input type="range" min="5" max="30" value="${cardCount}" id="countSlider"><span id="countLabel">${cardCount}</span></div>
      <p style="font-size:12px;color:#888;margin-top:4px;">可用词汇：${available} 张</p>
      <label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:13px;cursor:pointer;"><input type="checkbox" id="chkSpell" style="accent-color:#6366f1;"> 拼写模式（看释义输入单词）</label>
      <button class="btn-start" id="btnStartRandom">开始学习</button></div>`;
  document.getElementById('countSlider').addEventListener('input', e => { cardCount = parseInt(e.target.value); document.getElementById('countLabel').textContent = cardCount; });
  document.getElementById('btnStartRandom').addEventListener('click', () => {
    spellMode = document.getElementById('chkSpell').checked;
    const pool = items.filter(i => i.level < 10);
    queue = shuffle(pool).slice(0, cardCount);
    if (queue.length === 0) { alert('没有可学习的词汇'); return; }
    startLearning(queue);
  });
}

// ─── Manual Table ──────────────────────────────────────────

function renderManualTable() {
  const el = document.getElementById('modeOptions');
  const sorted = [...items].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  el.innerHTML = `
    <div class="manual-table-wrap">
      <input class="tbl-search" id="tblSearch" placeholder="搜索单词...">
      <div class="tbl-count" id="tblCount">共 ${sorted.length} 张</div>
      <table><thead><tr>
        <th></th><th data-sort="text">单词</th><th data-sort="createdAt">加入时间</th><th data-sort="level">掌握等级</th><th data-sort="examType">考试类别</th>
      </tr></thead><tbody id="tblBody"></tbody></table>
      <label style="display:flex;align-items:center;gap:6px;margin-top:12px;font-size:13px;cursor:pointer;"><input type="checkbox" id="chkSpell2" style="accent-color:#6366f1;"> 拼写模式</label>
      <button class="btn-start" id="btnStartManual" disabled>开始学习（已选 0 张）</button></div>`;
  let sortKey='createdAt',sortDir=-1,searchText='';
  function refresh() {
    let list=[...sorted];
    if(searchText) list=list.filter(i=>i.text.toLowerCase().includes(searchText.toLowerCase()));
    list.sort((a,b)=>{const va=a[sortKey]||'',vb=b[sortKey]||'';return typeof va==='number'?(va-vb)*sortDir:String(va).localeCompare(String(vb))*sortDir;});
    document.getElementById('tblCount').textContent=`共 ${list.length} 张，已选 ${manualSelected.size} 张`;
    document.getElementById('tblBody').innerHTML=list.map(i=>`<tr class="${manualSelected.has(i.id)?'selected':''}" data-id="${i.id}"><td><input type="checkbox" class="row-checkbox" ${manualSelected.has(i.id)?'checked':''}></td><td>${esc(i.text)}</td><td>${fmtDate(i.createdAt)}</td><td>Lv.${i.level>=10?(i.level>10?'10RE':'10M'):i.level}</td><td>${esc(i.examType||'—')}</td></tr>`).join('');
    document.querySelectorAll('#tblBody tr').forEach(tr=>{tr.addEventListener('click',e=>{if(e.target.tagName==='INPUT')return;const id=tr.dataset.id;manualSelected.has(id)?manualSelected.delete(id):manualSelected.add(id);refresh();});});
    document.querySelectorAll('.row-checkbox').forEach(cb=>{cb.addEventListener('change',e=>{e.stopPropagation();const id=cb.closest('tr').dataset.id;cb.checked?manualSelected.add(id):manualSelected.delete(id);refresh();});});
    const btn=document.getElementById('btnStartManual');if(btn){btn.disabled=manualSelected.size===0;btn.textContent=`开始学习（已选 ${manualSelected.size} 张）`;}
  }
  document.getElementById('tblSearch').addEventListener('input',e=>{searchText=e.target.value;refresh();});
  document.querySelectorAll('th[data-sort]').forEach(th=>{th.addEventListener('click',()=>{const k=th.dataset.sort;sortKey===k?sortDir*=-1:(sortKey=k,sortDir=-1);refresh();});});
  document.getElementById('btnStartManual').addEventListener('click',()=>{spellMode=document.getElementById('chkSpell2').checked;const sel=items.filter(i=>manualSelected.has(i.id));if(sel.length===0)return;queue=shuffle(sel);startLearning(queue);});
  refresh();
}

function renderTodayTable() {
  const today = new Date().toDateString();
  const todayItems = items.filter(i => new Date(i.createdAt).toDateString() === today);
  const el = document.getElementById('modeOptions');
  if (todayItems.length === 0) {
    el.innerHTML = `<div style="text-align:center;padding:40px;color:#888;">今天还没有收藏新词。<br>去浏览网页，选中单词收藏后再来学习吧！</div>`;
    return;
  }
  el.innerHTML = `
    <div class="manual-table-wrap">
      <p style="font-size:13px;color:#888;margin-bottom:8px;">今日收藏：${todayItems.length} 个新词</p>
      <table><thead><tr>
        <th></th><th>单词</th><th>加入时间</th><th>掌握等级</th><th>考试类别</th>
      </tr></thead><tbody>
        ${todayItems.map(i => `<tr data-id="${i.id}"><td><input type="checkbox" class="row-checkbox" checked></td><td>${esc(i.text)}</td><td>${fmtDate(i.createdAt)}</td><td>Lv.${i.level>=10?(i.level>10?'10RE':'10M'):i.level}</td><td>${esc(i.examType||'—')}</td></tr>`).join('')}
      </tbody></table>
      <label style="display:flex;align-items:center;gap:6px;margin-top:12px;font-size:13px;cursor:pointer;"><input type="checkbox" id="chkSpell3" style="accent-color:#6366f1;"> 拼写模式</label>
      <button class="btn-start" id="btnStartToday">开始学习（${todayItems.length} 张）</button>
    </div>`;
  document.querySelectorAll('#modeOptions .row-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const count = document.querySelectorAll('#modeOptions .row-checkbox:checked').length;
      const btn = document.getElementById('btnStartToday');
      if (btn) { btn.disabled = count === 0; btn.textContent = `开始学习（${count} 张）`; }
    });
  });
  document.getElementById('btnStartToday').addEventListener('click', () => {
    spellMode = document.getElementById('chkSpell3')?.checked || false;
    const checked = [...document.querySelectorAll('#modeOptions .row-checkbox:checked')].map(cb => cb.closest('tr').dataset.id);
    const sel = todayItems.filter(i => checked.includes(i.id));
    if (sel.length === 0) return;
    queue = shuffle(sel); startLearning(queue);
  });
}

function filterToday() {
  const today = new Date().toDateString();
  return items.filter(i => new Date(i.createdAt).toDateString() === today);
}

// ─── Learning Loop ─────────────────────────────────────────

function startLearning(q) {
  queue = q; currentIdx = -1; spellSubmitted = false;
  stats = { correct: 0, wrong: 0, partial: 0 };
  document.getElementById('modeSelect').style.display = 'none';
  document.getElementById('modeOptions').innerHTML = '';
  document.getElementById('cardStage').style.display = '';
  document.getElementById('learnNav').style.display = '';
  document.getElementById('progressArea').style.display = '';
  document.getElementById('topbarTabs').style.display = 'none';
  document.getElementById('btnClose').title = '返回主界面';
  nextCard();
}

function nextCard() {
  currentIdx++; spellSubmitted = false; currentFlipped = false;
  if (currentIdx >= queue.length) { showComplete(); return; }
  currentFlipped = false;
  const item = queue[currentIdx];
  const stage = document.getElementById('cardStage');

  stage.innerHTML = `
    <div class="card-flip" id="cardFlip">
      <div class="card-inner" id="cardInner">
        <div class="card-front">
          <div class="card-word">${spellMode ? esc(item.definitions?.[0] || item.text) : esc(item.text)}</div>
          <div class="card-hint">${spellMode ? '输入正确拼写，Enter 提交' : '点击或按 Space 翻转'}</div>
          ${spellMode ? `<input class="spell-input" id="spellInput" placeholder="输入单词..." autofocus autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">` : ''}
        </div>
        <div class="card-back">
          <div class="card-word">${esc(item.text)}</div>
          <div class="card-phonetic">/${esc(item.phonetic || '')}/</div>
          <div class="card-defs">${(item.definitions||[]).map(d=>esc(d)).join('<br>')}</div>
          <div class="card-level">掌握等级 <span class="lv">Lv.${item.level>=10?(item.level>10?'10RE':'10M'):item.level}</span></div>
          ${item.sourceSentence?`<div class="card-example">"${esc(item.sourceSentence.slice(0,120))}"</div>`:''}
        </div>
      </div>
    </div>
    <div class="spell-feedback" id="spellFeedback" style="display:none"></div>
    <div class="card-actions" id="cardActions" style="display:none">
      <button class="btn-action dunno" id="btnDunno">不认识</button>
      <button class="btn-action know" id="btnKnow">认识 (+1)</button>
    </div>`;

  updateProgress();

  const flip = document.getElementById('cardFlip');
  const inner = document.getElementById('cardInner');

  if (spellMode) {
    const input = document.getElementById('spellInput');
    // Prevent space from flipping card during spelling
    input.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Spacebar') e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        if (spellSubmitted) { nextCard(); return; }
        submitSpelling(item, input.value.trim());
      }
    });
    // Prevent document-level space from triggering
    input.addEventListener('keyup', (e) => {
      if (e.key === ' ' || e.key === 'Spacebar') e.stopPropagation();
    });
    flip.addEventListener('click', (e) => {
      if (e.target === input) return;
    });
    input.focus();
  } else {
    flip.addEventListener('click', () => doFlip(inner));
    document.removeEventListener('keydown', spaceHandler);
    document.addEventListener('keydown', spaceHandler = (e) => {
      if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); doFlip(inner); }
    });
  }

  document.getElementById('btnKnow')?.addEventListener('click', () => rateCard(item, 'know'));
  document.getElementById('btnDunno')?.addEventListener('click', () => rateCard(item, 'dunno'));

  // Touch prev/next
  document.getElementById('btnPrev').style.visibility = currentIdx > 0 ? 'visible' : 'hidden';
  document.getElementById('btnNext').style.display = 'none'; // hide next during active card

  // Keyboard shortcuts (no arrow keys — those are for touch nav buttons)
  const keyHandler = (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === '1') document.getElementById('btnDunno')?.click();
    if (e.key === '2') document.getElementById('btnKnow')?.click();
    if (e.key === 'Escape') { e.preventDefault(); returnToMenu(); }
  };
  document.addEventListener('keydown', keyHandler, { once: false });
}

function doFlip(inner) {
  if (currentFlipped || spellSubmitted) return;
  currentFlipped = true;
  inner.classList.add('flipped');
  const actions = document.getElementById('cardActions');
  if (actions) actions.style.display = 'flex';
}

function submitSpelling(item, input) {
  if (!input || spellSubmitted) return;
  spellSubmitted = true;
  const fb = document.getElementById('spellFeedback');
  const correct = item.text.trim().toLowerCase();
  const user = input.toLowerCase();
  fb.style.display = 'block';
  document.getElementById('cardInner').classList.add('flipped');
  document.getElementById('cardActions').style.display = 'none';
  document.getElementById('spellInput').disabled = true;

  if (user === correct) {
    document.getElementById('spellInput').classList.add('correct');
    fb.innerHTML = '<span style="color:#22c55e;font-size:16px;">✅ 完美！拼写正确</span>';
    rateCard(item, 'spell-correct');
  } else if (levenshtein(user, correct) <= 1) {
    document.getElementById('spellInput').classList.add('partial');
    const diff = highlightDiff(user, correct);
    fb.innerHTML = `<span style="color:#f59e0b;">⚠️ 接近正确 (+1)</span><br>你的: ${diff.user}<br>正确: ${diff.correct}`;
    rateCard(item, 'spell-partial');
  } else {
    document.getElementById('spellInput').classList.add('wrong');
    fb.innerHTML = `<span style="color:#ef4444;">❌ 拼写错误</span><br>正确拼写: <b>${esc(item.text)}</b>`;
    rateCard(item, 'dunno');
  }

  // Allow Space/Enter to go to next
  const nextHandler = (e) => {
    if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
      e.preventDefault();
      document.removeEventListener('keydown', nextHandler);
      nextCard();
    }
  };
  setTimeout(() => document.addEventListener('keydown', nextHandler), 200);
  document.getElementById('cardFlip').addEventListener('click', () => nextCard());
}

async function rateCard(item, result) {
  const today = new Date().toDateString();
  const progressToday = (item.todayDate === today) ? (item.todayProgress || 0) : 0;
  let delta = 0;
  if (result === 'know' || result === 'spell-partial') delta = 1;
  else if (result === 'spell-correct') delta = 2;
  if (delta > 0 && progressToday >= 2) delta = 0;
  const newProgress = delta > 0 ? Math.min(2, progressToday + delta) : progressToday;
  let newLevel = item.level || 0;
  if (delta > 0 && item.level >= 10 && item.level < 10.5) newLevel = 10;
  else if (result === 'dunno' && item.level >= 10) newLevel = 10.5;
  else if (delta > 0 && newLevel < 10) newLevel = Math.min(10, newLevel + delta);
  const mastered = newLevel >= 10 && newLevel < 10.5;

  await chrome.runtime.sendMessage({ type: 'UPDATE_LEARNING', payload: { wordId: item.id, level: newLevel, todayProgress: newProgress, todayDate: today, mastered, lastStudyDate: Date.now() } });
  item.level = newLevel; item.todayProgress = newProgress; item.todayDate = today;
  if (result !== 'dunno') stats.correct++; else stats.wrong++;
  if (result === 'spell-partial') stats.partial++;

  if (!spellMode) setTimeout(() => nextCard(), 500);
}

// ─── Progress ──────────────────────────────────────────────

function updateProgress() {
  const done = currentIdx + 1, total = queue.length;
  document.getElementById('progressArea').innerHTML = `<div class="progress-bar"><div class="fill" style="width:${total>0?done/total*100:0}%"></div></div><div class="progress-text">${done} / ${total}</div>`;
}

function showComplete() {
  document.getElementById('cardStage').innerHTML = `
    <div class="complete-card"><div class="complete-icon">🎉</div><div class="complete-title">本轮完成！</div>
      <div class="complete-stats">正确 ${stats.correct} · 错误 ${stats.wrong} · 半对 ${stats.partial}<br>共 ${queue.length} 张卡片</div>
      <button class="btn-start" style="margin-top:20px;" id="btnBack">返回选择</button></div>`;
  queue = [];
  document.getElementById('learnNav').style.display = 'none';
  document.getElementById('progressArea').style.display = 'none';
  document.getElementById('topbarTabs').style.display = '';
  document.getElementById('btnClose').title = '关闭';
  document.getElementById('btnBack').addEventListener('click', () => {
    document.getElementById('cardStage').style.display = 'none';
    returnToMenu();
  });
}

// ─── Achievement (flat, no collapse, sidepanel-style cards) ─

function renderAchievement() {
  const el = document.getElementById('achieveContent');
  const grouped = {};
  for (let i = 0; i <= 10; i++) grouped[i] = [];
  grouped[10.5] = [];
  items.forEach(item => {
    const lv = item.level || 0;
    if (lv >= 10 && lv < 10.5) grouped[10].push(item);
    else if (lv >= 10.5) grouped[10.5].push(item);
    else grouped[Math.floor(lv)].push(item);
  });

  const colors = ['#e0e0e0','#c084fc','#a78bfa','#818cf8','#60a5fa','#38bdf8','#22d3ee','#34d399','#a3e635','#fbbf24','#22c55e'];

  let html = `
    <div class="achieve-topbar">
      <h2 class="achieve-title">词汇掌握</h2>
      <button class="achieve-eye-btn" id="achieveEye" title="隐藏/显示释义">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      </button>
    </div>
    <div class="achieve-grid" id="achieveGrid">`;

  for (let lv = 10; lv >= 0; lv--) {
    const cards = grouped[lv] || [];
    const label = lv === 10 ? 'MAX' : lv < 10 ? `0${lv}` : '';
    html += `
    <div class="achieve-lv-section">
      <div class="achieve-lv-header">
        <span class="achieve-lv-dot" style="background:${colors[lv]}"></span>
        <span class="achieve-lv-label">Lv.${label}</span>
        <span class="achieve-lv-count">${cards.length} 词</span>
      </div>`;

    if (cards.length > 0) {
      html += `<div class="achieve-lv-cards">`;
      cards.forEach(c => {
        html += `<div class="achieve-card">
          <div class="achieve-card-word">${esc(c.text)}</div>
          <div class="achieve-card-meta">
            ${c.pos?`<span class="achieve-card-pos">${esc(c.pos)}</span>`:''}
            ${c.phonetic?`<span class="achieve-card-phonetic">/${esc(c.phonetic)}/</span>`:''}
            ${c.examType?`<span class="achieve-card-exam">${esc(c.examType)}</span>`:''}
          </div>
          <div class="achieve-card-defs">${(c.definitions||[]).slice(0,3).map(d=>esc(d)).join('; ')}</div>
        </div>`;
      });
      html += `</div>`;
    }
    html += `</div>`;
  }

  // Lv.10RE
  if (grouped[10.5].length > 0) {
    html += `
    <div class="achieve-lv-section">
      <div class="achieve-lv-header">
        <span class="achieve-lv-dot" style="background:#ef4444"></span>
        <span class="achieve-lv-label">Lv.10RE</span>
        <span class="achieve-lv-count">${grouped[10.5].length} 词</span>
      </div>
      <div class="achieve-lv-cards">`;
    grouped[10.5].forEach(c => {
      html += `<div class="achieve-card"><div class="achieve-card-word">${esc(c.text)}</div><div class="achieve-card-defs">${(c.definitions||[]).slice(0,3).map(d=>esc(d)).join('; ')}</div></div>`;
    });
    html += `</div></div>`;
  }

  html += '</div>';
  el.innerHTML = html;

  // Single toggle for all definitions
  let defsVisible = true;
  document.getElementById('achieveEye').addEventListener('click', () => {
    defsVisible = !defsVisible;
    el.querySelectorAll('.achieve-card-defs').forEach(d => d.classList.toggle('hidden', !defsVisible));
  });
}

// ─── Utils ─────────────────────────────────────────────────

function shuffle(arr) { const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
function esc(s) { const d=document.createElement('div'); d.textContent=s||''; return d.innerHTML; }
function fmtDate(ts) { if(!ts) return '—'; const d=new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function levenshtein(a,b){const m=a.length,n=b.length;let v0=Array(n+1).fill(0),v1=Array(n+1).fill(0);for(let i=0;i<=n;i++)v0[i]=i;for(let i=0;i<m;i++){v1[0]=i+1;for(let j=0;j<n;j++)v1[j+1]=Math.min(v0[j+1]+1,v1[j]+1,v0[j]+(a[i]!==b[j]?1:0));[v0,v1]=[v1,v0];}return v0[n];}
function highlightDiff(user,correct){let uh='',ch='';const m=Math.max(user.length,correct.length);for(let i=0;i<m;i++){const uc=user[i]||'',cc=correct[i]||'';if(uc!==cc){uh+=`<span class="diff-highlight">${uc||'_'}</span>`;ch+=`<span class="diff-highlight">${cc||'_'}</span>`;}else{uh+=uc;ch+=cc;}}return{user:uh,correct:ch};}

init();
