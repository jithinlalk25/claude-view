import { escapeHtml, formatDate } from '../utils.js';
import { showView } from '../ui.js';
import { setProjectsData, setSessionsData, appendSessionsData, setCurrentProject } from '../state.js';
import { renderToolsHtml } from '../renderers.js';

export async function loadProjects(page = 1) {
  const container = document.getElementById('projects-list');
  const pagEl = document.getElementById('projects-pagination');
  try {
    const res = await fetch(`/api/projects?page=${page}&limit=50`);
    const { projects, total, totalPages } = await res.json();
    setProjectsData(projects);

    if (projects.length === 0) {
      container.innerHTML = '<p class="empty">No Claude Code projects found in ~/.claude/projects/</p>';
      pagEl.innerHTML = '';
      return;
    }

    container.innerHTML = projects.map((p, i) => `
      <div class="project-card" data-index="${i}" role="button" tabindex="0">
        <div class="project-card-header">
          <span class="project-name">${escapeHtml(p.name)}</span>
          <span class="session-badge">${p.sessionCount} ${p.sessionCount === 1 ? 'session' : 'sessions'}</span>
        </div>
        <div class="project-path">${escapeHtml(p.path)}</div>
        ${p.lastActivity ? `<div class="project-meta">Last active ${formatDate(p.lastActivity)}</div>` : ''}
      </div>
    `).join('');

    if (totalPages > 1) {
      pagEl.innerHTML = `
        <div class="pagination-inner">
          <span class="pag-info">${total.toLocaleString()} projects · Page ${page} of ${totalPages}</span>
          <div class="pag-btns">
            ${page > 1 ? `<button class="pag-btn" data-page="${page - 1}">← Prev</button>` : ''}
            ${page < totalPages ? `<button class="pag-btn" data-page="${page + 1}">Next →</button>` : ''}
          </div>
        </div>`;
    } else {
      pagEl.innerHTML = '';
    }
  } catch (err) {
    container.innerHTML = `<p class="empty error">Failed to load projects: ${escapeHtml(err.message)}</p>`;
    pagEl.innerHTML = '';
  }
}

export async function loadSessions(project, push = true, tab = 'sessions') {
  setCurrentProject(project);
  const tabPath = tab === 'sessions' ? '' : `/${tab}`;
  if (push) history.pushState({}, '', `/projects/${encodeURIComponent(project.id)}${tabPath}`);
  document.getElementById('sessions-project-name').textContent = project.name;
  document.getElementById('sessions-project-path').textContent = project.path;
  document.querySelectorAll('[data-project-tab]').forEach(b =>
    b.classList.toggle('active', b.dataset.projectTab === tab));
  const sessionsTabEl = document.querySelector('[data-project-tab="sessions"]');
  if (sessionsTabEl) sessionsTabEl.textContent = 'Sessions';
  document.getElementById('project-sessions-pane').classList.toggle('active', tab === 'sessions');
  document.getElementById('project-config-pane').classList.toggle('active', tab === 'config');
  document.getElementById('project-tools-pane').classList.toggle('active', tab === 'tools');
  document.getElementById('project-config-content').dataset.loaded = '';
  document.getElementById('project-tools-content').dataset.loaded = '';
  showView('sessions');
  if (tab === 'config') loadProjectConfig(project);
  if (tab === 'tools') loadProjectTools(project);

  const container = document.getElementById('sessions-list');
  const loadMoreEl = document.getElementById('sessions-load-more');
  container.innerHTML = '<p class="loading">Loading sessions...</p>';
  loadMoreEl.innerHTML = '';
  setSessionsData([]);

  await _fetchSessionPage(project, 1, container, loadMoreEl, false);
}

export async function loadMoreSessions(project, page) {
  const container = document.getElementById('sessions-list');
  const loadMoreEl = document.getElementById('sessions-load-more');
  loadMoreEl.innerHTML = '<p class="loading" style="padding:1rem;text-align:center">Loading...</p>';
  await _fetchSessionPage(project, page, container, loadMoreEl, true);
}

