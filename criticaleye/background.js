// Efinn — Service Worker (Manifest V3)

import { OllamaClient    } from './lib/ollama.js';
import { OpenAIClient   } from './lib/openai.js';
import { AnthropicClient  } from './lib/anthropic.js';
import { OpenRouterClient } from './lib/openrouter.js';
import { search       } from './lib/search.js';
import {
  FALLACY_SYSTEM, FALLACY_USER,
  CLAIM_SYSTEM,   CLAIM_USER,
  VERIFY_SYSTEM,  VERIFY_USER,
} from './lib/prompts.js';
import { ceLog, persistLogs } from './lib/logger.js';

const MENU_ID   = 'criticaleye-analyze';
const MAX_CHARS = 5000;

// ── Context menu registration ─────────────────────────────────────────────────
function registerContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID, title: 'Analyze with Efinn', contexts: ['selection'],
    });
  });
}

chrome.runtime.onInstalled.addListener(registerContextMenu);
chrome.runtime.onStartup.addListener(registerContextMenu);
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

// ── Context menu click → analysis pipeline ────────────────────────────────────
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  if (!tab?.id) return;

  const rawText = info.selectionText || '';
  if (!rawText.trim()) return;

  ceLog('info', '═══ Analysis session started ═══');

  const truncated = rawText.length > MAX_CHARS;
  const text      = truncated ? rawText.slice(0, MAX_CHARS) : rawText;

  const settings = await chrome.storage.sync.get({
    provider:        'ollama',
    ollamaUrl:       'http://localhost:11434',
    openaiKey:       '',
    anthropicKey:    '',
    openrouterKey:   '',
    model:        '',
    maxClaims: 5, searchProvider: 'duckduckgo', searxngUrl: '',
    customPrompts: {},
  });

  ceLog('info', 'Settings loaded', {
    ollamaUrl:      settings.ollamaUrl,
    model:          settings.model || '(none)',
    maxClaims:      settings.maxClaims,
    searchProvider: settings.searchProvider,
    textChars:      text.length,
    truncated,
    usingCustomPrompts: {
      fallacy: !!(settings.customPrompts?.fallacy),
      claim:   !!(settings.customPrompts?.claim),
      verify:  !!(settings.customPrompts?.verify),
    },
  });

  const cp = settings.customPrompts || {};
  const prompts = {
    fallacy: cp.fallacy || FALLACY_SYSTEM,
    claim:   cp.claim   || CLAIM_SYSTEM,
    verify:  cp.verify  || VERIFY_SYSTEM,
  };

  if (!settings.model) {
    ceLog('error', 'No model configured — aborting');
    await persistLogs();
    await sendToTab(tab.id, {
      type: 'CE_ERROR',
      error: 'No Ollama model selected. Click the Efinn toolbar icon to configure it.',
    });
    return;
  }

  await sendToTab(tab.id, {
    type: 'CE_SHOW', selectedText: text, truncated, model: settings.model,
  });

  const ollama  = createAIClient(settings);
  const batcher = makeTokenBatcher(tab.id);

  try {
    // ── Step 1: Logical fallacy detection ──────────────────────────────────
    ceLog('info', '── Step 1: Fallacy detection ──');
    ceLog('info', 'System prompt (first 120 chars)', prompts.fallacy.slice(0, 120));
    await sendToTab(tab.id, { type: 'CE_STREAM_STEP', label: 'Detecting logical fallacies…' });

    let fallacies = [];
    let rawFallacy = '';
    try {
      rawFallacy = await ollama.chatWithStream(
        prompts.fallacy, FALLACY_USER(text), batcher.onToken,
      );
      await batcher.flush();
      ceLog('info', `Raw fallacy response (${rawFallacy.length} chars)`, rawFallacy.slice(0, 600));
      fallacies = parseJsonArray(rawFallacy, 'fallacy detection');
      ceLog('info', `Fallacy parse result: ${fallacies.length} item(s)`,
        fallacies.map((f) => f?.name || '(no name)'));
    } catch (err) {
      ceLog('error', 'Fallacy detection threw an exception', err.message);
    }
    await sendToTab(tab.id, { type: 'CE_FALLACIES', fallacies });

    // ── Step 2: Factual claim extraction ───────────────────────────────────
    ceLog('info', '── Step 2: Claim extraction ──');
    ceLog('info', 'System prompt (first 120 chars)', prompts.claim.slice(0, 120));
    await sendToTab(tab.id, { type: 'CE_STREAM_STEP', label: 'Extracting factual claims…' });

    let claims = [];
    let rawClaims = '';
    try {
      rawClaims = await ollama.chatWithStream(
        prompts.claim, CLAIM_USER(text), batcher.onToken,
      );
      await batcher.flush();
      ceLog('info', `Raw claims response (${rawClaims.length} chars)`, rawClaims.slice(0, 600));
      claims = parseJsonArray(rawClaims, 'claim extraction')
        .filter((c) => typeof c === 'string' && c.trim());
      ceLog('info', `Claim parse result: ${claims.length} claim(s)`, claims);
    } catch (err) {
      ceLog('error', 'Claim extraction threw an exception', err.message);
    }

    const claimsToCheck = claims.slice(0, settings.maxClaims);
    ceLog('info', `Verifying ${claimsToCheck.length} of ${claims.length} claims (limit: ${settings.maxClaims})`);
    await sendToTab(tab.id, { type: 'CE_CLAIMS_START', claims: claimsToCheck });

    // ── Step 3: Verify each claim ──────────────────────────────────────────
    for (let i = 0; i < claimsToCheck.length; i++) {
      const claim      = claimsToCheck[i];
      const shortClaim = claim.length > 60 ? claim.slice(0, 60) + '…' : claim;

      ceLog('info', `── Step 3.${i + 1}: Verifying claim`, claim);
      await sendToTab(tab.id, {
        type:  'CE_STREAM_STEP',
        label: `Verifying claim ${i + 1} of ${claimsToCheck.length}: "${shortClaim}"`,
      });

      try {
        // Search
        ceLog('info', `Searching for: "${claim.slice(0, 80)}"`);
        const { snippets, sources } = await search(claim, settings);
        ceLog('info', `Search results`, {
          snippetCount: snippets.length,
          snippetPreview: snippets.map((s) => s.slice(0, 80)),
          sources,
        });

        // Verify with Ollama
        const rawVerify = await ollama.chatWithStream(
          prompts.verify, VERIFY_USER(claim, snippets), batcher.onToken,
        );
        await batcher.flush();
        ceLog('info', `Raw verify response (${rawVerify.length} chars)`, rawVerify.slice(0, 400));

        const parsed = parseJsonObject(rawVerify, `claim ${i + 1} verification`);
        ceLog('info', `Verdict for claim ${i + 1}`, {
          verdict:     parsed.verdict,
          explanation: parsed.explanation,
        });

        await sendToTab(tab.id, {
          type:    'CE_CLAIM_RESULT',
          index:   i,
          claim,
          verdict:     parsed.verdict     || 'unverifiable',
          explanation: parsed.explanation || '',
          sources,
        });
      } catch (err) {
        ceLog('error', `Claim ${i + 1} verification failed`, err.message);
        await sendToTab(tab.id, {
          type: 'CE_CLAIM_RESULT', index: i, claim,
          verdict: 'unverifiable', explanation: '', sources: [],
        });
      }
    }

    ceLog('info', '═══ Analysis complete ═══');
    await persistLogs();
    await sendToTab(tab.id, { type: 'CE_COMPLETE' });

  } catch (err) {
    ceLog('error', 'Top-level analysis error', err.message);
    await persistLogs();
    await sendToTab(tab.id, {
      type:  'CE_ERROR',
      error: err.message || 'Analysis failed. Please check that Ollama is running.',
    });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// Returns the right AI client based on the saved provider setting.
function createAIClient(settings) {
  switch (settings.provider) {
    case 'openai':
      return new OpenAIClient(settings.openaiKey, settings.model);
    case 'anthropic':
      return new AnthropicClient(settings.anthropicKey, settings.model);
    case 'openrouter':
      return new OpenRouterClient(settings.openrouterKey, settings.model);
    default:
      return new OllamaClient(settings.ollamaUrl, settings.model);
  }
}

function makeTokenBatcher(tabId) {
  let buf = '', timer = null;
  const flush = () => {
    clearTimeout(timer); timer = null;
    if (!buf) return Promise.resolve();
    const msg = { type: 'CE_STREAM_CHUNK', text: buf }; buf = '';
    return sendToTab(tabId, msg);
  };
  const onToken = (token) => { buf += token; if (!timer) timer = setTimeout(flush, 60); };
  return { onToken, flush };
}

function stripFences(text) {
  return text.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/im, '').trim();
}

