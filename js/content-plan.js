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
import { makeEditable, makeEditableSelect } from './editable.js';
import { showToast } from './toast.js';
import { confirmDialog } from './confirm-dialog.js';

const generateContentPlan = httpsCallable(functions, 'generateContentPlan', { timeout: 170000 });

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
let countdownInterval = null;

function startCountdown() {
  const el = document.getElementById('content-plan-countdown');
  let secondsLeft = 40;
  el.textContent = `בונה תכנית תוכן... בערך ${secondsLeft} שניות נותרו`;
  countdownInterval = setInterval(() => {
    secondsLeft -= 1;
    el.textContent =
      secondsLeft > 0 ? `בונה תכנית תוכן... בערך ${secondsLeft} שניות נותרו` : 'כמעט מוכן, עוד רגע... 🔥';
  }, 1000);
}

function stopCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = null;
}

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
  // הסף חייב להתאים למה שהתווית בפועל מבטיחה ("עד כ-20%") - זה גם התואם
  // למפרט המקורי (80% קהל עיקרי / עד 20% משני), לא רק תיקון קוסמטי.
  return { label: `קהל משני: ${Math.round(secondaryShare * 100)}% (יעד עד כ-20%)`, ok: secondaryShare <= 0.2 };
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
    } else if (actual > target * 2) {
      gaps.push(`יש לך יחסית הרבה רעיונות בקטגוריית '${cat}' (${counts[cat]} מתוך ${total}) לעומת שאר הקטגוריות - כדאי לאזן עם עוד רעיונות בקטגוריות אחרות`);
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
      const cleanedType = (item.mustIncludeType || '').replace(/^[\s\-–•*]*\d*\s*[.):\-]?\s*/, '').trim();
      item.mustIncludeType = MUST_INCLUDE_TYPES.includes(cleanedType) ? cleanedType : '';
    }
  }
  plan.unmatchedCount = unmatchedCount;
  return plan;
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
  dayTd.dataset.label = 'יום';
  dayTd.textContent = item.day || '';
  tr.appendChild(dayTd);

  if (item.type === 'live') {
    const liveTd = document.createElement('td');
    liveTd.colSpan = 5;
    liveTd.dataset.label = 'תוכן חי';
    const liveWrap = document.createElement('div');
    liveWrap.className = 'content-plan-live-wrap';
    const liveTag = document.createElement('span');
    liveTag.className = 'content-plan-live-tag';
    liveTag.textContent = '🎤 תוכן חי';
    liveWrap.appendChild(liveTag);
    const note = document.createElement('span');
    note.className = 'warming-day-idea';
    note.textContent = item.note || '';
    note.title = 'לחיצה עורכת';
    makeEditable(note, (val) => (item.note = val));
    liveWrap.appendChild(note);
    liveTd.appendChild(liveWrap);
    tr.appendChild(liveTd);
  } else {
    const titleTd = document.createElement('td');
    titleTd.dataset.label = 'רעיון';
    renderTitleCell(titleTd, item);
    tr.appendChild(titleTd);

    const categoryTd = document.createElement('td');
    categoryTd.dataset.label = 'קטגוריה';
    renderCategoryCell(categoryTd, item);
    tr.appendChild(categoryTd);

    const typeTd = document.createElement('td');
    typeTd.dataset.label = 'סוג תוכן';
    renderTypeCell(typeTd, item);
    tr.appendChild(typeTd);

    const audienceTd = document.createElement('td');
    audienceTd.dataset.label = 'קהל';
    renderAudienceCell(audienceTd, item);
    tr.appendChild(audienceTd);

    const stageTd = document.createElement('td');
    stageTd.dataset.label = 'שלב שכנוע';
    renderStageCell(stageTd, item);
    tr.appendChild(stageTd);
  }

  const doneTd = document.createElement('td');
  doneTd.dataset.label = 'בוצע';
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

  const wrap = document.createElement('div');
  wrap.className = 'content-plan-table-wrap';

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

  wrap.appendChild(table);
  container.appendChild(wrap);
  document.getElementById('content-plan-save-btn').hidden = false;
  document.getElementById('content-plan-save-btn-top').hidden = false;
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

