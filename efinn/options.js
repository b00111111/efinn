// Efinn — Options Page Script (ES module)
import { FALLACY_SYSTEM, CLAIM_SYSTEM, VERIFY_SYSTEM } from './lib/prompts.js';
import { ANTHROPIC_MODELS } from './lib/anthropic.js';

const $ = (id) => document.getElementById(id);

// ── Provider tab switching ─────────────────────────────────────────────────────
let activeProvider = 'ollama';

function setProvider(provider) {
  activeProvider = provider;
  document.querySelectorAll('.provider-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.provider === provider);
  });
  $('ollama-fields').style.display      = provider === 'ollama'      ? 'block' : 'none';
  $('openai-fields').style.display      = provider === 'openai'      ? 'block' : 'none';
  $('anthropic-fields').style.display   = provider === 'anthropic'   ? 'block' : 'none';
  $('openrouter-fields').style.display  = provider === 'openrouter'  ? 'block' : 'none';
  $('model-select').innerHTML = '<option value="">— test connection to load models —</option>';
  $('model-select').disabled  = true;
}

document.querySelectorAll('.provider-tab').forEach((btn) => {
  btn.addEventListener('click', () => setProvider(btn.dataset.provider));
});

// ── Collapsible prompt sections ────────────────────────────────────────────────
['fallacy', 'claim', 'verify'].forEach((key) => {
  $(`ph-${key}`).addEventListener('click', () => {
    $(`ph-${key}`).classList.toggle('collapsed');
    $(`pb-${key}`).classList.toggle('collapsed');
  });
});

// ── Load persisted settings ────────────────────────────────────────────────────
async function loadSettings() {
  const s = await chrome.storage.sync.get({
    provider:       'ollama',
    ollamaUrl:      'http://localhost:11434',
    openaiKey:      '',
    anthropicKey:   '',
    openrouterKey:  '',
    model:          '',
    maxClaims:      5,
    searchProvider: 'duckduckgo',
    searxngUrl:     '',
    whoogleUrl:     '',
    braveKey:       '',
    kagiKey:        '',
    tavilyKey:      '',
    serperKey:      '',
    bingKey:        '',
    customPrompts:  {},
  });

  setProvider(s.provider || 'ollama');
  $('ollama-url').value    = s.ollamaUrl;
  $('openai-key').value      = s.openaiKey;
  $('anthropic-key').value   = s.anthropicKey;
  $('openrouter-key').value  = s.openrouterKey;

  $('max-claims').value           = s.maxClaims;
  $('max-claims-val').textContent = s.maxClaims;
  $('search-provider').value      = s.searchProvider;
  $('searxng-url').value          = s.searxngUrl;
  $('whoogle-url').value          = s.whoogleUrl;
  $('brave-key').value            = s.braveKey;
  $('kagi-key').value             = s.kagiKey;
  $('tavily-key').value           = s.tavilyKey;
  $('serper-key').value           = s.serperKey;
  $('bing-key').value             = s.bingKey;
  toggleSearchExtra(s.searchProvider);

  if (s.model) {
    const opt = document.createElement('option');
    opt.value       = s.model;
    opt.textContent = s.model + ' (saved — test connection to refresh)';
    opt.selected    = true;
    $('model-select').innerHTML = '';
    $('model-select').appendChild(opt);
    $('model-select').disabled = false;
  }

  const cp = s.customPrompts || {};
  $('prompt-fallacy').value = cp.fallacy ?? FALLACY_SYSTEM;
  $('prompt-claim').value   = cp.claim   ?? CLAIM_SYSTEM;
  $('prompt-verify').value  = cp.verify  ?? VERIFY_SYSTEM;
}

// ── Connection test — routes to the right provider ────────────────────────────
$('test-btn').addEventListener('click', async () => {
  $('test-btn').disabled    = true;
  $('test-btn').textContent = 'Testing…';
  try {
    if (activeProvider === 'ollama')    await testOllama();
    if (activeProvider === 'openai')    await testOpenAI();
    if (activeProvider === 'anthropic')  await testAnthropic();
    if (activeProvider === 'openrouter') await testOpenRouter();
  } finally {
    $('test-btn').disabled    = false;
    $('test-btn').textContent = 'Test Connection';
  }
});

