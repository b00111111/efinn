// Search client — supports DuckDuckGo, SearXNG, Brave, Kagi, Tavily, Serper, Bing, Whoogle.
//
// Returns: { snippets: string[], sources: { title, url }[] }

const MAX_RESULTS = 3;

// ── DuckDuckGo Instant Answer API ────────────────────────────────────────────
// Free, no API key. Limited to structured instant answers.
async function searchDuckDuckGo(query) {
  const url =
    `https://api.duckduckgo.com/?` +
    new URLSearchParams({
      q:             query,
      format:        'json',
      no_html:       '1',
      skip_disambig: '1',
      no_redirect:   '1',
      t:             'efinn',
    });

  const res = await fetch(url);
  if (!res.ok) throw new Error(`DuckDuckGo API error ${res.status}`);
  const data = await res.json();

  const snippets = [];
  const sources  = [];

  if (data.AbstractText) {
    snippets.push(data.AbstractText);
    if (data.AbstractURL) {
      sources.push({ title: data.AbstractSource || 'Abstract', url: data.AbstractURL });
    }
  }
  if (data.Answer) snippets.push(data.Answer);

  for (const topic of (data.RelatedTopics || []).slice(0, MAX_RESULTS)) {
    if (topic.Text) {
      snippets.push(topic.Text);
      if (topic.FirstURL) {
        sources.push({ title: topic.Text.slice(0, 60), url: topic.FirstURL });
      }
    }
  }

  return {
    snippets: snippets.slice(0, MAX_RESULTS),
    sources:  sources.slice(0, MAX_RESULTS),
  };
}

// ── SearXNG (self-hosted) ────────────────────────────────────────────────────
// Real web results. Requires a running SearXNG instance.
async function searchSearXNG(query, baseUrl) {
  const url =
    `${baseUrl.replace(/\/$/, '')}/search?` +
    new URLSearchParams({ q: query, format: 'json', engines: 'google,bing,duckduckgo' });

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`SearXNG error ${res.status}`);
  const data = await res.json();

  const results = (data.results || []).slice(0, MAX_RESULTS);
  return {
    snippets: results.map((r) => r.content || r.title || '').filter(Boolean),
    sources:  results.map((r) => ({ title: r.title || r.url, url: r.url })),
  };
}

// ── Whoogle (self-hosted Google proxy) ───────────────────────────────────────
// Same JSON format as SearXNG. Requires a running Whoogle instance.
async function searchWhoogle(query, baseUrl) {
  const url =
    `${baseUrl.replace(/\/$/, '')}/search?` +
    new URLSearchParams({ q: query, output: 'json' });

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Whoogle error ${res.status}`);
  const data = await res.json();

  // Whoogle returns { results: [{ title, url, description }] }
  const results = (data.results || []).slice(0, MAX_RESULTS);
  return {
    snippets: results.map((r) => r.description || r.title || '').filter(Boolean),
    sources:  results.map((r) => ({ title: r.title || r.url, url: r.url })),
  };
}

// ── Brave Search API ─────────────────────────────────────────────────────────
// Real web results. Free tier: 2,000 queries/month. API key required.
// https://api.search.brave.com/app/keys
async function searchBrave(query, apiKey) {
  const url = `https://api.search.brave.com/res/v1/web/search?` +
    new URLSearchParams({ q: query, count: MAX_RESULTS, result_filter: 'web' });

  const res = await fetch(url, {
    headers: {
      'Accept':               'application/json',
      'Accept-Encoding':      'gzip',
      'X-Subscription-Token': apiKey,
    },
  });
  if (res.status === 401) throw new Error('Brave: invalid API key');
  if (res.status === 429) throw new Error('Brave: rate limit exceeded');
  if (!res.ok) throw new Error(`Brave API error ${res.status}`);
  const data = await res.json();

  const results = (data.web?.results || []).slice(0, MAX_RESULTS);
  return {
    snippets: results.map((r) => r.description || r.title || '').filter(Boolean),
    sources:  results.map((r) => ({ title: r.title || r.url, url: r.url })),
  };
}

// ── Kagi Search API ──────────────────────────────────────────────────────────
// High-quality results. Requires a paid Kagi subscription + API key.
// https://kagi.com/settings?p=api
async function searchKagi(query, apiKey) {
  const url = `https://kagi.com/api/v0/search?` +
    new URLSearchParams({ q: query, limit: MAX_RESULTS });

  const res = await fetch(url, {
    headers: { 'Authorization': `Bot ${apiKey}` },
  });
  if (res.status === 401) throw new Error('Kagi: invalid API key');
  if (res.status === 429) throw new Error('Kagi: rate limit exceeded');
  if (!res.ok) throw new Error(`Kagi API error ${res.status}`);
  const data = await res.json();

  // Kagi returns { data: [{ t: 0 (result) | 1 (related), title, url, snippet }] }
  const results = (data.data || [])
    .filter((r) => r.t === 0 && r.url)
    .slice(0, MAX_RESULTS);

  return {
    snippets: results.map((r) => r.snippet || r.title || '').filter(Boolean),
    sources:  results.map((r) => ({ title: r.title || r.url, url: r.url })),
  };
}

