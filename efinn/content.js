// Efinn — Content Script
// Injects a Shadow DOM results panel into any page and handles messages
// from the service worker.  All styles are scoped inside the shadow root.

(() => {
  if (window.__efinnInjected) return;
  window.__efinnInjected = true;

  const HOST_ID = 'efinn-host';

  const VERDICT = {
    true:         { icon: '✓', label: 'True',             cls: 'verdict-true'          },
    false:        { icon: '✗', label: 'False',            cls: 'verdict-false'         },
    partial:      { icon: '~', label: 'Partial',          cls: 'verdict-partial'       },
    unverifiable: { icon: '?', label: 'Could not verify', cls: 'verdict-unverifiable'  },
  };

  // ── Styles ───────────────────────────────────────────────────────────────────
  const STYLES = `
    :host { all: initial; }
    *, *::before, *::after {
      box-sizing: border-box; margin: 0; padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    }

    /* ═══════════════ PANEL SHELL ═══════════════ */
    #panel {
      position: fixed;
      bottom: 24px; right: 24px;
      width: 440px;
      height: 80vh;
      max-height: 80vh;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,.22), 0 2px 8px rgba(0,0,0,.12);
      display: flex; flex-direction: column;
      z-index: 2147483647;
      overflow: hidden;
      font-size: 13px;
      color: #1a1a2e;
      animation: ce-slide-in .22s cubic-bezier(.16,1,.3,1);
    }
    @keyframes ce-slide-in {
      from { transform: translateY(24px) scale(.97); opacity: 0; }
      to   { transform: translateY(0)    scale(1);   opacity: 1; }
    }

    /* ═══════════════ HEADER ═══════════════ */
    #header {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 14px;
      background: #2e4057;
      color: #fff;
      flex-shrink: 0;
    }
    #header .logo { font-weight: 700; font-size: 14px; letter-spacing: .3px; flex: 1; }
    #header .model-badge {
      font-size: 10px;
      background: rgba(255,255,255,.16);
      border-radius: 4px;
      padding: 2px 7px;
      max-width: 150px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    #close-btn {
      background: none; border: none;
      color: rgba(255,255,255,.65);
      font-size: 20px; cursor: pointer; line-height: 1; padding: 0 2px;
      transition: color .15s;
    }
    #close-btn:hover { color: #fff; }

    /* ═══════════════ QUOTE STRIP ═══════════════ */
    #quote {
      background: #f5f7fa;
      border-left: 3px solid #048a81;
      padding: 7px 12px;
      font-size: 12px; color: #555; font-style: italic;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      flex-shrink: 0;
    }
    .truncated-warn { font-style: normal; color: #c0392b; font-size: 11px; margin-left: 4px; }

    /* ═══════════════ STEP PROGRESS BAR ═══════════════ */
    #step-bar {
      height: 3px;
      background: #eef0f5;
      flex-shrink: 0;
      overflow: hidden;
    }
    #step-fill {
      height: 100%;
      background: linear-gradient(90deg, #048a81, #04c9be);
      width: 0%;
      transition: width .5s ease;
    }
    #step-fill.indeterminate {
      width: 40%;
      animation: ce-bar-slide 1.4s ease-in-out infinite;
    }
    @keyframes ce-bar-slide {
      0%   { margin-left: -40%; }
      100% { margin-left: 140%; }
    }

    /* ═══════════════ SCROLLABLE BODY ═══════════════ */
    #body {
      overflow-y: auto; flex: 1;
      min-height: 0;
      padding: 10px 12px;
      display: flex; flex-direction: column; gap: 10px;
    }

    /* ═══════════════ THINKING STREAM (terminal) ═══════════════ */
    #thinking-wrap {
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #2a3a4d;
      transition: box-shadow .3s, border-color .3s;
    }
    #thinking-wrap.streaming {
      border-color: #048a81;
      box-shadow: 0 0 0 2px rgba(4,138,129,.18), 0 2px 12px rgba(4,138,129,.12);
      animation: ce-pulse-glow 2s ease infinite;
    }
    @keyframes ce-pulse-glow {
      0%,100% { box-shadow: 0 0 0 2px rgba(4,138,129,.14); }
      50%     { box-shadow: 0 0 0 3px rgba(4,138,129,.32), 0 4px 18px rgba(4,138,129,.18); }
    }

    #thinking-header {
      display: flex; align-items: center; gap: 8px;
      padding: 7px 11px;
      background: #161b22;
      border-bottom: 1px solid #2a3a4d;
      cursor: pointer;
      user-select: none;
    }
    #thinking-header:hover { background: #1c2330; }

    /* three animated dots */
    .think-dots { display: flex; gap: 4px; align-items: center; flex-shrink: 0; }
    .think-dots span {
      display: block; width: 5px; height: 5px;
      background: #048a81; border-radius: 50%;
      animation: ce-bounce 1.1s ease-in-out infinite;
    }
    .think-dots span:nth-child(2) { animation-delay: .18s; }
    .think-dots span:nth-child(3) { animation-delay: .36s; }
    @keyframes ce-bounce {
      0%,60%,100% { transform: translateY(0);   opacity: .8; }
      30%          { transform: translateY(-5px); opacity: 1;  }
    }
    #thinking-wrap.done .think-dots span { animation: none; background: #2a3a4d; }

    #thinking-step-label {
      flex: 1;
      font-size: 11px; font-weight: 600;
      color: #8b949e;
      font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    #thinking-step-label .step-tag {
      color: #04c9be;
      margin-right: 5px;
    }
    #thinking-toggle {
      font-size: 10px; color: #4a5568;
      transition: transform .2s;
    }
    #thinking-wrap.collapsed #thinking-toggle { transform: rotate(-90deg); }

    #thinking-output-wrap {
      background: #0d1117;
      max-height: 180px;
      overflow-y: auto;
      padding: 8px 11px;
      transition: max-height .3s ease;
    }
    #thinking-wrap.collapsed #thinking-output-wrap {
      max-height: 0;
      padding: 0 11px;
    }

    #thinking-output {
      font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
      font-size: 11px; line-height: 1.6;
      color: #c9d1d9;
      white-space: pre-wrap; word-break: break-all;
    }

    /* blinking cursor */
    .ce-cursor {
      display: inline-block;
      width: 7px; height: 13px;
      background: #04c9be;
      border-radius: 1px;
      animation: ce-blink .9s step-end infinite;
      vertical-align: text-bottom;
      margin-left: 1px;
    }
    @keyframes ce-blink { 0%,100%{opacity:1} 50%{opacity:0} }

    /* step separator in stream */
    .stream-step-line {
      color: #3d5a80;
      font-size: 10px;
      margin: 4px 0 2px;
      display: block;
    }

    /* ═══════════════ ERROR STATE ═══════════════ */
    #error-msg {
      background: #fde8e8; border: 1px solid #f5c6c6;
      border-radius: 6px; padding: 10px 12px;
      color: #c0392b; font-size: 12px; line-height: 1.5;
      display: none;
    }

    /* ═══════════════ RESULT SECTIONS ═══════════════ */
    .section { border: 1px solid #e8eaf0; border-radius: 8px; overflow: hidden; }
    .section-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 12px;
      background: #f5f7fa;
      font-weight: 600; font-size: 12px; color: #2e4057;
      cursor: pointer; user-select: none;
      border-bottom: 1px solid #e8eaf0;
    }
    .section-header:hover { background: #edf0f5; }
    .section-header .chevron { transition: transform .2s; font-size: 10px; }
    .section-header.collapsed .chevron { transform: rotate(-90deg); }
    .section-body {
      padding: 10px 12px;
      display: flex; flex-direction: column; gap: 8px;
    }
    .section-body.collapsed { display: none; }

    .badge {
      display: inline-flex; align-items: center; gap: 5px;
      background: #2e4057; color: #fff;  /* default white — overridden by .bc-* chips */
      border-radius: 10px; font-size: 10px; font-weight: 700;
      padding: 1px 7px; margin-left: 6px;
    }
    /* plain white text used before results arrive */
    .badge-plain { color: #fff; }
    /* per-verdict coloured chips inside the badge */
    .bc-true        { color: #4ade80; }   /* green  */
    .bc-false       { color: #f87171; }   /* red    */
    .bc-partial     { color: #fbbf24; }   /* yellow */
    .bc-unver       { color: #9ca3af; }   /* grey   */
    .empty-msg { font-size: 12px; color: #888; font-style: italic; }

    /* ═══════════════ FALLACY GROUPS (collapsible) ═══════════════ */
    .fallacy-group { border: 1px solid #e0e3ec; border-radius: 6px; overflow: hidden; }
    .fallacy-group-header {
      display: flex; align-items: center; gap: 7px;
      padding: 7px 10px;
      background: #f0f2f8;
      cursor: pointer; user-select: none;
      font-size: 12px; font-weight: 700; color: #2e4057;
    }
    .fallacy-group-header:hover { background: #e6e9f2; }
    .fallacy-group-chevron { font-size: 9px; transition: transform .2s; margin-left: auto; color: #7a8aaa; }
    .fallacy-group.collapsed .fallacy-group-chevron { transform: rotate(-90deg); }
    .fallacy-count-pill {
      background: #2e4057; color: #fff;
      border-radius: 8px; font-size: 9px; font-weight: 700;
      padding: 1px 5px; flex-shrink: 0;
    }
    .fallacy-group-body { display: flex; flex-direction: column; gap: 0; }
    .fallacy-group.collapsed .fallacy-group-body { display: none; }
    .fallacy-instance {
      font-size: 12px; line-height: 1.5;
      padding: 7px 10px;
      border-top: 1px solid #edeef5;
    }
    .fallacy-explanation { color: #333; margin: 2px 0; }
    .fallacy-quote {
      color: #666; font-style: italic;
      border-left: 2px solid #ccd;
      padding-left: 6px; margin-top: 3px; font-size: 11px;
    }

    /* ═══════════════ PROPAGANDA ITEMS ═══════════════ */
    .propaganda-group { border: 1px solid #e0e3ec; border-radius: 6px; overflow: hidden; }
    .propaganda-group-header {
      display: flex; align-items: center; gap: 7px;
      padding: 7px 10px;
      background: #f8f0f5;
      cursor: pointer; user-select: none;
      font-size: 12px; font-weight: 700; color: #5a1a3a;
    }
    .propaganda-group-header:hover { background: #f0e4ee; }
    .propaganda-group-chevron { font-size: 9px; transition: transform .2s; margin-left: auto; color: #9a6a8a; }
    .propaganda-group.collapsed .propaganda-group-chevron { transform: rotate(-90deg); }
    .propaganda-count-pill {
      background: #7a2a5a; color: #fff;
      border-radius: 8px; font-size: 9px; font-weight: 700;
      padding: 1px 5px; flex-shrink: 0;
    }
    .severity-pill {
      font-size: 9px; font-weight: 700; border-radius: 8px;
      padding: 1px 6px; flex-shrink: 0;
    }
    .severity-low    { background: #fef9e7; color: #9a7d0a; border: 1px solid #f9e79f; }
    .severity-medium { background: #fef0dc; color: #e07b20; border: 1px solid #fad7a0; }
    .severity-high   { background: #fde8e8; color: #c0392b; border: 1px solid #f5c6c6; }
    .propaganda-group-body { display: flex; flex-direction: column; gap: 0; }
    .propaganda-group.collapsed .propaganda-group-body { display: none; }
    .propaganda-instance {
      font-size: 12px; line-height: 1.5;
      padding: 7px 10px;
      border-top: 1px solid #edeef5;
    }
    .propaganda-explanation { color: #333; margin: 2px 0; }
    .propaganda-quote {
      color: #666; font-style: italic;
      border-left: 2px solid #c8a0b8;
      padding-left: 6px; margin-top: 3px; font-size: 11px;
    }

    /* ═══════════════ CLAIM ITEMS ═══════════════ */
    .claim-item { font-size: 12px; line-height: 1.5; }
    .claim-row { display: flex; align-items: flex-start; gap: 8px; }
    .verdict-icon {
      width: 22px; height: 22px; border-radius: 50%;
      font-size: 12px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; margin-top: 1px;
    }
    .verdict-true         { background: #d4f0e4; color: #1a8a5a; }
    .verdict-false        { background: #fde8e8; color: #c0392b; }
    .verdict-partial      { background: #fef0dc; color: #e07b20; }
    .verdict-unverifiable { background: #f0f0f0; color: #888;    }
    .verdict-pending      { background: #f0f0f0; color: #bbb;    }

    .claim-row { cursor: pointer; }
    .claim-row:hover .claim-text { color: #048a81; }
    .claim-text  { font-weight: 600; color: #222; flex: 1; transition: color .15s; }
    .claim-label { font-size: 10px; font-weight: 700; margin-top: 1px; }
    .verdict-true  .claim-label        { color: #1a8a5a; }
    .verdict-false .claim-label        { color: #c0392b; }
    .verdict-partial .claim-label      { color: #e07b20; }
    .verdict-unverifiable .claim-label { color: #888;    }
    .claim-expand-hint { font-size: 9px; color: #bbb; margin-top: 1px; }

    .claim-detail { display: none; padding-top: 6px; }
    .claim-detail.open { display: block; }
    .claim-explanation { color: #444; font-size: 11px; line-height: 1.45; margin-bottom: 4px; }

    .sources-list { display: flex; flex-direction: column; gap: 2px; margin-top: 2px; }
    .sources-list a {
      font-size: 10px; color: #048a81;
      text-overflow: ellipsis; overflow: hidden; white-space: nowrap;
      text-decoration: none;
    }
    .sources-list a:hover { text-decoration: underline; }

    .claim-spinner {
      width: 14px; height: 14px;
      border: 2px solid #dde; border-top-color: #048a81;
      border-radius: 50%;
      animation: ce-spin .7s linear infinite;
    }
    @keyframes ce-spin { to { transform: rotate(360deg); } }

    /* ═══════════════ FOOTER ═══════════════ */
    #footer {
      padding: 5px 12px; font-size: 10px; color: #aaa;
      border-top: 1px solid #eee; flex-shrink: 0; background: #fafafa;
      display: none;
    }
  `;

  // ── State ────────────────────────────────────────────────────────────────────
  let shadowRoot  = null;
  let claimCount  = 0;
  let streamText  = '';  // accumulated thinking output

  // ── Bootstrap shadow host ────────────────────────────────────────────────────
  function ensurePanel() {
    if (document.getElementById(HOST_ID)) return;

    const host = document.createElement('div');
    host.id = HOST_ID;
    document.body.appendChild(host);
    shadowRoot = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = STYLES;
    shadowRoot.appendChild(style);

    const panel = document.createElement('div');
    panel.id = 'panel';
    panel.innerHTML = `
      <div id="header">
        <span class="logo">🪶 Efinn <span style="font-size:10px;font-weight:400;opacity:.6">v1.4</span></span>
        <span class="model-badge" id="model-badge"></span>
        <button id="close-btn" title="Close (Esc)">×</button>
      </div>
      <div id="quote"></div>
      <div id="step-bar"><div id="step-fill" class="indeterminate"></div></div>
      <div id="body">
        <div id="error-msg"></div>

        <!-- ── Thinking stream terminal ── -->
        <div id="thinking-wrap" class="streaming">
          <div id="thinking-header">
            <div class="think-dots"><span></span><span></span><span></span></div>
            <span id="thinking-step-label">
              <span class="step-tag">▶</span>Starting…
            </span>
            <span id="thinking-toggle">▾</span>
          </div>
          <div id="thinking-output-wrap">
            <div id="thinking-output"><span class="ce-cursor"></span></div>
          </div>
        </div>

        <!-- ── Result sections (hidden until data arrives) ── -->
        <div id="fallacy-section" class="section" style="display:none">
          <div class="section-header" id="fallacy-header">
            Logical Fallacies<span class="badge" id="fallacy-badge">…</span>
            <span class="chevron">▾</span>
          </div>
          <div class="section-body" id="fallacy-body"></div>
        </div>

        <div id="propaganda-section" class="section" style="display:none">
          <div class="section-header" id="propaganda-header">
            Propaganda Techniques<span class="badge" id="propaganda-badge">…</span>
            <span class="chevron">▾</span>
          </div>
          <div class="section-body" id="propaganda-body"></div>
        </div>

        <div id="fact-section" class="section" style="display:none">
          <div class="section-header" id="fact-header">
            Fact Check<span class="badge" id="fact-badge">…</span>
            <span class="chevron">▾</span>
          </div>
          <div class="section-body" id="fact-body"></div>
        </div>
      </div>
      <div id="footer"></div>
    `;
    shadowRoot.appendChild(panel);

    // Close button
    shadowRoot.getElementById('close-btn').addEventListener('click', destroyPanel);

    // Thinking section collapse toggle
    shadowRoot.getElementById('thinking-header').addEventListener('click', () => {
      shadowRoot.getElementById('thinking-wrap').classList.toggle('collapsed');
    });

    // Result section collapse toggles
    ['fallacy-header', 'propaganda-header', 'fact-header'].forEach((id) => {
      shadowRoot.getElementById(id).addEventListener('click', () => {
        shadowRoot.getElementById(id).classList.toggle('collapsed');
        shadowRoot.getElementById(id.replace('-header', '-body')).classList.toggle('collapsed');
      });
    });
  }

  function destroyPanel() {
    document.getElementById(HOST_ID)?.remove();
    shadowRoot  = null;
    claimCount  = 0;
    streamText  = '';
    window.__efinnInjected = false;
  }

  // ── Message handlers ─────────────────────────────────────────────────────────

  function onShow({ selectedText, truncated, model }) {
    ensurePanel();
    claimCount = 0;
    streamText = '';

    // Quote strip
    const preview = selectedText.length > 180
      ? selectedText.slice(0, 180) + '…'
      : selectedText;
    const q = shadowRoot.getElementById('quote');
    q.textContent = `"${preview}"`;
    if (truncated) {
      const w = document.createElement('span');
      w.className = 'truncated-warn';
      w.textContent = ' (truncated to 5 000 chars)';
      q.appendChild(w);
    }

    shadowRoot.getElementById('model-badge').textContent = model;
    shadowRoot.getElementById('error-msg').style.display = 'none';

    // Reset thinking panel
    const wrap = shadowRoot.getElementById('thinking-wrap');
    wrap.classList.add('streaming');
    wrap.classList.remove('done', 'collapsed');
    setThinkingLabel('Initialising…');
    clearThinkingOutput();

    // Indeterminate progress bar
    const fill = shadowRoot.getElementById('step-fill');
    fill.className = 'indeterminate';
    fill.style.width = '';
  }

  function onStreamStep({ label }) {
    if (!shadowRoot) return;

    // Append a separator line in the stream showing the new step
    if (streamText.length > 0) {
      appendToStream('\n');
      const sep = document.createElement('span');
      sep.className = 'stream-step-line';
      sep.textContent = `\n── ${label} ──\n`;
      shadowRoot.getElementById('thinking-output').appendChild(sep);
      streamText += `\n── ${label} ──\n`;
    }

    setThinkingLabel(label);

    // Ensure thinking panel is expanded for each new step
    shadowRoot.getElementById('thinking-wrap').classList.remove('collapsed');
  }

  function onStreamChunk({ text }) {
    if (!shadowRoot) return;
    appendToStream(text);
  }

  function onFallacies({ fallacies }) {
    if (!shadowRoot) return;

    const section = shadowRoot.getElementById('fallacy-section');
    const body    = shadowRoot.getElementById('fallacy-body');
    const badge   = shadowRoot.getElementById('fallacy-badge');

    section.style.display = 'block';
    badge.textContent = String(fallacies.length);

    body.innerHTML = '';
    if (fallacies.length === 0) {
      body.innerHTML = `<p class="empty-msg">No logical fallacies detected.</p>`;
      return;
    }

    // Group instances by fallacy name (preserve first-seen order)
    const groups = new Map();
    for (const f of fallacies) {
      const key = (f.name || 'Unknown').trim();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(f);
    }

    for (const [name, instances] of groups) {
      const group = document.createElement('div');
      group.className = 'fallacy-group';

      // Header row — click to collapse/expand
      const header = document.createElement('div');
      header.className = 'fallacy-group-header';
      header.innerHTML = `
        <span>${esc(name)}</span>
        <span class="fallacy-count-pill">${instances.length}</span>
        <span class="fallacy-group-chevron">▾</span>
      `;
      header.addEventListener('click', () => group.classList.toggle('collapsed'));

      // Instance list
      const groupBody = document.createElement('div');
      groupBody.className = 'fallacy-group-body';
      for (const f of instances) {
        const inst = document.createElement('div');
        inst.className = 'fallacy-instance';
        inst.innerHTML = `
          <div class="fallacy-explanation">${esc(f.explanation || '')}</div>
          ${f.quote ? `<div class="fallacy-quote">${esc(f.quote)}</div>` : ''}
        `;
        groupBody.appendChild(inst);
      }

      group.appendChild(header);
      group.appendChild(groupBody);
      body.appendChild(group);
    }
  }

  function onPropaganda({ propaganda }) {
    if (!shadowRoot) return;

    const section = shadowRoot.getElementById('propaganda-section');
    const body    = shadowRoot.getElementById('propaganda-body');
    const badge   = shadowRoot.getElementById('propaganda-badge');

    section.style.display = 'block';
    badge.textContent = String(propaganda.length);

    body.innerHTML = '';
    if (propaganda.length === 0) {
      body.innerHTML = `<p class="empty-msg">No propaganda techniques detected.</p>`;
      return;
    }

    // Group instances by technique name
    const groups = new Map();
    for (const p of propaganda) {
      const key = (p.technique || 'Unknown').trim();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }

    for (const [technique, instances] of groups) {
      const group = document.createElement('div');
      group.className = 'propaganda-group';

      const header = document.createElement('div');
      header.className = 'propaganda-group-header';
      header.innerHTML = `
        <span>${esc(technique)}</span>
        <span class="propaganda-count-pill">${instances.length}</span>
        <span class="propaganda-group-chevron">▾</span>
      `;
      header.addEventListener('click', () => group.classList.toggle('collapsed'));

      const groupBody = document.createElement('div');
      groupBody.className = 'propaganda-group-body';
      for (const p of instances) {
        const sev = (p.severity || 'low').toLowerCase();
        const inst = document.createElement('div');
        inst.className = 'propaganda-instance';
        inst.innerHTML = `
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
            <span class="severity-pill severity-${sev}">${sev}</span>
          </div>
          <div class="propaganda-explanation">${esc(p.explanation || '')}</div>
          ${p.quote ? `<div class="propaganda-quote">${esc(p.quote)}</div>` : ''}
        `;
        groupBody.appendChild(inst);
      }

      group.appendChild(header);
      group.appendChild(groupBody);
      body.appendChild(group);
    }
  }

  function onClaimsStart({ claims }) {
    if (!shadowRoot) return;
    claimCount = claims.length;

    const section = shadowRoot.getElementById('fact-section');
    const body    = shadowRoot.getElementById('fact-body');
    const badge   = shadowRoot.getElementById('fact-badge');

    section.style.display = 'block';
    badge.innerHTML = `<span class="badge-plain">0 / ${claims.length}</span>`;

    body.innerHTML = '';
    if (claims.length === 0) {
      body.innerHTML = `<p class="empty-msg">No verifiable factual claims found.</p>`;
      return;
    }

    claims.forEach((claim, i) => {
      const item = document.createElement('div');
      item.className = 'claim-item';
      item.id = `claim-${i}`;
      item.innerHTML = `
        <div class="claim-row" id="claim-row-${i}">
          <div class="verdict-icon verdict-pending" id="verdict-icon-${i}">
            <span class="claim-spinner"></span>
          </div>
          <div style="flex:1">
            <div class="claim-text">${esc(claim)}</div>
            <div class="claim-label" id="claim-label-${i}">Checking…</div>
          </div>
        </div>
        <div class="claim-detail" id="claim-detail-${i}">
          <div class="claim-explanation" id="claim-exp-${i}"></div>
          <div class="sources-list" id="claim-sources-${i}"></div>
        </div>
      `;
      body.appendChild(item);
      if (i < claims.length - 1) {
        const hr = document.createElement('hr');
        hr.style.cssText = 'border:none;border-top:1px solid #eee;margin:4px 0';
        body.appendChild(hr);
      }
    });
  }

  function onClaimResult({ index, verdict, explanation, sources }) {
    if (!shadowRoot) return;
    const cfg    = VERDICT[verdict] || VERDICT.unverifiable;
    const icon   = shadowRoot.getElementById(`verdict-icon-${index}`);
    const lbl    = shadowRoot.getElementById(`claim-label-${index}`);
    const exp    = shadowRoot.getElementById(`claim-exp-${index}`);
    const src    = shadowRoot.getElementById(`claim-sources-${index}`);
    const detail = shadowRoot.getElementById(`claim-detail-${index}`);
    const row    = shadowRoot.getElementById(`claim-row-${index}`);
    if (!icon) return;

    icon.className   = `verdict-icon ${cfg.cls}`;
    icon.textContent = cfg.icon;
    lbl.textContent  = cfg.label;
    lbl.className    = `claim-label ${cfg.cls}`;

    const hasDetail = explanation || sources?.length > 0;

    if (explanation) exp.textContent = explanation;

    if (sources?.length > 0) {
      sources.forEach((s) => {
        const a = document.createElement('a');
        a.href = s.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.textContent = s.title || s.url;
        src.appendChild(a);
      });
    }

    if (hasDetail && row) {
      row.addEventListener('click', () => detail.classList.toggle('open'));
    }

    // Update fact badge tally (live, while claims are still loading)
    const badge   = shadowRoot.getElementById('fact-badge');
    const icons   = shadowRoot.querySelectorAll('.verdict-icon');
    const tN = [...icons].filter((el) => el.classList.contains('verdict-true')).length;
    const fN = [...icons].filter((el) => el.classList.contains('verdict-false')).length;
    const pN = [...icons].filter((el) => el.classList.contains('verdict-partial')).length;
    const uN = [...icons].filter((el) => el.classList.contains('verdict-unverifiable')).length;
    const done = tN + fN + pN + uN;
    badge.innerHTML = buildFactBadgeHtml(tN, fN, pN, uN, done, claimCount);
  }

  // Builds the coloured inner HTML for the fact-check section badge.
  // Pass done/total to show a live progress fraction; omit for the final summary.
  function buildFactBadgeHtml(t, f, p, u, done, total) {
    const chips = [
      `<span class="bc-true">${t}✓</span>`,
      `<span class="bc-false">${f}✗</span>`,
      `<span class="bc-partial">${p}~</span>`,
    ];
    if (u > 0) chips.push(`<span class="bc-unver">${u}?</span>`);
    if (done !== undefined && total !== undefined && done < total) {
      chips.push(`<span class="badge-plain">${done}/${total}</span>`);
    }
    return chips.join('');
  }

  function onComplete() {
    if (!shadowRoot) return;

    // ── Finalize progress bar ────────────────────────────────────────────────
    const fill = shadowRoot.getElementById('step-fill');
    fill.classList.remove('indeterminate');
    fill.style.width = '100%';

    // ── Wrap up thinking section ─────────────────────────────────────────────
    const wrap = shadowRoot.getElementById('thinking-wrap');
    wrap.classList.remove('streaming');
    wrap.classList.add('done');
    setThinkingLabel('Analysis complete — click to review AI reasoning');
    removeCursor();
    // Auto-collapse after a short pause so results panels take focus
    setTimeout(() => wrap.classList.add('collapsed'), 1200);

    // ── Finalize fact badge ───────────────────────────────────────────────────
    const icons2    = shadowRoot.querySelectorAll('.verdict-icon');
    const trueN     = [...icons2].filter((el) => el.classList.contains('verdict-true')).length;
    const falseN    = [...icons2].filter((el) => el.classList.contains('verdict-false')).length;
    const partialN  = [...icons2].filter((el) => el.classList.contains('verdict-partial')).length;
    const unverN    = [...icons2].filter((el) => el.classList.contains('verdict-unverifiable')).length;
    if (icons2.length > 0) {
      shadowRoot.getElementById('fact-badge').innerHTML =
        buildFactBadgeHtml(trueN, falseN, partialN, unverN);
    }

    // ── Footer ───────────────────────────────────────────────────────────────
    const footer = shadowRoot.getElementById('footer');
    footer.style.display = 'block';
    footer.textContent   = `Analysis complete · ${new Date().toLocaleTimeString()}`;
  }

  function onError({ error }) {
    if (!shadowRoot) return;
    const fill = shadowRoot.getElementById('step-fill');
    fill.classList.remove('indeterminate');
    fill.style.cssText = 'width:100%;background:#c0392b';

    const wrap = shadowRoot.getElementById('thinking-wrap');
    wrap.classList.remove('streaming');
    wrap.classList.add('done', 'collapsed');

    const errEl = shadowRoot.getElementById('error-msg');
    errEl.style.display = 'block';
    errEl.textContent   = error || 'An unknown error occurred.';
  }

  // ── Thinking stream helpers ──────────────────────────────────────────────────

  function setThinkingLabel(text) {
    const el = shadowRoot?.getElementById('thinking-step-label');
    if (!el) return;
    el.innerHTML = `<span class="step-tag">▶</span>${esc(text)}`;
  }

  function clearThinkingOutput() {
    const el = shadowRoot?.getElementById('thinking-output');
    if (!el) return;
    el.innerHTML = '<span class="ce-cursor"></span>';
    streamText = '';
  }

  function appendToStream(text) {
    const el = shadowRoot?.getElementById('thinking-output');
    if (!el) return;

    // Remove cursor, append text node, re-append cursor
    const cursor = el.querySelector('.ce-cursor');
    if (cursor) cursor.remove();

    el.appendChild(document.createTextNode(text));
    streamText += text;

    const newCursor = document.createElement('span');
    newCursor.className = 'ce-cursor';
    el.appendChild(newCursor);

    // Auto-scroll to bottom
    const wrap = shadowRoot.getElementById('thinking-output-wrap');
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
  }

  function removeCursor() {
    shadowRoot?.getElementById('thinking-output')?.querySelector('.ce-cursor')?.remove();
  }

  // ── Message listener ─────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    switch (msg.type) {
      case 'CE_SHOW':         onShow(msg);         break;
      case 'CE_STREAM_STEP':  onStreamStep(msg);   break;
      case 'CE_STREAM_CHUNK': onStreamChunk(msg);  break;
      case 'CE_FALLACIES':    onFallacies(msg);    break;
      case 'CE_PROPAGANDA':   onPropaganda(msg);   break;
      case 'CE_CLAIMS_START': onClaimsStart(msg);  break;
      case 'CE_CLAIM_RESULT': onClaimResult(msg);  break;
      case 'CE_COMPLETE':     onComplete();         break;
      case 'CE_ERROR':        onError(msg);         break;
    }
  });

  // ── Escape to close ───────────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById(HOST_ID)) destroyPanel();
  });

  // ── HTML escape utility ───────────────────────────────────────────────────────
  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
})();
