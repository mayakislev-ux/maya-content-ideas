// Chronological order matching the actual workflow: save an idea, check it,
// learn how to find more, browse inspiration, plan the content roadmap,
// write the script, plan the month, then warm up the audience beforehand.
const VIEWS = ['home', 'archive', 'progress', 'chat', 'guide', 'ideas-guide', 'inspiration', 'roadmap', 'content-plan', 'warming', 'video-assistant', 'feedback'];
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
  document.getElementById('add-idea-fab').hidden = !['home', 'archive'].includes(name);
  document.getElementById('embed-back-btn').hidden = !EMBED_VIEWS.includes(name);
  sessionStorage.setItem(LAST_VIEW_KEY, name);
  // 19/10/2026 (מאיה: לחיצה על "מעקב לקוחות" מתחתית מסך הבית - עמוד ארוך -
  // זרקה אותה לתחתית המסך הבא, לא למעלה). showView מחליפה תוכן בלי לאפס
  // גלילה; כשהמסך הקודם היה ארוך והבא קצר יותר, הדפדפן פשוט הצמיד את
  // הגלילה לסוף החדש - בדיוק מה שהיא תיארה. כל מעבר מסך אמור להתחיל מלמעלה.
  window.scrollTo(0, 0);
}

export function getLastView() {
  const saved = sessionStorage.getItem(LAST_VIEW_KEY);
  return VIEWS.includes(saved) ? saved : 'home';
}
