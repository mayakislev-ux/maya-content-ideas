import { db } from './firebase-init.js';
import { collection, getDocs, orderBy, query } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const PLATFORM_LABEL = { instagram: 'Instagram', tiktok: 'TikTok' };
const PLATFORM_ICON = {
  instagram:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1"/></svg>',
  tiktok:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v11.5a3.5 3.5 0 1 1-3-3.46"/><path d="M14 3a5 5 0 0 0 5 5"/></svg>',
};

let cachedVideos = null;

async function loadVideos() {
  if (cachedVideos) return cachedVideos;
  const q = query(collection(db, 'inspirationBank'), orderBy('domain'), orderBy('order'));
  const snapshot = await getDocs(q);
  cachedVideos = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  return cachedVideos;
}

function renderCards(videos) {
  const grid = document.getElementById('inspiration-grid');
  const empty = document.getElementById('inspiration-empty');
  grid.innerHTML = '';
  if (!videos.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  for (const video of videos) {
    const card = document.createElement('a');
    card.className = `inspiration-card inspiration-card--${video.platform}`;
    card.href = video.url;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';

    const badge = document.createElement('span');
    badge.className = 'inspiration-card-badge';
    badge.innerHTML = `${PLATFORM_ICON[video.platform] || ''}<span>${PLATFORM_LABEL[video.platform] || video.platform}</span>`;

    const domainTag = document.createElement('span');
    domainTag.className = 'inspiration-card-domain';
    domainTag.textContent = video.domain;

    const cta = document.createElement('span');
    cta.className = 'inspiration-card-cta';
    cta.textContent = 'פתחו לצפייה ←';

    card.append(badge, domainTag, cta);
    grid.appendChild(card);
  }
}

async function renderForDomain(domain) {
  const grid = document.getElementById('inspiration-grid');
  grid.innerHTML = '<p class="inspiration-loading">טוען השראה…</p>';
  const videos = await loadVideos();
  const filtered = domain ? videos.filter((v) => v.domain === domain) : videos;
  renderCards(filtered);
}

export function wireInspirationView() {
  const select = document.getElementById('inspiration-domain-filter');
  select.addEventListener('change', () => renderForDomain(select.value));
  renderForDomain(select.value);
}
