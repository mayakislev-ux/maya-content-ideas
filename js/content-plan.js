import { functions } from './firebase-init.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { getCurrentIdeas } from './archive-view.js';
import {
  categoryColorVar,
  categoryIcon,
  CATEGORIES,
  PERSUASION_STAGES,
  AUDIENCE_SCOPES,
  MUST_INCLUDE_TYPES,
  RATINGS,
  VIRAL_SCOPE,
  findSimilarIdea,
} from './ideas-logic.js';
import { saveContentPlan, updateContentPlan, listContentPlans, deleteContentPlan } from './content-plan-store.js';
import { makeEditable } from './editable.js';
import { showToast } from './toast.js';

const generateContentPlan = httpsCallable(functions, 'generateContentPlan');

// "רעיון עם זווית" אין לו שדה נפרד באפליקציה - הפרוקסי הכי אמין שיש
// למאמץ שכבר הושקע ברעיון הוא שהוא כבר סווג לקטגוריה (לא נשאר טיוטה
// גולמית). מתחת לסף הזה תכנית תוכן פשוט לא תהיה בנויה על משהו ממשי.
const MIN_READY_IDEAS = 6;

// יעד המינימום שמאיה קבעה - "לפחות 16, זו תמיד ההמלצה לצמיחה מהירה".
// המשתמשת יכולה להזין יותר, לא פחות (גם ולידציה בטופס וגם כאן כברירת מחדל).
const MIN_PIECE_COUNT = 16;

// תואם את ה-slice(0, 60) הקיים בצד השרת (functions/index.js) ואת
// max="60" בטופס (index.html) - קבוע אחד כאן כדי שהודעת החיתוך
// בסקורקארד לעולם לא תתייחס למספר שונה מזה שבאמת נשלח.
const MAX_IDEAS_SENT = 60;

// דירוג חסר (רעיונות ישנים, מלפני שהשדה rating נוסף) חייב להיחשב
// הכי פחות דחוף, לא הכי דחוף - RATINGS.indexOf מחזיר -1 לרעיון בלי
// rating, שבמיון רגיל היה קופץ לפני 🔥 בטעות.
function ratingRank(rating) {
  const i = RATINGS.indexOf(rating);
  return i === -1 ? RATINGS.length : i;
}

const CATEGORY_TARGETS = {
  'בעל ערך': 0.4,
  'אישי': 0.3,
  'מכירתי': 0.15,
  'בידורי': 0.15,
};

const STAGE_SHORT_LABELS = {
  [PERSUASION_STAGES[0]]: 'שלב 1',
  [PERSUASION_STAGES[1]]: 'שלב 2',
  [PERSUASION_STAGES[2]]: 'שלב 3',
};

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

// ===== Scorecard: כל האחוזים מחושבים כאן ב-JS רגיל, לא ב-AI. =====

function pct(count, total) {
  return total ? count / total : 0;
}

function withinHalfDouble(actual, target) {
  return actual >= target / 2 && actual <= target * 2;
}

function getAppItems(plan) {
  return (plan.weeks || []).flatMap((w) => (w.items || []).filter((i) => i.type !== 'live'));
}

function checkCategoryRatio(appItems) {
  const total = appItems.length;
  if (!total) return [];
  const counts = {};
  for (const item of appItems) counts[item.category] = (counts[item.category] || 0) + 1;
  return Object.entries(CATEGORY_TARGETS).map(([cat, target]) => {
    const actual = pct(counts[cat] || 0, total);
    return { label: `${cat}: ${Math.round(actual * 100)}% (יעד ${Math.round(target * 100)}%)`, ok: withinHalfDouble(actual, target) };
  });
}

function checkMustIncludeCoverage(appItems) {
  const total = appItems.length;
  if (!total) return null;
  const tagged = appItems.filter((i) => MUST_INCLUDE_TYPES.includes(i.mustIncludeType)).length;
  const actual = pct(tagged, total);
  return { label: `כיסוי 8 סוגי התוכן: ${Math.round(actual * 100)}% (יעד 80%+)`, ok: actual >= 0.8 };
}