async function _fetchSessionPage(project, page, container, loadMoreEl, append) {
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(project.id)}/sessions?page=${page}&limit=50`);
    const { sessions, total, totalPages } = await res.json();

    if (!append) {
      if (sessions.length === 0) {
        container.innerHTML = '<p class="empty">No sessions found for this project.</p>';
        loadMoreEl.innerHTML = '';
        return;
      }
      const sessionsTab = document.querySelector('[data-project-tab="sessions"]');
      if (sessionsTab) sessionsTab.textContent = `Sessions (${total})`;
    }

    const startIdx = append
      ? (document.querySelectorAll('#sessions-list .session-item').length)
      : 0;

    appendSessionsData(sessions);

    const html = sessions.map((s, i) => {
      const idx = startIdx + i;
      return `
        <div class="session-item" data-index="${idx}" role="button" tabindex="0">
          <span class="session-row-num">${idx + 1}</span>
          <div class="session-title">${escapeHtml(s.title)}</div>
          <div class="session-meta">
            <span>${s.messageCount} ${s.messageCount === 1 ? 'message' : 'messages'}</span>
            <span>${formatDate(s.createdAt)}</span>
          </div>
        </div>`;
    }).join('');

    if (append) {
      container.insertAdjacentHTML('beforeend', html);
    } else {
      container.innerHTML = html;
    }

    if (page < totalPages) {
      loadMoreEl.innerHTML = `
        <div class="load-more-wrap">
          <span class="load-more-info">${startIdx + sessions.length} of ${total} sessions</span>
          <button class="sessions-load-more-btn"
            data-page="${page + 1}"
            data-project-id="${encodeURIComponent(project.id)}">
            Load more sessions
          </button>
        </div>`;
    } else {
      loadMoreEl.innerHTML = '';
    }
  } catch (err) {
    if (!append) container.innerHTML = `<p class="empty error">Failed to load sessions: ${escapeHtml(err.message)}</p>`;
    loadMoreEl.innerHTML = '';
  }
}

export async function loadProjectConfig(project) {
  const container = document.getElementById('project-config-content');
  if (container.dataset.loaded && container.dataset.projectId === project.id) return;
  container.innerHTML = '<p class="loading">Loading config...</p>';
  container.dataset.loaded = '';
  container.dataset.projectId = project.id;

  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(project.id)}/config`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');

    const buildTree = (items) => {
      const root = { children: {} };
      for (const item of items) {
        const parts = item.label.split('/');
        let node = root;
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          if (!node.children[part]) node.children[part] = { name: part, isDir: true, children: {} };
          node = node.children[part];
        }
        const leaf = parts[parts.length - 1];
        node.children[leaf] = { name: leaf, isDir: false, item };
      }
      return root;
    };

    const renderTreeNodes = (node, depth) => {
      return Object.values(node.children).map(child => {
        const pad = `style="padding-left:calc(0.75rem + ${depth} * 1.25rem)"`;
        if (child.isDir) {
          return `
            <div class="tree-dir open">
              <div class="tree-dir-row" ${pad}>
                <span class="tree-chevron">▶</span>
                <span class="tree-node-icon tree-dir-icon">&#x1F4C1;</span>
                <span class="tree-node-name">${escapeHtml(child.name)}/</span>
              </div>
              <div class="tree-children">${renderTreeNodes(child, depth + 1)}</div>
            </div>`;
        } else {
          let displayContent = child.item.content;
          if (child.item.type === 'json') {
            try { displayContent = JSON.stringify(JSON.parse(child.item.content), null, 2); } catch {}
          }
          return `
            <div class="tree-file">
              <div class="tree-file-row" ${pad}>
                <span class="tree-chevron">▶</span>
                <span class="tree-node-icon tree-file-icon">&#x1F4C4;</span>
                <span class="tree-node-name">${escapeHtml(child.name)}</span>
              </div>
              <div class="tree-file-body">
                <pre class="block-code settings-code">${escapeHtml(displayContent)}</pre>
              </div>
            </div>`;
        }
      }).join('');
    };

    const renderSection = (items, title, pathLabel) => {
      const body = items.length === 0
        ? `<p class="empty">No ${title.toLowerCase()} config files found.</p>`
        : `<div class="file-tree">${renderTreeNodes(buildTree(items), 0)}</div>`;
      return `
        <div class="config-section">
          <div class="config-section-title">${escapeHtml(title)}</div>
          <div class="config-section-path">${escapeHtml(pathLabel)}</div>
          ${body}
        </div>`;
    };

    const globalItems = data.global.map(item => ({ ...item, label: item.label.replace(/^~\//, '') }));
    container.innerHTML =
      renderSection(data.project, 'Project Config', data.projectPath) +
      renderSection(globalItems, 'Global Config', '~/.claude');
    container.dataset.loaded = '1';

    // Event delegation instead of per-node listeners to avoid listener accumulation
    container.addEventListener('click', (e) => {
      const dirRow = e.target.closest('.tree-dir-row');
      if (dirRow) { dirRow.closest('.tree-dir').classList.toggle('open'); return; }
      const fileRow = e.target.closest('.tree-file-row');
      if (fileRow) { fileRow.closest('.tree-file').classList.toggle('expanded'); }
    });
  } catch (err) {
    container.innerHTML = `<p class="empty error">Failed to load config: ${escapeHtml(err.message)}</p>`;
  }
}

export async function loadProjectTools(project) {
  const container = document.getElementById('project-tools-content');
  if (container.dataset.loaded && container.dataset.projectId === project.id) return;
  container.innerHTML = '<p class="loading">Loading tools...</p>';
  container.dataset.loaded = '';
  container.dataset.projectId = project.id;

  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(project.id)}/tools`);
    const { skills, mcpServers, agents, plugins } = await res.json();
    container.innerHTML = renderToolsHtml({ skills, mcpServers, agents, plugins }, { showScopeBadge: true });
    container.dataset.loaded = '1';
  } catch (err) {
    container.innerHTML = `<p class="empty error">Failed to load tools: ${escapeHtml(err.message)}</p>`;
  }
}
