import { escapeHtml } from '../utils.js';
import { renderToolsHtml } from '../renderers.js';

export async function loadTools() {
  const container = document.getElementById('tools-content');
  if (container.dataset.loaded) return;
  container.innerHTML = '<p class="loading">Loading tools...</p>';
  try {
    const res = await fetch('/api/tools');
    const { skills, mcpServers, agents, plugins } = await res.json();
    container.innerHTML = renderToolsHtml({ skills, mcpServers, agents, plugins }, { showScopeBadge: false });
    container.dataset.loaded = '1';
  } catch (err) {
    container.innerHTML = `<p class="empty error">Failed to load tools: ${escapeHtml(err.message)}</p>`;
  }
}