function checkVirality(appItems) {
  const total = appItems.length;
  if (!total) return null;
  const actual = pct(appItems.filter((i) => i.audienceScope === VIRAL_SCOPE).length, total);
  return { label: `ויראליות: ${Math.round(actual * 100)}% (יעד כ-30%)`, ok: withinHalfDouble(actual, 0.3) };
}

function checkAudience(appItems) {
  const primary = appItems.filter((i) => i.audienceScope === 'עיקרי').length;
  const secondary = appItems.filter((i) => i.audienceScope === 'משני').length;
  const total = primary + secondary;
  if (!total) return null;
  const secondaryShare = pct(secondary, total);
  return { label: `קהל משני: ${Math.round(secondaryShare * 100)}% (יעד עד כ-20%)`, ok: secondaryShare <= 0.4 };
}

function checkPersuasionStages(appItems) {
  const total = appItems.length;
  if (!total) return [];
  const counts = {};
  for (const item of appItems) counts[item.persuasionStage] = (counts[item.persuasionStage] || 0) + 1;
  return PERSUASION_STAGES.map((stage, i) => {
    const actual = pct(counts[stage] || 0, total);
    return { label: `שלב שכנוע ${i + 1}: ${Math.round(actual * 100)}%`, ok: withinHalfDouble(actual, 1 / 3) };
  });
}

function checkSeries(plan) {
  const note = (plan.seriesNote || '').trim();
  return { label: note ? `סדרה/פורמט חוזר: ${note}` : 'אין כרגע סדרה חוזרת - לא חובה אבל מומלץ לצמיחת עוקבים', ok: Boolean(note) };
}

function checkBankGaps(readyIdeas) {
  const total = readyIdeas.length;
  if (!total) return [];
  const counts = {};
  for (const idea of readyIdeas) counts[idea.category] = (counts[idea.category] || 0) + 1;
  const gaps = [];
  for (const [cat, target] of Object.entries(CATEGORY_TARGETS)) {
    const actual = pct(counts[cat] || 0, total);
    if (actual < target / 2) {
      gaps.push(`יש לך רק ${counts[cat] || 0} רעיונות בקטגוריית '${cat}' - כדאי להוסיף עוד`);
    }
  }
  return gaps;
}

function checkAngleCoverage(readyIdeas) {
  const total = readyIdeas.length;
  if (!total) return null;
  const withAngle = readyIdeas.filter((idea) => (idea.title || '').includes('זווית:')).length;
  const actual = pct(withAngle, total);
  return { label: `כיסוי זווית הנגשה במאגר: ${Math.round(actual * 100)}%`, ok: actual >= 0.5 };
}

function renderScorecardRow(list, row) {
  if (!row || !row.label) return;
  const el = document.createElement('div');
  el.className = `scorecard-row ${row.ok ? 'scorecard-ok' : 'scorecard-warn'}`;
  el.textContent = `${row.ok ? '✓' : '⚠'} ${row.label}`;
  list.appendChild(el);
}

