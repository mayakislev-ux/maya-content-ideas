import { filterIdeas, sortIdeas, categoryColorVar, categoryIcon, CATEGORIES } from './ideas-logic.js';
import { getInstantThumbnail, fetchThumbnail } from './video-preview.js';
import { addQuickIdea, markIdeaCompleted, uncompleteIdea, deleteIdea, restoreIdea } from './ideas-store.js';
import { showToast } from './toast.js';
import { animateCountUp } from './count-up.js';
import { burstConfetti } from './confetti.js';
import { showView } from './view-router.js';
import { startIdeaChatWithExistingIdea } from './idea-chat.js';

const QUICK_ADD_TOASTS = [
  '📝 הרעיון נשמר כטיוטה - אפשר להשלים אותו בהמשך',
  '✨ נחמד! הרעיון חיכה במגירה, עכשיו הוא במאגר',
  '💡 עוד רעיון אחד קרוב יותר לתוכן הבא שלך',
  '📥 נשמר בבטחה - תחזרו אליו כשיהיה לכם את הזמן',
];

const LEVELS = [
  { min: 0, name: 'בתחלת הדרך', icon: '🌱' },
  { min: 10, name: 'בקצב עולה', icon: '🌿' },
  { min: 25, name: 'בהתקדמות משמעותית', icon: '🌳' },
  { min: 50, name: 'ברמת מומחיות', icon: '⭐' },
  { min: 100, name: 'בשיא היצירה', icon: '👑' },
];

function currentLevel(count) {
  return [...LEVELS].reverse().find((level) => count >= level.min);
}


const MILESTONES = [10, 25, 50, 100];
const seenMilestones = new Set(JSON.parse(localStorage.getItem('idea-milestones-seen') || '[]'));

function celebrateMilestone(count, ideas) {
  if (!MILESTONES.includes(count) || seenMilestones.has(count)) return;
  seenMilestones.add(count);
  localStorage.setItem('idea-milestones-seen', JSON.stringify([...seenMilestones]));
  burstConfetti();
  if (navigator.vibrate) navigator.vibrate([20, 40, 20]);

  const counts = CATEGORIES.map((category) => ({
    category,
    n: ideas.filter((idea) => idea.category === category).length,
  })).sort((a, b) => b.n - a.n);
  const leader = counts[0];
  const detail = leader && leader.n > 0
    ? `הכי הרבה כתבת ב"${leader.category}" (${leader.n})`
    : 'המשיכי ככה';
  showToast(`🎉 ${count} רעיונות במאגר שלך! ${detail}`, { duration: 6000 });
}

let currentIdeas = [];
let showingCompleted = false;

// Approximation: counts today's already-synced ideas +1 for the one just
// submitted (whose Firestore snapshot hasn't come back yet at toast time) -
// close enough for a quick dopamine hit, not meant to be a precise ledger.
function todaysIdeaCountLabel() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayCount =
    1 +
    currentIdeas.filter((idea) => {
      if (!idea.createdAt || typeof idea.createdAt.toDate !== 'function') return false;
      return idea.createdAt.toDate() >= startOfToday;
    }).length;
  return todayCount === 1 ? 'רעיון ראשון היום!' : `${todayCount} רעיונות היום!`;
}

function formatDate(idea) {
  if (!idea.createdAt || typeof idea.createdAt.toDate !== 'function') return '';
  return idea.createdAt.toDate().toLocaleDateString('he-IL');
}

export function renderArchive(ideas, { onItemClick }) {
  currentIdeas = ideas.filter((idea) => !idea.deletedAt);
  applyFilters(onItemClick);
  renderHomeRecent(onItemClick);
  renderHomeProgressWidget();
  celebrateMilestone(currentIdeas.length, currentIdeas);
  renderHero();
  renderStatScroll();
}

