export function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navSection = (name === 'sessions' || name === 'messages') ? 'projects' : name;
  const navItem = document.querySelector(`.nav-item[data-view="${navSection}"]`);
  if (navItem) navItem.classList.add('active');
}
