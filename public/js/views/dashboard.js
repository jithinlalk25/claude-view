import { escapeHtml, formatDate, formatTokens, formatDuration } from '../utils.js';

export async function loadDashboard() {
  const container = document.getElementById('dashboard-content');
  container.innerHTML = '<p class="loading">Loading dashboard...</p>';
  try {
    const res = await fetch('/api/dashboard');
    const { activeSessions, stats, recentSessions } = await res.json();

    const activeHtml = activeSessions.length > 0 ? `
      <h3 class="section-title">Active Sessions</h3>
      <div class="sessions-list" style="margin-bottom:1.75rem">
        ${activeSessions.map(s => `
          <div class="session-item">
            <div class="session-title">${escapeHtml(s.name || s.cwd || 'Unknown')}</div>
            <div class="session-meta">
              <span class="status-badge ${escapeHtml(s.status || 'idle')}">${escapeHtml(s.status || 'idle')}</span>
              ${s.version ? `<span>v${escapeHtml(s.version)}</span>` : ''}
              <span>${escapeHtml(s.cwd || '')}</span>
              ${s.startedAt ? `<span>${formatDate(s.startedAt)}</span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    ` : '';

    const recentHtml = recentSessions.length > 0 ? `
      <h3 class="section-title">Recent Activity</h3>
      <div class="sessions-list">
        ${recentSessions.map(s => `
          <div class="session-item">
            <div class="session-title">${escapeHtml(s.first_prompt || 'No prompt')}</div>
            <div class="session-meta">
              <span class="history-project">${escapeHtml(s.project_path || '')}</span>
              ${s.duration_minutes ? `<span>${formatDuration(s.duration_minutes)}</span>` : ''}
              ${s.input_tokens ? `<span>↑ ${formatTokens(s.input_tokens)}</span>` : ''}
              ${s.output_tokens ? `<span>↓ ${formatTokens(s.output_tokens)}</span>` : ''}
              <span>${formatDate(s.start_time)}</span>
            </div>
          </div>
        `).join('')}
      </div>
    ` : '';

    container.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${stats.totalSessions.toLocaleString()}</div>
          <div class="stat-label">Sessions</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${formatTokens(stats.totalInputTokens)}</div>
          <div class="stat-label">Input Tokens</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${formatTokens(stats.totalOutputTokens)}</div>
          <div class="stat-label">Output Tokens</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.totalGitCommits.toLocaleString()}</div>
          <div class="stat-label">Git Commits</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${(stats.totalLinesAdded + stats.totalLinesRemoved).toLocaleString()}</div>
          <div class="stat-label">Lines Changed</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${formatDuration(stats.totalDurationMinutes)}</div>
          <div class="stat-label">Total Time</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.totalFilesModified.toLocaleString()}</div>
          <div class="stat-label">Files Modified</div>
        </div>
      </div>
      ${activeHtml}
      ${recentHtml}
    `;
  } catch (err) {
    container.innerHTML = `<p class="empty error">Failed to load dashboard: ${escapeHtml(err.message)}</p>`;
  }
}