// ── Tavily Search API ────────────────────────────────────────────────────────
// Designed for AI/RAG — returns clean pre-summarized snippets.
// Free tier available. https://app.tavily.com
async function searchTavily(query, apiKey) {
  const res = await fetch('https://api.tavily.com/search', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      api_key:        apiKey,
      query,
      search_depth:   'basic',
      max_results:    MAX_RESULTS,
      include_answer: false,
    }),
  });
  if (res.status === 401) throw new Error('Tavily: invalid API key');
  if (res.status === 429) throw new Error('Tavily: rate limit exceeded');
  if (!res.ok) throw new Error(`Tavily API error ${res.status}`);
  const data = await res.json();

  const results = (data.results || []).slice(0, MAX_RESULTS);
  return {
    snippets: results.map((r) => r.content || r.title || '').filter(Boolean),
    sources:  results.map((r) => ({ title: r.title || r.url, url: r.url })),
  };
}

// ── Serper (Google Search) API ───────────────────────────────────────────────
// Wraps Google. Free tier: 2,500 queries/month. https://serper.dev
async function searchSerper(query, apiKey) {
  const res = await fetch('https://google.serper.dev/search', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
    body:    JSON.stringify({ q: query, num: MAX_RESULTS }),
  });
  if (res.status === 401) throw new Error('Serper: invalid API key');
  if (res.status === 429) throw new Error('Serper: rate limit exceeded');
  if (!res.ok) throw new Error(`Serper API error ${res.status}`);
  const data = await res.json();

  const results = (data.organic || []).slice(0, MAX_RESULTS);
  return {
    snippets: results.map((r) => r.snippet || r.title || '').filter(Boolean),
    sources:  results.map((r) => ({ title: r.title || r.url, url: r.link })),
  };
}

// ── Bing Search API ──────────────────────────────────────────────────────────
// Via Azure Cognitive Services. Free tier via Azure.
// https://portal.azure.com → Bing Search v7
async function searchBing(query, apiKey) {
  const url = `https://api.bing.microsoft.com/v7.0/search?` +
    new URLSearchParams({ q: query, count: MAX_RESULTS, responseFilter: 'Webpages' });

  const res = await fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': apiKey } });
  if (res.status === 401) throw new Error('Bing: invalid API key');
  if (res.status === 429) throw new Error('Bing: rate limit exceeded');
  if (!res.ok) throw new Error(`Bing API error ${res.status}`);
  const data = await res.json();

  const results = (data.webPages?.value || []).slice(0, MAX_RESULTS);
  return {
    snippets: results.map((r) => r.snippet || r.name || '').filter(Boolean),
    sources:  results.map((r) => ({ title: r.name || r.url, url: r.url })),
  };
}

// ── Unified search entry point ───────────────────────────────────────────────
export async function search(query, settings) {
  const {
    searchProvider,
    searxngUrl, whoogleUrl,
    braveKey, kagiKey, tavilyKey, serperKey, bingKey,
  } = settings;

  try {
    switch (searchProvider) {
      case 'searxng':  return searxngUrl  ? await searchSearXNG(query, searxngUrl)   : { snippets: [], sources: [] };
      case 'whoogle':  return whoogleUrl  ? await searchWhoogle(query, whoogleUrl)   : { snippets: [], sources: [] };
      case 'brave':    return braveKey    ? await searchBrave(query, braveKey)       : { snippets: [], sources: [] };
      case 'kagi':     return kagiKey     ? await searchKagi(query, kagiKey)         : { snippets: [], sources: [] };
      case 'tavily':   return tavilyKey   ? await searchTavily(query, tavilyKey)     : { snippets: [], sources: [] };
      case 'serper':   return serperKey   ? await searchSerper(query, serperKey)     : { snippets: [], sources: [] };
      case 'bing':     return bingKey     ? await searchBing(query, bingKey)         : { snippets: [], sources: [] };
      case 'none':     return { snippets: [], sources: [] };
      default:         return await searchDuckDuckGo(query);
    }
  } catch (err) {
    console.warn('[Efinn] Search failed:', err.message);
    return { snippets: [], sources: [] };
  }
}
