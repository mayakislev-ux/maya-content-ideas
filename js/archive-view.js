import { filterIdeas, sortIdeas, categoryColorVar, categoryIcon, CATEGORIES } from './ideas-logic.js';
import { getInstantThumbnail, fetchThumbnail } from './video-preview.js';
import { addQuickIdea, markIdeaCompleted, uncompleteIdea, deleteIdea, restoreIdea, deleteIdeasBulk, restoreIdeasBulk } from './ideas-store.js';
import { showToast } from './toast.js';
import { serverErrorText } from './server-error.js';
import { animateCountUp } from './count-up.js';
import { burstConfetti } from './confetti.js';
import { getProfile } from './user-profile.js';
import { showView } from './view-router.js';
import { isClientView } from './client-view.js';
import { CATEGORY_GROUPS, UNSORTED_GROUP, groupByCategory, ideasCountLabel } from './ideas-shelves.js';
import { confirmDialog } from './confirm-dialog.js';

// אימוג'י (📋/🔍) לא היו מובנים כאייקוני פעולה - במיוחד 🔍 (זכוכית
// מגדלת), שנקרא באופן טבעי כ"חיפוש" ולא כ"בדיקה חוזרת בצ'אט". אייקוני
// קו פשוטים (אותו סגנון בדיוק כמו ה-SVG-ים הקיימים ב-.tab-icon/bottom-nav)
// חד-משמעיים יותר ועקביים ויזואלית עם שאר האפליקציה.
const COPY_ICON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const CHECK_ICON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>';
const RECHECK_ICON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';

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

async function celebrateMilestone(count, ideas) {
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
  let detail = 'המשיכי ככה';
  if (leader && leader.n > 0) {
    detail = `הכי הרבה כתבת ב"${leader.category}" (${leader.n})`;
  } else {
    const profile = await getProfile();
    detail = profile && profile.pronoun === 'אתה' ? 'תמשיך ככה' : 'המשיכי ככה';
  }
  showToast(`🎉 ${count} רעיונות במאגר שלך! ${detail}`, { duration: 6000 });
}

let currentIdeas = [];
let showingCompleted = false;

/* 06/11/2026: העיצוב החדש של מסך הרעיונות (js/ideas-shelves.js). כבוי
   כברירת מחדל, ו-app.js מדליק אותו לפי ideasRedesignFor אחרי ההתחברות.
   כשהוא כבוי המסך זהה לחלוטין למה שהיה. */
let redesign = false;
let lastOnItemClick = null;
/* הכפתור הפתוח: '' (הכל סגור), אחד משלושת הסוגים, או UNSORTED_GROUP */
let openGroup = '';
/* "רעיונות שבוצעו": מצב בחירה למחיקה מרובה */
let selectMode = false;
const selectedIds = new Set();
let bulkBusy = false;

/* בטלפון האייפון מתעלם מ-hidden על <option>, ולכן המיון "🔥 הכי חזק קודם"
   יוצא מהרשימה בפועל ונחזר כשהמתג כבוי. */
let ratingSortOption = null;