// ── Ollama test (two-phase: GET tags + POST chat CORS probe) ──────────────────
async function testOllama() {
  const url = $('ollama-url').value.trim();
  if (!url) { showStatus('error', 'Please enter an Ollama host URL.'); return; }
  showStatus('info', 'Connecting to Ollama…');
  $('cors-banner').style.display = 'none';
  const base = url.replace(/\/$/, '');
  try {
    const tagsRes = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(8000) });
    if (!tagsRes.ok) throw new Error(`HTTP ${tagsRes.status} — ${tagsRes.statusText}`);
    const data   = await tagsRes.json();
    const models = (data.models || []).map((m) => m.name).sort();
    if (models.length === 0) {
      showStatus('error', 'Connected, but no models installed. Run: ollama pull llama3');
      return;
    }
    showStatus('info', `✓ Ollama reachable (${models.length} model${models.length !== 1 ? 's' : ''}). Checking CORS…`);
    const chatRes = await fetch(`${base}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ model: models[0], messages: [{ role: 'user', content: 'ping' }], stream: false, options: { num_predict: 1 } }),
      signal:  AbortSignal.timeout(15000),
    });
    if (chatRes.status === 403) {
      $('cors-banner').style.display = 'block';
      showStatus('error', '✗ CORS blocked (403) — see the fix instructions above.');
      return;
    }
    populateModelDropdown(models);
    showStatus('ok', `✓ Connected & CORS OK — ${models.length} model${models.length !== 1 ? 's' : ''} available`);
  } catch (err) {
    let msg = err.message || 'Unknown error';
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('refused'))
      msg = 'Connection refused. Is Ollama running? Try: ollama serve';
    else if (msg.includes('timeout') || msg.includes('AbortError'))
      msg = 'Connection timed out. Check the host URL and your network.';
    showStatus('error', `✗ ${msg}`);
  }
}

// ── OpenAI test ───────────────────────────────────────────────────────────────
async function testOpenAI() {
  const key = $('openai-key').value.trim();
  if (!key) { showStatus('error', 'Please enter your OpenAI API key.'); return; }
  showStatus('info', 'Connecting to OpenAI…');
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${key}` },
      signal:  AbortSignal.timeout(10000),
    });
    if (res.status === 401) { showStatus('error', '✗ Invalid API key — check your key and try again.'); return; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data   = await res.json();
    const models = (data.data || [])
      .map((m) => m.id)
      .filter((id) => id.startsWith('gpt-') || /^o[134]-/.test(id))
      .sort();
    const list = models.length > 0 ? models : ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
    populateModelDropdown(list);
    showStatus('ok', `✓ Connected — ${list.length} chat model${list.length !== 1 ? 's' : ''} available`);
  } catch (err) {
    showStatus('error', `✗ ${err.message}`);
  }
}

// ── Anthropic test ────────────────────────────────────────────────────────────
async function testAnthropic() {
  const key = $('anthropic-key').value.trim();
  if (!key) { showStatus('error', 'Please enter your Anthropic API key.'); return; }
  showStatus('info', 'Connecting to Anthropic…');
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body:   JSON.stringify({ model: ANTHROPIC_MODELS[1], max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 401) { showStatus('error', '✗ Invalid API key — check your key and try again.'); return; }
    if (res.status === 529) { showStatus('error', '✗ Anthropic API overloaded — try again shortly.'); return; }
    if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`HTTP ${res.status}: ${t}`); }
    populateModelDropdown(ANTHROPIC_MODELS);
    showStatus('ok', `✓ Connected — ${ANTHROPIC_MODELS.length} models available`);
  } catch (err) {
    showStatus('error', `✗ ${err.message}`);
  }
}

function populateModelDropdown(models) {
  const sel  = $('model-select');
  const prev = sel.value;
  sel.innerHTML = '';
  sel.disabled  = false;
  models.forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (name === prev) opt.selected = true;
    sel.appendChild(opt);
  });
  if (!prev || !models.includes(prev)) sel.selectedIndex = 0;
}