function parseJsonArray(text, context = '') {
  for (const attempt of [text.trim(), stripFences(text)]) {
    if (attempt.startsWith('[')) {
      try {
        const val = JSON.parse(attempt);
        if (Array.isArray(val)) return val;
      } catch { /* continue */ }
    }
    const m = attempt.match(/\[[\s\S]*\]/);
    if (m) {
      try {
        const val = JSON.parse(m[0]);
        if (Array.isArray(val)) return val;
      } catch { /* continue */ }
    }
  }
  ceLog('warn', `parseJsonArray (${context}): no valid JSON array found`,
    `Raw (first 400): ${text.slice(0, 400)}`);
  return [];
}

function parseJsonObject(text, context = '') {
  for (const attempt of [text.trim(), stripFences(text)]) {
    if (attempt.startsWith('{')) {
      try { return JSON.parse(attempt); } catch { /* continue */ }
    }
    const m = attempt.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch { /* continue */ }
    }
  }
  ceLog('warn', `parseJsonObject (${context}): no valid JSON object found`,
    `Raw (first 400): ${text.slice(0, 400)}`);
  return {};
}

async function sendToTab(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      await chrome.tabs.sendMessage(tabId, message);
    } catch (err2) {
      ceLog('error', 'sendToTab failed', err2.message);
    }
  }
}
