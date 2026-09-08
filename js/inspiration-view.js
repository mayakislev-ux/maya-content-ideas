import { db } from './firebase-init.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const PLATFORM_LABEL = { instagram: 'Instagram', tiktok: 'TikTok' };
const PLATFORM_ICON = {
  instagram:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1"/></svg>',
  tiktok:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v11.5a3.5 3.5 0 1 1-3-3.46"/><path d="M14 3a5 5 0 0 0 5 5"/></svg>',
};

let cachedVideosPromise = null;

// No server-side orderBy on purpose: sorting by two fields (domain, order)
// needs a Firestore composite index, which either fails the query outright
// until one is created, or adds real latency - the collection is small
// (~150 docs today), so a plain fetch + client-side sort is both simpler
// and faster than depending on an index.
async function loadVideos() {
  if (!cachedVideosPromise) {
    cachedVideosPromise = getDocs(collection(db, 'inspirationBank')).then((snapshot) =>
      snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => a.domain.localeCompare(b.domain) || a.order - b.order)
    );
  }
  return cachedVideosPromise;
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

// Wiring just attaches the filter listener - it does NOT fetch anything yet.
// The actual fetch only happens once the tab is opened (openInspirationView,
// called from app.js's tab-inspiration click), so every other user who never
// visits this tab pays zero network/render cost for it on app load.
export function wireInspirationView() {
  const select = document.getElementById('inspiration-domain-filter');
  select.addEventListener('change', () => renderForDomain(select.value));
}

export function openInspirationView() {
  const select = document.getElementById('inspiration-domain-filter');
  renderForDomain(select.value);
}
