import { escapeHtml, formatDate } from '../utils.js';
import { setHistoryPage, setHistorySearch, getHistorySearch } from '../state.js';

export async function loadHistory(page = 1, search = getHistorySearch()) {
  setHistoryPage(page);
  setHistorySearch(search);
  const listEl = document.getElementById('history-list');
  const pagEl = document.getElementById('history-pagination');
  listEl.innerHTML = '<p class="loading">Loading...</p>';
  pagEl.innerHTML = '';

  try {
    const params = new URLSearchParams({ page, search });
    const res = await fetch(`/api/history?${params}`);
    const { items, total, totalPages } = await res.json();

    if (items.length === 0) {
      listEl.innerHTML = '<p class="empty">No history found.</p>';
      return;
    }

    listEl.innerHTML = items.map(item => `
      <div class="history-item">
        <div class="history-prompt">${escapeHtml(item.display)}</div>
        <div class="history-meta">
          ${item.project ? `<span class="history-project">${escapeHtml(item.project)}</span>` : ''}
          ${item.timestamp ? `<span>${formatDate(item.timestamp)}</span>` : ''}
        </div>
      </div>
    `).join('');

    pagEl.innerHTML = `
      <div class="pagination-inner">
        <span class="pag-info">${total.toLocaleString()} entries · Page ${page} of ${totalPages}</span>
        <div class="pag-btns">
          ${page > 1 ? `<button class="pag-btn" data-page="${page - 1}">← Prev</button>` : ''}
          ${page < totalPages ? `<button class="pag-btn" data-page="${page + 1}">Next →</button>` : ''}
        </div>
      </div>
    `;
  } catch (err) {
    listEl.innerHTML = `<p class="empty error">Failed to load history: ${escapeHtml(err.message)}</p>`;
  }
}