// "יש לפחות רעיון אחד בכל קטגוריה" לא מספיק - קטגוריה עם רעיון או שניים
// בלבד תמיד תיצור תכנית לא מאוזנת, לא משנה כמה פעמים לוחצים "בנייה":
// אי אפשר לשבץ יותר תוכן מ'אישי' ממה שבאמת קיים במאגר. הסף כאן הוא חצי
// מהיעד עבור תכנית בגודל המינימלי (16) - אותה נוסחה בדיוק שכבר משמשת את
// checkBankGaps בסקורקארד אחרי הבנייה, רק שכאן זה חוסם *לפני* שמבזבזים
// קריאת AI על תכנית שמראש לא יכלה לצאת מאוזנת.
function getCategoryVolumeGaps(readyIdeas) {
  const counts = {};
  for (const idea of readyIdeas) counts[idea.category] = (counts[idea.category] || 0) + 1;
  const gaps = [];
  for (const [cat, target] of Object.entries(CATEGORY_TARGETS)) {
    const needed = Math.ceil((target * MIN_PIECE_COUNT) / 2);
    const actual = counts[cat] || 0;
    if (actual < needed) gaps.push({ category: cat, actual, needed });
  }
  return gaps;
}

export function refreshGate() {
  const readyIdeas = getReadyIdeas();
  const readyCount = readyIdeas.length;
  const gateMsg = document.getElementById('content-plan-gate-msg');
  const form = document.getElementById('content-plan-form');
  const enoughVolume = readyCount >= MIN_READY_IDEAS;
  const volumeGaps = getCategoryVolumeGaps(readyIdeas);
  const enough = enoughVolume && volumeGaps.length === 0;
  gateMsg.hidden = enough;
  form.hidden = !enough;
  if (!enoughVolume) {
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
  } else if (volumeGaps.length) {
    const gapText = volumeGaps.map((g) => `'${g.category}' (יש לך ${g.actual}, צריך לפחות ${g.needed})`).join(', ');
    gateMsg.textContent = `כדי לבנות תכנית תוכן מאוזנת (ביחס 40/30/15/15) חסר לך מספיק רעיונות מסווגים בקטגוריות הבאות: ${gapText} (רעיונות שסומנו כ"בוצע" לא נספרים כאן). בלי זה כל תכנית שתיבנה תצא לא מאוזנת, כי אין ממה לשבץ. לכי ל"הרעיונות שלי" והוסיפי/סווגי עוד רעיונות בקטגוריות האלה, ואז אפשר לבנות תכנית מאוזנת באמת.`;
  }
}

export function wireContentPlanView() {
  const form = document.getElementById('content-plan-form');
  const errorEl = document.getElementById('content-plan-error');
  const loadingEl = document.getElementById('content-plan-loading');
  const generateBtn = document.getElementById('content-plan-generate-btn');
  const saveBtn = document.getElementById('content-plan-save-btn');
  const saveBtnTop = document.getElementById('content-plan-save-btn-top');
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
    saveBtnTop.hidden = true;
    startCountdown();

    try {
      const result = await generateContentPlan({ pieceCount, ideas: ideasPayload });
      currentPlan = enrichPlanFromBank(result.data.plan, cappedIdeas);
      if (readyIdeas.length > cappedIdeas.length) currentPlan.truncatedFrom = readyIdeas.length;
      currentMeta = { pieceCount };
      currentPlanId = null;
      renderPlan(currentPlan);
    } catch (err) {
      console.error('generateContentPlan failed:', err);
      const hasHebrewText = /[\u0590-\u05FF]/.test(err.message || '');
      errorEl.textContent = hasHebrewText
        ? `משהו השתבש בבניית התכנית: ${err.message}. נסו שוב.`
        : 'משהו השתבש בבניית התכנית, נסו שוב.';
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
      saveBtnTop.disabled = false;
    }
  }
  saveBtn.addEventListener('click', handleSaveClick);
  saveBtnTop.addEventListener('click', handleSaveClick);

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
          const confirmed = await confirmDialog('למחוק את התכנית הזו? הפעולה לא הפיכה.', { okLabel: 'מחיקה', cancelLabel: 'ביטול' });
          if (!confirmed) return;
          try {
            await deleteContentPlan(p.id);
            if (currentPlanId === p.id) {
              // התכנית שנמחקה היא בדיוק זו שמוצגת כרגע על המסך - בלי הניקוי
              // הזה הטבלה/הסקורקארד/כפתורי השמירה נשארים גלויים, ולחיצה על
              // שמירה הייתה יוצרת בטעות מסמך חדש עם אותו תוכן שנמחק הרגע.
              currentPlanId = null;
              currentPlan = null;
              currentMeta = null;
              document.getElementById('content-plan-result').innerHTML = '';
              scorecardEl.hidden = true;
              saveBtn.hidden = true;
              saveBtnTop.hidden = true;
            }
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
