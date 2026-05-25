import { getProjectsData, getSessionsData, getCurrentProject } from './state.js';
import { showView } from './ui.js';
import { debounce } from './utils.js';
import { loadDashboard } from './views/dashboard.js';
import { loadProjects, loadSessions, loadMoreSessions, loadProjectConfig, loadProjectTools } from './views/projects.js';
import { loadMessages, appendMessages, getSessionMessages } from './views/messages.js';
import { loadHistory } from './views/history.js';
import { loadTools } from './views/tools.js';
import { loadConfig } from './views/config.js';

export function registerEventListeners() {
  document.getElementById('projects-list').addEventListener('click', (e) => {
    const card = e.target.closest('.project-card');
    if (!card) return;
    const idx = parseInt(card.dataset.index, 10);
    const projects = getProjectsData();
    if (!isNaN(idx) && projects[idx]) loadSessions(projects[idx]);
  });

  document.getElementById('projects-list').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.project-card');
    if (!card) return;
    e.preventDefault();
    const idx = parseInt(card.dataset.index, 10);
    const projects = getProjectsData();
    if (!isNaN(idx) && projects[idx]) loadSessions(projects[idx]);
  });

  document.getElementById('projects-pagination').addEventListener('click', (e) => {
    const btn = e.target.closest('.pag-btn');
    if (!btn) return;
    loadProjects(parseInt(btn.dataset.page, 10));
  });

  document.querySelector('.sessions-project-tabs').addEventListener('click', e => {
    const btn = e.target.closest('[data-project-tab]');
    if (!btn) return;
    const tab = btn.dataset.projectTab;
    document.querySelectorAll('[data-project-tab]').forEach(b => b.classList.toggle('active', b === btn));
    document.getElementById('project-sessions-pane').classList.toggle('active', tab === 'sessions');
    document.getElementById('project-config-pane').classList.toggle('active', tab === 'config');
    document.getElementById('project-tools-pane').classList.toggle('active', tab === 'tools');
    const project = getCurrentProject();
    if (project) {
      const tabPath = tab === 'sessions' ? '' : `/${tab}`;
      history.pushState({}, '', `/projects/${encodeURIComponent(project.id)}${tabPath}`);
    }
    if (tab === 'config' && project) loadProjectConfig(project);
    if (tab === 'tools' && project) loadProjectTools(project);
  });

  document.getElementById('back-btn').addEventListener('click', () => {
    history.pushState({}, '', '/projects');
    showView('projects');
  });

  document.getElementById('messages-back-btn').addEventListener('click', () => {
    const project = getCurrentProject();
    if (project) history.pushState({}, '', `/projects/${encodeURIComponent(project.id)}`);
    showView('sessions');
  });

  document.getElementById('sessions-list').addEventListener('click', (e) => {
    const item = e.target.closest('.session-item');
    if (!item) return;
    const idx = parseInt(item.dataset.index, 10);
    const sessions = getSessionsData();
    const project = getCurrentProject();
    if (!isNaN(idx) && sessions[idx] && project) loadMessages(project, sessions[idx]);
  });

  document.getElementById('sessions-list').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const item = e.target.closest('.session-item');
    if (!item) return;
    e.preventDefault();
    const idx = parseInt(item.dataset.index, 10);
    const sessions = getSessionsData();
    const project = getCurrentProject();
    if (!isNaN(idx) && sessions[idx] && project) loadMessages(project, sessions[idx]);
  });

  document.getElementById('sessions-load-more').addEventListener('click', (e) => {
    const btn = e.target.closest('.sessions-load-more-btn');
    if (!btn) return;
    const project = getCurrentProject();
    if (project) loadMoreSessions(project, parseInt(btn.dataset.page, 10));
  });

  document.getElementById('messages-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.raw-toggle-btn');
    if (!btn) return;
    const messageItem = btn.closest('.message-item');
    const raw = messageItem.querySelector('.message-raw');
    const opening = raw.hidden;
    // Lazily populate raw JSON content on first open (avoids stringifying all messages upfront)
    if (opening && !raw.textContent) {
      const idx = parseInt(btn.dataset.msgIndex, 10);
      const messages = getSessionMessages();
      if (!isNaN(idx) && messages[idx]) {
        raw.textContent = JSON.stringify(messages[idx].raw, null, 2);
      }
    }
    raw.hidden = !opening;
    btn.textContent = opening ? 'Hide' : 'Raw';
    btn.classList.toggle('active', opening);
  });

  document.getElementById('messages-load-more').addEventListener('click', (e) => {
    const btn = e.target.closest('.load-more-btn');
    if (!btn) return;
    const project = getCurrentProject();
    if (!project) return;
    const session = { id: decodeURIComponent(btn.dataset.sessionId) };
    appendMessages(project, session, parseInt(btn.dataset.page, 10));
  });

  document.getElementById('history-search').addEventListener('input', debounce((e) => {
    loadHistory(1, e.target.value);
  }, 300));

  document.getElementById('history-pagination').addEventListener('click', (e) => {
    const btn = e.target.closest('.pag-btn');
    if (!btn) return;
    loadHistory(parseInt(btn.dataset.page, 10));
  });

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const view = item.dataset.view;
      history.pushState({}, '', '/' + view);
      showView(view);
      if (view === 'dashboard') loadDashboard();
      else if (view === 'projects') loadProjects(1);
      else if (view === 'history') { document.getElementById('history-search').value = ''; loadHistory(1, ''); }
      else if (view === 'tools') loadTools();
      else if (view === 'config') loadConfig();
    });
  });
}
