// Anthropic Claude API client
// Docs: https://docs.anthropic.com/en/api

// Current Claude models (Anthropic has no public list-models endpoint)
export const ANTHROPIC_MODELS = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  'claude-3-opus-20240229',
];

export class AnthropicClient {
  constructor(apiKey, model) {
    this.apiKey  = apiKey;
    this.model   = model;
    this.baseUrl = 'https://api.anthropic.com/v1';
  }

  // ── Model list (hardcoded — no API endpoint exists) ───────────────────────
  async listModels() {
    return [...ANTHROPIC_MODELS];
  }

  // ── Quick connectivity / key check via a minimal messages call ───────────
  async testConnection() {
    try {
      // Send a minimal request to verify the key is valid
      const res  = await this._fetch('POST', '/messages', {
        model:      ANTHROPIC_MODELS[1], // use sonnet for the probe
        max_tokens: 1,
        messages:   [{ role: 'user', content: 'ping' }],
      });
      // Any non-error response means the key is valid
      await res.json();
      return { ok: true, models: await this.listModels() };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // ── Streaming chat completion ─────────────────────────────────────────────
  // Anthropic streams as SSE with named events:
  //
  //   event: content_block_delta
  //   data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"token"}}
  //
  // System prompt is a top-level field, NOT a message.
  async chatWithStream(systemPrompt, userMessage, onToken) {
    const body = {
      model:      this.model,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userMessage }],
      stream:     true,
      max_tokens: 2048,
    };

    const res     = await this._fetch('POST', '/messages', body);
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let partial  = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        partial += decoder.decode(value, { stream: true });
        const lines = partial.split('\n');
        partial = lines.pop();

        let currentEvent = '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('event:')) {
            currentEvent = trimmed.slice(6).trim();
          } else if (trimmed.startsWith('data:') &&
                     currentEvent === 'content_block_delta') {
            try {
              const parsed = JSON.parse(trimmed.slice(5).trim());
              const token  = parsed.delta?.type === 'text_delta'
                ? (parsed.delta.text ?? '')
                : '';
              if (token) { fullText += token; onToken(token); }
            } catch { /* skip malformed line */ }
          } else if (trimmed === '') {
            currentEvent = ''; // blank line resets event type
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    return fullText;
  }

  // ── Internal fetch helper ─────────────────────────────────────────────────
  async _fetch(method, path, body) {
    const url  = `${this.baseUrl}${path}`;
    const init = {
      method,
      headers: {
        'Content-Type':                            'application/json',
        'x-api-key':                               this.apiKey,
        'anthropic-version':                       '2023-06-01',
        // Required to allow direct browser / extension requests
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    };
    if (body) init.body = JSON.stringify(body);

    let res;
    try {
      res = await fetch(url, init);
    } catch (err) {
      throw new Error(
        `Cannot reach Anthropic. Check your internet connection. (${err.message})`
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let msg = `Anthropic API error ${res.status}`;
      try {
        const json = JSON.parse(text);
        msg += `: ${json.error?.message || text}`;
      } catch {
        msg += `: ${text || res.statusText}`;
      }
      if (res.status === 401) msg += ' — Invalid API key. Check your key in settings.';
      if (res.status === 429) msg += ' — Rate limited or quota exceeded.';
      throw new Error(msg);
    }
    return res;
  }
}