export function setIdeasRedesign(on) {
  redesign = Boolean(on);
  /* 06/11/2026 ערב (מאיה: "מרגיש מאוד עמוס"): צ'יפי הקטגוריה והקובייה לא
     על המסך. הקטגוריה היא עכשיו שלושת הכפתורים, והקובייה עוברת ל"עוד סינון". */
  const view = document.getElementById('archive-view');
  if (view) view.classList.toggle('ideas-cats', redesign);
  const details = document.querySelector('#archive-view .more-filters-details');
  const dice = document.getElementById('random-idea-btn');
  if (redesign && details && dice && dice.parentElement !== details) details.appendChild(dice);
  /* הטופס כבר לא "מלא": רק הרעיון ולינק, והשאר מסווג לבד */
  const addBtn = document.getElementById('add-idea-top-btn');
  if (addBtn) addBtn.textContent = redesign ? '+ רעיון חדש' : '+ רעיון מלא';

  /* מאיה: "את החלק של חייב לצלם שווה לצלם - להוריד לגמרי". בלי דירוג אין
     סינון לפי דירוג ואין מיון לפיו. */
  const ratingFilter = document.getElementById('filter-rating');
  if (ratingFilter) {
    ratingFilter.hidden = redesign;
    if (redesign) ratingFilter.value = '';
  }
  const sort = document.getElementById('sort-order');
  if (sort) {
    const opt = sort.querySelector('option[value="rating"]');
    if (redesign && opt) {
      if (sort.value === 'rating') sort.value = 'newest';
      ratingSortOption = opt;
      opt.remove();
    } else if (!redesign && !opt && ratingSortOption) {
      sort.appendChild(ratingSortOption);
    }
  }
  if (!redesign) {
    openGroup = '';
    selectMode = false;
    selectedIds.clear();
  }
  if (lastOnItemClick) applyFilters(lastOnItemClick);
}

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

  // רעיונות בלי קטגוריה (הוספה מהירה) נעלמים בשקט מבניית תכנית תוכן
  // (getReadyIdeas שם סופרת רק idea.category) - הפיל הזה נותן תזכורת קבועה
  // וגלויה, לא רק כשיש פחות מ-MIN_READY_IDEAS רעיונות מסווגים (אז כבר יש
  // הודעת gate נפרדת ב-content-plan.js, אבל היא נעלמת ברגע שיש מספיק).
  const draftCount = active.filter((idea) => !idea.category).length;

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
    ${draftCount > 0
      ? `<button type="button" class="stat-pill stat-pill-draft" id="drafts-pending-btn">
      <span class="n">📝 ${draftCount}</span>
      <span class="l">טיוטות ממתינות לסיווג</span>
    </button>`
      : ''}
  `;

  document.getElementById('goal-edit-btn').addEventListener('click', () => {
    const modal = document.getElementById('goal-edit-modal');
    document.getElementById('goal-edit-input').value = String(goal);
    modal.hidden = false;
    document.getElementById('goal-edit-input').focus();
  });

  const draftsBtn = document.getElementById('drafts-pending-btn');
  if (draftsBtn) {
    draftsBtn.addEventListener('click', () => {
      showView('archive');
      const categorySelect = document.getElementById('filter-category');
      if (categorySelect) {
        categorySelect.value = '__none__';
        categorySelect.dispatchEvent(new Event('change'));
      }
    });
  }
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
    selectMode = false;
    selectedIds.clear();
    toggleBtn.textContent = showingCompleted ? 'חזרה לרעיונות פעילים' : 'רעיונות שבוצעו';
    applyFilters(onItemClick);
  });

  const quickAddInput = document.getElementById('quick-add-input');
  const quickAddBtn = document.getElementById('quick-add-btn');
  const draftSavedIndicator = document.getElementById('draft-saved-indicator');
  /* 05/11/2026: הטיוטה נשמרת במפתח אחד למכשיר. בתוך לקוחה (תצוגה כלקוחה)
     מאיה ראתה בתיבה של הלקוחה את הטיוטה של עצמה, ומה שהקלידה שם דרס אותה.
     בתצוגה כלקוחה הטיוטה פשוט לא נשמרת ולא משוחזרת. ללקוחות אין שינוי. */
  const QUICK_ADD_DRAFT_KEY = isClientView() ? null : 'quick-add-draft';
  const draftStore = {
    get: () => { try { return QUICK_ADD_DRAFT_KEY ? localStorage.getItem(QUICK_ADD_DRAFT_KEY) : null; } catch { return null; } },
    set: (v) => { try { if (QUICK_ADD_DRAFT_KEY) localStorage.setItem(QUICK_ADD_DRAFT_KEY, v); } catch { /* אין אחסון */ } },
    clear: () => { try { if (QUICK_ADD_DRAFT_KEY) localStorage.removeItem(QUICK_ADD_DRAFT_KEY); } catch { /* אין אחסון */ } },
  };

  const savedDraft = draftStore.get();
  if (savedDraft) quickAddInput.value = savedDraft;
  const showDraftSaved = debounce(() => {
    if (!quickAddInput.value.trim()) return;
    draftSavedIndicator.hidden = false;
    draftSavedIndicator.classList.remove('draft-saved-pop');
    void draftSavedIndicator.offsetWidth;
    draftSavedIndicator.classList.add('draft-saved-pop');
  }, 400);
  quickAddInput.addEventListener('input', () => {
    draftStore.set(quickAddInput.value);
    showDraftSaved();
  });

  /* 04/11/2026 (ביקורת): התיבה התרוקנה והטיוטה נמחקה *לפני* השמירה. שמירה
     שנדחתה (למשל מנוי שפג) מחקה את הרעיון בשקט. עכשיו מנקים רק אחרי
     שהשמירה הצליחה, ובכישלון הטקסט נשאר והיא רואה למה. */
  let quickAddBusy = false;
  const submitQuickAdd = async () => {
    const title = quickAddInput.value.trim();
    if (!title || quickAddBusy) return;
    quickAddBusy = true;
    quickAddBtn.disabled = true;
    try {
      await addQuickIdea(title);
    } catch (err) {
      console.error('addQuickIdea failed:', err);
      const denied = String(err && err.code).endsWith('permission-denied');
      showToast(
        denied
          ? 'הרעיון לא נשמר: אין כרגע הרשאה לשמור (אולי המנוי הסתיים). הטקסט נשאר בתיבה.'
          : `${serverErrorText(err, 'שמירת הרעיון')} הטקסט נשאר בתיבה.`,
        { duration: 7000 }
      );
      return;
    } finally {
      quickAddBusy = false;
      quickAddBtn.disabled = false;
    }
    // מנקים רק אם בינתיים לא הקלידו משהו חדש
    if (quickAddInput.value.trim() === title) {
      quickAddInput.value = '';
      draftStore.clear();
    }
    if (navigator.vibrate) navigator.vibrate(15);
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
  lastOnItemClick = onItemClick;
  const text = document.getElementById('search-input').value;
  const categorySelect = document.getElementById('filter-category');
  let category = categorySelect.value;
  const audienceScope = document.getElementById('filter-audience-scope').value;
  const persuasionStage = document.getElementById('filter-persuasion').value;
  const rating = redesign ? '' : document.getElementById('filter-rating').value;
  const sortOrder = document.getElementById('sort-order').value;
  /* בעיצוב החדש הקטגוריה היא הכפתור הפתוח. "טיוטות ממתינות לסיווג"
     במסך הבית בוחר '__none__' בתפריט הנסתר, וכאן זה פותח את הכניסה
     של מה שעוד לא סווג. */
  if (redesign && category) {
    openGroup = category === '__none__' ? UNSORTED_GROUP : category;
    categorySelect.value = '';
    category = '';
  }
  const scoped = currentIdeas.filter((idea) => Boolean(idea.completedAt) === showingCompleted);
  const filtered = filterIdeas(scoped, { text, category, audienceScope, persuasionStage, rating });
  const sorted = sortIdeas(filtered, sortOrder);

  animateCountUp(document.getElementById('idea-count'), sorted.length, '');

  const list = document.getElementById('archive-list');
  list.innerHTML = '';
  list.classList.toggle('archive-list--cats', redesign && !showingCompleted);
  const selecting = redesign && showingCompleted && selectMode;
  document.body.classList.toggle('ideas-selecting', selecting);

  if (redesign && !showingCompleted) {
    const unfiltered = sortIdeas(filterIdeas(scoped, { audienceScope, persuasionStage }), sortOrder);
    renderCategoryBoard(list, { all: unfiltered, matches: sorted, text: text.trim(), onItemClick,
      filtering: Boolean(audienceScope || persuasionStage) });
    return;
  }

  /* מחוץ למצב בחירה הסרגל בראש הרשימה. במצב בחירה הוא בסוף ונדבק לתחתית */
  if (redesign && showingCompleted && !selecting) renderDoneToolbar(list, scoped, sorted);

  if (!sorted.length) {
    const empty = document.createElement('li');
    empty.className = 'archive-empty-state';
    if (currentIdeas.length === 0) {
      const addLabel = redesign ? '+ רעיון חדש' : '+ רעיון מלא';
      empty.innerHTML = `<div class="archive-empty-emoji">🌱</div><p>עדיין שקט כאן - הרעיון הראשון מחכה שיכתבו אותו ב"${addLabel}" למעלה</p>`;
    } else if (redesign && showingCompleted && !scoped.length) {
      empty.innerHTML = '<div class="archive-empty-emoji">✓</div><p>אין כרגע רעיונות שבוצעו</p>';
    } else {
      empty.innerHTML = '<div class="archive-empty-emoji">🔍</div><p>כלום לא תואם את החיפוש הזה - נסו מילה אחרת או נקו את הסינון</p>';
    }
    list.appendChild(empty);
    if (selecting) renderDoneToolbar(list, scoped, sorted);
    return;
  }

  if (selecting) {
    sorted.forEach((idea) => list.appendChild(renderSelectRow(idea)));
    renderDoneToolbar(list, scoped, sorted);
    return;
  }

  sorted.forEach((idea, index) => {
    list.appendChild(renderItem(idea, onItemClick, index));
  });
}

/* ---------- שלושת הכפתורים ----------
   06/11/2026 (מאיה: "3 כפתורים בולטים בצבעים שונים, הערך ירוק, החיבור
   האישי ורוד והמכירתי אדום ואז רק שלוחצים נפתחים הרעיונות תחת אותה
   קטגוריה ושיהיה אפשר גם לסגור בקלות"). כפתור אחד פתוח בכל פעם. בטלפון
   הרשימה נפתחת ממש מתחת לכפתור (אקורדיון), ובמחשב הכפתורים בשורה אחת
   והרשימה נפתחת מתחתם לכל הרוחב (css/ideas-shelves.css). */
const BOARD_SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const CHEVRON_SVG = `${BOARD_SVG_OPEN}<polyline points="6 9 12 15 18 9"/></svg>`;
const PANEL_ID = 'cat-panel';

function toggleGroup(id) {
  openGroup = openGroup === id ? '' : id;
  rerenderKeepingFocus(`[data-group="${id}"]`);
}

function rerenderKeepingFocus(selector) {
  if (!lastOnItemClick) return;
  applyFilters(lastOnItemClick);
  const el = document.querySelector(`#archive-list ${selector}`);
  if (el) {
    try { el.focus({ preventScroll: true }); } catch { el.focus(); }
  }
}

