# Efinn

> *In Norse mythology, Odin kept two ravens: **Huginn** (Thought) and **Muninn** (Memory). They flew across the world each day and returned to whisper what they had seen. Efinn is what we imagine his third raven would have been — **Efa** (Doubt) — the one who questions whether what the others brought back is actually true.*

A Chrome extension that analyzes selected text for **logical fallacies** and **fact-checks claims** using AI. Works with local models via Ollama or cloud APIs — your choice.

---

## What it does

Select any text on any webpage, right-click, and choose **Analyze with Efinn**. A panel slides in with:

- **Logical Fallacies** — bulleted list with fallacy name, explanation, and the relevant quote from the text
- **Fact Check** — each verifiable claim labeled ✓ True, ✗ False, ~ Partial, or ? Unverifiable, with explanations and sources
- **Live thinking stream** — a terminal-style panel showing raw AI output as it streams in

---

## AI Providers

Efinn supports four backends — pick whichever fits your setup:

| Provider | Privacy | Cost | Setup |
|---|---|---|---|
| **Ollama** | Fully local, no data leaves your machine | Free | Install Ollama, pull a model |
| **Anthropic** | Cloud | API key required | claude.ai API key |
| **OpenAI** | Cloud | API key required | platform.openai.com API key |
| **OpenRouter** | Cloud (routes to 100s of models) | API key required | openrouter.ai API key |

Switch providers any time from the settings page.

---

## Installation

### 1. Set up your AI provider

**Option A — Ollama (local, no API key)**

Download [Ollama](https://ollama.com) and pull a model:

```bash
ollama pull llama3
```

Then restart Ollama with CORS enabled so Chrome extensions can reach it:

```bash
# Mac / Linux
OLLAMA_ORIGINS="chrome-extension://*" ollama serve

# Windows (PowerShell)
$env:OLLAMA_ORIGINS="chrome-extension://*"; ollama serve
```

To make this permanent, add `export OLLAMA_ORIGINS="chrome-extension://*"` to your `~/.zshrc` or `~/.bashrc`.

**Option B — Cloud provider**

Get an API key from [Anthropic](https://console.anthropic.com), [OpenAI](https://platform.openai.com), or [OpenRouter](https://openrouter.ai) and have it ready for the settings step below.

### 2. Load the extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `criticaleye` folder (the one containing `manifest.json`)

### 3. Configure the extension

1. Click the Efinn toolbar icon to open **Settings**
2. Choose your AI provider from the dropdown
3. For Ollama: enter the host URL (default `http://localhost:11434`) and click **Test Connection**
4. For cloud providers: paste your API key and click **Test Connection**
5. Select a model and click **Save Settings**

---

## Usage

1. Select any text on a webpage
2. Right-click → **Analyze with Efinn**
3. The analysis panel opens in the bottom-right corner

| Section | What it shows |
|---|---|
| **Thinking stream** | Live AI output — dark terminal panel, auto-collapses when done |
| **Logical Fallacies** | Fallacy name + explanation + quoted passage |
| **Fact Check** | Each claim with a verdict, explanation, and sources |

**Verdict icons:**

| Icon | Meaning |
|---|---|
| ✓ True | Supported by search results |
| ✗ False | Contradicted by search results |
| ~ Partial | Partly correct but overstated, misleading, or missing context |
| ? Could not verify | Search returned no relevant results |

Press `Escape` to close the panel.

---

## Settings

### AI Provider

- **Ollama** — local inference; set host URL, test connection, pick model
- **Anthropic** — Claude models (Opus, Sonnet, Haiku); paste API key
- **OpenAI** — GPT-4o, GPT-4, GPT-3.5, o-series; paste API key
- **OpenRouter** — access hundreds of models from one API key

### Analysis Settings

- **Max claims to verify** (1–10, default 5) — how many factual claims go through the search + verify pipeline
- **Search provider**:
  - **DuckDuckGo Instant Answers** — free, no key required
  - **SearXNG** — self-hosted meta-search; more reliable for niche claims
  - **None** — disables fact-checking (fallacy detection only)

### System Prompts

All three system prompts (fallacy detection, claim extraction, claim verification) are fully editable with per-prompt **Reset to default** buttons. Useful for tuning output format to match a specific model's response style.

---

## Project structure

```
criticaleye/
├── manifest.json          # Extension manifest (MV3)
├── background.js          # Service worker — analysis pipeline
├── content.js             # Content script — Shadow DOM results panel
├── options.html           # Settings page HTML
├── options.js             # Settings page logic
└── lib/
    ├── ollama.js          # Ollama REST API client (streaming)
    ├── anthropic.js       # Anthropic Claude API client (streaming)
    ├── openai.js          # OpenAI API client (streaming)
    ├── openrouter.js      # OpenRouter API client (streaming)
    ├── search.js          # DuckDuckGo / SearXNG search client
    ├── prompts.js         # Default system prompt templates
    └── logger.js          # Debug logger (buffers to chrome.storage.local)
```

---

## Troubleshooting

**403 Forbidden on every analysis (Ollama)**
→ CORS is not configured. Restart Ollama with `OLLAMA_ORIGINS="chrome-extension://*"` set — see Installation step 1.

**"No model selected" error**
→ Open settings, test the connection, select a model, and save.

**Empty fallacy / fact results**
→ Check the thinking stream — it shows raw model output. Open the debug log (bottom of settings page) and look for `parseJsonArray: no valid JSON array found`. Edit the prompts to match your model's output format.

**Very slow analysis**
→ Reduce Max claims to verify, switch to a faster model, or use a cloud provider.

**Panel doesn't appear after right-clicking**
→ Reload the extension at `chrome://extensions` and refresh the page. Some pages with strict CSP headers block content scripts.
