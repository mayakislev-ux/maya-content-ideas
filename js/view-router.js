const VIEWS = ['archive', 'chat', 'script', 'guide', 'inspiration', 'feedback', 'roadmap', 'content-plan', 'warming'];
const EMBED_VIEWS = ['roadmap', 'content-plan'];
// The chat/script views have their own position:fixed input row pinned to the
// bottom of the screen - showing the bottom nav at the same time would stack
// two fixed bottom bars on top of each other, so it hides itself there. The
// hamburger menu in the header stays reachable from every view either way.
const VIEWS_WITHOUT_BOTTOM_NAV = ['chat', 'script'];
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
  document.getElementById('bottom-nav').hidden = VIEWS_WITHOUT_BOTTOM_NAV.includes(name);
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
