import { escapeHtml } from './utils.js';

export function renderBlocks(blocks) {
  return blocks.map(block => {
    switch (block.type) {
      case 'text':
        return `<div class="block-text">${escapeHtml(block.text)}</div>`;
      case 'thinking':
        return `<div class="block-thinking"><span class="block-label">Thinking</span><div class="block-thinking-body">${escapeHtml(block.text)}</div></div>`;
      case 'tool_use':
        return `<div class="block-tool-use"><span class="block-label tool-label">${escapeHtml(block.name)}</span><pre class="block-code">${escapeHtml(JSON.stringify(block.input, null, 2))}</pre></div>`;
      case 'tool_result':
        return `<div class="block-tool-result"><span class="block-label result-label">Result</span><pre class="block-code">${escapeHtml(block.text)}</pre></div>`;
      case 'slash_command':
        return `<div class="block-slash-command"><span class="slash-command-text">${escapeHtml(block.command)}</span></div>`;
      case 'image':
        return `<div class="block-image">[Image attached]</div>`;
      default:
        return '';
    }
  }).join('');
}

export function renderToolsHtml({ skills, mcpServers, agents, plugins }, { showScopeBadge = false } = {}) {
  function sectionHead(label, count) {
    return `<div class="tools-section-head"><h3 class="section-title">${escapeHtml(label)}</h3><span class="session-badge">${count}</span></div>`;
  }

  function renderSkillItem(s) {
    const argHint = s.argumentHint ? ` <span class="tool-arg-hint">${escapeHtml(s.argumentHint)}</span>` : '';
    const tags = [
      s.disableModelInvocation ? `<span class="tool-tag user-only">user-only</span>` : '',
      !s.userInvocable ? `<span class="tool-tag model-only">model-only</span>` : '',
      s.supportingFiles.length > 0 ? `<span class="tool-tag">${s.supportingFiles.length} file${s.supportingFiles.length !== 1 ? 's' : ''}</span>` : '',
    ].filter(Boolean).join('');
    return `<div class="session-item tool-item">
      <div class="tool-main">
        <div class="tool-invoke">/${escapeHtml(s.name)}${argHint}</div>
        ${s.description ? `<div class="tool-desc">${escapeHtml(s.description)}</div>` : ''}
      </div>
      ${tags ? `<div class="tool-tags">${tags}</div>` : ''}
    </div>`;
  }

  function renderServerItem(s) {
    const cmdLine = [s.command, ...(s.args || [])].filter(Boolean).join(' ');
    return `<div class="session-item tool-item">
      <div class="tool-main">
        <div class="tool-invoke">${escapeHtml(s.name)}</div>
        <code class="tool-cmd">${escapeHtml(cmdLine)}</code>
        ${s.envKeys.length > 0 ? `<div class="tool-env">env: ${s.envKeys.map(k => escapeHtml(k)).join(', ')}</div>` : ''}
      </div>
    </div>`;
  }

  function renderAgentItem(a) {
    const tags = [
      a.allowedTools ? `<span class="tool-tag">${escapeHtml(a.allowedTools)}</span>` : '',
    ].filter(Boolean).join('');
    return `<div class="session-item tool-item">
      <div class="tool-main">
        <div class="tool-invoke">${escapeHtml(a.name)}</div>
        ${a.description ? `<div class="tool-desc">${escapeHtml(a.description)}</div>` : ''}
      </div>
      ${tags ? `<div class="tool-tags">${tags}</div>` : ''}
    </div>`;
  }

  function renderPluginItem(p) {
    return `<div class="session-item tool-item">
      <div class="tool-main">
        <div class="tool-invoke">${escapeHtml(p.name)}</div>
        <div class="tool-plugin-meta">
          ${p.version ? `<span class="plugin-version">v${escapeHtml(p.version)}</span>` : ''}
          ${p.source ? `<span class="tool-source">${escapeHtml(p.source)}</span>` : ''}
        </div>
      </div>
      <div class="tool-tags">
        <span class="plugin-status ${p.enabled ? 'enabled' : 'disabled'}">${p.enabled ? 'Enabled' : 'Disabled'}</span>
      </div>
    </div>`;
  }

  function renderFlatContent(skillItems, serverItems, agentItems, pluginItems = null) {
    const statsCards = [
      `<div class="stat-card"><div class="stat-value">${skillItems.length}</div><div class="stat-label">Skills</div></div>`,
      `<div class="stat-card"><div class="stat-value">${serverItems.length}</div><div class="stat-label">MCP Servers</div></div>`,
      `<div class="stat-card"><div class="stat-value">${agentItems.length}</div><div class="stat-label">Agents</div></div>`,
      ...(pluginItems !== null ? [`<div class="stat-card"><div class="stat-value">${pluginItems.length}</div><div class="stat-label">Plugins</div></div>`] : []),
    ].join('');
    let html = `<div class="stats-grid" style="margin-bottom:2rem">${statsCards}</div>`;

    html += sectionHead('Skills', skillItems.length);
    if (skillItems.length === 0) {
      html += `<p class="empty tools-empty">No skills installed in ~/.claude/skills/</p>`;
    } else {
      html += `<div class="sessions-list tools-list" style="margin-bottom:2rem">${skillItems.map(renderSkillItem).join('')}</div>`;
    }

    html += sectionHead('MCP Servers', serverItems.length);
    if (serverItems.length === 0) {
      html += `<p class="empty tools-empty">No user-scoped MCP servers configured. Add with <code class="inline-code">claude mcp add --scope user</code>.</p>`;
    } else {
      html += `<div class="sessions-list tools-list" style="margin-bottom:2rem">` +
        serverItems.map(s => {
          const cmdLine = [s.command, ...(s.args || [])].filter(Boolean).join(' ');
          return `<div class="session-item tool-item">
            <div class="tool-main">
              <div class="tool-invoke">${escapeHtml(s.name)}</div>
              <code class="tool-cmd">${escapeHtml(cmdLine)}</code>
              ${s.envKeys.length > 0 ? `<div class="tool-env">env: ${s.envKeys.map(k => escapeHtml(k)).join(', ')}</div>` : ''}
            </div>
            <div class="tool-tags"><span class="plugin-status enabled">${escapeHtml(s.scope)}</span></div>
          </div>`;
        }).join('') + `</div>`;
    }

    html += sectionHead('Agents', agentItems.length);
    if (agentItems.length === 0) {
      html += `<p class="empty tools-empty">No subagents defined in ~/.claude/agents/</p>`;
    } else {
      html += `<div class="sessions-list tools-list" style="margin-bottom:2rem">${agentItems.map(renderAgentItem).join('')}</div>`;
    }

    if (pluginItems !== null) {
      html += sectionHead('Plugins', pluginItems.length);
      if (pluginItems.length === 0) {
        html += `<p class="empty tools-empty">No plugins installed.</p>`;
      } else {
        html += `<div class="sessions-list tools-list">${pluginItems.map(renderPluginItem).join('')}</div>`;
      }
    }

    return html;
  }

  if (showScopeBadge) {
    const projSkills = skills.filter(s => s.scope === 'project');
    const globSkills = skills.filter(s => s.scope !== 'project');
    const projServers = mcpServers.filter(s => s.scope === 'project');
    const globServers = mcpServers.filter(s => s.scope !== 'project');
    const projAgents = agents.filter(a => a.scope === 'project');
    const globAgents = agents.filter(a => a.scope !== 'project');

    const projTotal = projSkills.length + projServers.length + projAgents.length;
    const globTotal = globSkills.length + globServers.length + globAgents.length + plugins.length;

    const projBody = projTotal > 0
      ? renderFlatContent(projSkills, projServers, projAgents)
      : `<p class="empty tools-empty">No project-level tools found in <code class="inline-code">.claude/</code> or <code class="inline-code">.mcp.json</code>.</p>`;

    const projSection = `<div class="scope-section scope-project">
      <div class="scope-section-header">
        <span class="scope-section-icon">&#x1F4C1;</span>
        <h3 class="scope-section-title">Project Level</h3>
        <span class="session-badge">${projTotal}</span>
      </div>
      <div class="scope-section-body">${projBody}</div>
    </div>`;

    const globBody = globTotal > 0
      ? renderFlatContent(globSkills, globServers, globAgents, plugins)
      : `<p class="empty tools-empty">No global tools configured.</p>`;

    const globSection = `<div class="scope-section scope-global">
      <div class="scope-section-header">
        <span class="scope-section-icon">&#x1F30D;</span>
        <h3 class="scope-section-title">Global Level</h3>
        <span class="session-badge">${globTotal}</span>
      </div>
      <div class="scope-section-body">${globBody}</div>
    </div>`;

    return projSection + globSection;
  }

  return renderFlatContent(skills, mcpServers, agents, plugins);
}
