# Efinn 🪶

> *In Norse mythology, Odin kept two ravens: **Huginn** (Thought) and **Muninn** (Memory). They flew across the world each day and returned to whisper what they had seen. Efinn is what we imagine his third raven would have been — **Efa** (Doubt) — the one who questions whether what the others brought back is actually true.*

A Chrome extension that analyzes selected text for **logical fallacies** and **fact-checks claims** using a locally-hosted [Ollama](https://ollama.com) model. No cloud AI — everything runs on your machine.

---

## What it does

Select any text on any webpage, right-click, and choose **Analyze with Efinn**. A panel slides in with:

- **Logical Fallacies** — bulleted list with fallacy name, explanation, and the relevant quote from the text
- **Fact Check** — each verifiable claim labeled ✓ True, ✗ False, ~ Partial, or ? Unverifiable, with explanations and sources
- **Live thinking stream** — a terminal-style panel showing the raw AI output as it streams in, so you can see exactly what the model is doing

---

## Prerequisites

- [Google Chrome](https://www.google.com/chrome/) 120 or later
- [Ollama](https://ollama.com) installed and running locally
- At least one Ollama model pulled (e.g. `ollama pull llama3`)

---

## Installation

### 1. Install Ollama and pull a model

Download Ollama from [ollama.com](https://ollama.com) and pull a model:

```bash
ollama pull llama3
```

Any instruction-following model works. Larger models (13B+) give better JSON reliability; smaller ones (7B/8B) are faster.

### 2. Fix CORS — required before first use

Chrome extensions send an `Origin: chrome-extension://...` header with every POST request. Ollama blocks these by default, causing a **403 Forbidden** error on every analysis call.

**You must restart Ollama with the `OLLAMA_ORIGINS` environment variable set:**

**Mac / Linux:**
```bash
OLLAMA_ORIGINS="chrome-extension://*" ollama serve
```

**Windows (PowerShell):**
```powershell
$env:OLLAMA_ORIGINS="chrome-extension://*"; ollama serve
```

**To make it permanent** (so you don't have to set it every time):

- **Mac / Linux** — add this line to your `~/.zshrc` or `~/.bashrc`, then run `source ~/.zshrc`:
  ```bash
  export OLLAMA_ORIGINS="chrome-extension://*"
  ```
- **Windows** — open System Properties → Environment Variables → New System Variable:
  - Variable name: `OLLAMA_ORIGINS`
  - Variable value: `chrome-extension://*`

  Then restart Ollama.

> **Note:** The connection test in the options page checks for this. If you see "CORS blocked (403)", the fix instructions will appear directly in the settings page.

### 3. Load the extension in Chrome

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `efinn` folder (the one containing `manifest.json`)

The Efinn icon (🪶) will appear in your toolbar.

### 4. Configure the extension

1. Click the Efinn toolbar icon — this opens the **Settings** page
2. Enter your Ollama host URL (default: `http://localhost:11434`)
3. Click **Test Connection** — you should see **"✓ Connected & CORS OK"**
   - If you see a 403 CORS error, follow the instructions in step 2 above
4. Select a model from the dropdown
5. Click **Save Settings**

---

## Usage

1. Select any text on a webpage (a paragraph, article, social media post, etc.)
2. Right-click → **Analyze with Efinn**
3. The analysis panel opens in the bottom-right corner of the page

The panel shows three sections:

| Section | What it shows |
|---|---|
| **Thinking stream** | Live streaming AI output — dark terminal panel, auto-collapses when done |
| **Logical Fallacies** | Bulleted list: fallacy name + explanation + quoted passage |
| **Fact Check** | Each claim with a verdict, explanation, and expandable sources |

**Verdict icons:**

| Icon | Meaning |
|---|---|
| ✓ True | Supported by search results |
| ✗ False | Contradicted by search results — explanation shown |
| ~ Partial | Partly correct but overstated, misleading, or missing context — explanation shown |
| ? Could not verify | Search returned no relevant results |

**Keyboard shortcut:** Press `Escape` to close the panel.

---

## Settings

Open the settings page any time by clicking the toolbar icon.

### Ollama Connection

- **Host URL** — URL of your Ollama server (default `http://localhost:11434`). Change this if Ollama is running on a different machine or port.
- **Test Connection** — verifies both reachability (GET `/api/tags`) and CORS configuration (POST `/api/chat`). Shows a 403 CORS banner with fix instructions if needed.
- **Model** — populated after a successful connection test. Pick the model you want to use for analysis.

### Analysis Settings

- **Max claims to verify** (1–10, default 5) — limits how many factual claims are sent through the search + verify pipeline. Higher = more thorough but slower.
- **Search provider**:
  - **DuckDuckGo Instant Answers** (default) — free, no API key required; works best for well-known facts
  - **SearXNG** — a self-hosted meta-search engine; gives real web results and is more reliable for niche claims. Set your SearXNG instance URL after selecting this option.
  - **None** — disables fact-checking entirely (only fallacy detection runs)

### System Prompts

The three system prompts sent to Ollama are fully editable in the settings page:

| Prompt | Purpose | Expected output |
|---|---|---|
| **Fallacy Detection** | Identifies logical fallacies | JSON array of `{name, explanation, quote}` |
| **Claim Extraction** | Pulls out verifiable facts | JSON array of strings |
| **Claim Verification** | Evaluates a claim against search results | JSON object `{verdict, explanation}` |

Each prompt has a **Reset to default** button. If analysis is returning empty results, check the thinking stream to see the raw model output, then adjust the prompts here to better match your model's response style.

**Common fixes:**
- If the model wraps output in ` ```json ``` ` code fences despite being told not to — the parser handles this automatically, but you can also remove the "Output nothing outside the JSON" line from the prompt
- If key names are wrong (e.g. model returns `"fallacy_name"` instead of `"name"`) — adjust the prompt to specify the exact key names you want
- If the model returns explanatory prose before the JSON — the parser will scan for the first `[` or `{` and extract from there

---

## Debug Log

The **Debug Log** card at the bottom of the settings page shows detailed logs from the most recent analysis sessions.

Each log entry shows:
- **Timestamp** — when the event occurred
- **Level** — INFO (blue), WARN (yellow), ERROR (red)
- **Message** — what happened
- **Data** — raw values (model output, parse results, search snippets, etc.)

**Filter buttons** let you show only Warn or Error entries to quickly spot problems.

**Key things to look for:**

| Log entry | What it means |
|---|---|
| `Settings loaded` | Confirms which model and prompts are in use |
| `Raw fallacy response` | The exact string the model returned — check this if parsing fails |
| `parseJsonArray: no valid JSON array found` | The model didn't return parseable JSON — check/edit the prompt |
| `Search results` | How many snippets DuckDuckGo returned for each claim |
| `Ollama API error 403` | CORS not configured — see the fix in step 2 of Installation |

The **Copy** button copies all logs as plain text for sharing or pasting into a bug report. The **Clear** button wipes the log. Logs auto-refresh every 3 seconds while the settings page is open.

---

## Project structure

```
efinn/
├── manifest.json          # Extension manifest (MV3)
├── background.js          # Service worker — analysis pipeline orchestration
├── content.js             # Content script — Shadow DOM results panel
├── options.html           # Settings page HTML
├── options.js             # Settings page logic (ES module)
├── lib/
│   ├── ollama.js          # Ollama REST API client (streaming + non-streaming)
│   ├── search.js          # DuckDuckGo / SearXNG search client
│   ├── prompts.js         # Default system prompt templates
│   └── logger.js          # Debug logger (buffers to chrome.storage.local)
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## How the analysis pipeline works

```
User selects text → right-click → Analyze with Efinn
        │
        ▼
Service worker wakes up
        │
        ├─ Step 1: POST /api/chat  (FALLACY_SYSTEM prompt)
        │    └─ Streams tokens → content script thinking panel
        │    └─ Parse JSON array → render Logical Fallacies section
        │
        ├─ Step 2: POST /api/chat  (CLAIM_SYSTEM prompt)
        │    └─ Streams tokens → content script thinking panel
        │    └─ Parse JSON array of claim strings
        │
        └─ Step 3: for each claim (up to maxClaims):
             ├─ Search (DuckDuckGo or SearXNG) → top 3 snippets
             ├─ POST /api/chat  (VERIFY_SYSTEM prompt + snippets)
             │    └─ Streams tokens → content script thinking panel
             │    └─ Parse {verdict, explanation}
             └─ Send result to content script → update claim verdict
```

All Ollama calls use streaming (`"stream": true`) so tokens appear in the thinking panel as they're generated.

---

## Troubleshooting

**"No Ollama model selected" error**
→ Open settings, test the connection, and save a model.

**403 Forbidden on every analysis**
→ Ollama's CORS policy is blocking extension POST requests. See [Fix CORS](#2-fix-cors--required-before-first-use) above.

**Empty fallacy / fact results**
→ Check the thinking stream in the panel — it shows the raw model output. Open the debug log and look for `parseJsonArray: no valid JSON array found`. The raw output in the log data shows what the model actually returned; edit the prompts to match.

**Very slow analysis**
→ Reduce **Max claims to verify** in settings, or switch to a smaller/faster model.

**Panel doesn't appear after right-clicking**
→ Try reloading the extension at `chrome://extensions` and refreshing the page. On some pages with strict CSP headers the content script may be blocked.

**Connection test passes but analysis still fails**
→ Check the debug log for the specific error. A 403 that only appears during analysis (not the connection test) means CORS was not configured before Ollama was started — restart Ollama with `OLLAMA_ORIGINS` set.