function renderCategoryBoard(list, { all, matches, text, onItemClick, filtering }) {
  const groups = groupByCategory(text ? matches : all);
  const board = document.createElement('li');
  board.className = 'cat-board';

  for (const g of CATEGORY_GROUPS) {
    const ideas = groups[g.id];
    const open = !text && openGroup === g.id;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `cat-btn cat-btn--${g.tone}`;
    btn.dataset.group = g.id;
    btn.style.setProperty('--c', categoryColorVar(g.id));
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) btn.setAttribute('aria-controls', PANEL_ID);
    btn.innerHTML = `<span class="cat-btn__icon">${BOARD_SVG_OPEN}${g.icon}</svg></span>`
      + '<span class="cat-btn__text"><span class="cat-btn__name"></span><span class="cat-btn__explain"></span></span>'
      + '<span class="cat-btn__count"></span>'
      + `<span class="cat-btn__chev">${CHEVRON_SVG}</span>`;
    btn.querySelector('.cat-btn__name').textContent = g.id;
    btn.querySelector('.cat-btn__explain').textContent = g.explain;
    btn.querySelector('.cat-btn__count').textContent = String(ideas.length);
    btn.setAttribute('aria-label', `${g.id}, ${ideasCountLabel(ideas.length)}`);
    btn.addEventListener('click', () => toggleGroup(g.id));
    board.appendChild(btn);
    if (open) board.appendChild(renderPanel({ title: g.id, color: categoryColorVar(g.id), ideas, onItemClick, filtering }));
  }

  /* טיוטות שעוד לא סווגו, וגם רעיון ישן שנשאר "בידורי": כניסה רביעית
     קטנה ושקטה, רק כשיש כאלה */
  const unsorted = groups[UNSORTED_GROUP];
  if (!text && (unsorted.length || openGroup === UNSORTED_GROUP)) {
    const open = openGroup === UNSORTED_GROUP;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cat-unsorted';
    btn.dataset.group = UNSORTED_GROUP;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) btn.setAttribute('aria-controls', PANEL_ID);
    btn.innerHTML = '<span class="cat-unsorted__label"></span><span class="cat-unsorted__chev">' + CHEVRON_SVG + '</span>';
    btn.querySelector('.cat-unsorted__label').textContent = `📝 עוד לא סווגו · ${unsorted.length}`;
    btn.addEventListener('click', () => toggleGroup(UNSORTED_GROUP));
    board.appendChild(btn);
    if (open) {
      board.appendChild(renderPanel({ title: 'עוד לא סווגו', ideas: unsorted, onItemClick, filtering,
        hint: 'פותחים רעיון ובוחרים לו סוג, או שומרים אותו ככה והסוג יזוהה לבד', unsorted: true }));
    }
  }

  /* חיפוש עובר על כל הרעיונות, לא רק על הכפתור הפתוח */
  if (text) {
    board.appendChild(renderPanel({ title: `תוצאות חיפוש: ${ideasCountLabel(matches.length)}`, ideas: matches,
      onItemClick, filtering: true, showCategory: true, search: true }));
  }

  list.appendChild(board);
}

