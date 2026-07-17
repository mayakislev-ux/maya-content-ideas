import { functions } from './firebase-init.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { getCurrentIdeas } from './archive-view.js';
import { categoryColorVar, categoryIcon } from './ideas-logic.js';
import { saveContentPlan, updateContentPlan, listContentPlans, deleteContentPlan } from './content-plan-store.js';
import { makeEditable } from './warming.js';
import { showToast } from './toast.js';

const generateContentPlan = httpsCallable(functions, 'generateContentPlan');

// "רעיון עם זווית" אין לו שדה נפרד באפליקציה - הפרוקסי הכי אמין שיש
// למאמץ שכבר הושקע ברעיון הוא שהוא כבר סווג לקטגוריה (לא נשאר טיוטה
// גולמית). מתחת לסף הזה תכנית תוכן פשוט לא תהיה בנויה על משהו ממשי.
const MIN_READY_IDEAS = 6;

let currentPlan = null;
let currentMeta = null;
let currentPlanId = null;

function getReadyIdeas() {
  return getCurrentIdeas().filter((idea) => Boolean(idea.category));
}

function autosaveCheckboxChange() {
  if (!currentPlanId || !currentPlan) return;
  updateContentPlan(currentPlanId, { plan: currentPlan }).catch((err) => {
    console.error('Content plan checkbox autosave failed:', err);
    showToast('הסימון לא נשמר - בדקו חיבור לאינטרנט ונסו שוב');
  });
}

function renderItem(item) {
  const row = document.createElement('div');
  row.className = 'warming-day-row';
  if (item.done) row.classList.add('warming-done');

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'warming-checkbox';
  checkbox.checked = Boolean(item.done);
  checkbox.addEventListener('change', () => {
    item.done = checkbox.checked;
    row.classList.toggle('warming-done', checkbox.checked);
    autosaveCheckboxChange();
  });
  row.appendChild(checkbox);

  const textWrap = document.createElement('div');
  textWrap.className = 'warming-day-text';

  const dayEl = document.createElement('div');
  dayEl.className = 'warming-day-name';
  dayEl.textContent = item.day || '';
  textWrap.appendChild(dayEl);

  if (item.type === 'live') {
    const liveTag = document.createElement('span');
    liveTag.className = 'content-plan-live-tag';
    liveTag.textContent = '🎤 תוכן חי';
    textWrap.appendChild(liveTag);

    const note = document.createElement('div');
    note.className = 'warming-day-idea';
    note.textContent = item.note || '';
    note.title = 'לחיצה עורכת';
    makeEditable(note, (val) => (item.note = val));
    textWrap.appendChild(note);
  } else {
    if (item.category) {
      const tag = document.createElement('span');
      tag.className = 'card-category-tag';
      tag.style.setProperty('--card-color', categoryColorVar(item.category));
      tag.textContent = `${categoryIcon(item.category)} ${item.category}`;
      textWrap.appendChild(tag);
    }
    const title = document.createElement('div');
    title.className = 'warming-day-idea';
    title.textContent = item.ideaTitle || '';
    title.title = 'לחיצה עורכת';
    makeEditable(title, (val) => (item.ideaTitle = val));
    textWrap.appendChild(title);
  }

  row.appendChild(textWrap);
  return row;
}

function renderWeek(week) {
  const section = document.createElement('details');
  section.className = 'warming-week';
  section.open = true;

  const summary = document.createElement('summary');
  summary.textContent = week.label || '';
  section.appendChild(summary);

  if (week.note && week.note.trim()) {
    const note = document.createElement('p');
    note.className = 'content-plan-week-note';
    note.textContent = `⚠️ ${week.note.trim()}`;
    section.appendChild(note);
  }

  const list = document.createElement('div');
  list.className = 'warming-days';
  for (const item of week.items || []) {
    list.appendChild(renderItem(item));
  }
  section.appendChild(list);
  return section;
}

function renderPlan(plan) {
  const container = document.getElementById('content-plan-result');
  container.innerHTML = '';
  for (const week of plan.weeks || []) {
    container.appendChild(renderWeek(week));
  }
  document.getElementById('content-plan-save-btn').hidden = false;
}

function renderSavedList(plans, onOpen, onDelete) {
  const container = document.getElementById('content-plan-saved-list');
  container.innerHTML = '';
  if (!plans.length) {
    container.textContent = 'עדיין אין תוכניות שמורות.';
    return;
  }
  for (const p of plans) {
    const row = document.createElement('div');
    row.className = 'warming-saved-row';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'warming-saved-item';
    const dateText = p.createdAt && p.createdAt.toDate ? p.createdAt.toDate().toLocaleDateString('he-IL') : '';
    btn.textContent = `תכנית תוכן (${dateText})`;
    btn.addEventListener('click', () => onOpen(p));
    row.appendChild(btn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'warming-saved-delete-btn';
    deleteBtn.textContent = '🗑️';
    deleteBtn.setAttribute('aria-label', 'מחיקת התוכנית');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onDelete(p);
    });
    row.appendChild(deleteBtn);

    container.appendChild(row);
  }
}