// ── OpenRouter test ───────────────────────────────────────────────────────────
async function testOpenRouter() {
  const key = $('openrouter-key').value.trim();
  if (!key) { showStatus('error', 'Please enter your OpenRouter API key.'); return; }
  showStatus('info', 'Connecting to OpenRouter…');
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${key}`,
        'HTTP-Referer':  'https://efinn.extension',
        'X-Title':       'Efinn',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 401) { showStatus('error', '✗ Invalid API key — check your key and try again.'); return; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data   = await res.json();
    const models = (data.data || []).map((m) => m.id).sort();
    populateModelDropdown(models);
    showStatus('ok', `✓ Connected — ${models.length} model${models.length !== 1 ? 's' : ''} available`);
  } catch (err) {
    showStatus('error', `✗ ${err.message}`);
  }
}

// ── Range slider ──────────────────────────────────────────────────────────────
$('max-claims').addEventListener('input', () => {
  $('max-claims-val').textContent = $('max-claims').value;
});

// ── Search provider toggle ────────────────────────────────────────────────────
$('search-provider').addEventListener('change', (e) => toggleSearchExtra(e.target.value));

const SEARCH_EXTRA_ROWS = {
  brave:   'brave-row',
  kagi:    'kagi-row',
  tavily:  'tavily-row',
  serper:  'serper-row',
  bing:    'bing-row',
  searxng: 'searxng-row',
  whoogle: 'whoogle-row',
};

function toggleSearchExtra(provider) {
  for (const [key, rowId] of Object.entries(SEARCH_EXTRA_ROWS)) {
    $(`${rowId}`).classList.toggle('visible', provider === key);
  }
}

// ── Save provider settings (key + model) ─────────────────────────────────────
$('provider-save-btn').addEventListener('click', async () => {
  const model = $('model-select').value;
  if (!model) {
    showStatus('error', 'Please test the connection and select a model first.');
    return;
  }
  await chrome.storage.sync.set({
    provider:      activeProvider,
    ollamaUrl:     $('ollama-url').value.trim() || 'http://localhost:11434',
    openaiKey:     $('openai-key').value.trim(),
    anthropicKey:  $('anthropic-key').value.trim(),
    openrouterKey: $('openrouter-key').value.trim(),
    model,
  });
  flashConfirm('provider-save-msg');
});

// ── Save analysis settings ────────────────────────────────────────────────────
$('save-btn').addEventListener('click', async () => {
  await chrome.storage.sync.set({
    maxClaims:      parseInt($('max-claims').value, 10),
    searchProvider: $('search-provider').value,
    searxngUrl:     $('searxng-url').value.trim(),
    whoogleUrl:     $('whoogle-url').value.trim(),
    braveKey:       $('brave-key').value.trim(),
    kagiKey:        $('kagi-key').value.trim(),
    tavilyKey:      $('tavily-key').value.trim(),
    serperKey:      $('serper-key').value.trim(),
    bingKey:        $('bing-key').value.trim(),
  });
  flashConfirm('save-msg');
});

// ── Reset prompt buttons ──────────────────────────────────────────────────────
$('reset-fallacy').addEventListener('click', () => { $('prompt-fallacy').value = FALLACY_SYSTEM; });
$('reset-claim').addEventListener('click',   () => { $('prompt-claim').value   = CLAIM_SYSTEM;   });
$('reset-verify').addEventListener('click',  () => { $('prompt-verify').value  = VERIFY_SYSTEM;  });

// ── Save prompts ──────────────────────────────────────────────────────────────
$('save-prompts-btn').addEventListener('click', async () => {
  const fallacy = $('prompt-fallacy').value.trim();
  const claim   = $('prompt-claim').value.trim();
  const verify  = $('prompt-verify').value.trim();

  if (!fallacy || !claim || !verify) {
    alert('Prompts cannot be empty. Use the Reset button to restore defaults.');
    return;
  }

  await chrome.storage.sync.set({
    customPrompts: { fallacy, claim, verify },
  });
  flashConfirm('save-prompts-msg');
});

// ── Utilities ─────────────────────────────────────────────────────────────────
function showStatus(type, text) {
  const el = $('status-msg');
  el.className  = type;
  el.textContent = text;
}

function flashConfirm(id) {
  const el = $(id);
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 2500);
}

// ── Debug Log Viewer ─────────────────────────────────────────────────────────
const LOG_KEY = 'efinn_logs';
let allLogs    = [];
let activeFilter = 'all';
let autoRefreshTimer = null;

// Read logs from storage
async function fetchLogs() {
  const res = await chrome.storage.local.get({ [LOG_KEY]: [] });
  allLogs   = Array.isArray(res[LOG_KEY]) ? res[LOG_KEY] : [];
  renderLogs();
}

// Render the currently-filtered log list
function renderLogs() {
  const container = $('log-container');
  const empty     = $('log-empty');
  const status    = $('log-status');

  const filtered = activeFilter === 'all'
    ? allLogs
    : allLogs.filter((e) => e.level === activeFilter);

  // Update status
  const warnCount  = allLogs.filter((e) => e.level === 'warn').length;
  const errorCount = allLogs.filter((e) => e.level === 'error').length;
  status.textContent = `${allLogs.length} entries` +
    (warnCount  ? `  ⚠ ${warnCount}`  : '') +
    (errorCount ? `  ✗ ${errorCount}` : '');

  if (filtered.length === 0) {
    empty.style.display = 'block';
    // Remove all entries but keep the empty placeholder
    [...container.querySelectorAll('.log-entry, .log-sep')].forEach((el) => el.remove());
    return;
  }
  empty.style.display = 'none';

  // Build fragment (newest first)
  const frag    = document.createDocumentFragment();
  const wasAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 40;

  // Clear existing entries
  [...container.querySelectorAll('.log-entry, .log-sep')].forEach((el) => el.remove());

  // Render in reverse order (newest at top)
  const reversed = [...filtered].reverse();
  reversed.forEach((entry, i) => {
    // Session separator
    if (entry.msg && entry.msg.startsWith('═══ Analysis session started')) {
      const sep = document.createElement('div');
      sep.className = 'log-sep';
      sep.textContent = `── ${fmt(entry.t)} ──────────────────────────────`;
      frag.appendChild(sep);
    }

    const row = document.createElement('div');
    row.className = `log-entry entry-${entry.level}`;

    const timeEl  = document.createElement('span');
    timeEl.className = 'log-time';
    timeEl.textContent = fmt(entry.t);

    const levelEl = document.createElement('span');
    levelEl.className = `log-level level-${entry.level}`;
    levelEl.textContent = entry.level.toUpperCase();

    const bodyEl  = document.createElement('div');
    bodyEl.className = 'log-body';

    const msgEl   = document.createElement('span');
    msgEl.className = 'log-msg';
    msgEl.textContent = entry.msg || '';
    bodyEl.appendChild(msgEl);

    if (entry.data) {
      const dataEl = document.createElement('span');
      dataEl.className = 'log-data';
      // Pretty-print if it looks like JSON
      let display = entry.data;
      try {
        const parsed = JSON.parse(entry.data);
        display = JSON.stringify(parsed, null, 2);
      } catch { /* use raw string */ }
      dataEl.textContent = display;
      bodyEl.appendChild(dataEl);
    }

    row.appendChild(timeEl);
    row.appendChild(levelEl);
    row.appendChild(bodyEl);
    frag.appendChild(row);
  });

  // Insert after empty placeholder
  empty.after(frag);
  // Keep scroll at bottom if it was there
  if (wasAtBottom) container.scrollTop = container.scrollHeight;
}

function fmt(ts) {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Filter buttons
document.querySelectorAll('.log-filter-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    activeFilter = btn.dataset.filter;
    document.querySelectorAll('.log-filter-btn').forEach((b) => {
      b.className = 'log-filter-btn'; // reset
    });
    btn.classList.add(`active-${activeFilter}`);
    renderLogs();
  });
});

// Refresh
$('log-refresh-btn').addEventListener('click', fetchLogs);

// Copy all logs as plain text
$('log-copy-btn').addEventListener('click', async () => {
  const lines = allLogs.map((e) =>
    `[${fmt(e.t)}] [${e.level.toUpperCase()}] ${e.msg}${e.data ? '\n  ' + e.data : ''}`
  ).join('\n');
  await navigator.clipboard.writeText(lines || '(no logs)');
  const btn = $('log-copy-btn');
  btn.textContent = '✓ Copied';
  setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
});

// Clear
$('log-clear-btn').addEventListener('click', async () => {
  if (!confirm('Clear all debug logs?')) return;
  await chrome.storage.local.set({ [LOG_KEY]: [] });
  allLogs = [];
  renderLogs();
});

// Auto-refresh
function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshTimer = setInterval(fetchLogs, 3000);
}
function stopAutoRefresh() {
  if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
}

$('log-auto').addEventListener('change', (e) => {
  e.target.checked ? startAutoRefresh() : stopAutoRefresh();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopAutoRefresh();
  } else if ($('log-auto').checked) {
    startAutoRefresh();
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────
loadSettings();
fetchLogs();
startAutoRefresh();
