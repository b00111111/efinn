// OpenAI API client
// Docs: https://platform.openai.com/docs/api-reference

export class OpenAIClient {
  constructor(apiKey, model) {
    this.apiKey  = apiKey;
    this.model   = model;
    this.baseUrl = 'https://api.openai.com/v1';
  }

  // ── List available chat models ────────────────────────────────────────────
  async listModels() {
    const res  = await this._fetch('GET', '/models');
    const data = await res.json();
    const ids  = (data.data || [])
      .map((m) => m.id)
      .filter((id) =>
        id.startsWith('gpt-') || id.startsWith('o1') ||
        id.startsWith('o3')   || id.startsWith('o4')
      )
      .sort();
    // Fall back to a hardcoded list if the API returns nothing useful
    return ids.length > 0 ? ids : [
      'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo',
    ];
  }

  // ── Quick connectivity / key check ────────────────────────────────────────
  async testConnection() {
    try {
      const models = await this.listModels();
      return { ok: true, models };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // ── Streaming chat completion ─────────────────────────────────────────────
  // OpenAI streams as Server-Sent Events (SSE):
  //   data: {"choices":[{"delta":{"content":"token"},...}]}
  //   data: [DONE]
  async chatWithStream(systemPrompt, userMessage, onToken) {
    const body = {
      model:      this.model,
      messages:   [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage  },
      ],
      stream:      true,
      temperature: 0.1,
      max_tokens:  2048,
    };

    const res     = await this._fetch('POST', '/chat/completions', body);
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
        partial = lines.pop(); // keep incomplete last line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') return fullText;
          try {
            const parsed = JSON.parse(payload);
            const token  = parsed.choices?.[0]?.delta?.content ?? '';
            if (token) { fullText += token; onToken(token); }
          } catch { /* skip malformed SSE line */ }
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
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
    };
    if (body) init.body = JSON.stringify(body);

    let res;
    try {
      res = await fetch(url, init);
    } catch (err) {
      throw new Error(
        `Cannot reach OpenAI. Check your internet connection. (${err.message})`
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let msg = `OpenAI API error ${res.status}`;
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
