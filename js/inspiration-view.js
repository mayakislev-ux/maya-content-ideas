import { db, functions } from './firebase-init.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

const matchInspirationQuery = httpsCallable(functions, 'matchInspirationQuery');

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

// The "כל התחומים" (all domains) view needs videos genuinely mixed across
// domains, not grouped in domain-sized blocks the way `loadVideos`'s
// (domain, order) sort naturally produces - round-robins one video at a
// time from each domain (each domain's own internal order is already
// shuffled, so this reuses that instead of re-randomizing).
function interleaveByDomain(videos) {
  const byDomain = new Map();
  for (const v of videos) {
    if (!byDomain.has(v.domain)) byDomain.set(v.domain, []);
    byDomain.get(v.domain).push(v);
  }
  const queues = [...byDomain.values()];
  const result = [];
  let remaining = true;
  while (remaining) {
    remaining = false;
    for (const queue of queues) {
      if (queue.length) {
        result.push(queue.shift());
        remaining = true;
      }
    }
  }
  return result;
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

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'inspiration-card-thumb';
    if (video.thumbnailUrl) {
      const img = document.createElement('img');
      img.src = video.thumbnailUrl;
      img.loading = 'lazy';
      img.alt = '';
      thumbWrap.appendChild(img);
    } else {
      // No real thumbnail available (mainly Instagram - no public API for
      // it without a Meta app token) - a branded placeholder instead of a
      // blank box.
      thumbWrap.innerHTML = PLATFORM_ICON[video.platform] || '';
      thumbWrap.classList.add('inspiration-card-thumb--placeholder');
    }

    const info = document.createElement('div');
    info.className = 'inspiration-card-info';

    const badge = document.createElement('span');
    badge.className = 'inspiration-card-badge';
    badge.innerHTML = `${PLATFORM_ICON[video.platform] || ''}<span>${PLATFORM_LABEL[video.platform] || video.platform}</span>`;

    const domainTag = document.createElement('span');
    domainTag.className = 'inspiration-card-domain';
    domainTag.textContent = video.domain;

    const cta = document.createElement('span');
    cta.className = 'inspiration-card-cta';
    cta.textContent = 'פתחו לצפייה ←';

    info.append(badge, domainTag, cta);

    // Readable text for the "שכפול" workflow - clients read the exact wording
    // instead of watching. Two sources, both pre-computed in advance (never
    // live/on-demand, so this is always instant and never fails in front of
    // a client): foreign-language videos get translationHe (an accurate
    // Hebrew translation); Hebrew-source videos get transcriptHe (the exact
    // spoken text, cleaned up from the raw speech-to-text pass). See the
    // inspiration-bank-system skill for how each field gets filled in.
    const isForeign = video.sourceLanguage && video.sourceLanguage !== 'he';
    const readableText = isForeign ? video.translationHe : video.transcriptHe;
    if (readableText) {
      const label = isForeign ? 'תרגום מדויק לעברית 🇮🇱' : 'התמלול המדויק 📝';
      const hideLabel = isForeign ? 'הסתרת התרגום' : 'הסתרת התמלול';

      const readBtn = document.createElement('button');
      readBtn.type = 'button';
      readBtn.className = 'inspiration-card-translate-btn';
      readBtn.textContent = label;

      const textBox = document.createElement('p');
      textBox.className = 'inspiration-card-translation';
      textBox.textContent = readableText;
      textBox.hidden = true;

      // Clients copy the exact wording straight into their own script/notes
      // instead of retyping it by hand - only shown once the text itself is
      // visible, and only makes sense alongside real text (never on its own).
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'inspiration-card-copy-btn';
      copyBtn.textContent = 'העתקת הטקסט 📋';
      copyBtn.hidden = true;

      readBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        textBox.hidden = !textBox.hidden;
        copyBtn.hidden = textBox.hidden;
        readBtn.textContent = textBox.hidden ? label : hideLabel;
      });

      copyBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(readableText);
          copyBtn.textContent = 'הועתק ✓';
        } catch (err) {
          console.error('Copy failed:', err);
          copyBtn.textContent = 'ההעתקה נכשלה, נסו שוב';
        }
        setTimeout(() => { copyBtn.textContent = 'העתקת הטקסט 📋'; }, 1800);
      });

      info.append(readBtn, textBox, copyBtn);
    }

    card.append(thumbWrap, info);
    grid.appendChild(card);
  }
}

async function renderForDomain(domain) {
  const grid = document.getElementById('inspiration-grid');
  const status = document.getElementById('inspiration-search-status');
  status.hidden = true;
  grid.innerHTML = '<p class="inspiration-loading">טוען השראה…</p>';
  const videos = await loadVideos();
  const filtered = domain ? videos.filter((v) => v.domain === domain) : interleaveByDomain(videos);
  renderCards(filtered);
}

// "שכפול הפוך" - a client already has her own idea ("אני רוצה לשתף את סיפור
// פתיחת העסק שלי") and wants matching-FORMAT reference videos from ANY
// domain, not just her own. matchInspirationQuery converts her free text
// into 1-2 tags from the same taxonomy classifyInspirationFormats tagged
// every video with server-side; this just filters the already-loaded list
// by tag overlap, ranking a 2-tag match above a 1-tag match.
async function runSearch(query) {
  const grid = document.getElementById('inspiration-grid');
  const status = document.getElementById('inspiration-search-status');
  const select = document.getElementById('inspiration-domain-filter');

  grid.innerHTML = '<p class="inspiration-loading">מחפשת רפרנסים מתאימים…</p>';
  status.hidden = true;

  let tags;
  try {
    const result = await matchInspirationQuery({ query });
    tags = result.data.tags;
  } catch (err) {
    console.error('matchInspirationQuery failed:', err);
    grid.innerHTML = '';
    status.hidden = false;
    status.textContent = 'לא הצלחנו להבין את החיפוש - נסו לנסח אחרת.';
    return;
  }

  const videos = await loadVideos();
  const scored = videos
    .map((v) => ({ video: v, score: (v.formatTags || []).filter((t) => tags.includes(t)).length }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  select.value = '';
  status.hidden = false;
  status.textContent = scored.length
    ? `נמצאו ${scored.length} סרטונים בסגנון "${tags.join(' / ')}" - מכל התחומים`
    : 'לא נמצאו סרטונים דומים - נסו לנסח אחרת או דפדפו לפי תחום.';
  renderCards(scored.map((s) => s.video));
}

// Wiring just attaches the filter/search listeners - it does NOT fetch
// anything yet. The actual fetch only happens once the tab is opened
// (openInspirationView, called from app.js's tab-inspiration click), so
// every other user who never visits this tab pays zero network/render cost
// for it on app load.
export function wireInspirationView() {
  const select = document.getElementById('inspiration-domain-filter');
  select.addEventListener('change', () => renderForDomain(select.value));

  const form = document.getElementById('inspiration-search-form');
  const input = document.getElementById('inspiration-search-input');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = input.value.trim();
    if (query) runSearch(query);
  });

  document.getElementById('inspiration-search-clear-btn').addEventListener('click', () => {
    input.value = '';
    renderForDomain(select.value);
  });
}

export function openInspirationView() {
  const select = document.getElementById('inspiration-domain-filter');
  renderForDomain(select.value);
}
