const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const readline = require('readline');
const fsp = fs.promises;

const app = express();
const PORT = process.env.PORT || 3000;
const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const CLAUDE_DIR = path.join(os.homedir(), '.claude');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', name: 'claude-view' });
});

// Read first 4KB of a session file to extract cwd without reading the whole file
async function extractCwdFromSession(filePath) {
  try {
    const fd = await fsp.open(filePath, 'r');
    const buf = Buffer.alloc(4096);
    const { bytesRead } = await fd.read(buf, 0, 4096, 0);
    await fd.close();
    const chunk = buf.toString('utf8', 0, bytesRead);
    for (const line of chunk.split('\n')) {
      try { const p = JSON.parse(line); if (p.cwd) return p.cwd; } catch {}
    }
  } catch {}
  return null;
}

// Walk a directory tree with depth and file count limits to prevent unbounded recursion
function walkDir(dir, labelPrefix, { maxDepth = 5, maxFiles = 200, exclude = new Set() } = {}) {
  const MAX_FILE_SIZE = 512 * 1024;
  const readSafe = (p) => { try { const s = fs.statSync(p); if (s.size > MAX_FILE_SIZE) return null; return fs.readFileSync(p, 'utf8'); } catch { return null; } };
  const fileType = (name) => name.endsWith('.json') ? 'json' : name.endsWith('.md') ? 'md' : 'text';
  const count = { n: 0 };
  const walk = (dir, labelPrefix, depth) => {
    if (depth > maxDepth || count.n >= maxFiles) return [];
    const entries = [];
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (exclude.has(entry.name)) continue;
        if (count.n >= maxFiles) break;
        const fullPath = path.join(dir, entry.name);
        const label = `${labelPrefix}/${entry.name}`;
        let stat;
        try { stat = fs.statSync(fullPath); } catch { continue; }
        if (stat.isDirectory()) {
          entries.push(...walk(fullPath, label, depth + 1));
        } else if (stat.isFile()) {
          const content = readSafe(fullPath);
          if (content !== null) { count.n++; entries.push({ label, type: fileType(entry.name), content }); }
        }
      }
    } catch {}
    return entries;
  };
  return walk(dir, labelPrefix, 0);
}

// Parse YAML-style frontmatter from a markdown/text file
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let val = line.slice(colonIdx + 1).trim();
    if (val === 'true') val = true;
    else if (val === 'false') val = false;
    fm[key] = val;
  }
  return fm;
}

// Parse a session JSONL file into metadata (streaming readline — non-blocking)
async function parseSessionFile(filePath) {
  let title = null, createdAt = null, updatedAt = null, messageCount = 0, projectPath = null;
  try {
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (!line.trim()) continue;
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      if (entry.cwd && !projectPath) projectPath = entry.cwd;
      if (entry.timestamp) {
        if (!createdAt || entry.timestamp < createdAt) createdAt = entry.timestamp;
        if (!updatedAt || entry.timestamp > updatedAt) updatedAt = entry.timestamp;
      }
      if (entry.type === 'user' && !entry.isMeta) {
        const rawContent = entry.message?.content;
        const text = typeof rawContent === 'string' ? rawContent
          : Array.isArray(rawContent) ? (rawContent.find(c => c.type === 'text')?.text || '') : '';
        const isCommand = /<command-name>|<local-command-caveat>|<command-message>|<local-command-stdout>|<system-reminder>/.test(text);
        if (!isCommand) {
          messageCount++;
          if (!title && text.trim()) title = text.trim().substring(0, 120);
        }
      }
      if (entry.type === 'assistant') messageCount++;
    }
  } catch {
    return { title: 'Untitled session', createdAt, updatedAt, messageCount, projectPath };
  }
  return { title: title || 'Untitled session', createdAt, updatedAt, messageCount, projectPath };
}

