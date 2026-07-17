// Chronological order matching the actual workflow: save an idea, check it,
// learn how to find more, browse inspiration, plan the content roadmap,
// write the script, plan the month, then warm up the audience beforehand.
const VIEWS = ['archive', 'chat', 'guide', 'inspiration', 'roadmap', 'script', 'content-plan', 'warming', 'feedback'];
const EMBED_VIEWS = ['roadmap', 'content-plan'];
const LAST_VIEW_KEY = 'last-view';

export function showView(name) {
  for (const view of VIEWS) {
    const el = document.getElementById(`${view}-view`);
    if (el) el.hidden = view !== name;
    const tab = document.getElementById(`tab-${view}`);
    if (tab) tab.classList.toggle('active', view === name);
    const bottomTab = document.getElementById(`bottomnav-${view}`);
    if (bottomTab) bottomTab.classList.toggle('active', view === name);
  }
  document.getElementById('random-idea-btn').hidden = name !== 'archive';
  document.getElementById('add-idea-fab').hidden = name !== 'archive';
  document.getElementById('embed-back-btn').hidden = !EMBED_VIEWS.includes(name);
  if (name !== 'script') {
    document.body.classList.remove('focus-mode');
    const focusBtn = document.getElementById('focus-mode-btn');
    if (focusBtn) focusBtn.textContent = '🎯 מצב מיקוד';
  }
  sessionStorage.setItem(LAST_VIEW_KEY, name);
}

export function getLastView() {
  const saved = sessionStorage.getItem(LAST_VIEW_KEY);
  return VIEWS.includes(saved) ? saved : 'archive';
}
