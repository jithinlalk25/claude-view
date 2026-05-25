import { getProjectsData, getSessionsData } from './state.js';
import { showView } from './ui.js';
import { loadDashboard } from './views/dashboard.js';
import { loadProjects, loadSessions } from './views/projects.js';
import { loadMessages } from './views/messages.js';
import { loadHistory } from './views/history.js';
import { loadTools } from './views/tools.js';
import { loadConfig } from './views/config.js';

const THEME_KEY = 'claude-view-theme';

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themeValue === theme);
  });
}

export function registerThemeHandlers() {
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.themeValue;
      localStorage.setItem(THEME_KEY, t);
      applyTheme(t);
    });
  });
}

async function handleRoute(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const root = parts[0];

  if (!root || root === 'dashboard') {
    showView('dashboard');
    loadDashboard();
    return;
  }
  if (root === 'history') { showView('history'); loadHistory(1, ''); return; }
  if (root === 'tools') { showView('tools'); loadTools(); return; }
  if (root === 'config') { showView('config'); loadConfig(); return; }

  if (root === 'projects') {
    const projectId = decodeURIComponent(parts[1] || '');
    if (!projectId) { showView('projects'); return; }

    // Try cache first; if not found (paginated away), construct a stub from the id
    let project = getProjectsData().find(p => p.id === projectId);
    if (!project) {
      const projectPath = projectId.replace(/^-/, '/').replace(/-/g, '/');
      const name = projectPath.split('/').filter(Boolean).pop() || projectId;
      project = { id: projectId, name, path: projectPath };
    }

    const subPath = parts[2] || '';
    if (subPath === 'config' || subPath === 'tools') {
      await loadSessions(project, false, subPath);
    } else {
      await loadSessions(project, false, 'sessions');
      if (parts.length === 4 && subPath === 'sessions') {
        const sessionId = decodeURIComponent(parts[3]);
        const session = getSessionsData().find(s => s.id === sessionId);
        if (session) await loadMessages(project, session, false);
      }
    }
    return;
  }

  showView('dashboard');
  loadDashboard();
}

export function registerRouter() {
  window.addEventListener('popstate', () => handleRoute(window.location.pathname));
}

export async function init() {
  await loadProjects();
  await handleRoute(window.location.pathname);
}
