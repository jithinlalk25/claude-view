# claude-view

Local web UI for browsing Claude Code session data.

## Stack

- **Backend**: Node.js + Express (`server.js`) — reads from `~/.claude/` directly: projects, history, usage-data, plans, plugins, settings
- **Frontend**: Single-page vanilla HTML/CSS/JS — no framework, no build step. Entry: `public/index.html` + `public/style.css`. Logic split into ES modules under `public/js/`: `main.js`, `router.js`, `state.js`, `events.js`, `ui.js`, `renderers.js`, `utils.js`, and view modules in `public/js/views/`

## Commands

```bash
npm start      # production
npm run dev    # nodemon watch mode
```

Runs at `http://localhost:3000`.

## Architecture

Data is read directly from `~/.claude/` — JSONL session transcripts, usage-data analytics, history.jsonl, skills, agents, plugins registry, and settings. UI state is managed in `public/js/state.js`; routing in `router.js`; per-view logic in `public/js/views/`.

## Views

- **Dashboard** — aggregate stats + active sessions (`~/.claude/sessions/`) + recent activity (`usage-data/session-meta/`)
- **Projects** — session browser: projects → sessions → messages (`~/.claude/projects/`). Each project has sub-tabs: **Sessions**, **Config** (CLAUDE.md, `.mcp.json`, `.claude/` config files, global `~/.claude.json`), **Tools** (project-scoped skills, MCP servers, agents)
- **History** — paginated, searchable prompt history (`~/.claude/history.jsonl`)
- **Tools** — global skills, MCP servers, agents, and plugins (`~/.claude/skills/`, `~/.claude/agents/`, `~/.claude/plugins/`)

## Theming

CSS custom properties in `style.css` drive dark/light/system themes. Theme is stored in `localStorage` under `claude-view-theme`. A flash-prevention script in `<head>` applies `data-theme` on `<html>` before first paint. Default is system (`prefers-color-scheme`).

All new features must be styled for both dark and light themes.