function refreshGate() {
  const readyCount = getReadyIdeas().length;
  const gateMsg = document.getElementById('content-plan-gate-msg');
  const form = document.getElementById('content-plan-form');
  const enough = readyCount >= MIN_READY_IDEAS;
  gateMsg.hidden = enough;
  form.hidden = !enough;
  if (!enough) {
    gateMsg.textContent = `כדי לבנות תכנית תוכן צריך קודם מספיק רעיונות מסווגים (עם קטגוריה) במאגר - יש לך כרגע ${readyCount} מתוך ${MIN_READY_IDEAS} הדרושים. לכי ל"הרעיונות שלי" והוסיפי/סווגי עוד רעיונות קודם.`;
  }
}

export function wireContentPlanView() {
  const form = document.getElementById('content-plan-form');
  const errorEl = document.getElementById('content-plan-error');
  const loadingEl = document.getElementById('content-plan-loading');
  const generateBtn = document.getElementById('content-plan-generate-btn');
  const saveBtn = document.getElementById('content-plan-save-btn');
  const savedToggleBtn = document.getElementById('content-plan-saved-toggle-btn');
  const savedListEl = document.getElementById('content-plan-saved-list');

  refreshGate();
  document.getElementById('tab-content-plan').addEventListener('click', refreshGate);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const weeksCount = Number(document.getElementById('content-plan-weeks').value) || 4;
    const postsPerWeek = Number(document.getElementById('content-plan-posts-per-week').value) || 3;
    const liveContentNote = document.getElementById('content-plan-live-note').value.trim();

    const readyIdeas = getReadyIdeas().map((idea) => ({
      title: idea.title,
      category: idea.category,
      persuasionStage: idea.persuasionStage || '',
      rating: idea.rating || '',
    }));

    generateBtn.disabled = true;
    loadingEl.hidden = false;
    document.getElementById('content-plan-result').innerHTML = '';
    saveBtn.hidden = true;

    try {
      const result = await generateContentPlan({ weeksCount, postsPerWeek, liveContentNote, ideas: readyIdeas });
      currentPlan = result.data.plan;
      currentMeta = { weeksCount, postsPerWeek, liveContentNote };
      currentPlanId = null;
      renderPlan(currentPlan);
    } catch (err) {
      console.error('generateContentPlan failed:', err);
      errorEl.textContent = 'משהו השתבש בבניית התכנית, נסו שוב.';
      errorEl.hidden = false;
    } finally {
      generateBtn.disabled = false;
      loadingEl.hidden = true;
    }
  });

  saveBtn.addEventListener('click', async () => {
    if (!currentPlan || !currentMeta) return;
    saveBtn.disabled = true;
    try {
      if (currentPlanId) {
        await updateContentPlan(currentPlanId, { plan: currentPlan });
      } else {
        const ref = await saveContentPlan({ ...currentMeta, plan: currentPlan });
        currentPlanId = ref.id;
      }
      showToast('💾 התכנית נשמרה בהצלחה');
    } catch (err) {
      console.error('saveContentPlan failed:', err);
      showToast('משהו השתבש בשמירה, נסו שוב');
    } finally {
      saveBtn.disabled = false;
    }
  });

  async function refreshSavedList() {
    savedListEl.textContent = 'טוען...';
    try {
      const plans = await listContentPlans();
      renderSavedList(
        plans,
        (p) => {
          currentPlan = p.plan;
          currentMeta = { weeksCount: p.weeksCount, postsPerWeek: p.postsPerWeek, liveContentNote: p.liveContentNote };
          currentPlanId = p.id;
          renderPlan(currentPlan);
          savedListEl.hidden = true;
        },
        async (p) => {
          try {
            await deleteContentPlan(p.id);
            if (currentPlanId === p.id) currentPlanId = null;
            showToast('🗑️ התכנית נמחקה');
            refreshSavedList();
          } catch (err) {
            console.error('deleteContentPlan failed:', err);
            showToast('משהו השתבש במחיקה, נסו שוב');
          }
        }
      );
    } catch (err) {
      console.error('listContentPlans failed:', err);
      savedListEl.textContent = 'משהו השתבש בטעינת התוכניות השמורות.';
    }
  }

  savedToggleBtn.addEventListener('click', () => {
    const opening = savedListEl.hidden;
    savedListEl.hidden = !opening;
    if (opening) refreshSavedList();
  });
}
