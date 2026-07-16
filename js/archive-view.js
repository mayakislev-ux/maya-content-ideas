import { filterIdeas, sortIdeas, categoryColorVar, categoryIcon, CATEGORIES } from './ideas-logic.js';
import { getInstantThumbnail, fetchThumbnail } from './video-preview.js';
import { addQuickIdea, markIdeaCompleted, uncompleteIdea, deleteIdea, restoreIdea } from './ideas-store.js';
import { showToast } from './toast.js';
import { animateCountUp } from './count-up.js';
import { burstConfetti } from './confetti.js';

const QUICK_ADD_TOASTS = [
  '📝 הרעיון נשמר כטיוטה - אפשר להשלים אותו בהמשך',
  '✨ נחמד! הרעיון חיכה במגירה, עכשיו הוא במאגר',
  '💡 עוד רעיון אחד קרוב יותר לתוכן הבא שלך',
  '📥 נשמר בבטחה - תחזרי אליו כשתהיה לך את הזמן',
];

const LEVELS = [
  { min: 0, name: 'מתחילה', icon: '🌱' },
  { min: 10, name: 'יוצרת תוכן', icon: '🌿' },
  { min: 25, name: 'יוצרת מנוסה', icon: '🌳' },
  { min: 50, name: 'מומחית תוכן', icon: '⭐' },
  { min: 100, name: 'אלופת תוכן', icon: '👑' },
];

function currentLevel(count) {
  return [...LEVELS].reverse().find((level) => count >= level.min);
}

function renderLevelBadge(count) {
  const el = document.getElementById('level-badge');
  if (!el) return;
  const level = currentLevel(count);
  el.textContent = `${level.icon} ${level.name}`;
}

const MILESTONES = [10, 25, 50, 100];
const seenMilestones = new Set(JSON.parse(localStorage.getItem('idea-milestones-seen') || '[]'));

function celebrateMilestone(count) {
  if (!MILESTONES.includes(count) || seenMilestones.has(count)) return;
  seenMilestones.add(count);
  localStorage.setItem('idea-milestones-seen', JSON.stringify([...seenMilestones]));
  burstConfetti();
  showToast(`🎉 וואו, ${count} רעיונות במאגר שלך!`, { duration: 6000 });
}

let currentIdeas = [];
let showingCompleted = false;

function formatDate(idea) {
  if (!idea.createdAt || typeof idea.createdAt.toDate !== 'function') return '';
  return idea.createdAt.toDate().toLocaleDateString('he-IL');
}

export function renderArchive(ideas, { onItemClick }) {
  currentIdeas = ideas.filter((idea) => !idea.deletedAt);
  applyFilters(onItemClick);
  celebrateMilestone(currentIdeas.length);
  renderCategoryBreakdown();
  renderLevelBadge(currentIdeas.length);
}

function renderCategoryBreakdown() {
  const container = document.getElementById('category-breakdown');
  const active = getCurrentIdeas();
  if (active.length < 2) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  const counts = CATEGORIES.map((category) => ({
    category,
    count: active.filter((idea) => idea.category === category).length,
  })).filter((row) => row.count > 0);
  const max = Math.max(...counts.map((row) => row.count), 1);

  container.innerHTML = '';
  for (const { category, count } of counts) {
    const row = document.createElement('div');
    row.className = 'category-breakdown-row';
    row.innerHTML = `
      <span class="category-breakdown-label">${categoryIcon(category)} ${category}</span>
      <span class="category-breakdown-track"><span class="category-breakdown-fill"></span></span>
      <span class="category-breakdown-count">${count}</span>
    `;
    container.appendChild(row);
    const fill = row.querySelector('.category-breakdown-fill');
    fill.style.background = categoryColorVar(category);
    requestAnimationFrame(() => {
      fill.style.width = `${Math.max((count / max) * 100, 8)}%`;
    });
  }
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

  const categorySelect = document.getElementById('filter-category');
  const audienceSelect = document.getElementById('filter-audience-scope');
  const categoryChips = document.querySelectorAll('.quick-chip[data-category]');
  const viralChip = document.getElementById('quick-chip-viral');

  categoryChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      categorySelect.value = chip.dataset.category;
      categoryChips.forEach((c) => c.classList.toggle('active', c === chip));
      applyFilters(onItemClick);
    });
  });

  viralChip.addEventListener('click', () => {
    const isActive = viralChip.classList.toggle('active');
    audienceSelect.value = isActive ? 'רחב' : '';
    applyFilters(onItemClick);
  });

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
  const draftSavedIndicator = document.getElementById('draft-saved-indicator');
  const QUICK_ADD_DRAFT_KEY = 'quick-add-draft';

  const savedDraft = localStorage.getItem(QUICK_ADD_DRAFT_KEY);
  if (savedDraft) quickAddInput.value = savedDraft;
  const showDraftSaved = debounce(() => {
    if (!quickAddInput.value.trim()) return;
    draftSavedIndicator.hidden = false;
    draftSavedIndicator.classList.remove('draft-saved-pop');
    void draftSavedIndicator.offsetWidth;
    draftSavedIndicator.classList.add('draft-saved-pop');
  }, 400);
  quickAddInput.addEventListener('input', () => {
    localStorage.setItem(QUICK_ADD_DRAFT_KEY, quickAddInput.value);
    showDraftSaved();
  });

  const submitQuickAdd = async () => {
    const title = quickAddInput.value.trim();
    if (!title) return;
    quickAddInput.value = '';
    localStorage.removeItem(QUICK_ADD_DRAFT_KEY);
    await addQuickIdea(title);
    showToast(QUICK_ADD_TOASTS[Math.floor(Math.random() * QUICK_ADD_TOASTS.length)]);
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

  animateCountUp(document.getElementById('idea-count'), sorted.length, ' רעיונות במאגר שלך');

  const list = document.getElementById('archive-list');
  list.innerHTML = '';

  if (!sorted.length) {
    const empty = document.createElement('li');
    empty.className = 'archive-empty-state';
    if (currentIdeas.length === 0) {
      empty.innerHTML = '<div class="archive-empty-emoji">🌱</div><p>עדיין שקט כאן - הרעיון הראשון שלך רק מחכה שתכתבי אותו בהוספה המהירה למעלה</p>';
    } else {
      empty.innerHTML = '<div class="archive-empty-emoji">🔍</div><p>כלום לא תואם את החיפוש הזה - נסי מילה אחרת או נקי את הסינון</p>';
    }
    list.appendChild(empty);
    return;
  }

  sorted.forEach((idea, index) => {
    list.appendChild(renderItem(idea, onItemClick, index));
  });
}