function renderPanel({ title, color, ideas, onItemClick, filtering, hint, showCategory = false, unsorted = false, search = false }) {
  const panel = document.createElement('section');
  panel.className = 'cat-panel';
  if (unsorted) panel.classList.add('cat-panel--unsorted');
  if (search) panel.classList.add('cat-panel--search');
  if (!search) panel.id = PANEL_ID;
  if (color) panel.style.setProperty('--c', color);
  panel.setAttribute('aria-label', title);

  const head = document.createElement('div');
  head.className = 'cat-panel__head';
  const h = document.createElement('h3');
  h.className = 'cat-panel__title';
  h.textContent = search ? title : `${title} · ${ideasCountLabel(ideas.length)}`;
  head.appendChild(h);
  if (!search) head.appendChild(closeButton('cat-panel__close'));
  panel.appendChild(head);

  if (hint) {
    const p = document.createElement('p');
    p.className = 'cat-panel__hint';
    p.textContent = hint;
    panel.appendChild(p);
  }

  const ul = document.createElement('ul');
  ul.className = 'cat-panel__list';
  if (!ideas.length) {
    const empty = document.createElement('li');
    empty.className = 'cat-panel__empty';
    empty.textContent = search
      ? 'כלום לא תואם את החיפוש הזה. נסו מילה אחרת'
      : (filtering ? 'אין כאן רעיונות שמתאימים לסינון' : 'עדיין אין כאן רעיונות');
    ul.appendChild(empty);
  }
  ideas.forEach((idea) => ul.appendChild(renderCalmCard(idea, onItemClick, { showCategory: showCategory || unsorted })));
  panel.appendChild(ul);

  /* ברשימה ארוכה סוגרים גם מלמטה, בלי לגלול חזרה למעלה */
  if (!search && ideas.length > 5) panel.appendChild(closeButton('cat-panel__close cat-panel__close--bottom', { scrollBack: true }));
  return panel;
}