function renderScorecard(plan, readyIdeas) {
  const container = document.getElementById('content-plan-scorecard');
  container.innerHTML = '';
  container.hidden = false;

  const appItems = getAppItems(plan);
  const rows = [
    ...checkCategoryRatio(appItems),
    checkMustIncludeCoverage(appItems),
    checkVirality(appItems),
    checkAudience(appItems),
    ...checkPersuasionStages(appItems),
    checkSeries(plan),
    checkAngleCoverage(readyIdeas),
  ];

  const list = document.createElement('div');
  list.className = 'scorecard-rows';
  for (const row of rows) renderScorecardRow(list, row);
  container.appendChild(list);

  const notes = checkBankGaps(readyIdeas).map((text) => ({ icon: '📦', text }));
  if (plan.unmatchedCount) {
    const text =
      plan.unmatchedCount === 1
        ? 'פריט אחד לא זוהה במדויק במאגר בזמן הבנייה - כדאי לבדוק אותו בטבלה'
        : `${plan.unmatchedCount} פריטים לא זוהו במדויק במאגר בזמן הבנייה - כדאי לבדוק אותם בטבלה`;
    notes.push({ icon: '❓', text });
  }
  if (plan.truncatedFrom) {
    notes.push({
      icon: '✂️',
      text: `התכנית נבנתה מתוך ${MAX_IDEAS_SENT} הרעיונות המדורגים הכי גבוה, מתוך ${plan.truncatedFrom} שיש לך במאגר`,
    });
  }
  if (notes.length) {
    const notesBox = document.createElement('div');
    notesBox.className = 'scorecard-gaps';
    for (const note of notes) {
      const line = document.createElement('div');
      line.textContent = `${note.icon} ${note.text}`;
      notesBox.appendChild(line);
    }
    container.appendChild(notesBox);
  }
}

// ===== העשרת הפלט מהשרת בנתונים מהמאגר - קטגוריה/קהל/שלב שכנוע נלקחים =====
// ===== מהרעיון המקורי לפי התאמת כותרת מדויקת, לא נסמכים על ה-AI שיחזיר =====
// ===== אותם נכון. mustIncludeType נשאר כמו שה-AI קבע - זה תפקידו החדש. =====

function enrichPlanFromBank(plan, readyIdeas) {
  const byTitle = new Map(readyIdeas.map((idea) => [idea.title, idea]));
  let unmatchedCount = 0;
  for (const week of plan.weeks || []) {
    for (const item of week.items || []) {
      if (item.type === 'live') continue;
      const source = byTitle.get(item.ideaTitle) || findSimilarIdea(readyIdeas, item.ideaTitle);
      if (source) {
        item.category = source.category;
        item.persuasionStage = source.persuasionStage || '';
        item.audienceScope = source.audienceScope || '';
      } else {
        unmatchedCount++;
      }
      item.mustIncludeType = MUST_INCLUDE_TYPES.includes(item.mustIncludeType) ? item.mustIncludeType : '';
    }
  }
  plan.unmatchedCount = unmatchedCount;
  return plan;
}

// ===== תא עריכה בלחיצה, גרסת select (קטגוריה/סוג-תוכן/קהל/שלב שכנוע) =====

function makeEditableSelect(td, options, currentValue, onCommit, renderValue) {
  td.classList.add('table-editable-cell');
  td.title = 'לחיצה לעריכה';

  const show = (value) => {
    td.innerHTML = '';
    td.appendChild(renderValue(value));
  };
  show(currentValue);

  td.addEventListener('click', () => {
    if (td.querySelector('select')) return;
    const select = document.createElement('select');
    select.className = 'table-cell-select';
    const blankOption = document.createElement('option');
    blankOption.value = '';
    blankOption.textContent = '-';
    select.appendChild(blankOption);
    for (const opt of options) {
      const optionEl = document.createElement('option');
      optionEl.value = opt;
      optionEl.textContent = opt;
      select.appendChild(optionEl);
    }
    select.value = options.includes(currentValue) ? currentValue : '';
    td.innerHTML = '';
    td.appendChild(select);
    select.focus();
    select.addEventListener('change', () => {
      currentValue = select.value;
      onCommit(currentValue);
      show(currentValue);
    });
    select.addEventListener('blur', () => show(currentValue));
  });
}

function rescoreCard() {
  if (currentPlan) renderScorecard(currentPlan, getReadyIdeas());
}

function renderTitleCell(td, item) {
  const span = document.createElement('span');
  span.className = 'warming-day-idea';
  span.textContent = item.ideaTitle || '';
  span.title = 'לחיצה עורכת';
  makeEditable(span, (val) => (item.ideaTitle = val));
  td.appendChild(span);
}

