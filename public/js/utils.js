export function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(typeof iso === 'number' ? iso : iso);
  if (isNaN(d)) return '';
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  const date = d.toLocaleDateString(undefined, opts);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date}, ${time}`;
}

export function formatTokens(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return Math.round(n / 1000) + 'K';
  return (n || 0).toString();
}

export function formatDuration(minutes) {
  const total = Math.round(minutes || 0);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function debounce(fn, delay) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), delay);
  };
}