function closeButton(className, { scrollBack = false } = {}) {
  const close = document.createElement('button');
  close.type = 'button';
  close.className = className;
  close.innerHTML = '<span aria-hidden="true">✕</span><span>סגירה</span>';
  close.setAttribute('aria-label', 'סגירת הרשימה');
  close.addEventListener('click', () => {
    const id = openGroup;
    openGroup = '';
    rerenderKeepingFocus(`[data-group="${id}"]`);
    const btn = document.querySelector(`#archive-list [data-group="${id}"]`);
    if (scrollBack && btn && btn.scrollIntoView) btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  return close;
}

/* כרטיס שקט: הרעיון, ובחיפוש או בטיוטות גם נקודת הסוג שלו. לחיצה פותחת
   את הרעיון (עריכה, צ'אט, זווית, מחיקה). שני כפתורי אייקון קטנים נשארים,
   כדי ש"בוצע" ו"העתקה" לא ייעלמו מהמסך. בלי 🔥: הדירוג ירד. */
function renderCalmCard(idea, onItemClick, { showCategory = false } = {}) {
  const li = document.createElement('li');
  li.className = 'calm-card';
  li.dataset.id = idea.id;

  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'calm-card__open';
  const text = document.createElement('p');
  text.className = 'calm-card__title';
  text.textContent = idea.title || '';
  open.appendChild(text);

  if (showCategory || idea.sourceLink) {
    const meta = document.createElement('span');
    meta.className = 'calm-card__meta';
    if (showCategory) {
      const cat = document.createElement('span');
      cat.className = 'calm-card__cat';
      if (CATEGORIES.includes(idea.category) || idea.category === 'ערכי') {
        cat.style.setProperty('--c', categoryColorVar(idea.category));
        cat.textContent = idea.category === 'ערכי' ? 'בעל ערך' : idea.category;
      } else {
        cat.textContent = 'עוד לא סווג';
      }
      meta.appendChild(cat);
    }
    if (idea.sourceLink) {
      const link = document.createElement('span');
      link.className = 'calm-card__link';
      link.textContent = '🔗 יש לינק להשראה';
      meta.appendChild(link);
    }
    open.appendChild(meta);
  }
  open.addEventListener('click', () => onItemClick(idea));
  li.appendChild(open);

  const tools = document.createElement('span');
  tools.className = 'calm-card__tools';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'calm-card__tool';
  copy.setAttribute('aria-label', 'העתקת הרעיון');
  copy.innerHTML = COPY_ICON_SVG;
  copy.addEventListener('click', (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(idea.title || '').then(() => showToast('✓ הרעיון הועתק'), () => showToast('ההעתקה נכשלה'));
  });
  const done = document.createElement('button');
  done.type = 'button';
  done.className = 'calm-card__tool';
  done.setAttribute('aria-label', 'סימון שהרעיון בוצע');
  done.textContent = '✓';
  done.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await markIdeaCompleted(idea.id);
      showToast('✓ סומן כבוצע', { actionLabel: 'בטלו', onAction: () => uncompleteIdea(idea.id) });
    } catch (err) {
      console.error('toggle complete failed:', err);
      showToast('הפעולה נכשלה, נסו שוב');
    }
  });
  tools.append(copy, done);
  li.appendChild(tools);
  return li;
}

