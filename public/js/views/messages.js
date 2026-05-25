import { escapeHtml, formatDate } from '../utils.js';
import { showView } from '../ui.js';
import { renderBlocks } from '../renderers.js';

// Module-level store so raw JSON can be stringified lazily on click
let sessionMessages = [];
export function getSessionMessages() { return sessionMessages; }

export async function loadMessages(project, session, push = true) {
  if (push) history.pushState({}, '', `/projects/${encodeURIComponent(project.id)}/sessions/${encodeURIComponent(session.id)}`);
  document.getElementById('messages-session-title').textContent = session.title;
  document.getElementById('raw-file-btn').href =
    `/api/projects/${encodeURIComponent(project.id)}/sessions/${encodeURIComponent(session.id)}/raw`;
  showView('messages');

  sessionMessages = [];
  const container = document.getElementById('messages-list');
  const loadMoreEl = document.getElementById('messages-load-more');
  container.innerHTML = '<p class="loading">Loading messages...</p>';
  loadMoreEl.innerHTML = '';

  await _fetchMessagePage(project, session, 1, container, loadMoreEl, false);
}

export async function appendMessages(project, session, page) {
  const container = document.getElementById('messages-list');
  const loadMoreEl = document.getElementById('messages-load-more');
  loadMoreEl.innerHTML = '<p class="loading" style="padding:1rem;text-align:center">Loading...</p>';
  await _fetchMessagePage(project, session, page, container, loadMoreEl, true);
}

async function _fetchMessagePage(project, session, page, container, loadMoreEl, append) {
  try {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(project.id)}/sessions/${encodeURIComponent(session.id)}/messages?page=${page}&limit=100`
    );
    const { messages, total, totalPages } = await res.json();

    if (!append && messages.length === 0) {
      container.innerHTML = '<p class="empty">No messages found in this session.</p>';
      loadMoreEl.innerHTML = '';
      return;
    }

    const startIdx = sessionMessages.length;
    sessionMessages = sessionMessages.concat(messages);

    const html = messages.map((m, i) => {
      const absIdx = startIdx + i;
      return `
        <div class="message-item">
          <div class="message-header">
            <span class="message-role ${m.role}">${m.role === 'user' ? 'User' : m.role === 'tool' ? 'Tool Result' : 'Assistant'}</span>
            <span class="message-timestamp">${formatDate(m.timestamp)}</span>
            <button class="raw-toggle-btn" data-msg-index="${absIdx}">Raw</button>
          </div>
          ${renderBlocks(m.content)}
          <pre class="message-raw" hidden></pre>
        </div>`;
    }).join('');

    if (append) {
      container.insertAdjacentHTML('beforeend', html);
    } else {
      container.innerHTML = html || '<p class="empty">No messages found in this session.</p>';
    }

    if (page < totalPages) {
      loadMoreEl.innerHTML = `
        <div class="load-more-wrap">
          <span class="load-more-info">${sessionMessages.length} of ${total} messages</span>
          <button class="load-more-btn"
            data-page="${page + 1}"
            data-project-id="${encodeURIComponent(project.id)}"
            data-session-id="${encodeURIComponent(session.id)}">
            Load more messages
          </button>
        </div>`;
    } else {
      loadMoreEl.innerHTML = total > 100
        ? `<p class="load-more-info">${total} messages total</p>`
        : '';
    }
  } catch (err) {
    if (!append) {
      container.innerHTML = `<p class="empty error">Failed to load messages: ${escapeHtml(err.message)}</p>`;
    }
    loadMoreEl.innerHTML = '';
  }
}
