// Ollama REST API client
// Docs: https://github.com/ollama/ollama/blob/main/docs/api.md

export class OllamaClient {
  constructor(baseUrl, model) {
    // Normalise: strip trailing slash
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.model = model;
  }

  // ── List available models ──────────────────────────────────────────────────
  async listModels() {
    const res = await this._fetch('GET', '/api/tags');
    const data = await res.json();
    // Returns { models: [{ name, modified_at, size, ... }] }
    return (data.models || []).map((m) => m.name);
  }

  // ── Quick connectivity check ───────────────────────────────────────────────
  async testConnection() {
    try {
      const models = await this.listModels();
      return { ok: true, models };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // ── Chat completion (non-streaming) ───────────────────────────────────────
  // Returns the assistant message string.
  async chat(systemPrompt, userMessage) {
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage  },
      ],
      stream: false,
      options: {
        temperature: 0.1,   // deterministic for structured output
        num_predict: 2048,
      },
    };

    const res = await this._fetch('POST', '/api/chat', body);
    const data = await res.json();

    // Ollama chat response: { message: { role, content }, done, ... }
    const content = data?.message?.content;
    if (!content) {
      throw new Error('Ollama returned an empty response.');
    }
    return content;
  }

  // ── Streaming chat completion ──────────────────────────────────────────────
  // Calls onToken(tokenString) for each chunk as it arrives.
  // Returns the full assembled response string when done.
  async chatWithStream(systemPrompt, userMessage, onToken) {
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage  },
      ],
      stream: true,
      options: {
        temperature: 0.1,
        num_predict: 2048,
      },
    };

    const res = await this._fetch('POST', '/api/chat', body);
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let partial  = '';   // incomplete JSON line buffer

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode chunk and append to any leftover from previous iteration
        partial += decoder.decode(value, { stream: true });

        // Ollama sends one JSON object per line (NDJSON)
        const lines = partial.split('\n');
        partial = lines.pop(); // last element may be an incomplete line

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data  = JSON.parse(line);
            const token = data?.message?.content ?? '';
            if (token) {
              fullText += token;
              onToken(token);
            }
            if (data.done) return fullText;
          } catch {
            // Malformed JSON line — skip silently
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullText;
  }

  // ── Internal fetch helper ──────────────────────────────────────────────────
  async _fetch(method, path, body) {
    const url = `${this.baseUrl}${path}`;
    const init = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) init.body = JSON.stringify(body);

    let res;
    try {
      res = await fetch(url, init);
    } catch (err) {
      // Network-level error (refused connection, DNS failure, etc.)
      throw new Error(
        `Cannot reach Ollama at ${this.baseUrl}. ` +
        `Make sure Ollama is running and the host URL is correct. (${err.message})`
      );
    }

    if (!res.ok) {
      if (res.status === 403) {
        throw new Error(
          'Ollama returned 403 Forbidden — this is a CORS configuration issue.\n\n' +
          'Chrome extensions send an Origin header with POST requests, and Ollama ' +
          'blocks them by default.\n\n' +
          'Fix: restart Ollama with the OLLAMA_ORIGINS environment variable:\n\n' +
          '  Mac / Linux:\n' +
          '  OLLAMA_ORIGINS="chrome-extension://*" ollama serve\n\n' +
          '  Windows (PowerShell):\n' +
          '  $env:OLLAMA_ORIGINS="chrome-extension://*"; ollama serve\n\n' +
          'Or set it permanently in your shell profile / system environment variables.\n' +
          'See the CORS tip in the CriticalEye options page for details.'
        );
      }
      const text = await res.text().catch(() => '');
      throw new Error(`Ollama API error ${res.status}: ${text || res.statusText}`);
    }
    return res;
  }
}
