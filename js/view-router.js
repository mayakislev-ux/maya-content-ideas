const VIEWS = ['archive', 'chat', 'guide', 'inspiration', 'feedback', 'roadmap', 'content-plan', 'warming'];
const EMBED_VIEWS = ['roadmap', 'content-plan'];
const LAST_VIEW_KEY = 'last-view';

export function showView(name) {
  for (const view of VIEWS) {
    const el = document.getElementById(`${view}-view`);
    if (el) el.hidden = view !== name;
    const tab = document.getElementById(`tab-${view}`);
    if (tab) tab.classList.toggle('active', view === name);
  }
  document.getElementById('random-idea-btn').hidden = name !== 'archive';
  document.getElementById('add-idea-fab').hidden = name !== 'archive';
  document.getElementById('embed-back-btn').hidden = !EMBED_VIEWS.includes(name);
  sessionStorage.setItem(LAST_VIEW_KEY, name);
}

export function getLastView() {
  const saved = sessionStorage.getItem(LAST_VIEW_KEY);
  return VIEWS.includes(saved) ? saved : 'archive';
}
