import { functions } from './firebase-init.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { getCurrentIdeas } from './archive-view.js';

const generateWarmingPlan = httpsCallable(functions, 'generateWarmingPlan');

const WEEK_LABELS = {
  week1: '🗓️ שבוע 1 - חימום שוטף',
  week2: '🗓️ שבוע 2 - חימום שוטף',
  week3: '🔥 שבוע 3 - חימום לקראת מכירה',
};

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
    const row = document.createElement('div');
    row.className = 'warming-day-row';

    const dayName = document.createElement('div');
    dayName.className = 'warming-day-name';
    dayName.textContent = item.day || '';
    row.appendChild(dayName);

    const idea = document.createElement('div');
    idea.className = 'warming-day-idea';
    idea.textContent = item.idea || '';
    row.appendChild(idea);

    list.appendChild(row);
  }
  section.appendChild(list);
  return section;
}

function renderPlan(plan) {
  const container = document.getElementById('warming-result');
  container.innerHTML = '';
  for (const weekKey of ['week1', 'week2', 'week3']) {
    if (Array.isArray(plan[weekKey])) {
      container.appendChild(renderWeek(weekKey, plan[weekKey]));
    }
  }
}

export function wireWarmingView() {
  const form = document.getElementById('warming-form');
  const errorEl = document.getElementById('warming-error');
  const loadingEl = document.getElementById('warming-loading');
  const generateBtn = document.getElementById('warming-generate-btn');

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

    try {
      const result = await generateWarmingPlan({ product, audience, extraContext, existingIdeasTitles });
      renderPlan(result.data.plan);
    } catch (err) {
      console.error('generateWarmingPlan failed:', err);
      errorEl.textContent = 'משהו השתבש בבניית התוכנית, נסו שוב.';
      errorEl.hidden = false;
    } finally {
      generateBtn.disabled = false;
      loadingEl.hidden = true;
    }
  });
}