/* ---------- מחיקה מרובה ב"רעיונות שבוצעו" ----------
   06/11/2026 (מאיה: "מעצבן שיש מלא רעיונות שביצעתי ובשביל למחוק כל רעיון
   זה ממש להיכנס למחוק לוקח מלא זמן ולא נוח בעליל"). שתי דרכים: "בחירה"
   עם תיבות סימון ו"מחיקת הנבחרים", או "מחיקת כל מה שבוצע". שתיהן שואלות
   קודם עם המספר, ואחרי המחיקה אפשר לבטל מההודעה. */
function renderDoneToolbar(list, allDone, visible) {
  const visibleIds = new Set(visible.map((i) => i.id));
  for (const id of [...selectedIds]) if (!visibleIds.has(id)) selectedIds.delete(id);

  const bar = document.createElement('li');
  bar.className = selectMode ? 'done-toolbar done-toolbar--selecting' : 'done-toolbar';
  if (!allDone.length) return;

  const button = (label, cls, onClick) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = label;
    b.disabled = bulkBusy;
    b.addEventListener('click', onClick);
    return b;
  };

  if (!selectMode) {
    const hint = document.createElement('span');
    hint.className = 'done-toolbar__hint';
    hint.textContent = ideasCountLabel(allDone.length) + ' שבוצעו';
    bar.append(
      hint,
      button('בחירה', 'done-toolbar__btn', () => {
        selectMode = true;
        selectedIds.clear();
        rerenderKeepingFocus('.done-toolbar__btn');
      }),
      button(`מחיקת כל מה שבוצע (${allDone.length})`, 'done-toolbar__btn done-toolbar__btn--danger', () => {
        bulkDelete(allDone.map((i) => i.id));
      }),
    );
  } else {
    const count = document.createElement('span');
    count.className = 'done-toolbar__hint';
    count.textContent = selectedIds.size ? `נבחרו ${selectedIds.size}` : 'מסמנים את מה למחוק';
    const allVisibleSelected = visible.length > 0 && visible.every((i) => selectedIds.has(i.id));
    const del = button(`מחיקת הנבחרים (${selectedIds.size})`, 'done-toolbar__btn done-toolbar__btn--danger', () => {
      bulkDelete([...selectedIds]);
    });
    del.disabled = bulkBusy || !selectedIds.size;
    bar.append(
      count,
      button(allVisibleSelected ? 'ניקוי הבחירה' : 'בחירת הכל', 'done-toolbar__btn', () => {
        if (allVisibleSelected) selectedIds.clear();
        else visible.forEach((i) => selectedIds.add(i.id));
        rerenderKeepingFocus('.done-toolbar__btn');
      }),
      del,
      button('ביטול', 'done-toolbar__btn done-toolbar__btn--ghost', () => {
        selectMode = false;
        selectedIds.clear();
        rerenderKeepingFocus('.done-toolbar__btn');
      }),
    );
  }
  list.appendChild(bar);
}

