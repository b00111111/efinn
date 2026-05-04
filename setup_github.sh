#!/bin/bash
# Run this once from Terminal to initialize the git repo and push to GitHub.
# Usage: bash setup_github.sh
#
# Prerequisites: you must be logged in to GitHub CLI (gh auth login)
# or have SSH/HTTPS credentials configured for git.

set -e

REPO_NAME="efinn"
REPO_DESC="Efinn — Odin's third raven. Chrome extension that detects logical fallacies and fact-checks claims using Ollama, OpenAI, Anthropic, or OpenRouter."

cd "$(dirname "$0")"

# Remove any stale lock left by a previous attempt
rm -f .git/index.lock 2>/dev/null || true

# Init (safe to re-run; --initial-branch requires git >= 2.28)
if [ ! -d .git ]; then
  git init -b main
else
  git checkout -b main 2>/dev/null || git checkout main 2>/dev/null || true
fi

git config user.name  "Stephen Goddard"
git config user.email "stephen.goddard@gmail.com"

git add criticaleye/ .gitignore
git status

git commit -m "Initial commit — Efinn Chrome extension v1.1.0

Efinn is a Chrome extension that analyzes selected text for logical
fallacies and fact-checks factual claims using your choice of AI provider.

Named after Odin's imagined third raven — Efa (Doubt) — the one who
questions whether what the others brought back is actually true.

Features:
- Logical fallacy detection with collapsible grouped results
- Factual claim extraction and web-search-backed verification
- Streaming AI responses with live token display
- Provider support: Ollama (local), OpenAI, Anthropic, OpenRouter
- Color-coded fact-check verdict badges (true/false/partial/unverifiable)
- Custom prompt overrides per analysis type
- Debug log viewer in settings
- Shadow DOM panel — no style conflicts with host pages

Tech: Chrome MV3 service worker, SSE streaming, DuckDuckGo / SearXNG search"

# Create the GitHub repo and push (requires gh CLI: https://cli.github.com)
if command -v gh &>/dev/null; then
  gh repo create "$REPO_NAME" \
    --public \
    --description "$REPO_DESC" \
    --source . \
    --remote origin \
    --push
  echo ""
  echo "Done! Repo is live at: https://github.com/$(gh api user --jq .login)/$REPO_NAME"
else
  echo ""
  echo "gh CLI not found. Create the repo manually on github.com, then run:"
  echo "  git remote add origin https://github.com/YOUR_USERNAME/$REPO_NAME.git"
  echo "  git push -u origin main"
fi