// Compact bar version of the same weekly-progress data the full
// progress-view's ring shows - lives on home now since a full standalone
// screen for one number was more navigation than the data warranted.
// Tapping it still opens progress-view for the fuller level/category
// breakdown.
function renderHomeProgressWidget() {
  const label = document.getElementById('home-progress-label');
  const fill = document.getElementById('home-progress-bar-fill');
  if (!label || !fill) return;
  const { thisWeekCount, goal } = weeklyProgress();
  const pct = Math.min((thisWeekCount / goal) * 100, 100);
  label.textContent = `${thisWeekCount} מתוך ${goal} רעיונות`;
  fill.style.width = `${pct}%`;
}

// The home screen is deliberately a calm capture-first moment, not a
// second full list - just enough of a peek at the last few ideas to feel
// "it's saved, it's here" without repeating archive-view's tags/dates/
// filters. Full browsing (search, filters, tags) stays on the "רעיונות" view.
function renderHomeRecent(onItemClick) {
  const list = document.getElementById('home-recent-list');
  if (!list) return;
  const recent = getCurrentIdeas()
    .slice()
    .sort((a, b) => {
      const time = (idea) => (idea.createdAt && typeof idea.createdAt.toMillis === 'function' ? idea.createdAt.toMillis() : 0);
      return time(b) - time(a);
    })
    .slice(0, 3);

  list.innerHTML = '';
  if (!recent.length) {
    const empty = document.createElement('li');
    empty.className = 'home-recent-empty';
    empty.textContent = 'עדיין אין רעיונות - הראשון מחכה שיכתבו אותו למעלה';
    list.appendChild(empty);
    return;
  }

  recent.forEach((idea) => {
    const li = document.createElement('li');
    li.className = 'home-recent-item';
    li.style.setProperty('--card-color', categoryColorVar(idea.category));
    const title = document.createElement('span');
    title.className = 'home-recent-item-title';
    title.textContent = idea.title;
    li.appendChild(title);
    const chevron = document.createElement('span');
    chevron.className = 'home-recent-item-chevron';
    chevron.textContent = '‹';
    li.appendChild(chevron);
    li.addEventListener('click', () => onItemClick(idea));
    list.appendChild(li);
  });
}

const WEEKLY_GOAL_KEY = 'weekly-idea-goal';

function getWeeklyGoal() {
  const saved = Number(localStorage.getItem(WEEKLY_GOAL_KEY));
  return Number.isFinite(saved) && saved > 0 ? saved : 10;
}

function startOfWeek() {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
  return start;
}

function weeklyProgress() {
  const active = getCurrentIdeas();
  const weekStart = startOfWeek();
  const thisWeekCount = active.filter((idea) => {
    if (!idea.createdAt || typeof idea.createdAt.toDate !== 'function') return false;
    return idea.createdAt.toDate() >= weekStart;
  }).length;
  const goal = getWeeklyGoal();
  return { thisWeekCount, goal };
}

function renderHero() {
  const ringMount = document.getElementById('hero-ring-svg-mount');
  const { thisWeekCount, goal } = weeklyProgress();
  const progress = Math.min(thisWeekCount / goal, 1);
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  ringMount.innerHTML = `
    <svg width="150" height="150" viewBox="0 0 150 150">
      <circle cx="75" cy="75" r="${radius}" fill="none" stroke="var(--accent-tint)" stroke-width="12"/>
      <circle cx="75" cy="75" r="${radius}" fill="none" stroke="url(#hero-ring-grad)" stroke-width="12" stroke-linecap="round"
        stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" style="transition: stroke-dashoffset 700ms var(--ease-snap);"/>
      <defs>
        <linearGradient id="hero-ring-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="var(--accent-2)"/>
          <stop offset="100%" stop-color="var(--accent)"/>
        </linearGradient>
      </defs>
    </svg>
    <div class="hero-ring-center">
      <span class="hero-ring-num">${thisWeekCount}/${goal}</span>
      <span class="hero-ring-label">רעיונות השבוע</span>
    </div>
  `;

  const remainingEl = document.getElementById('hero-remaining');
  if (remainingEl) {
    const remaining = Math.max(goal - thisWeekCount, 0);
    remainingEl.textContent = remaining === 0 ? '🎉 היעד השבועי הושג!' : `נותרו ${remaining} להשלמת היעד השבועי`;
  }
}

let lastSeenLevelName = localStorage.getItem('last-seen-level-name');

