import { functions } from './firebase-init.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { getCurrentIdeas } from './archive-view.js';
import { saveWarmingPlan, updateWarmingPlan, listWarmingPlans } from './warming-store.js';
import { showToast } from './toast.js';

const generateWarmingPlan = httpsCallable(functions, 'generateWarmingPlan');

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

function makeEditable(el, onCommit) {
  el.contentEditable = 'true';
  el.classList.add('warming-editable');
  el.addEventListener('blur', () => onCommit(el.textContent.trim()));
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
  });
  row.appendChild(checkbox);

  const textWrap = document.createElement('div');
  textWrap.className = 'warming-day-text';

  const dayName = document.createElement('div');
  dayName.className = 'warming-day-name';
  dayName.textContent = item.day || '';
  textWrap.appendChild(dayName);

  if (item.law) {
    const law = document.createElement('div');
    law.className = 'warming-law-label';
    law.textContent = item.law;
    law.title = 'לחיצה עורכת';
    makeEditable(law, (val) => (item.law = val));
    textWrap.appendChild(law);
  }

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
  });
  header.appendChild(checkbox);

  const stageTag = document.createElement('span');
  stageTag.className = 'warming-stage-tag';
  stageTag.textContent = STAGE_LABELS[block.stage] || block.stage || '';
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

    if (story.format) {
      const format = document.createElement('span');
      format.className = 'warming-story-format';
      format.textContent = `(${story.format})`;
      format.title = 'לחיצה עורכת';
      makeEditable(format, (val) => (story.format = val));
      storyRow.appendChild(format);
    }

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
}

function renderSavedList(plans, onOpen) {
  const container = document.getElementById('warming-saved-list');
  container.innerHTML = '';
  if (!plans.length) {
    container.textContent = 'עדיין אין תוכניות שמורות.';
    return;
  }
  for (const p of plans) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'warming-saved-item';
    const dateText = p.createdAt && p.createdAt.toDate ? p.createdAt.toDate().toLocaleDateString('he-IL') : '';
    btn.textContent = `${p.product} - ${p.audience} (${dateText})`;
    btn.addEventListener('click', () => onOpen(p));
    container.appendChild(btn);
  }
}

export function wireWarmingView() {
  const form = document.getElementById('warming-form');
  const errorEl = document.getElementById('warming-error');
  const loadingEl = document.getElementById('warming-loading');
  const generateBtn = document.getElementById('warming-generate-btn');
  const saveBtn = document.getElementById('warming-save-btn');
  const savedToggleBtn = document.getElementById('warming-saved-toggle-btn');
  const savedListEl = document.getElementById('warming-saved-list');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const product = document.getElementById('warming-product').value.trim();
    const audience = document.getElementById('warming-audience').value.trim();
    const extraContext = document.getElementById('warming-context').value.trim();
    if (!product || !audience) return;

    const existingIdeasTitles = getCurrentIdeas()
      .map((idea) => idea.title)
      .filter(Boolean);

    generateBtn.disabled = true;
    loadingEl.hidden = false;
    document.getElementById('warming-result').innerHTML = '';
    saveBtn.hidden = true;

    try {
      const result = await generateWarmingPlan({ product, audience, extraContext, existingIdeasTitles });
      currentPlan = result.data.plan;
      currentMeta = { product, audience, extraContext };
      currentPlanId = null;
      renderPlan(currentPlan);
    } catch (err) {
      console.error('generateWarmingPlan failed:', err);
      errorEl.textContent = 'משהו השתבש בבניית התוכנית, נסו שוב.';
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
        await updateWarmingPlan(currentPlanId, { plan: currentPlan });
      } else {
        const ref = await saveWarmingPlan({ ...currentMeta, plan: currentPlan });
        currentPlanId = ref.id;
      }
      showToast('💾 התוכנית נשמרה בהצלחה');
    } catch (err) {
      console.error('saveWarmingPlan failed:', err);
      showToast('משהו השתבש בשמירה, נסו שוב');
    } finally {
      saveBtn.disabled = false;
    }
  });

  savedToggleBtn.addEventListener('click', async () => {
    const opening = savedListEl.hidden;
    savedListEl.hidden = !opening;
    if (!opening) return;

    savedListEl.textContent = 'טוען...';
    try {
      const plans = await listWarmingPlans();
      renderSavedList(plans, (p) => {
        currentPlan = p.plan;
        currentMeta = { product: p.product, audience: p.audience, extraContext: p.extraContext };
        currentPlanId = p.id;
        document.getElementById('warming-product').value = p.product;
        document.getElementById('warming-audience').value = p.audience;
        document.getElementById('warming-context').value = p.extraContext || '';
        renderPlan(currentPlan);
        savedListEl.hidden = true;
      });
    } catch (err) {
      console.error('listWarmingPlans failed:', err);
      savedListEl.textContent = 'משהו השתבש בטעינת התוכניות השמורות.';
    }
  });
}
