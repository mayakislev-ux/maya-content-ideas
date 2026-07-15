import { filterIdeas, sortIdeas, categoryColorVar } from './ideas-logic.js';
import { getInstantThumbnail, fetchThumbnail } from './video-preview.js';
import { addQuickIdea, markIdeaCompleted, uncompleteIdea } from './ideas-store.js';
import { showToast } from './toast.js';

let currentIdeas = [];
let showingCompleted = false;

function formatDate(idea) {
  if (!idea.createdAt || typeof idea.createdAt.toDate !== 'function') return '';
  return idea.createdAt.toDate().toLocaleDateString('he-IL');
}

export function renderArchive(ideas, { onItemClick }) {
  currentIdeas = ideas.filter((idea) => !idea.deletedAt);
  applyFilters(onItemClick);
}

export function getCurrentIdeas() {
  return currentIdeas.filter((idea) => !idea.completedAt);
}

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function wireArchiveControls(onItemClick) {
  const debouncedApply = debounce(() => applyFilters(onItemClick), 200);
  document.getElementById('search-input').addEventListener('input', debouncedApply);
  const selectIds = ['filter-category', 'filter-audience-scope', 'filter-persuasion', 'filter-rating', 'sort-order'];
  for (const id of selectIds) {
    document.getElementById(id).addEventListener('change', () => applyFilters(onItemClick));
  }

  const toggleBtn = document.getElementById('completed-toggle-btn');
  toggleBtn.addEventListener('click', () => {
    showingCompleted = !showingCompleted;
    toggleBtn.textContent = showingCompleted ? '🔙 חזרה לרעיונות פעילים' : '📦 רעיונות שבוצעו';
    applyFilters(onItemClick);
  });

  const filtersToggleBtn = document.getElementById('filters-toggle-btn');
  const archiveFilters = document.getElementById('archive-filters');
  filtersToggleBtn.addEventListener('click', () => {
    const isOpen = archiveFilters.classList.toggle('open');
    filtersToggleBtn.classList.toggle('active', isOpen);
  });

  const quickAddInput = document.getElementById('quick-add-input');
  const quickAddBtn = document.getElementById('quick-add-btn');
  const QUICK_ADD_DRAFT_KEY = 'quick-add-draft';

  const savedDraft = localStorage.getItem(QUICK_ADD_DRAFT_KEY);
  if (savedDraft) quickAddInput.value = savedDraft;
  quickAddInput.addEventListener('input', () => {
    localStorage.setItem(QUICK_ADD_DRAFT_KEY, quickAddInput.value);
  });

  const submitQuickAdd = async () => {
    const title = quickAddInput.value.trim();
    if (!title) return;
    quickAddInput.value = '';
    localStorage.removeItem(QUICK_ADD_DRAFT_KEY);
    await addQuickIdea(title);
    showToast('📝 הרעיון נשמר כטיוטה - אפשר להשלים אותו בהמשך');
  };
  quickAddBtn.addEventListener('click', submitQuickAdd);
  quickAddInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitQuickAdd();
    }
  });
}

function applyFilters(onItemClick) {
  const text = document.getElementById('search-input').value;
  const category = document.getElementById('filter-category').value;
  const audienceScope = document.getElementById('filter-audience-scope').value;
  const persuasionStage = document.getElementById('filter-persuasion').value;
  const rating = document.getElementById('filter-rating').value;
  const sortOrder = document.getElementById('sort-order').value;
  const scoped = currentIdeas.filter((idea) => Boolean(idea.completedAt) === showingCompleted);
  const filtered = filterIdeas(scoped, { text, category, audienceScope, persuasionStage, rating });
  const sorted = sortIdeas(filtered, sortOrder);

  document.getElementById('idea-count').textContent = `${sorted.length} רעיונות במאגר שלך`;

  const list = document.getElementById('archive-list');
  list.innerHTML = '';
  for (const idea of sorted) {
    list.appendChild(renderItem(idea, onItemClick));
  }
}

function renderItem(idea, onItemClick) {
  const li = document.createElement('li');
  li.style.setProperty('--card-color', categoryColorVar(idea.category));
  li.className = 'archive-item';
  if (!idea.category) li.classList.add('archive-item-draft');

  const header = document.createElement('div');
  header.className = 'archive-item-header';
  const title = document.createElement('strong');
  title.textContent = idea.title;
  header.appendChild(title);

  if (idea.category) {
    const tag = document.createElement('span');
    tag.className = 'card-category-tag';
    tag.textContent = idea.category;
    header.appendChild(tag);
  } else {
    const draftTag = document.createElement('span');
    draftTag.className = 'draft-badge';
    draftTag.textContent = '📝 טיוטה - להשלמה';
    header.appendChild(draftTag);
  }

  if (idea.rating) {
    const ratingEl = document.createElement('span');
    ratingEl.textContent = idea.rating;
    header.appendChild(ratingEl);
  }
  if (idea.audienceScope) {
    const scopeEl = document.createElement('span');
    scopeEl.className = idea.audienceScope === 'רחב' ? 'viral-badge' : 'card-category-tag';
    scopeEl.textContent = idea.audienceScope === 'רחב' ? '🔥 קהל רחב' : `קהל ${idea.audienceScope}`;
    header.appendChild(scopeEl);
  }

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'copy-idea-btn';
  copyBtn.textContent = '📋';
  copyBtn.setAttribute('aria-label', 'העתקת הרעיון');
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(idea.title).then(() => {
      copyBtn.textContent = '✓';
      setTimeout(() => (copyBtn.textContent = '📋'), 1500);
    });
  });
  header.appendChild(copyBtn);

  if (idea.completedAt) {
    const undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.className = 'complete-idea-btn';
    undoBtn.textContent = '↩ החזרה לפעילים';
    undoBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await uncompleteIdea(idea.id);
    });
    header.appendChild(undoBtn);
  } else {
    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'complete-idea-btn';
    doneBtn.textContent = '✓ בוצע';
    doneBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await markIdeaCompleted(idea.id);
    });
    header.appendChild(doneBtn);
  }

  li.appendChild(header);

  const dateText = formatDate(idea);
  if (dateText) {
    const meta = document.createElement('div');
    meta.className = 'archive-item-meta';
    meta.textContent = dateText;
    li.appendChild(meta);
  }

  if (idea.sourceLink) {
    const linkRow = document.createElement('div');
    linkRow.className = 'archive-item-link';

    const thumb = document.createElement('img');
    thumb.className = 'archive-item-thumb';
    thumb.loading = 'lazy';
    thumb.hidden = true;
    const instant = getInstantThumbnail(idea.sourceLink);
    if (instant) {
      thumb.src = instant;
      thumb.hidden = false;
    } else {
      fetchThumbnail(idea.sourceLink).then((url) => {
        if (url) {
          thumb.src = url;
          thumb.hidden = false;
        }
      });
    }
    linkRow.appendChild(thumb);

    const link = document.createElement('a');
    link.href = idea.sourceLink;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = '🔗 לינק לסרטון';
    link.addEventListener('click', (e) => e.stopPropagation());
    linkRow.appendChild(link);

    li.appendChild(linkRow);
  }

  li.addEventListener('click', () => onItemClick(idea));
  return li;
}
