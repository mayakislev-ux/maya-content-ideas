import { functions } from './firebase-init.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { getCurrentIdeas } from './archive-view.js';
import { saveWarmingPlan, updateWarmingPlan, listWarmingPlans, deleteWarmingPlan } from './warming-store.js';
import { showToast } from './toast.js';
import { makeEditable, makeEditableSelect } from './editable.js';
import { confirmDialog } from './confirm-dialog.js';

const generateWarmingPlan = httpsCallable(functions, 'generateWarmingPlan', { timeout: 170000 });

const WEEK_LABELS = {
  week1: '🗓️ שבוע 1 - חימום שוטף',
  week2: '🗓️ שבוע 2 - חימום שוטף',
  week3: '🔥 שבוע 3 - חימום לקראת מכירה',
};

const STAGE_LABELS = {
  'הכנה': '1️⃣ שלב ההכנה - מודעות לבעיה',
  'חימום עיקרי': '2️⃣ שלב החימום העיקרי - מודעות לפתרון',
  'מכירה': '3️⃣ מכירה',
  'אחרי מכירה': '4️⃣ אחרי המכירה - פומו',
};

let currentPlan = null;
let currentMeta = null;
let currentPlanId = null;
let countdownInterval = null;

function startCountdown() {
  const el = document.getElementById('warming-countdown');
  let secondsLeft = 40;
  el.textContent = `בונה תוכנית... בערך ${secondsLeft} שניות נותרו`;
  countdownInterval = setInterval(() => {
    secondsLeft -= 1;
    el.textContent =
      secondsLeft > 0 ? `בונה תוכנית... בערך ${secondsLeft} שניות נותרו` : 'כמעט מוכן, עוד רגע... 🔥';
  }, 1000);
}

function stopCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = null;
}

// Checking off a story/day only ever updated the in-memory plan object -
// it looked "not saved" the moment she left the screen or reloaded, since
// nothing wrote it back to Firestore until she pressed the save button
// again herself. Once a plan has been saved once (currentPlanId exists),
// every checkbox toggle now persists immediately on its own.
function autosaveCheckboxChange() {
  if (!currentPlanId || !currentPlan) return;
  updateWarmingPlan(currentPlanId, { plan: currentPlan }).catch((err) => {
    console.error('Warming checkbox autosave failed:', err);
    showToast('הסימון לא נשמר - בדקו חיבור לאינטרנט ונסו שוב');
  });
}

function renderDayRow(item) {
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

  const dayName = document.createElement('div');
  dayName.className = 'warming-day-name';
  dayName.textContent = item.day || '';
  textWrap.appendChild(dayName);

  const law = document.createElement('div');
  law.className = 'warming-law-label';
  law.textContent = item.law || '-';
  law.title = 'לחיצה עורכת';
  makeEditable(law, (val) => (item.law = val));
  textWrap.appendChild(law);

  const idea = document.createElement('div');
  idea.className = 'warming-day-idea';
  idea.textContent = item.idea || '';
  idea.title = 'לחיצה עורכת';
  makeEditable(idea, (val) => (item.idea = val));
  textWrap.appendChild(idea);

  row.appendChild(textWrap);
  return row;
}

function renderWeek(weekKey, days) {
  const section = document.createElement('details');
  section.className = 'warming-week';
  section.open = true;

  const summary = document.createElement('summary');
  summary.textContent = WEEK_LABELS[weekKey] || weekKey;
  section.appendChild(summary);

  const list = document.createElement('div');
  list.className = 'warming-days';
  for (const item of days) {
    list.appendChild(renderDayRow(item));
  }
  section.appendChild(list);
  return section;
}