function renderStatScroll() {
  const container = document.getElementById('stat-scroll');
  const active = getCurrentIdeas();
  const level = currentLevel(active.length);
  const { goal } = weeklyProgress();
  const leveledUp = lastSeenLevelName !== null && lastSeenLevelName !== level.name;
  lastSeenLevelName = level.name;
  localStorage.setItem('last-seen-level-name', level.name);

  const counts = CATEGORIES.map((category) => ({
    category,
    count: active.filter((idea) => idea.category === category).length,
  })).filter((row) => row.count > 0);

  container.innerHTML = `
    <button type="button" class="stat-pill stat-pill-level${leveledUp ? ' level-up-glow' : ''}" id="goal-edit-btn">
      <span class="n">${level.icon} ${level.name}</span>
      <span class="l">יעד שבועי: ${goal} · לשינוי</span>
    </button>
    ${counts
      .map(
        ({ category, count }) => `
      <div class="stat-pill" style="border-color: ${categoryColorVar(category)};">
        <span class="n">${categoryIcon(category)} ${count}</span>
        <span class="l">${category}</span>
      </div>`
      )
      .join('')}
  `;

  document.getElementById('goal-edit-btn').addEventListener('click', () => {
    const modal = document.getElementById('goal-edit-modal');
    document.getElementById('goal-edit-input').value = String(goal);
    modal.hidden = false;
    document.getElementById('goal-edit-input').focus();
  });
}

