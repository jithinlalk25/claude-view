import { escapeHtml } from '../utils.js';

let loaded = false;

export async function loadConfig() {
  const container = document.getElementById('config-content');
  if (loaded) return;
  container.innerHTML = '<p class="loading">Loading config...</p>';

  try {
    const res = await fetch('/api/config');
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

    const items = data.items.map(item => ({ ...item, label: item.label.replace(/^~\//, '') }));
    const body = items.length === 0
      ? '<p class="empty">No global config files found.</p>'
      : `<div class="file-tree">${renderTreeNodes(buildTree(items), 0)}</div>`;

    container.innerHTML = `
      <div class="config-section">
        <div class="config-section-title">Global Config</div>
        <div class="config-section-path">~/.claude</div>
        ${body}
      </div>`;

    loaded = true;

    container.querySelectorAll('.tree-dir-row').forEach(row => {
      row.addEventListener('click', () => row.closest('.tree-dir').classList.toggle('open'));
    });
    container.querySelectorAll('.tree-file-row').forEach(row => {
      row.addEventListener('click', () => row.closest('.tree-file').classList.toggle('expanded'));
    });
  } catch (err) {
    container.innerHTML = `<p class="empty error">Failed to load config: ${escapeHtml(err.message)}</p>`;
  }
}
