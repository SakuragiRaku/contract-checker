// app.js — 契約書チェッカー

const STORAGE_KEY = 'contract-checker';
let state = { checks: [], theme: 'dark' };

function init() {
  loadState(); applyTheme(); bindEvents(); renderHistory();
}

function loadState() {
  try { const s = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (s) state = { ...state, ...s }; } catch {}
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  document.getElementById('theme-toggle').textContent = state.theme === 'dark' ? '☀️' : '🌙';
}

function bindEvents() {
  document.getElementById('theme-toggle').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark'; applyTheme(); saveState();
  });
  document.getElementById('api-key-btn').addEventListener('click', () => AIConfig.createApiKeyModal());
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn, .tab-content').forEach(e => e.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
  document.getElementById('contract-form').addEventListener('submit', handleAnalyze);
}

async function handleAnalyze(e) {
  e.preventDefault();
  if (!AIConfig.hasApiKey()) { AIConfig.createApiKeyModal(() => handleAnalyze(e)); return; }

  const text = document.getElementById('c-text').value.trim();
  const type = document.getElementById('c-type').value;
  const role = document.getElementById('c-role').value;
  const title = document.getElementById('c-title').value.trim() || `${type} (${role})`;

  if (!text) return;

  const btn = document.getElementById('analyze-btn');
  btn.disabled = true;
  btn.querySelector('.btn-text').style.display = 'none';
  btn.querySelector('.btn-loading').style.display = 'inline';

  try {
    const result = await analyzeContract(text, type, role);
    const check = {
      id: Date.now().toString(),
      title, type, role, text,
      score: result.score,
      analysis: result.analysis,
      createdAt: new Date().toISOString()
    };
    state.checks.unshift(check);
    saveState();
    renderResult(check);
    renderHistory();
  } catch (err) { alert(err.message); }
  finally {
    btn.disabled = false;
    btn.querySelector('.btn-text').style.display = 'inline';
    btn.querySelector('.btn-loading').style.display = 'none';
  }
}

async function analyzeContract(text, type, role) {
  const prompt = `あなたは企業法務を専門とする日本の弁護士AIです。以下の契約書をレビューしてください。

【契約種別】${type}
【依頼者の立場】${role}

【契約書本文】
${text}

以下のJSON形式で分析結果を出力してください。
依頼者の立場から見て不利な条項やリスクにフォーカスしてください。リスクがない場合は無理に指摘せずともよいです。
{
  "score": <0-100の整数、リスク度合い。100が最もリスクが高い（危険）、0が安全>,
  "analysis": [
    {
      "level": "<high または med または low>",
      "quote": "<契約書本文からリスクのある一文を正確に引用(ハイライト用に使用します)>",
      "reason": "<なぜこの条項が依頼者にとってリスクなのか平易な日本語で解説>",
      "suggestion": "<どのように修正交渉すべきかの具体的な提案>"
    }
  ]
}
※ analysisのquoteは、必ず提供された本文テキストに完全一致する部分文字列にしてください。`;

  const raw = await AIConfig.callGemini(prompt, { jsonMode: true, temperature: 0.2 });
  return JSON.parse(raw);
}

function renderResult(check) {
  document.getElementById('result-section').style.display = 'block';
  document.getElementById('risk-score-val').textContent = check.score;
  
  // Highlight text
  let highlightedText = escapeHTML(check.text);
  
  // ソートして長いquoteから置換（部分一致の重複を避ける）
  const sorted = [...check.analysis].sort((a,b) => b.quote.length - a.quote.length);
  
  sorted.forEach(item => {
    if (!item.quote || item.quote.length < 5) return;
    const escapedQuote = escapeHTML(item.quote);
    const split = highlightedText.split(escapedQuote);
    if (split.length > 1) {
      highlightedText = split.join(`<span class="mark-${item.level}">${escapedQuote}</span>`);
    } else {
      // 完全一致しない場合は類似一致を試みるか諦める（今回はシンプルにスキップ）
    }
  });
  
  document.getElementById('highlighted-text').innerHTML = highlightedText;
  
  // Analysis List
  const list = document.getElementById('analysis-list');
  if (check.analysis.length === 0) {
    list.innerHTML = '<p>特に大きなリスク条項は見当たりませんでした。</p>';
  } else {
    const levelText = { high: '高リスク', med: '中リスク', low: '低リスク' };
    list.innerHTML = check.analysis.map(a => `
      <div class="analysis-card ${a.level}">
        <div class="ac-header">
          <span class="ac-badge ${a.level}">${levelText[a.level]}</span>
        </div>
        <div class="ac-quote">「${escapeHTML(a.quote)}」</div>
        <div class="ac-reason">${escapeHTML(a.reason)}</div>
        <div class="ac-suggestion">${escapeHTML(a.suggestion)}</div>
      </div>
    `).join('');
  }
}

function renderHistory() {
  const empty = document.getElementById('history-empty');
  const list = document.getElementById('history-list');
  if (state.checks.length === 0) { empty.style.display = 'block'; list.innerHTML = ''; return; }
  empty.style.display = 'none';
  
  list.innerHTML = state.checks.map(c => `
    <div class="history-card">
      <div class="history-card-info" onclick="showHistoryDetail('${c.id}')">
        <h3>${escapeHTML(c.title)}</h3>
        <div class="history-card-meta">${formatDate(c.createdAt)}</div>
      </div>
      <div class="history-card-score" onclick="showHistoryDetail('${c.id}')">${c.score}</div>
      <button class="history-del-btn" onclick="deleteCheck('${c.id}')">🗑️</button>
    </div>
  `).join('');
}

function showHistoryDetail(id) {
  const c = state.checks.find(x => x.id === id);
  if (!c) return;
  
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelector('[data-tab="check"]').classList.add('active');
  document.getElementById('tab-check').classList.add('active');
  
  document.getElementById('c-type').value = c.type;
  document.getElementById('c-role').value = c.role;
  document.getElementById('c-title').value = c.title;
  document.getElementById('c-text').value = c.text;
  
  renderResult(c);
}

function deleteCheck(id) {
  if (!confirm('この履歴を削除しますか？')) return;
  state.checks = state.checks.filter(x => x.id !== id);
  saveState(); renderHistory();
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}
function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

document.addEventListener('DOMContentLoaded', init);