export function wireGoalEditModal() {
  const modal = document.getElementById('goal-edit-modal');
  const input = document.getElementById('goal-edit-input');
  const save = () => {
    const parsed = Number(input.value);
    if (Number.isFinite(parsed) && parsed > 0) {
      localStorage.setItem(WEEKLY_GOAL_KEY, String(Math.round(parsed)));
      modal.hidden = true;
      renderHero();
      renderStatScroll();
    }
  };
  document.getElementById('goal-edit-save-btn').addEventListener('click', save);
  document.getElementById('goal-edit-cancel-btn').addEventListener('click', () => {
    modal.hidden = true;
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    }
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.hidden = true;
  });
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

  const archiveTitleLabel = document.getElementById('archive-title-label');
  categoryChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      categorySelect.value = chip.dataset.category;
      categoryChips.forEach((c) => c.classList.toggle('active', c === chip));
      // Tapping a category should feel like landing on "the ideas for
      // this category", not just applying a filter to the same screen -
      // updating the heading plus a brief fade on the list itself is a
      // lightweight way to sell that without a real route/screen change.
      archiveTitleLabel.textContent = chip.dataset.category || 'הרעיונות שלי';
      const list = document.getElementById('archive-list');
      list.classList.remove('archive-list-switch');
      void list.offsetWidth;
      list.classList.add('archive-list-switch');
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
    toggleBtn.textContent = showingCompleted ? 'חזרה לרעיונות פעילים' : 'רעיונות שבוצעו';
    applyFilters(onItemClick);
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
    if (navigator.vibrate) navigator.vibrate(15);
    await addQuickIdea(title);
    showToast(`⭐ ${todaysIdeaCountLabel()} ${QUICK_ADD_TOASTS[Math.floor(Math.random() * QUICK_ADD_TOASTS.length)]}`);
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

  animateCountUp(document.getElementById('idea-count'), sorted.length, '');

  const list = document.getElementById('archive-list');
  list.innerHTML = '';

  if (!sorted.length) {
    const empty = document.createElement('li');
    empty.className = 'archive-empty-state';
    if (currentIdeas.length === 0) {
      empty.innerHTML = '<div class="archive-empty-emoji">🌱</div><p>עדיין שקט כאן - הרעיון הראשון מחכה שיכתבו אותו בהוספה המהירה למעלה</p>';
    } else {
      empty.innerHTML = '<div class="archive-empty-emoji">🔍</div><p>כלום לא תואם את החיפוש הזה - נסו מילה אחרת או נקו את הסינון</p>';
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
  if (idea.completedAt) inner.classList.add('archive-item-completed');
  li.appendChild(inner);

  const header = document.createElement('div');
  header.className = 'archive-item-header';
  const title = document.createElement('strong');
  title.textContent = idea.title;
  header.appendChild(title);
  inner.appendChild(header);

  // Pinned to a corner instead of sitting inline in the flex-wrapping tag
  // row - it's a utility action, not "another tag", and inline it forced
  // the row to wrap in ways that stranded other tags.
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
  inner.appendChild(copyBtn);

  // Sends this exact idea straight into the "בדיקת רעיון" chat instead of
  // needing to retype/copy-paste it there manually - and remembers which
  // idea it came from, so finishing the chat updates this one directly
  // instead of guessing by fuzzy title matching.
  const recheckBtn = document.createElement('button');
  recheckBtn.type = 'button';
  recheckBtn.className = 'recheck-idea-btn';
  recheckBtn.textContent = '🔍';
  recheckBtn.setAttribute('aria-label', 'בדיקת הרעיון הזה מחדש בצ\'אט');
  recheckBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showView('chat');
    startIdeaChatWithExistingIdea(idea);
  });
  inner.appendChild(recheckBtn);

  // Three genuinely different axes (what kind of idea / how strong / who
  // it's for) were all rendered as interchangeable pills - the rating had
  // no styling at all (bare floating text) and audience-scope reused the
  // exact same class as category, so it visually read as "another
  // category" instead of a separate piece of information. Each axis now
  // gets its own consistent visual treatment, always in the same order,
  // so the shape/color tells you which kind of tag it is before you even
  // read the word.
  const tagsRow = document.createElement('div');
  tagsRow.className = 'archive-item-tags';

  if (idea.category) {
    const tag = document.createElement('span');
    tag.className = 'card-category-tag';
    tag.textContent = `${categoryIcon(idea.category)} ${idea.category}`;
    tagsRow.appendChild(tag);
  } else {
    const draftTag = document.createElement('span');
    draftTag.className = 'draft-badge';
    draftTag.textContent = '📝 טיוטה - להשלמה';
    tagsRow.appendChild(draftTag);
  }

  if (idea.audienceScope) {
    const scopeEl = document.createElement('span');
    scopeEl.className = idea.audienceScope === 'רחב' ? 'viral-badge' : 'audience-tag';
    scopeEl.textContent = idea.audienceScope === 'רחב' ? '🔥 קהל רחב' : `קהל ${idea.audienceScope}`;
    tagsRow.appendChild(scopeEl);
  }

  if (idea.rating) {
    const ratingEl = document.createElement('span');
    ratingEl.className = 'rating-tag';
    ratingEl.textContent = idea.rating;
    tagsRow.appendChild(ratingEl);
  }

  if (tagsRow.children.length) inner.appendChild(tagsRow);

  // Date and the complete/undo action live together in one footer row,
  // not mixed into the wrapping tag row above - that was leaving the
  // done-button stranded on its own wrapped line with a large empty
  // gap before the date, making it read as an unrelated leftover.
  const footer = document.createElement('div');
  footer.className = 'archive-item-footer';

  const dateText = formatDate(idea);
  const dateEl = document.createElement('span');
  dateEl.className = 'archive-item-date';
  dateEl.textContent = dateText;
  footer.appendChild(dateEl);

  if (idea.completedAt) {
    const undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.className = 'complete-idea-btn';
    undoBtn.textContent = '↩ החזרה לפעילים';
    undoBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await uncompleteIdea(idea.id);
    });
    footer.appendChild(undoBtn);
  } else {
    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'complete-idea-btn';
    doneBtn.textContent = '✓ בוצע';
    doneBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      inner.classList.add('archive-item-pop');
      if (navigator.vibrate) navigator.vibrate(15);
      await markIdeaCompleted(idea.id);
    });
    footer.appendChild(doneBtn);
  }

  inner.appendChild(footer);

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
      if (navigator.vibrate) navigator.vibrate(15);
      if (idea.completedAt) await uncompleteIdea(idea.id);
      else await markIdeaCompleted(idea.id);
    } else if (deltaX < -70) {
      if (navigator.vibrate) navigator.vibrate(15);
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