function renderSelectRow(idea) {
  const li = document.createElement('li');
  li.className = 'select-row';
  li.dataset.id = idea.id;
  const label = document.createElement('label');
  label.className = 'select-row__label';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.className = 'select-row__box';
  box.checked = selectedIds.has(idea.id);
  box.addEventListener('change', () => {
    if (box.checked) selectedIds.add(idea.id);
    else selectedIds.delete(idea.id);
    li.classList.toggle('select-row--on', box.checked);
    refreshDoneToolbarCounts();
  });
  const title = document.createElement('span');
  title.className = 'select-row__title';
  title.textContent = idea.title || '';
  label.append(box, title);
  li.classList.toggle('select-row--on', box.checked);
  li.appendChild(label);
  return li;
}

/* סימון תיבה לא מצייר את כל הרשימה מחדש (כדי לא לקפוץ בגלילה), רק את המונים */
function refreshDoneToolbarCounts() {
  const bar = document.querySelector('#archive-list .done-toolbar');
  if (!bar) return;
  const hint = bar.querySelector('.done-toolbar__hint');
  if (hint) hint.textContent = selectedIds.size ? `נבחרו ${selectedIds.size}` : 'מסמנים את מה למחוק';
  const del = bar.querySelector('.done-toolbar__btn--danger');
  if (del) {
    del.textContent = `מחיקת הנבחרים (${selectedIds.size})`;
    del.disabled = bulkBusy || !selectedIds.size;
  }
}

async function bulkDelete(ids) {
  const n = ids.length;
  if (!n || bulkBusy) return;
  const ok = await confirmDialog(
    n === 1 ? 'למחוק רעיון אחד שבוצע?' : `למחוק ${n} רעיונות שבוצעו?`,
    { okLabel: n === 1 ? 'מחיקה' : `מחיקת ${n}`, cancelLabel: 'ביטול' },
  );
  if (!ok) return;
  bulkBusy = true;
  refreshBusy();
  let result;
  try {
    result = await deleteIdeasBulk(ids);
  } catch (err) {
    result = { done: [], failed: ids, error: err };
  } finally {
    bulkBusy = false;
  }
  const { done, failed, error } = result;
  selectMode = false;
  selectedIds.clear();
  if (lastOnItemClick) applyFilters(lastOnItemClick);
  const undo = done.length
    ? { actionLabel: 'בטלו', onAction: () => { restoreIdeasBulk(done).then((r) => { if (r.failed.length) showToast('הביטול לא הצליח לגמרי, נסו שוב'); }); } }
    : {};
  if (!failed.length) {
    showToast(done.length === 1 ? '🗑️ רעיון אחד נמחק' : `🗑️ ${done.length} רעיונות נמחקו`, { ...undo, duration: 7000 });
  } else if (done.length) {
    showToast(`${done.length} נמחקו, ${failed.length} לא נמחקו. ${serverErrorText(error, 'המחיקה')}`, { ...undo, duration: 9000 });
  } else {
    showToast(`שום רעיון לא נמחק. ${serverErrorText(error, 'המחיקה')}`, { duration: 9000 });
  }
}

function refreshBusy() {
  document.querySelectorAll('#archive-list .done-toolbar button').forEach((b) => { b.disabled = true; });
  const del = document.querySelector('#archive-list .done-toolbar__btn--danger');
  if (del) del.textContent = 'מוחקים...';
}

