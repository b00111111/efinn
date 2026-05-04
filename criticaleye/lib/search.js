// Search client — supports DuckDuckGo Instant Answer API and SearXNG.
//
// Returns: { snippets: string[], sources: { title, url }[] }

const MAX_RESULTS = 3;

// ── DuckDuckGo Instant Answer API ────────────────────────────────────────────
// Free, no API key required. Limited to structured "instant answers" — works
// well for factual queries about people, places, events, and statistics.
async function searchDuckDuckGo(query) {
  const url =
    `https://api.duckduckgo.com/?` +
    new URLSearchParams({
      q:              query,
      format:         'json',
      no_html:        '1',
      skip_disambig:  '1',
      no_redirect:    '1',
      t:              'criticaleye',
    });

  const res = await fetch(url);
  if (!res.ok) throw new Error(`DuckDuckGo API error ${res.status}`);
  const data = await res.json();

  const snippets = [];
  const sources  = [];

  // AbstractText: main factual summary
  if (data.AbstractText) {
    snippets.push(data.AbstractText);
    if (data.AbstractURL) {
      sources.push({ title: data.AbstractSource || 'Abstract', url: data.AbstractURL });
    }
  }

  // Answer: quick-answer fields (e.g. conversions, calculations)
  if (data.Answer) {
    snippets.push(data.Answer);
  }

  // RelatedTopics: up to MAX_RESULTS additional snippets
  const topics = (data.RelatedTopics || []).slice(0, MAX_RESULTS);
  for (const topic of topics) {
    if (topic.Text) {
      snippets.push(topic.Text);
      if (topic.FirstURL) {
        sources.push({ title: topic.Text.slice(0, 60), url: topic.FirstURL });
      }
    }
  }

  return {
    snippets: snippets.slice(0, MAX_RESULTS),
    sources:  sources.slice(0,  MAX_RESULTS),
  };
}

// ── SearXNG (self-hosted) ────────────────────────────────────────────────────
// Provides real web search results. Requires a running SearXNG instance.
async function searchSearXNG(query, baseUrl) {
  const url =
    `${baseUrl.replace(/\/$/, '')}/search?` +
    new URLSearchParams({
      q:       query,
      format:  'json',
      engines: 'google,bing,duckduckgo',
    });

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`SearXNG error ${res.status}`);
  const data = await res.json();

  const results = (data.results || []).slice(0, MAX_RESULTS);
  return {
    snippets: results.map((r) => r.content || r.title || '').filter(Boolean),
    sources:  results.map((r) => ({ title: r.title || r.url, url: r.url })),
  };
}

// ── Unified search entry point ───────────────────────────────────────────────
export async function search(query, settings) {
  const { searchProvider, searxngUrl } = settings;

  try {
    if (searchProvider === 'searxng' && searxngUrl) {
      return await searchSearXNG(query, searxngUrl);
    }
    if (searchProvider === 'none') {
      return { snippets: [], sources: [] };
    }
    // Default: DuckDuckGo
    return await searchDuckDuckGo(query);
  } catch (err) {
    console.warn('[CriticalEye] Search failed:', err.message);
    return { snippets: [], sources: [] };
  }
}