function renderItem(idea, onItemClick, index = 0) {
  const li = document.createElement('li');
  li.className = 'archive-item-outer';

  const doneAction = document.createElement('div');
  doneAction.className = 'swipe-action swipe-action-done';
  doneAction.textContent = idea.completedAt ? '↩' : '✓';
  li.appendChild(doneAction);

  const deleteAction = document.createElement('div');
  deleteAction.className = 'swipe-action swipe-action-delete';
  deleteAction.textContent = '🗑️';
  li.appendChild(deleteAction);

  const trail = document.createElement('div');
  trail.className = 'swipe-trail';
  li.appendChild(trail);

  const inner = document.createElement('div');
  inner.style.setProperty('--card-color', categoryColorVar(idea.category));
  inner.style.setProperty('--stagger-i', Math.min(index, 12));
  inner.className = 'archive-item';
  if (!idea.category) inner.classList.add('archive-item-draft');
  li.appendChild(inner);

  const header = document.createElement('div');
  header.className = 'archive-item-header';
  const title = document.createElement('strong');
  title.textContent = idea.title;
  header.appendChild(title);

  if (idea.category) {
    const tag = document.createElement('span');
    tag.className = 'card-category-tag';
    tag.textContent = `${categoryIcon(idea.category)} ${idea.category}`;
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
      inner.classList.add('archive-item-pop');
      await markIdeaCompleted(idea.id);
    });
    header.appendChild(doneBtn);
  }

  inner.appendChild(header);

  const dateText = formatDate(idea);
  if (dateText) {
    const meta = document.createElement('div');
    meta.className = 'archive-item-meta';
    meta.textContent = dateText;
    inner.appendChild(meta);
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

    inner.appendChild(linkRow);
  }

  let hasSwiped = false;
  let touchStartX = null;
  let touchStartY = null;
  let horizontalSwipe = false;

  inner.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    horizontalSwipe = false;
    inner.style.transition = 'none';
  });

  inner.addEventListener('touchmove', (e) => {
    if (touchStartX === null) return;
    const deltaX = e.touches[0].clientX - touchStartX;
    const deltaY = e.touches[0].clientY - touchStartY;
    if (!horizontalSwipe && Math.abs(deltaX) > 12 && Math.abs(deltaX) > Math.abs(deltaY)) {
      horizontalSwipe = true;
    }
    if (!horizontalSwipe) return;
    e.preventDefault();
    hasSwiped = true;
    const clamped = Math.max(-90, Math.min(90, deltaX));
    inner.style.transform = `translateX(${clamped}px)`;
    trail.classList.toggle('right', clamped > 8);
    trail.classList.toggle('left', clamped < -8);
    trail.style.opacity = Math.min(Math.abs(clamped) / 70, 1);
  });

  inner.addEventListener('touchend', async (e) => {
    trail.style.opacity = 0;
    trail.classList.remove('right', 'left');
    if (!horizontalSwipe) {
      touchStartX = null;
      return;
    }
    const deltaX = e.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    inner.style.transition = 'transform 0.2s ease';
    inner.style.transform = 'translateX(0)';

    if (deltaX > 70) {
      inner.classList.add('archive-item-pop');
      if (idea.completedAt) await uncompleteIdea(idea.id);
      else await markIdeaCompleted(idea.id);
    } else if (deltaX < -70) {
      await deleteIdea(idea.id);
      showToast('הרעיון נמחק', { actionLabel: 'בטלו', onAction: () => restoreIdea(idea.id) });
    }

    setTimeout(() => {
      hasSwiped = false;
    }, 50);
  });

  inner.addEventListener('click', () => {
    if (hasSwiped) return;
    onItemClick(idea);
  });
  return li;
}

export function wirePullToRefresh() {
  const archiveView = document.getElementById('archive-view');
  const indicator = document.createElement('div');
  indicator.className = 'pull-refresh-indicator';
  indicator.textContent = '↻';
  archiveView.prepend(indicator);

  let startY = null;
  let pulling = false;

  archiveView.addEventListener('touchstart', (e) => {
    startY = window.scrollY === 0 && !archiveView.hidden ? e.touches[0].clientY : null;
  });

  archiveView.addEventListener('touchmove', (e) => {
    if (startY === null) return;
    const delta = e.touches[0].clientY - startY;
    if (delta > 0 && window.scrollY === 0) {
      pulling = true;
      const clamped = Math.min(delta, 70);
      indicator.style.opacity = Math.min(delta / 70, 1);
      indicator.style.transform = `translateY(${clamped}px) rotate(${delta * 2}deg)`;
    }
  });

  archiveView.addEventListener('touchend', () => {
    if (pulling) {
      indicator.classList.add('spinning');
      setTimeout(() => {
        indicator.classList.remove('spinning');
        indicator.style.opacity = 0;
        indicator.style.transform = '';
      }, 500);
    }
    startY = null;
    pulling = false;
  });
}