function renderCategoryCell(td, item) {
  makeEditableSelect(
    td,
    CATEGORIES,
    item.category || '',
    (val) => {
      item.category = val;
      rescoreCard();
    },
    (value) => {
      const tag = document.createElement('span');
      tag.className = 'card-category-tag';
      tag.style.setProperty('--card-color', categoryColorVar(value));
      tag.textContent = value ? `${categoryIcon(value)} ${value}` : '-';
      return tag;
    }
  );
}

function renderTypeCell(td, item) {
  makeEditableSelect(
    td,
    MUST_INCLUDE_TYPES,
    item.mustIncludeType || '',
    (val) => {
      item.mustIncludeType = val;
      rescoreCard();
    },
    (value) => {
      const tag = document.createElement('span');
      tag.className = 'type-tag';
      tag.textContent = value || '-';
      return tag;
    }
  );
}

function renderAudienceCell(td, item) {
  makeEditableSelect(
    td,
    AUDIENCE_SCOPES,
    item.audienceScope || '',
    (val) => {
      item.audienceScope = val;
      rescoreCard();
    },
    (value) => {
      const tag = document.createElement('span');
      tag.className = 'audience-tag';
      tag.textContent = value || '-';
      return tag;
    }
  );
}

function renderStageCell(td, item) {
  makeEditableSelect(
    td,
    PERSUASION_STAGES,
    item.persuasionStage || '',
    (val) => {
      item.persuasionStage = val;
      rescoreCard();
    },
    (value) => {
      const tag = document.createElement('span');
      tag.className = 'stage-tag';
      tag.textContent = value ? STAGE_SHORT_LABELS[value] || '-' : '-';
      tag.title = value || '';
      return tag;
    }
  );
}

// ===== רינדור הטבלה =====

function renderItemRow(item) {
  const tr = document.createElement('tr');
  if (item.done) tr.classList.add('warming-done');

  const dayTd = document.createElement('td');
  dayTd.className = 'warming-day-name';
  dayTd.textContent = item.day || '';
  tr.appendChild(dayTd);

  if (item.type === 'live') {
    const liveTd = document.createElement('td');
    liveTd.colSpan = 5;
    const liveTag = document.createElement('span');
    liveTag.className = 'content-plan-live-tag';
    liveTag.textContent = '🎤 תוכן חי';
    liveTd.appendChild(liveTag);
    liveTd.appendChild(document.createElement('br'));
    const note = document.createElement('span');
    note.className = 'warming-day-idea';
    note.textContent = item.note || '';
    note.title = 'לחיצה עורכת';
    makeEditable(note, (val) => (item.note = val));
    liveTd.appendChild(note);
    tr.appendChild(liveTd);
  } else {
    const titleTd = document.createElement('td');
    renderTitleCell(titleTd, item);
    tr.appendChild(titleTd);

    const categoryTd = document.createElement('td');
    renderCategoryCell(categoryTd, item);
    tr.appendChild(categoryTd);

    const typeTd = document.createElement('td');
    renderTypeCell(typeTd, item);
    tr.appendChild(typeTd);

    const audienceTd = document.createElement('td');
    renderAudienceCell(audienceTd, item);
    tr.appendChild(audienceTd);

    const stageTd = document.createElement('td');
    renderStageCell(stageTd, item);
    tr.appendChild(stageTd);
  }

  const doneTd = document.createElement('td');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'warming-checkbox';
  checkbox.checked = Boolean(item.done);
  checkbox.addEventListener('change', () => {
    item.done = checkbox.checked;
    tr.classList.toggle('warming-done', checkbox.checked);
    autosaveCheckboxChange();
  });
  doneTd.appendChild(checkbox);
  tr.appendChild(doneTd);

  return tr;
}

function renderWeekHeaderRow(week) {
  const tr = document.createElement('tr');
  tr.className = 'content-plan-week-row';
  const td = document.createElement('td');
  td.colSpan = 7;
  td.textContent = week.label || '';
  if (week.note && week.note.trim()) {
    const note = document.createElement('div');
    note.className = 'content-plan-week-note';
    note.textContent = `⚠️ ${week.note.trim()}`;
    td.appendChild(note);
  }
  tr.appendChild(td);
  return tr;
}