function renderBlock(block) {
  const wrap = document.createElement('div');
  wrap.className = 'warming-block';
  if (block.done) wrap.classList.add('warming-done');

  const header = document.createElement('div');
  header.className = 'warming-block-header';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'warming-checkbox';
  checkbox.checked = Boolean(block.done);
  checkbox.addEventListener('change', () => {
    block.done = checkbox.checked;
    wrap.classList.toggle('warming-done', checkbox.checked);
    autosaveCheckboxChange();
  });
  header.appendChild(checkbox);

  const stageTag = document.createElement('span');
  stageTag.className = 'warming-stage-tag';
  makeEditableSelect(
    stageTag,
    Object.keys(STAGE_LABELS),
    block.stage || '',
    (val) => {
      block.stage = val;
    },
    (value) => document.createTextNode(value ? STAGE_LABELS[value] || value : '-')
  );
  header.appendChild(stageTag);

  const label = document.createElement('div');
  label.className = 'warming-block-label';
  label.textContent = block.label || '';
  label.title = 'לחיצה עורכת';
  makeEditable(label, (val) => (block.label = val));
  header.appendChild(label);

  wrap.appendChild(header);

  const stories = document.createElement('div');
  stories.className = 'warming-stories';
  (block.stories || []).forEach((story, i) => {
    const storyRow = document.createElement('div');
    storyRow.className = 'warming-story-row';

    const num = document.createElement('span');
    num.className = 'warming-story-num';
    num.textContent = `סטורי ${i + 1}`;
    storyRow.appendChild(num);

    const format = document.createElement('span');
    format.className = 'warming-story-format';
    format.textContent = story.format ? `(${story.format})` : '-';
    format.title = 'לחיצה עורכת';
    makeEditable(format, (val) => (story.format = val));
    storyRow.appendChild(format);

    const idea = document.createElement('div');
    idea.className = 'warming-story-idea';
    idea.textContent = story.idea || '';
    idea.title = 'לחיצה עורכת';
    makeEditable(idea, (val) => (story.idea = val));
    storyRow.appendChild(idea);

    stories.appendChild(storyRow);
  });
  wrap.appendChild(stories);

  return wrap;
}

function renderWeek3(blocks) {
  const section = document.createElement('details');
  section.className = 'warming-week warming-week3';
  section.open = true;

  const summary = document.createElement('summary');
  summary.textContent = WEEK_LABELS.week3;
  section.appendChild(summary);

  const list = document.createElement('div');
  list.className = 'warming-blocks';
  for (const block of blocks) {
    list.appendChild(renderBlock(block));
  }
  section.appendChild(list);
  return section;
}

function renderPlan(plan) {
  const container = document.getElementById('warming-result');
  container.innerHTML = '';
  if (Array.isArray(plan.week1)) container.appendChild(renderWeek('week1', plan.week1));
  if (Array.isArray(plan.week2)) container.appendChild(renderWeek('week2', plan.week2));
  if (Array.isArray(plan.week3)) container.appendChild(renderWeek3(plan.week3));
  document.getElementById('warming-save-btn').hidden = false;
  document.getElementById('warming-save-btn-top').hidden = false;
}

// Surfaces exactly what the AI itself flagged as missing (e.g. no real
// client story for חוק הראי) instead of silently falling back to generic
// placeholders throughout the plan - she can fill these in and regenerate
// for a sharper result, without a whole separate clarifying-chat screen.
function renderMissingInfo(missingInfo) {
  const container = document.getElementById('warming-missing-info');
  container.innerHTML = '';
  if (!Array.isArray(missingInfo) || !missingInfo.length) {
    container.hidden = true;
    return;
  }
  const title = document.createElement('div');
  title.className = 'warming-missing-info-title';
  title.textContent = '💡 כדי לדייק את התוכנית עוד יותר, כדאי להוסיף:';
  container.appendChild(title);
  const list = document.createElement('ul');
  missingInfo.forEach((q) => {
    const li = document.createElement('li');
    li.textContent = q;
    list.appendChild(li);
  });
  container.appendChild(list);
  container.hidden = false;
}

