/* 29/10/2026 (מאיה: "כשאני מתחברת בתור לקוחה אני חייבת אופציה לחפש את
   השמות שלהן, ושזה יחולק לי לפי מחזורים, מחזור 7 ואז תיקייה כזאת, ובוחרת").
   חלון בחירה: חיפוש לפי שם או מייל, והלקוחות בתיקיות לפי מחזור. המחזור
   החדש למעלה. בזמן חיפוש כל התיקיות שיש בהן התאמה נפתחות. */

const OTHER_GROUPS = ['מחזורים 1-6 (לפני הפורטל)', 'בלי מחזור'];

function cohortRank(name) {
  const i = OTHER_GROUPS.indexOf(name);
  if (i !== -1) return -1000 - i;
  const m = /(\d+)/.exec(name || '');
  return m ? Number(m[1]) : -500;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[֑-ׇ]/g, '').trim();

/** טהורה: תיקיות לפי מחזור, מסוננות לפי חיפוש. [{ cohort, clients }] */
export function groupClients(clients = [], query = '') {
  const q = norm(query);
  const hit = (c) => !q || norm(c.name).includes(q) || norm(c.email).includes(q) || norm(c.cohort).includes(q);
  const groups = new Map();
  for (const c of clients) {
    if (!hit(c)) continue;
    const key = c.cohort || 'בלי מחזור';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  return [...groups.entries()]
    .sort((a, b) => cohortRank(b[0]) - cohortRank(a[0]))
    .map(([cohort, list]) => ({
      cohort,
      clients: list.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, 'he')),
    }));
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

/**
 * פותח את החלון. clients: [{ uid, email, name, cohort, plan }].
 * onPick(client|null): null = החשבון שלי.
 */
export function openClientPicker({ clients = [], currentUid = null, onPick }) {
  document.querySelectorAll('.cp-overlay').forEach((o) => o.remove());
  const overlay = document.createElement('div');
  overlay.className = 'cp-overlay';
  overlay.innerHTML = `
    <div class="cp-modal" role="dialog" aria-modal="true" aria-label="בחירת לקוחה">
      <div class="cp-head">
        <h2 class="cp-title">בחירת לקוחה</h2>
        <button type="button" class="cp-close" aria-label="סגירה">✕</button>
      </div>
      <input type="search" class="cp-search" placeholder="חיפוש לפי שם או מייל" aria-label="חיפוש לקוחה" />
      <button type="button" class="cp-mine${currentUid ? '' : ' is-on'}" data-pick="">החשבון שלי</button>
      <div class="cp-list"></div>
    </div>`;
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('.cp-close').addEventListener('click', close);
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  const list = overlay.querySelector('.cp-list');
  const search = overlay.querySelector('.cp-search');
  const open = new Set();
  // התיקייה של הלקוחה הנוכחית פתוחה מההתחלה
  const cur = clients.find((c) => c.uid === currentUid);
  if (cur) open.add(cur.cohort || 'בלי מחזור');

  function render() {
    const q = search.value;
    const groups = groupClients(clients, q);
    if (!groups.length) {
      list.innerHTML = '<p class="cp-empty">לא נמצאה לקוחה בשם הזה</p>';
      return;
    }
    list.innerHTML = groups.map((g) => {
      const isOpen = Boolean(q.trim()) || open.has(g.cohort);
      return `<div class="cp-group">
        <button type="button" class="cp-folder" data-folder="${esc(g.cohort)}" aria-expanded="${isOpen}">
          <span aria-hidden="true">${isOpen ? '📂' : '📁'}</span>
          <span class="cp-folder__name">${esc(g.cohort)}</span>
          <span class="cp-folder__count">${g.clients.length}</span>
        </button>
        ${isOpen ? `<div class="cp-clients">${g.clients.map((c) => `
          <button type="button" class="cp-client${c.uid === currentUid ? ' is-on' : ''}" data-pick="${esc(c.uid)}">
            <span class="cp-client__name">${esc(c.name || c.email)}</span>
            ${c.name ? `<span class="cp-client__mail">${esc(c.email)}</span>` : ''}
          </button>`).join('')}</div>` : ''}
      </div>`;
    }).join('');
  }

  overlay.addEventListener('click', (e) => {
    const folder = e.target.closest('[data-folder]');
    if (folder) {
      const k = folder.dataset.folder;
      if (open.has(k)) open.delete(k); else open.add(k);
      render();
      return;
    }
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      const uid = pick.dataset.pick;
      close();
      onPick(uid ? clients.find((c) => c.uid === uid) || null : null);
    }
  });
  search.addEventListener('input', render);
  render();
  document.body.appendChild(overlay);
  search.focus();
  return overlay;
}