// /api/projects — paginated project listing
// Strategy: parallel stat+readdir for mtime sort key, paginate first,
//            then only read session files for the current page.
app.get('/api/projects', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  try {
    let entries = [];
    try { entries = await fsp.readdir(PROJECTS_DIR, { withFileTypes: true }); } catch {}
    const dirEntries = entries.filter(e => e.isDirectory());

    // Parallel: get mtime + session file list for all project dirs (cheap, no content reads)
    const dirInfos = await Promise.all(dirEntries.map(async entry => {
      const projectDir = path.join(PROJECTS_DIR, entry.name);
      try {
        const [stat, files] = await Promise.all([fsp.stat(projectDir), fsp.readdir(projectDir)]);
        const sessionFiles = files.filter(f => f.endsWith('.jsonl'));
        if (!sessionFiles.length) return null;
        return { name: entry.name, mtime: stat.mtime, sessionCount: sessionFiles.length, sessionFiles };
      } catch { return null; }
    }));

    const valid = dirInfos.filter(Boolean);
    valid.sort((a, b) => b.mtime - a.mtime);

    const total = valid.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const pageItems = valid.slice((page - 1) * limit, page * limit);

    // Parallel: extract cwd only for current page (first 4KB per session file)
    const projects = await Promise.all(pageItems.map(async d => {
      let projectPath = null;
      for (const sf of d.sessionFiles) {
        projectPath = await extractCwdFromSession(path.join(PROJECTS_DIR, d.name, sf));
        if (projectPath) break;
      }
      if (!projectPath) projectPath = d.name.replace(/^-/, '/').replace(/-/g, '/');
      return {
        id: d.name,
        name: path.basename(projectPath),
        path: projectPath,
        sessionCount: d.sessionCount,
        lastActivity: d.mtime.toISOString(),
      };
    }));

    res.json({ projects, total, page, totalPages, limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// /api/projects/:id/sessions — paginated session listing
// Strategy: stat all session files for mtime sort, paginate first,
//            then parse metadata only for current page.
app.get('/api/projects/:id/sessions', async (req, res) => {
  const projectDir = path.resolve(PROJECTS_DIR, req.params.id);
  if (!projectDir.startsWith(PROJECTS_DIR + path.sep) && projectDir !== PROJECTS_DIR) {
    return res.status(400).json({ error: 'Invalid project id' });
  }
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  try {
    try { await fsp.access(projectDir); } catch { return res.status(404).json({ error: 'Project not found' }); }

    const allFiles = await fsp.readdir(projectDir);
    const jsonlFiles = allFiles.filter(f => f.endsWith('.jsonl'));

    // Parallel: stat all session files for mtime-based sort (no content reads yet)
    const statResults = await Promise.all(jsonlFiles.map(async sf => {
      const sfPath = path.join(projectDir, sf);
      try {
        const stat = await fsp.stat(sfPath);
        return { id: sf.replace('.jsonl', ''), path: sfPath, mtime: stat.mtime };
      } catch { return null; }
    }));

    const valid = statResults.filter(Boolean);
    valid.sort((a, b) => b.mtime - a.mtime);

    const total = valid.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const pageSessions = valid.slice((page - 1) * limit, page * limit);

    // Parallel: parse metadata only for current page (streaming reads)
    const sessions = await Promise.all(pageSessions.map(async s => {
      const meta = await parseSessionFile(s.path);
      return { id: s.id, ...meta };
    }));

    res.json({ sessions, total, page, totalPages, limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/projects/:id/config', async (req, res) => {
  const projectDir = path.resolve(PROJECTS_DIR, req.params.id);
  if (!projectDir.startsWith(PROJECTS_DIR + path.sep) && projectDir !== PROJECTS_DIR) {
    return res.status(400).json({ error: 'Invalid project id' });
  }
  try {
    let projectPath = null;
    let sessionFiles = [];
    try { sessionFiles = (await fsp.readdir(projectDir)).filter(f => f.endsWith('.jsonl')); } catch {}
    for (const sf of sessionFiles) {
      if (projectPath) break;
      projectPath = await extractCwdFromSession(path.join(projectDir, sf));
    }
    if (!projectPath) projectPath = req.params.id.replace(/^-/, '/').replace(/-/g, '/');

    const readFile = (p) => { try { const s = fs.statSync(p); if (s.size > 512 * 1024) return null; return fs.readFileSync(p, 'utf8'); } catch { return null; } };
    const fileType = (name) => name.endsWith('.json') ? 'json' : name.endsWith('.md') ? 'md' : 'text';

    const clDotDir = path.join(projectPath, '.claude');
    const result = { projectPath, project: [], global: [] };

    for (const name of ['CLAUDE.md', '.mcp.json', '.worktreeinclude']) {
      const content = readFile(path.join(projectPath, name));
      if (content !== null) result.project.push({ label: name, type: fileType(name), content });
    }
    result.project.push(...walkDir(clDotDir, '.claude', { maxFiles: 200 }));

    const claudeJsonContent = readFile(path.join(os.homedir(), '.claude.json'));
    if (claudeJsonContent !== null) result.global.push({ label: '~/.claude.json', type: 'json', content: claudeJsonContent });
    for (const name of ['CLAUDE.md', 'settings.json', 'keybindings.json']) {
      const content = readFile(path.join(CLAUDE_DIR, name));
      if (content !== null) result.global.push({ label: `~/.claude/${name}`, type: fileType(name), content });
    }
    for (const dir of ['themes', 'rules', 'skills', 'commands', 'output-styles', 'agents', 'agent-memory']) {
      result.global.push(...walkDir(path.join(CLAUDE_DIR, dir), `~/.claude/${dir}`, { maxFiles: 50 }));
    }
    result.global.push(...walkDir(path.join(PROJECTS_DIR, req.params.id, 'memory'), `~/.claude/projects/${req.params.id}/memory`, { maxFiles: 50 }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/projects/:id/tools', async (req, res) => {
  const projectDir = path.resolve(PROJECTS_DIR, req.params.id);
  if (!projectDir.startsWith(PROJECTS_DIR + path.sep) && projectDir !== PROJECTS_DIR) {
    return res.status(400).json({ error: 'Invalid project id' });
  }
  try {
    let projectPath = null;
    let sessionFiles = [];
    try { sessionFiles = (await fsp.readdir(projectDir)).filter(f => f.endsWith('.jsonl')); } catch {}
    for (const sf of sessionFiles) {
      if (projectPath) break;
      projectPath = await extractCwdFromSession(path.join(projectDir, sf));
    }
    if (!projectPath) projectPath = req.params.id.replace(/^-/, '/').replace(/-/g, '/');

    const result = { skills: [], mcpServers: [], agents: [], plugins: [] };
    const clDotDir = path.join(projectPath, '.claude');

    // Project-level skills
    try {
      const entries = await fsp.readdir(path.join(clDotDir, 'skills'), { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        try {
          const content = await fsp.readFile(path.join(clDotDir, 'skills', entry.name, 'SKILL.md'), 'utf8');
          const fm = parseFrontmatter(content);
          let supportingFiles = [];
          try { supportingFiles = (await fsp.readdir(path.join(clDotDir, 'skills', entry.name))).filter(f => f !== 'SKILL.md'); } catch {}
          result.skills.push({ name: fm.name || entry.name, description: fm.description || null, disableModelInvocation: fm['disable-model-invocation'] === true || fm['disable-model-invocation'] === 'true', userInvocable: fm['user-invocable'] !== false && fm['user-invocable'] !== 'false', argumentHint: fm['argument-hint'] || null, supportingFiles, scope: 'project' });
        } catch {}
      }
    } catch {}

    // Global skills
    try {
      const entries = await fsp.readdir(path.join(CLAUDE_DIR, 'skills'), { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        try {
          const content = await fsp.readFile(path.join(CLAUDE_DIR, 'skills', entry.name, 'SKILL.md'), 'utf8');
          const fm = parseFrontmatter(content);
          let supportingFiles = [];
          try { supportingFiles = (await fsp.readdir(path.join(CLAUDE_DIR, 'skills', entry.name))).filter(f => f !== 'SKILL.md'); } catch {}
          result.skills.push({ name: fm.name || entry.name, description: fm.description || null, disableModelInvocation: fm['disable-model-invocation'] === true || fm['disable-model-invocation'] === 'true', userInvocable: fm['user-invocable'] !== false && fm['user-invocable'] !== 'false', argumentHint: fm['argument-hint'] || null, supportingFiles, scope: 'global' });
        } catch {}
      }
    } catch {}
    result.skills.sort((a, b) => a.scope === b.scope ? a.name.localeCompare(b.name) : a.scope === 'project' ? -1 : 1);

    // Project-level MCP servers (.mcp.json at project root)
    try {
      const mcpJson = JSON.parse(await fsp.readFile(path.join(projectPath, '.mcp.json'), 'utf8'));
      const servers = mcpJson.mcpServers || {};
      for (const [name, config] of Object.entries(servers)) {
        result.mcpServers.push({ name, command: config.command || null, args: config.args || [], envKeys: config.env ? Object.keys(config.env) : [], scope: 'project' });
      }
    } catch {}

    // Global MCP servers (~/.claude.json)
    try {
      const claudeJson = JSON.parse(await fsp.readFile(path.join(os.homedir(), '.claude.json'), 'utf8'));
      const servers = claudeJson.mcpServers || {};
      for (const [name, config] of Object.entries(servers)) {
        result.mcpServers.push({ name, command: config.command || null, args: config.args || [], envKeys: config.env ? Object.keys(config.env) : [], scope: 'global' });
      }
    } catch {}
    result.mcpServers.sort((a, b) => a.scope === b.scope ? a.name.localeCompare(b.name) : a.scope === 'project' ? -1 : 1);

    // Project-level agents
    try {
      const entries = await fsp.readdir(path.join(clDotDir, 'agents'), { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
        try {
          const content = await fsp.readFile(path.join(clDotDir, 'agents', entry.name), 'utf8');
          const fm = parseFrontmatter(content);
          result.agents.push({ name: fm.name || entry.name.replace(/\.md$/, ''), description: fm.description || null, allowedTools: fm['allowed-tools'] || null, scope: 'project' });
        } catch {}
      }
    } catch {}

    // Global agents
    try {
      const entries = await fsp.readdir(path.join(CLAUDE_DIR, 'agents'), { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
        try {
          const content = await fsp.readFile(path.join(CLAUDE_DIR, 'agents', entry.name), 'utf8');
          const fm = parseFrontmatter(content);
          result.agents.push({ name: fm.name || entry.name.replace(/\.md$/, ''), description: fm.description || null, allowedTools: fm['allowed-tools'] || null, scope: 'global' });
        } catch {}
      }
    } catch {}
    result.agents.sort((a, b) => a.scope === b.scope ? a.name.localeCompare(b.name) : a.scope === 'project' ? -1 : 1);

    // Plugins (global only)
    try {
      const data = JSON.parse(await fsp.readFile(path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json'), 'utf8'));
      const installedPlugins = data.plugins || {};
      let enabledPlugins = {};
      try {
        const settings = JSON.parse(await fsp.readFile(path.join(CLAUDE_DIR, 'settings.json'), 'utf8'));
        enabledPlugins = settings.enabledPlugins || {};
      } catch {}
      result.plugins = Object.entries(installedPlugins).map(([fullName, installs]) => {
        const install = Array.isArray(installs) ? installs[0] : installs;
        const atIdx = fullName.indexOf('@');
        const name = atIdx !== -1 ? fullName.slice(0, atIdx) : fullName;
        const source = atIdx !== -1 ? fullName.slice(atIdx + 1) : null;
        return { fullName, name, source, version: install?.version || null, scope: install?.scope || null, enabled: enabledPlugins[fullName] !== false };
      });
      result.plugins.sort((a, b) => a.name.localeCompare(b.name));
    } catch {}

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/projects/:id/sessions/:sessionId/raw', async (req, res) => {
  const projectDir = path.resolve(PROJECTS_DIR, req.params.id);
  if (!projectDir.startsWith(PROJECTS_DIR + path.sep) && projectDir !== PROJECTS_DIR) {
    return res.status(400).json({ error: 'Invalid project id' });
  }
  const sessionFile = path.resolve(projectDir, req.params.sessionId + '.jsonl');
  if (!sessionFile.startsWith(projectDir + path.sep)) {
    return res.status(400).json({ error: 'Invalid session id' });
  }
  try { await fsp.access(sessionFile); } catch { return res.status(404).send('Session not found'); }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.sendFile(sessionFile);
});

// /api/.../messages — paginated, streaming parse
// Streams the JSONL file with readline: only loads `limit` messages into memory,
// counts total in a single pass. O(limit) memory regardless of session size.
app.get('/api/projects/:id/sessions/:sessionId/messages', async (req, res) => {
  const projectDir = path.resolve(PROJECTS_DIR, req.params.id);
  if (!projectDir.startsWith(PROJECTS_DIR + path.sep) && projectDir !== PROJECTS_DIR) {
    return res.status(400).json({ error: 'Invalid project id' });
  }
  const sessionFile = path.resolve(projectDir, req.params.sessionId + '.jsonl');
  if (!sessionFile.startsWith(projectDir + path.sep)) {
    return res.status(400).json({ error: 'Invalid session id' });
  }
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 100));

  try {
    try { await fsp.access(sessionFile); } catch { return res.status(404).json({ error: 'Session not found' }); }

    const messages = [];
    let total = 0;
    const skip = (page - 1) * limit;

    const rl = readline.createInterface({
      input: fs.createReadStream(sessionFile, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line.trim()) continue;
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }

      if (entry.isMeta) continue;
      if (entry.type !== 'user' && entry.type !== 'assistant') continue;

      const rawContent = entry.message?.content;
      const blocks = [];

      if (typeof rawContent === 'string') {
        const cmdMatch = rawContent.match(/<command-name>([^<]*)<\/command-name>/);
        if (cmdMatch) {
          blocks.push({ type: 'slash_command', command: cmdMatch[1].trim() });
        } else if (rawContent.trim()) {
          blocks.push({ type: 'text', text: rawContent });
        }
      } else if (Array.isArray(rawContent)) {
        const textBlocks = rawContent.filter(c => c.type === 'text');
        const cmdBlock = textBlocks.find(c => /<command-name>/.test(c.text || ''));
        if (cmdBlock) {
          const cmdMatch = cmdBlock.text.match(/<command-name>([^<]*)<\/command-name>/);
          if (cmdMatch) blocks.push({ type: 'slash_command', command: cmdMatch[1].trim() });
        } else {
          for (const block of rawContent) {
            switch (block.type) {
              case 'text':
                if (block.text) blocks.push({ type: 'text', text: block.text });
                break;
              case 'thinking':
                if (block.thinking) blocks.push({ type: 'thinking', text: block.thinking });
                break;
              case 'tool_use':
                blocks.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input });
                break;
              case 'tool_result': {
                let resultText = '';
                if (Array.isArray(block.content)) {
                  resultText = block.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
                } else if (typeof block.content === 'string') {
                  resultText = block.content;
                }
                blocks.push({ type: 'tool_result', tool_use_id: block.tool_use_id, text: resultText });
                break;
              }
              case 'image':
                blocks.push({ type: 'image' });
                break;
            }
          }
        }
      }

      if (blocks.length === 0) continue;

      total++;
      if (total > skip && total <= skip + limit) {
        const isToolResult = blocks.every(b => b.type === 'tool_result');
        messages.push({
          uuid: entry.uuid,
          role: isToolResult ? 'tool' : (entry.message?.role || entry.type),
          timestamp: entry.timestamp,
          content: blocks,
          raw: entry,
        });
      }
    }

    res.json({ messages, total, page, totalPages: Math.ceil(total / limit) || 1, limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dashboard: active sessions + aggregate stats from usage-data
app.get('/api/dashboard', async (req, res) => {
  try {
    const sessionsDir = path.join(CLAUDE_DIR, 'sessions');
    const sessionMetaDir = path.join(CLAUDE_DIR, 'usage-data', 'session-meta');

    let activeSessions = [];
    try {
      const files = (await fsp.readdir(sessionsDir)).filter(f => f.endsWith('.json'));
      const loaded = await Promise.all(files.map(async f => {
        try { return JSON.parse(await fsp.readFile(path.join(sessionsDir, f), 'utf8')); } catch { return null; }
      }));
      activeSessions = loaded.filter(Boolean).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    } catch {}

    const stats = { totalSessions: 0, totalInputTokens: 0, totalOutputTokens: 0, totalGitCommits: 0, totalLinesAdded: 0, totalLinesRemoved: 0, totalFilesModified: 0, totalDurationMinutes: 0 };
    let recentSessions = [];

    try {
      const metaFiles = (await fsp.readdir(sessionMetaDir)).filter(f => f.endsWith('.json'));
      stats.totalSessions = metaFiles.length;

      for (const f of metaFiles) {
        try {
          const data = JSON.parse(await fsp.readFile(path.join(sessionMetaDir, f), 'utf8'));
          stats.totalInputTokens += data.input_tokens || 0;
          stats.totalOutputTokens += data.output_tokens || 0;
          stats.totalGitCommits += data.git_commits || 0;
          stats.totalLinesAdded += data.lines_added || 0;
          stats.totalLinesRemoved += data.lines_removed || 0;
          stats.totalFilesModified += data.files_modified || 0;
          stats.totalDurationMinutes += data.duration_minutes || 0;

          // Maintain a bounded top-5 list instead of accumulating all into memory
          recentSessions.push(data);
          if (recentSessions.length > 10) {
            recentSessions.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
            recentSessions.length = 5;
          }
        } catch {}
      }
    } catch {}

    recentSessions.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
    if (recentSessions.length > 5) recentSessions.length = 5;
    const recentMapped = recentSessions.map(m => ({
      session_id: m.session_id,
      project_path: m.project_path,
      start_time: m.start_time,
      duration_minutes: m.duration_minutes,
      first_prompt: m.first_prompt,
      input_tokens: m.input_tokens,
      output_tokens: m.output_tokens,
    }));

    res.json({ activeSessions, stats, recentSessions: recentMapped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// History cache: invalidated by file mtime change so searches are fast
let historyCache = null;
let historyCacheMtime = 0;

// History: paginated and searchable — streaming parse with mtime-based in-memory cache
app.get('/api/history', async (req, res) => {
  const historyFile = path.join(CLAUDE_DIR, 'history.jsonl');
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = 50;
  const search = (req.query.search || '').toLowerCase().trim().slice(0, 200);

  try {
    let allEntries = historyCache;

    // Rebuild cache only when file has changed (mtime-based invalidation)
    try {
      const stat = await fsp.stat(historyFile);
      const mtime = stat.mtimeMs;
      if (!allEntries || historyCacheMtime !== mtime) {
        allEntries = [];
        const rl = readline.createInterface({
          input: fs.createReadStream(historyFile, { encoding: 'utf8' }),
          crlfDelay: Infinity,
        });
        for await (const line of rl) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            if (entry.display) allEntries.push(entry);
          } catch {}
        }
        allEntries.reverse(); // newest-first
        historyCache = allEntries;
        historyCacheMtime = mtime;
      }
    } catch {}
    allEntries = allEntries || [];

    const entries = search
      ? allEntries.filter(e =>
          e.display.toLowerCase().includes(search) ||
          (e.project || '').toLowerCase().includes(search))
      : allEntries;

    const total = entries.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const items = entries.slice((page - 1) * pageSize, page * pageSize);
    res.json({ items, total, page, totalPages, pageSize });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tools: global skills, MCP servers, agents, plugins
app.get('/api/tools', async (req, res) => {
  const result = { skills: [], mcpServers: [], agents: [], plugins: [] };

  const skillsDir = path.join(CLAUDE_DIR, 'skills');
  try {
    const entries = await fsp.readdir(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const content = await fsp.readFile(path.join(skillsDir, entry.name, 'SKILL.md'), 'utf8');
        const fm = parseFrontmatter(content);
        let supportingFiles = [];
        try { supportingFiles = (await fsp.readdir(path.join(skillsDir, entry.name))).filter(f => f !== 'SKILL.md'); } catch {}
        result.skills.push({
          name: fm.name || entry.name,
          description: fm.description || null,
          disableModelInvocation: fm['disable-model-invocation'] === true || fm['disable-model-invocation'] === 'true',
          userInvocable: fm['user-invocable'] !== false && fm['user-invocable'] !== 'false',
          argumentHint: fm['argument-hint'] || null,
          supportingFiles,
        });
      } catch {}
    }
    result.skills.sort((a, b) => a.name.localeCompare(b.name));
  } catch {}

  try {
    const claudeJson = JSON.parse(await fsp.readFile(path.join(os.homedir(), '.claude.json'), 'utf8'));
    const servers = claudeJson.mcpServers || {};
    result.mcpServers = Object.entries(servers).map(([name, config]) => ({
      name,
      command: config.command || null,
      args: config.args || [],
      envKeys: config.env ? Object.keys(config.env) : [],
      scope: 'user',
    }));
    result.mcpServers.sort((a, b) => a.name.localeCompare(b.name));
  } catch {}

  const agentsDir = path.join(CLAUDE_DIR, 'agents');
  try {
    const entries = await fsp.readdir(agentsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      try {
        const content = await fsp.readFile(path.join(agentsDir, entry.name), 'utf8');
        const fm = parseFrontmatter(content);
        result.agents.push({
          name: fm.name || entry.name.replace(/\.md$/, ''),
          description: fm.description || null,
          allowedTools: fm['allowed-tools'] || null,
        });
      } catch {}
    }
    result.agents.sort((a, b) => a.name.localeCompare(b.name));
  } catch {}

  try {
    const data = JSON.parse(await fsp.readFile(path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json'), 'utf8'));
    const installedPlugins = data.plugins || {};
    let enabledPlugins = {};
    try {
      const settings = JSON.parse(await fsp.readFile(path.join(CLAUDE_DIR, 'settings.json'), 'utf8'));
      enabledPlugins = settings.enabledPlugins || {};
    } catch {}
    result.plugins = Object.entries(installedPlugins).map(([fullName, installs]) => {
      const install = Array.isArray(installs) ? installs[0] : installs;
      const atIdx = fullName.indexOf('@');
      const name = atIdx !== -1 ? fullName.slice(0, atIdx) : fullName;
      const source = atIdx !== -1 ? fullName.slice(atIdx + 1) : null;
      return {
        fullName, name, source,
        version: install?.version || null,
        scope: install?.scope || null,
        enabled: enabledPlugins[fullName] !== false,
      };
    });
    result.plugins.sort((a, b) => a.name.localeCompare(b.name));
  } catch {}

  res.json(result);
});

// Global config: ~/.claude.json + files/dirs from ~/.claude/
app.get('/api/config', async (req, res) => {
  try {
    const readFile = (p) => { try { const s = fs.statSync(p); if (s.size > 512 * 1024) return null; return fs.readFileSync(p, 'utf8'); } catch { return null; } };
    const fileType = (name) => name.endsWith('.json') ? 'json' : name.endsWith('.md') ? 'md' : 'text';

    const items = [];
    const claudeJsonContent = readFile(path.join(os.homedir(), '.claude.json'));
    if (claudeJsonContent !== null) items.push({ label: '~/.claude.json', type: 'json', content: claudeJsonContent });
    for (const name of ['CLAUDE.md', 'settings.json', 'keybindings.json']) {
      const content = readFile(path.join(CLAUDE_DIR, name));
      if (content !== null) items.push({ label: `~/.claude/${name}`, type: fileType(name), content });
    }
    for (const dir of ['themes', 'rules', 'skills', 'commands', 'output-styles', 'agents', 'agent-memory']) {
      items.push(...walkDir(path.join(CLAUDE_DIR, dir), `~/.claude/${dir}`, { maxFiles: 50 }));
    }
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve index.html for all non-API routes so client-side routing works on reload
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Claude View running at http://localhost:${PORT}`);
});
