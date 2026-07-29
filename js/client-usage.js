import { functions } from './firebase-init.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

const getClientUsageStats = httpsCallable(functions, 'getClientUsageStats', { timeout: 60000 });

let clients = [];

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

function renderClientsList() {
  const list = document.getElementById('client-usage-list');
  list.innerHTML = '';
  clients.forEach((client) => {
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
    status.textContent = `${clients.length} לקוחות · ממוינות מהכי-ותיקה-בהתחברות, כדי לראות מהר מי דורשת מעקב`;
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
}