function renderPlan(plan) {
  const container = document.getElementById('content-plan-result');
  container.innerHTML = '';

  const table = document.createElement('table');
  table.className = 'content-plan-table';

  const thead = document.createElement('thead');
  thead.innerHTML =
    '<tr><th>יום</th><th>רעיון</th><th>קטגוריה</th><th>סוג תוכן</th><th>קהל</th><th>שלב שכנוע</th><th>בוצע</th></tr>';
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const week of plan.weeks || []) {
    tbody.appendChild(renderWeekHeaderRow(week));
    for (const item of week.items || []) {
      tbody.appendChild(renderItemRow(item));
    }
  }
  table.appendChild(tbody);

  container.appendChild(table);
  document.getElementById('content-plan-save-btn').hidden = false;
  renderScorecard(plan, getReadyIdeas());
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

export function refreshGate() {
  const readyCount = getReadyIdeas().length;
  const gateMsg = document.getElementById('content-plan-gate-msg');
  const form = document.getElementById('content-plan-form');
  const enough = readyCount >= MIN_READY_IDEAS;
  gateMsg.hidden = enough;
  form.hidden = !enough;
  if (!enough) {
    const unclassified = getCurrentIdeas().filter((idea) => !idea.category);
    let hint = '';
    if (unclassified.length) {
      const sample = unclassified
        .slice(0, 3)
        .map((idea) => {
          const t = (idea.title || '').trim();
          return `"${t.length > 40 ? `${t.slice(0, 40)}...` : t}"`;
        })
        .join(', ');
      hint = ` יש לך ${unclassified.length} רעיונות שכבר כתובים במאגר אבל עדיין בלי קטגוריה, למשל: ${sample}${unclassified.length > 3 ? ' ועוד' : ''} - לכי אליהם קודם, זה הכי מהיר.`;
    }
    gateMsg.textContent = `כדי לבנות תכנית תוכן צריך קודם מספיק רעיונות מסווגים (עם קטגוריה) במאגר - יש לך כרגע ${readyCount} מתוך ${MIN_READY_IDEAS} הדרושים.${hint} לכי ל"הרעיונות שלי" והוסיפי/סווגי עוד רעיונות קודם.`;
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
  const scorecardEl = document.getElementById('content-plan-scorecard');

  const modal = document.getElementById('content-plan-modal');
  document.getElementById('content-plan-open-builder-btn').addEventListener('click', () => {
    refreshGate();
    modal.hidden = false;
  });
  document.getElementById('content-plan-modal-close-btn').addEventListener('click', () => {
    modal.hidden = true;
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.hidden = true;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const pieceCount = Number(document.getElementById('content-plan-piece-count').value) || MIN_PIECE_COUNT;
    const readyIdeas = [...getReadyIdeas()].sort((a, b) => ratingRank(a.rating) - ratingRank(b.rating));
    const cappedIdeas = readyIdeas.slice(0, MAX_IDEAS_SENT);

    const ideasPayload = cappedIdeas.map((idea) => ({
      title: idea.title,
      category: idea.category,
      persuasionStage: idea.persuasionStage || '',
      audienceScope: idea.audienceScope || '',
      rating: idea.rating || '',
    }));

    generateBtn.disabled = true;
    loadingEl.hidden = false;
    document.getElementById('content-plan-result').innerHTML = '';
    scorecardEl.hidden = true;
    saveBtn.hidden = true;

    try {
      const result = await generateContentPlan({ pieceCount, ideas: ideasPayload });
      currentPlan = enrichPlanFromBank(result.data.plan, cappedIdeas);
      if (readyIdeas.length > cappedIdeas.length) currentPlan.truncatedFrom = readyIdeas.length;
      currentMeta = { pieceCount };
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
          currentMeta = { pieceCount: p.pieceCount || MIN_PIECE_COUNT };
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