function renderSavedList(plans, onOpen, onDelete) {
  const container = document.getElementById('warming-saved-list');
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
    btn.textContent = `${p.product} - ${p.audience} (${dateText})`;
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

const WARMING_DRAFT_KEY = 'warming-form-draft';

export function wireWarmingView() {
  const form = document.getElementById('warming-form');
  const errorEl = document.getElementById('warming-error');
  const loadingEl = document.getElementById('warming-loading');
  const generateBtn = document.getElementById('warming-generate-btn');
  const saveBtn = document.getElementById('warming-save-btn');
  const saveBtnTop = document.getElementById('warming-save-btn-top');
  const savedToggleBtn = document.getElementById('warming-saved-toggle-btn');
  const savedListEl = document.getElementById('warming-saved-list');
  const truncationNoteEl = document.getElementById('warming-truncation-note');

  const productInput = document.getElementById('warming-product');
  const audienceInput = document.getElementById('warming-audience');
  const contextInput = document.getElementById('warming-context');

  try {
    const draft = JSON.parse(localStorage.getItem(WARMING_DRAFT_KEY) || 'null');
    if (draft) {
      productInput.value = draft.product || '';
      audienceInput.value = draft.audience || '';
      contextInput.value = draft.extraContext || '';
    }
  } catch (err) {
    console.error('Failed to restore warming form draft:', err);
  }

  const saveDraft = () => {
    localStorage.setItem(
      WARMING_DRAFT_KEY,
      JSON.stringify({ product: productInput.value, audience: audienceInput.value, extraContext: contextInput.value })
    );
  };
  productInput.addEventListener('input', saveDraft);
  audienceInput.addEventListener('input', saveDraft);
  contextInput.addEventListener('input', saveDraft);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const product = document.getElementById('warming-product').value.trim();
    const audience = document.getElementById('warming-audience').value.trim();
    const extraContext = document.getElementById('warming-context').value.trim();
    if (!product || !audience) {
      errorEl.textContent = 'צריך למלא מוצר/הצעה וקהל יעד כדי לבנות תוכנית (רווחים בלבד לא נספרים כמילוי)';
      errorEl.hidden = false;
      return;
    }

    // Bare titles gave the AI a one-line label with no real substance to
    // actually "weave in" - the ideas collection has much richer fields
    // (hookText, category, persuasionStage, rating) that were being
    // silently dropped. Only ideas with real hookText content count as
    // usable material, ranked by rating so the strongest ones lead - matches
    // "if something strong fits," not "dump every quick-added title."
    const eligibleIdeas = getCurrentIdeas()
      .filter((idea) => idea.hookText && idea.hookText.trim())
      .sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
    const existingIdeasTitles = eligibleIdeas.slice(0, 15).map((idea) => {
      const tags = [idea.category, idea.persuasionStage].filter(Boolean).join(' | ');
      return `${idea.title}${tags ? ` (${tags})` : ''}: ${idea.hookText.trim()}`;
    });

    generateBtn.disabled = true;
    loadingEl.hidden = false;
    document.getElementById('warming-result').innerHTML = '';
    document.getElementById('warming-missing-info').hidden = true;
    truncationNoteEl.hidden = true;
    saveBtn.hidden = true;
    saveBtnTop.hidden = true;
    startCountdown();

    try {
      const result = await generateWarmingPlan({ product, audience, extraContext, existingIdeasTitles });
      currentPlan = result.data.plan;
      currentMeta = { product, audience, extraContext };
      currentPlanId = null;
      renderPlan(currentPlan);
      renderMissingInfo(result.data.missingInfo);
      if (eligibleIdeas.length > 15) {
        truncationNoteEl.textContent = `✂️ התוכנית נבנתה מתוך 15 הרעיונות המדורגים הכי גבוה עם טקסט זווית, מתוך ${eligibleIdeas.length} שיש לך במאגר`;
        truncationNoteEl.hidden = false;
      }
    } catch (err) {
      console.error('generateWarmingPlan failed:', err);
      const hasHebrewText = /[\u0590-\u05FF]/.test(err.message || '');
      errorEl.textContent = hasHebrewText
        ? `משהו השתבש בבניית התוכנית: ${err.message}. נסו שוב.`
        : 'משהו השתבש בבניית התוכנית, נסו שוב.';
      errorEl.hidden = false;
    } finally {
      generateBtn.disabled = false;
      loadingEl.hidden = true;
      stopCountdown();
    }
  });

  async function handleSaveClick() {
    if (!currentPlan || !currentMeta) return;
    saveBtn.disabled = true;
    saveBtnTop.disabled = true;
    try {
      if (currentPlanId) {
        await updateWarmingPlan(currentPlanId, { plan: currentPlan });
      } else {
        const ref = await saveWarmingPlan({ ...currentMeta, plan: currentPlan });
        currentPlanId = ref.id;
      }
      showToast('💾 התוכנית נשמרה בהצלחה');
      // The draft (product/audience/context) used to keep auto-filling the
      // form on every future visit, saved or not - so "building a new plan"
      // after saving one silently reused the exact same inputs and got back
      // an almost-identical plan, which read as "it's not building anything
      // new." Once a plan is actually saved, that input combination is
      // done - clear the draft so the next visit starts blank and ready for
      // a genuinely new product/audience, instead of stuck on repeat.
      localStorage.removeItem(WARMING_DRAFT_KEY);
    } catch (err) {
      console.error('saveWarmingPlan failed:', err);
      showToast('משהו השתבש בשמירה, נסו שוב');
    } finally {
      saveBtn.disabled = false;
      saveBtnTop.disabled = false;
    }
  }
  saveBtn.addEventListener('click', handleSaveClick);
  saveBtnTop.addEventListener('click', handleSaveClick);

  async function refreshSavedList() {
    savedListEl.textContent = 'טוען...';
    try {
      const plans = await listWarmingPlans();
      renderSavedList(
        plans,
        (p) => {
          currentPlan = p.plan;
          currentMeta = { product: p.product, audience: p.audience, extraContext: p.extraContext };
          currentPlanId = p.id;
          document.getElementById('warming-product').value = p.product;
          document.getElementById('warming-audience').value = p.audience;
          document.getElementById('warming-context').value = p.extraContext || '';
          renderPlan(currentPlan);
          document.getElementById('warming-missing-info').hidden = true;
          truncationNoteEl.hidden = true;
          savedListEl.hidden = true;
        },
        async (p) => {
          const confirmed = await confirmDialog(`למחוק את התוכנית "${p.product} - ${p.audience}"? הפעולה לא הפיכה.`, { okLabel: 'מחיקה', cancelLabel: 'ביטול' });
          if (!confirmed) return;
          try {
            await deleteWarmingPlan(p.id);
            if (currentPlanId === p.id) {
              // התוכנית שנמחקה היא בדיוק זו שמוצגת כרגע - בלי הניקוי הזה
              // התצוגה נשארת עם כפתור שמירה זמין, ולחיצה עליו הייתה יוצרת
              // בטעות מסמך חדש עם אותו תוכן שנמחק הרגע.
              currentPlanId = null;
              currentPlan = null;
              currentMeta = null;
              document.getElementById('warming-result').innerHTML = '';
              document.getElementById('warming-missing-info').hidden = true;
              truncationNoteEl.hidden = true;
              saveBtn.hidden = true;
              saveBtnTop.hidden = true;
            }
            showToast('🗑️ התוכנית נמחקה');
            refreshSavedList();
          } catch (err) {
            console.error('deleteWarmingPlan failed:', err);
            showToast('משהו השתבש במחיקה, נסו שוב');
          }
        }
      );
    } catch (err) {
      console.error('listWarmingPlans failed:', err);
      savedListEl.textContent = 'משהו השתבש בטעינת התוכניות השמורות.';
    }
  }

  savedToggleBtn.addEventListener('click', () => {
    const opening = savedListEl.hidden;
    savedListEl.hidden = !opening;
    if (opening) refreshSavedList();
  });
}
