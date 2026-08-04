import { functions } from './firebase-init.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

const getClientUsageStats = httpsCallable(functions, 'getClientUsageStats', { timeout: 60000 });

let clients = [];
let searchQuery = '';
let sortMode = 'oldest';

function formatRelative(isoString) {
  if (!isoString) return 'מעולם לא התחברה';
  const date = new Date(isoString);
  const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'היום';
  if (days === 1) return 'אתמול';
  if (days < 30) return `לפני ${days} ימים`;
  const months = Math.floor(days / 30);
  if (months < 12) return `לפני ${months} חודשים`;
  return date.toLocaleDateString('he-IL');
}

// רעיון בלי התחברות אף פעם צריך להיחשב "הכי ותיק" תמיד (0), כדי שבמיון
// "מי לא התחברה מזמן" הוא יופיע ראשון כמו שהיה, ובמיון "לאחרונה" הוא
// יישאר בסוף במקום לקפוץ בטעות לראש הרשימה.
function clientTimestamp(client) {
  return client.lastSignInTime ? new Date(client.lastSignInTime).getTime() : 0;
}

function getFilteredSortedClients() {
  const needle = searchQuery.trim().toLowerCase();
  const filtered = needle ? clients.filter((c) => (c.email || '').toLowerCase().includes(needle)) : clients.slice();
  filtered.sort((a, b) => {
    const diff = clientTimestamp(a) - clientTimestamp(b);
    return sortMode === 'recent' ? -diff : diff;
  });
  return filtered;
}

function renderClientsList() {
  const list = document.getElementById('client-usage-list');
  list.innerHTML = '';
  const visible = getFilteredSortedClients();

  const status = document.getElementById('client-usage-status');
  const sortLabel = sortMode === 'recent' ? 'ממוינות מהכי-חדשה-בהתחברות' : 'ממוינות מהכי-ותיקה-בהתחברות, כדי לראות מהר מי דורשת מעקב';
  status.textContent = searchQuery.trim()
    ? `${visible.length} מתוך ${clients.length} לקוחות תואמות · ${sortLabel}`
    : `${clients.length} לקוחות · ${sortLabel}`;

  if (!visible.length) {
    const empty = document.createElement('li');
    empty.className = 'client-usage-empty';
    empty.textContent = 'לא נמצאו לקוחות תואמים.';
    list.appendChild(empty);
    return;
  }

  visible.forEach((client) => {
    const li = document.createElement('li');
    li.className = 'client-usage-item';
    if (client.ideaCount > 0) li.classList.add('client-usage-item-clickable');

    const email = document.createElement('div');
    email.className = 'client-usage-email';
    email.textContent = client.email;
    li.appendChild(email);

    const stats = document.createElement('div');
    stats.className = 'client-usage-stats';
    stats.innerHTML = `
      <span>התחברות אחרונה: ${formatRelative(client.lastSignInTime)}</span>
      <span>${client.ideaCount} רעיונות</span>
      <span>רעיון אחרון: ${formatRelative(client.lastIdeaAt)}</span>
    `;
    li.appendChild(stats);

    if (client.ideaCount > 0) {
      li.addEventListener('click', () => showClientIdeas(client));
    }
    list.appendChild(li);
  });
}

function showClientIdeas(client) {
  document.getElementById('client-ideas-email').textContent = client.email;
  const list = document.getElementById('client-ideas-list');
  list.innerHTML = '';
  client.ideas.forEach((idea) => {
    const li = document.createElement('li');
    const dateText = idea.createdAt ? new Date(idea.createdAt).toLocaleDateString('he-IL') : '';
    const categoryText = idea.category ? ` · ${idea.category}` : '';
    li.textContent = `${idea.title}${categoryText} (${dateText})`;
    list.appendChild(li);
  });
  document.getElementById('client-ideas-modal').hidden = false;
}

export async function loadClientUsage() {
  const status = document.getElementById('client-usage-status');
  status.textContent = 'טוענת נתונים...';
  document.getElementById('client-usage-list').innerHTML = '';
  try {
    const { data } = await getClientUsageStats();
    clients = data.clients;
    renderClientsList();
  } catch (err) {
    console.error('getClientUsageStats failed:', err);
    status.textContent = 'משהו השתבש בטעינת הנתונים - נסי לרענן.';
  }
}

export function wireClientUsageView() {
  document.getElementById('client-usage-refresh-btn').addEventListener('click', loadClientUsage);
  document.getElementById('client-ideas-modal-close-btn').addEventListener('click', () => {
    document.getElementById('client-ideas-modal').hidden = true;
  });
  document.getElementById('client-ideas-modal').addEventListener('click', (e) => {
    if (e.target.id === 'client-ideas-modal') document.getElementById('client-ideas-modal').hidden = true;
  });

  document.getElementById('client-usage-search').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderClientsList();
  });

  const sortOldestBtn = document.getElementById('client-usage-sort-oldest');
  const sortRecentBtn = document.getElementById('client-usage-sort-recent');

  sortOldestBtn.addEventListener('click', () => {
    sortMode = 'oldest';
    sortOldestBtn.classList.add('client-usage-sort-active');
    sortRecentBtn.classList.remove('client-usage-sort-active');
    renderClientsList();
  });

  sortRecentBtn.addEventListener('click', () => {
    sortMode = 'recent';
    sortRecentBtn.classList.add('client-usage-sort-active');
    sortOldestBtn.classList.remove('client-usage-sort-active');
    renderClientsList();
  });
}
