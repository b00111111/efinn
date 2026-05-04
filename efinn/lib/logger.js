// Efinn — Debug Logger
//
// Usage in service worker:
//   ceLog('info',  'Step 1 started', { model: 'llama3' });
//   ceLog('warn',  'JSON parse failed', rawText);
//   ceLog('error', 'Ollama unreachable', err.message);
//   await persistLogs();   ← call once at the end of each analysis
//
// All logs are also emitted to the SW console immediately via console.log/warn/error,
// so they remain visible in chrome://extensions → Efinn → Inspect service worker.

const LOG_KEY  = 'efinn_logs';
const MAX_LOGS = 400;

// In-memory buffer — flushed to storage at the end of each analysis session.
// Module-level so it survives across helper function calls within one SW event.
let _buf = [];

// ── ceLog ─────────────────────────────────────────────────────────────────────
// Synchronous — never blocks the pipeline.
export function ceLog(level, message, data = null) {
  // 1. Immediate console output (visible in SW devtools right away)
  const fn = level === 'error' ? console.error
           : level === 'warn'  ? console.warn
           : console.log;
  fn(`[Efinn] ${message}`, data ?? '');

  // 2. Buffer for deferred storage write
  _buf.push({
    t:     Date.now(),
    level,
    msg:   message,
    data:  data != null
      ? (typeof data === 'object'
          ? JSON.stringify(data).slice(0, 800)
          : String(data).slice(0, 800))
      : null,
  });
}

// ── persistLogs ───────────────────────────────────────────────────────────────
// Call once at the end (or on error) to write buffered entries to storage.
export async function persistLogs() {
  if (!_buf.length) return;
  const toSave = [..._buf];
  _buf = [];

  try {
    const res      = await chrome.storage.local.get({ [LOG_KEY]: [] });
    const existing = Array.isArray(res[LOG_KEY]) ? res[LOG_KEY] : [];
    const combined = [...existing, ...toSave].slice(-MAX_LOGS);
    await chrome.storage.local.set({ [LOG_KEY]: combined });
  } catch (e) {
    console.error('[Efinn] Failed to persist logs:', e);
  }
}

// ── clearLogs ─────────────────────────────────────────────────────────────────
export async function clearLogs() {
  _buf = [];
  await chrome.storage.local.set({ [LOG_KEY]: [] });
}

// ── getLogs ───────────────────────────────────────────────────────────────────
export async function getLogs() {
  const res = await chrome.storage.local.get({ [LOG_KEY]: [] });
  return Array.isArray(res[LOG_KEY]) ? res[LOG_KEY] : [];
}