function renderItem(idea, onItemClick, index = 0) {
  const li = document.createElement('li');
  li.className = 'archive-item-outer';

  const doneAction = document.createElement('div');
  doneAction.className = 'swipe-action swipe-action-done';
  doneAction.textContent = idea.completedAt ? '↩' : '✓';
  doneAction.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      if (idea.completedAt) await uncompleteIdea(idea.id);
      else await markIdeaCompleted(idea.id);
    } catch (err) {
      console.error('toggle complete failed:', err);
      showToast('הפעולה נכשלה, נסו שוב');
    }
  });
  li.appendChild(doneAction);

  const deleteAction = document.createElement('div');
  deleteAction.className = 'swipe-action swipe-action-delete';
  deleteAction.textContent = '🗑️';
  deleteAction.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await deleteIdea(idea.id);
      showToast('הרעיון נמחק', { actionLabel: 'בטלו', onAction: () => restoreIdea(idea.id) });
    } catch (err) {
      console.error('deleteIdea failed:', err);
      showToast('המחיקה נכשלה, נסו שוב');
    }
  });
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

  // Used to float as icon-only pills pinned to the card corner, relying on
  // :hover to even show a background and a title="" tooltip to explain what
  // they do - neither exists on a touchscreen (no hover, no mouse to rest
  // over a tooltip), so on her actual iPhone these read as unlabeled icons
  // with zero indication of what they do. Moved into the footer with the
  // complete/undo button (same place, same real-text-label pattern already
  // proven there) so the label is always visible, no interaction required.
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'copy-idea-btn';
  copyBtn.innerHTML = `${COPY_ICON_SVG}<span>העתקה</span>`;
  copyBtn.setAttribute('aria-label', 'העתקת הרעיון');
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(idea.title).then(() => {
      copyBtn.innerHTML = `${CHECK_ICON_SVG}<span>הועתק</span>`;
      setTimeout(() => (copyBtn.innerHTML = `${COPY_ICON_SVG}<span>העתקה</span>`), 1500);
    }).catch((err) => {
      console.error('copy failed:', err);
      showToast('ההעתקה נכשלה');
    });
  });


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

  // Date and all action buttons (copy / recheck / complete-undo) live
  // together in one footer row, not mixed into the wrapping tag row above -
  // that was leaving buttons stranded on their own wrapped line with a
  // large empty gap before the date, making them read as unrelated leftovers.
  const footer = document.createElement('div');
  footer.className = 'archive-item-footer';

  const dateText = formatDate(idea);
  const dateEl = document.createElement('span');
  dateEl.className = 'archive-item-date';
  dateEl.textContent = dateText;
  footer.appendChild(dateEl);

  const actionsGroup = document.createElement('div');
  actionsGroup.className = 'archive-item-actions';
  actionsGroup.appendChild(copyBtn);

  if (idea.completedAt) {
    const undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.className = 'complete-idea-btn';
    undoBtn.textContent = '↩ החזרה לפעילים';
    undoBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await uncompleteIdea(idea.id);
      } catch (err) {
        console.error('uncompleteIdea failed:', err);
        showToast('הפעולה נכשלה, נסו שוב');
      }
    });
    actionsGroup.appendChild(undoBtn);
  } else {
    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'complete-idea-btn';
    doneBtn.textContent = '✓ בוצע';
    doneBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      inner.classList.add('archive-item-pop');
      if (navigator.vibrate) navigator.vibrate(15);
      try {
        await markIdeaCompleted(idea.id);
      } catch (err) {
        console.error('markIdeaCompleted failed:', err);
        showToast('הפעולה נכשלה, נסו שוב');
      }
    });
    actionsGroup.appendChild(doneBtn);
  }

  footer.appendChild(actionsGroup);
  inner.appendChild(footer);

  if (idea.sourceLink) {
    const linkRow = document.createElement('div');
    linkRow.className = 'archive-item-link';

    const thumb = document.createElement('img');
    thumb.className = 'archive-item-thumb';
    thumb.loading = 'lazy';
    thumb.alt = '';
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

    try {
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
    } catch (err) {
      console.error('swipe action failed:', err);
      showToast('הפעולה נכשלה, נסו שוב');
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
