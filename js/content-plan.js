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
import { getProfile, saveProfile } from './user-profile.js';

const generateContentPlan = httpsCallable(functions, 'generateContentPlan', { timeout: 290000 });

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

// היחס בין הקטגוריות (40/30/15/15) בעבר היה תלוי בהנחיה רכה בפרומפט
// שה-AI "יבחר בעצמו" להשאיר חלק מרעיונות קטגוריה עשירה בחוץ - התבררה
// כלא אמינה (בפועל השתמש כמעט בכל המאגר, ביחס של המאגר עצמו, לא ביחס
// היעד), וגם תרמה לעומס חשיבה שגרם לתשובות ריקות. במקום זה, הבחירה איזה
// רעיונות בכלל *נשלחים* ל-AI כבר מבטיחה את היחס מראש בקוד רגיל - ה-AI
// רק משבץ בלוח זמנים את מה שכבר נבחר נכון, בלי צורך להחליט בעצמו מה
// להשמיט.
// שיטת "השארית הגדולה" - עיגול כל קטגוריה בנפרד (Math.round) לא בהכרח
// מסתכם בחזרה ל-pieceCount (נמצא באמת: 16 - ברירת המחדל עצמה! - יצא
// 15 בפועל). מחשבים קודם את המכסה המדויקת (לא מעוגלת) לכל קטגוריה,
// לוקחים את השלם התחתון של כולן, ואז מחלקים את מה שנשאר (עד להשלמת
// pieceCount) לפי מי שהכי קרוב לעיגול למעלה - כך שהסכום תמיד יוצא
// בדיוק pieceCount (כשיש מספיק היצע בכל קטגוריה). מופרד לפונקציה
// משלה כי גם הפופאפ של בחירת רעיונות ידנית צריך את אותו חישוב בדיוק,
// כדי להראות בזמן אמת כמה מקום יש לכל קטגוריה.
function computeCategoryQuotas(pieceCount) {
  const entries = Object.entries(CATEGORY_TARGETS).map(([cat, target]) => {
    const exact = pieceCount * target;
    return { cat, count: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = pieceCount - entries.reduce((sum, e) => sum + e.count, 0);
  [...entries]
    .sort((a, b) => b.remainder - a.remainder)
    .forEach((e) => {
      if (remaining > 0) {
        e.count += 1;
        remaining -= 1;
      }
    });
  const quotas = {};
  for (const e of entries) quotas[e.cat] = Math.max(1, e.count);
  return quotas;
}

// מילוי אוטומטי "עיוור לשלב שכנוע" (top-N לפי דירוג בלבד) יכול להשמיט
// שלב שלם מהתכנית - אם שני הרעיונות המדורגים הכי גבוה בקטגוריה נמצאים
// שניהם בשלב 2/3, שלב 1 לא נכנס בכלל, גם שיש ממנו היצע אמיתי במאגר.
// אותו עיקרון בדיוק כמו יחס הקטגוריות: לא סומכים על שיקול דעת AI
// (הוכח לא אמין בעבר) - בוחרים דטרמיניסטית "סבב" (round-robin) בין
// שלבי השכנוע הקיימים בפועל בקבוצה הזו, לפי דירוג בתוך כל שלב.
function distributeByStage(ideas, count) {
  if (count <= 0) return [];
  const byStage = {};
  for (const idea of ideas) {
    const stage = idea.persuasionStage || '';
    (byStage[stage] = byStage[stage] || []).push(idea);
  }
  const stageGroups = Object.values(byStage);
  const picked = [];
  let index = 0;
  while (picked.length < count) {
    const before = picked.length;
    for (const group of stageGroups) {
      if (picked.length >= count) break;
      if (group[index]) picked.push(group[index]);
    }
    if (picked.length === before) break; // כל השלבים מוצו, אין עוד מה להוסיף
    index++;
  }
  return picked;
}

function selectIdeasForRatio(readyIdeasSortedByRating, pieceCount, pinnedIds = new Set()) {
  const byCategory = {};
  for (const idea of readyIdeasSortedByRating) {
    (byCategory[idea.category] = byCategory[idea.category] || []).push(idea);
  }
  const quotas = computeCategoryQuotas(pieceCount);

  const selected = [];
  const droppedPinned = [];
  for (const [cat, targetCount] of Object.entries(quotas)) {
    const pool = byCategory[cat] || [];
    // רעיונות מסומנים (pinnedIds) מקבלים עדיפות ראשונה למכסה של הקטגוריה
    // שלהם, לפי דירוג ביניהם - ורק מה שנשאר מהמכסה מתמלא מהלא-מסומנים,
    // בדיוק כמו הבחירה האוטומטית הרגילה. pool כבר ממוין לפי דירוג (מגיע
    // מ-readyIdeasSortedByRating), אז filter שומר על סדר הדירוג בכל
    // תת-קבוצה בלי צורך למיין שוב.
    const pinnedInCategory = pool.filter((idea) => pinnedIds.has(idea.id));
    const unpinnedInCategory = pool.filter((idea) => !pinnedIds.has(idea.id));
    const chosenPinned = pinnedInCategory.slice(0, targetCount);
    droppedPinned.push(...pinnedInCategory.slice(targetCount));
    const remainingSlots = targetCount - chosenPinned.length;
    selected.push(...chosenPinned, ...distributeByStage(unpinnedInCategory, remainingSlots));
  }
  return {
    selected: selected.sort((a, b) => ratingRank(a.rating) - ratingRank(b.rating)),
    droppedPinned,
  };
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
  // ה-AI צריך עכשיו יותר "מקום לחשוב" בשביל תכניות מאוזנות (ראו התיקון
  // ל-max_tokens) - זה יכול לקחת יותר מדקה, במיוחד לתכניות גדולות. הערכה
  // ריאלית יותר במקום ספירה-לאחור שמבטיחה "כמעט מוכן" ואז נתקעת שם דקות.
  let secondsLeft = 60;
  el.textContent = `בונה תכנית תוכן... בערך ${secondsLeft} שניות נותרו`;
  countdownInterval = setInterval(() => {
    secondsLeft -= 1;
    el.textContent =
      secondsLeft > 0
        ? `בונה תכנית תוכן... בערך ${secondsLeft} שניות נותרו`
        : 'כמעט מוכן, לתכניות גדולות זה יכול לקחת עוד קצת... 🔥';
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

// checkMustIncludeCoverage למעלה בודק רק אחוז מצטבר - זה יכול לצאת "80%+"
// גם אם זה תמיד אותם 2-3 סוגים חוזרים על עצמם. זה מפרט בדיוק אילו מתוך 8
// הסוגים בכלל לא הופיעו בתכנית הזו, כדי לראות פער אמיתי, לא רק אחוז גולמי.
function checkMissingMustIncludeTypes(appItems) {
  if (!appItems.length) return [];
  const used = new Set(appItems.map((i) => i.mustIncludeType).filter(Boolean));
  return MUST_INCLUDE_TYPES.filter((type) => !used.has(type));
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
  const missingTypes = checkMissingMustIncludeTypes(appItems);
  if (missingTypes.length) {
    notes.push({ icon: '🎯', text: `סוגי תוכן חשובים שלא כוסו בתכנית הזו: ${missingTypes.join(', ')}` });
  }
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
      text: `התכנית נבנתה מתוך ${plan.selectedCount || plan.truncatedFrom} רעיונות שנבחרו לפי יחס הקטגוריות, מתוך ${plan.truncatedFrom} שיש לך במאגר - לא כל הרעיונות נכנסו כדי לשמור על האיזון`,
    });
  }
  if (plan.droppedPinnedTitles && plan.droppedPinnedTitles.length) {
    const titles = plan.droppedPinnedTitles.join(', ');
    const text =
      plan.droppedPinnedTitles.length === 1
        ? `הרעיון שסימנת ידנית "${titles}" לא נכנס לתכנית כי חרג ממכסת הקטגוריה שלו`
        : `${plan.droppedPinnedTitles.length} מהרעיונות שסימנת ידנית לא נכנסו לתכנית כי חרגו ממכסת הקטגוריה שלהם: ${titles}`;
    notes.push({ icon: '📌', text });
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
// pieceCount מגיע עכשיו מהשדה בפועל (לא קבוע MIN_PIECE_COUNT קשיח) - שער
// שנבדק פעם אחת מול 16 ואז לא מתעדכן שוב, בזמן שהמשתמשת מעלה את הכמות
// עד 60, יכול "לעבור" בקלות ואז לתת תכנית עם המון ימים ריקים כי בפועל
// אין מספיק היצע לכמות שבאמת התבקשה.
function getCategoryVolumeGaps(readyIdeas, pieceCount) {
  const counts = {};
  for (const idea of readyIdeas) counts[idea.category] = (counts[idea.category] || 0) + 1;
  const gaps = [];
  for (const [cat, target] of Object.entries(CATEGORY_TARGETS)) {
    const needed = Math.ceil((target * pieceCount) / 2);
    const actual = counts[cat] || 0;
    if (actual < needed) gaps.push({ category: cat, actual, needed });
  }
  return gaps;
}

// אותו עיקרון בדיוק, לשלושת שלבי השכנוע - "יש לפחות רעיון אחד משלב 3"
// לא מספיק כדי לבנות תכנית מאוזנת בין שלבי השכנוע, בדיוק כמו שקטגוריה
// עם רעיון-שניים לא מספיקה לבניית יחס קטגוריות מאוזן.
function getPersuasionStageVolumeGaps(readyIdeas, pieceCount) {
  const counts = {};
  for (const idea of readyIdeas) counts[idea.persuasionStage] = (counts[idea.persuasionStage] || 0) + 1;
  const target = 1 / PERSUASION_STAGES.length;
  const needed = Math.ceil((target * pieceCount) / 2);
  const gaps = [];
  PERSUASION_STAGES.forEach((stage, i) => {
    const actual = counts[stage] || 0;
    if (actual < needed) gaps.push({ stage: `שלב שכנוע ${i + 1}`, actual, needed });
  });
  return gaps;
}

// אותו עיקרון שוב, לוויראליות (VIRAL_SCOPE = "רחב"). אומת מול נתונים
// אמיתיים: מתוך 59 רעיונות מוכנים היו רק 5 מתויגים "קהל רחב" (8%) - אין
// שום דרך להגיע ל-30% מהתכנית בלי מספיק היצע כזה מלכתחילה, לא משנה כמה
// טוב אלגוריתם הבחירה. בלי השער הזה זה נבנה בשקט עם ויראליות נמוכה,
// בדיוק מה שקרה בפועל.
function getViralityVolumeGap(readyIdeas, pieceCount) {
  const target = 0.3;
  const needed = Math.ceil((target * pieceCount) / 2);
  const actual = readyIdeas.filter((idea) => idea.audienceScope === VIRAL_SCOPE).length;
  return actual < needed ? { actual, needed } : null;
}

// הודעת השער עברה מפסקה ארוכה אחת (עמוסה, קשה לסרוק) למבנה עם כותרות
// ורשימות - כל קבוצת חוסרים (קטגוריות / שלבי שכנוע / רעיונות לא מסווגים)
// מקבלת כותרת קצרה משלה ורשימת שורות, במקום להיטמע כולה במשפט אחד.
function renderGateSection(container, heading, items) {
  if (!items.length) return;
  const h = document.createElement('div');
  h.className = 'content-plan-gate-heading';
  h.textContent = heading;
  container.appendChild(h);
  const ul = document.createElement('ul');
  ul.className = 'content-plan-gate-list';
  for (const item of items) {
    const li = document.createElement('li');
    li.textContent = item;
    ul.appendChild(li);
  }
  container.appendChild(ul);
}

// בלי קהל יעד עיקרי מוגדר בפרופיל, אין ל-AI שום דבר אמיתי להשוות אליו
// כשהוא בונה תכנית - התכנית הייתה נבנית "עיוורת לקהל" בשקט, בלי שום
// התראה. no-op אם החלון סגור (כדי לא לבזבז קריאת פרופיל בכל שינוי
// רעיונות ברקע, גם כשאף אחת לא בכלל מסתכלת על בניית תכנית תוכן) - אבל
// כן רץ מחדש בכל שינוי רעיונות *כשהחלון פתוח*, כדי שעדכון רעיונות ברקע
// לא "יפתח" בטעות את הטופס בזמן שהודעת "הגדירי קהל יעד" עדיין אמורה
// להיות מוצגת (refreshGate קורא לזה בסוף, ראו למטה).
async function refreshAudienceGate() {
  const modal = document.getElementById('content-plan-modal');
  if (modal.hidden) return;

  const gateMsg = document.getElementById('content-plan-gate-msg');
  const form = document.getElementById('content-plan-form');
  const secondaryAudienceRow = document.getElementById('content-plan-secondary-audience-row');
  const audienceModal = document.getElementById('audience-edit-modal');

  let profile;
  try {
    profile = await getProfile();
  } catch (err) {
    console.error('Failed to load profile for content-plan audience check:', err);
    // כשל-סגור (fail closed): אם אי אפשר לוודא שיש קהל יעד, לא מניחים
    // שהכל בסדר ומשאירים את המצב הקודם עומד - חוסמים בפירוש.
    gateMsg.innerHTML = '';
    const errIntro = document.createElement('p');
    errIntro.className = 'content-plan-gate-intro';
    errIntro.textContent = 'לא הצלחנו לבדוק את קהל היעד שלך (בעיית רשת) - רעננו את הדף ונסו שוב.';
    gateMsg.appendChild(errIntro);
    gateMsg.hidden = false;
    form.hidden = true;
    secondaryAudienceRow.hidden = true;
    return;
  }

  if (!profile || !profile.primaryAudience) {
    gateMsg.innerHTML = '';
    const intro = document.createElement('p');
    intro.className = 'content-plan-gate-intro';
    intro.textContent = 'כדי לבנות תכנית תוכן שבאמת מותאמת לקהל שלך, צריך קודם להגדיר מי קהל היעד העיקרי שלך.';
    gateMsg.appendChild(intro);
    const defineBtn = document.createElement('button');
    defineBtn.type = 'button';
    defineBtn.className = 'btn-primary';
    defineBtn.textContent = 'הגדרת קהל יעד';
    defineBtn.addEventListener('click', () => {
      document.getElementById('audience-edit-error').hidden = true;
      document.getElementById('audience-edit-primary').value = '';
      document.getElementById('audience-edit-secondary').value = '';
      audienceModal.hidden = false;
    });
    gateMsg.appendChild(defineBtn);
    gateMsg.hidden = false;
    form.hidden = true;
    secondaryAudienceRow.hidden = true;
    return;
  }
  // השורה הזו רלוונטית רק אם באמת הוגדר קהל משני בפרופיל - בלי זה
  // "לכלול קהל משני?" הוא צ'קבוקס שלא אומר כלום.
  secondaryAudienceRow.hidden = !profile.secondaryAudience;
}

export function refreshGate() {
  const readyIdeas = getReadyIdeas();
  const readyCount = readyIdeas.length;
  const gateMsg = document.getElementById('content-plan-gate-msg');
  const form = document.getElementById('content-plan-form');
  const pieceCountInput = document.getElementById('content-plan-piece-count');
  const pieceCount = Number(pieceCountInput && pieceCountInput.value) || MIN_PIECE_COUNT;
  const enoughVolume = readyCount >= MIN_READY_IDEAS;
  const categoryGaps = getCategoryVolumeGaps(readyIdeas, pieceCount);
  const stageGaps = getPersuasionStageVolumeGaps(readyIdeas, pieceCount);
  const viralityGap = getViralityVolumeGap(readyIdeas, pieceCount);
  const enough = enoughVolume && categoryGaps.length === 0 && stageGaps.length === 0 && !viralityGap;
  gateMsg.hidden = enough;
  form.hidden = !enough;
  if (enough) {
    // נפח/יחס מספיקים לכמות המבוקשת כרגע - נשאר רק לוודא שקהל היעד גם
    // כן מוגדר (לא מחכים לתוצאה - זו רק עדכון UI, לא ולידציה חוסמת של
    // הקריאה הזו עצמה).
    refreshAudienceGate();
    return;
  }

  gateMsg.innerHTML = '';

  if (!enoughVolume) {
    const intro = document.createElement('p');
    intro.className = 'content-plan-gate-intro';
    intro.textContent = `כדי לבנות תכנית תוכן צריך קודם מספיק רעיונות מסווגים (עם קטגוריה) במאגר - יש לך כרגע ${readyCount} מתוך ${MIN_READY_IDEAS} הדרושים.`;
    gateMsg.appendChild(intro);

    const unclassified = getCurrentIdeas().filter((idea) => !idea.category);
    if (unclassified.length) {
      const examples = unclassified.slice(0, 3).map((idea) => {
        const t = (idea.title || '').trim();
        return t.length > 40 ? `${t.slice(0, 40)}...` : t;
      });
      if (unclassified.length > 3) examples.push(`ועוד ${unclassified.length - 3}`);
      renderGateSection(gateMsg, `רעיונות שכבר כתובים אבל עדיין בלי קטגוריה (${unclassified.length}):`, examples);
    }

    const cta = document.createElement('p');
    cta.className = 'content-plan-gate-cta';
    cta.textContent = 'לכי ל"הרעיונות שלי" והוסיפי/סווגי עוד רעיונות קודם.';
    gateMsg.appendChild(cta);
    return;
  }

  const intro = document.createElement('p');
  intro.className = 'content-plan-gate-intro';
  intro.textContent = 'כדי לבנות תכנית תוכן מאוזנת (יחס קטגוריות 40/30/15/15, איזון בין שלבי שכנוע, וכ-30% ויראליות) חסר לך מספיק רעיונות מסווגים:';
  gateMsg.appendChild(intro);

  renderGateSection(
    gateMsg,
    'בקטגוריות:',
    categoryGaps.map((g) => `${g.category} - יש לך ${g.actual}, צריך לפחות ${g.needed}`)
  );
  renderGateSection(
    gateMsg,
    'בשלבי שכנוע:',
    stageGaps.map((g) => `${g.stage} - יש לך ${g.actual}, צריך לפחות ${g.needed}`)
  );
  renderGateSection(
    gateMsg,
    'בוויראליות (קהל רחב):',
    viralityGap ? [`יש לך ${viralityGap.actual}, צריך לפחות ${viralityGap.needed} רעיונות מתויגים "קהל רחב" - חשוב לצמיחה`] : []
  );

  const cta = document.createElement('p');
  cta.className = 'content-plan-gate-cta';
  cta.textContent = 'רעיונות שסומנו כ"בוצע" לא נספרים כאן. לכי ל"הרעיונות שלי" והוסיפי/סווגי עוד רעיונות, ואז אפשר לבנות תכנית מאוזנת באמת.';
  gateMsg.appendChild(cta);
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
  const audienceModal = document.getElementById('audience-edit-modal');
  const secondaryAudienceRow = document.getElementById('content-plan-secondary-audience-row');
  const includeSecondaryCheckbox = document.getElementById('content-plan-include-secondary');

  const pickIdeasModal = document.getElementById('content-plan-pick-ideas-modal');
  const pickIdeasBtn = document.getElementById('content-plan-pick-ideas-btn');
  const pickIdeasList = document.getElementById('content-plan-pick-ideas-list');
  const pickIdeasSearchInput = document.getElementById('content-plan-pick-ideas-search');
  const pickIdeasCategoryChipsEl = document.getElementById('content-plan-pick-ideas-category-chips');
  const pickIdeasRatingChipsEl = document.getElementById('content-plan-pick-ideas-rating-chips');
  const pickIdeasCountEl = document.getElementById('content-plan-pick-ideas-count');
  const pickIdeasClearBtn = document.getElementById('content-plan-pick-ideas-clear-btn');

  // סינון יחיד (לא רב-בחירה) - סימון מרובה יחד הרגיש לא ברור, אז כל
  // לחיצה על צ'יפ מבטלת את מה שהיה מסומן לפניו באותה קבוצה (כמו כפתורי
  // רדיו), ולחיצה חוזרת על אותו צ'יפ מבטלת את הסינון לגמרי - כך שתמיד
  // ברור בדיוק מה מסומן: או כלום, או צ'יפ אחד יחיד. הצ'יפים עצמם נבנים
  // פעם אחת (לא תלויים בבנק הרעיונות) - אותו סגנון .category-chip/
  // .rating-chip שכבר קיים בטופס הוספת רעיון, כדי שזה ירגיש כמו חלק
  // מהאפליקציה ולא כמו רכיב חדש.
  let activeCategoryFilter = '';
  let activeRatingFilter = '';

  function selectSingleChip(container, chip, value, currentValue, setValue) {
    const nextValue = currentValue === value ? '' : value;
    setValue(nextValue);
    container.querySelectorAll('button').forEach((btn) => {
      const isActive = btn === chip && nextValue === value;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
    renderPickIdeasList();
  }

  function buildCategoryFilterChips() {
    pickIdeasCategoryChipsEl.innerHTML = '';
    CATEGORIES.forEach((category) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'category-chip';
      chip.style.setProperty('--chip-color', categoryColorVar(category));
      chip.textContent = `${categoryIcon(category)} ${category}`;
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', () => {
        selectSingleChip(pickIdeasCategoryChipsEl, chip, category, activeCategoryFilter, (v) => (activeCategoryFilter = v));
      });
      pickIdeasCategoryChipsEl.appendChild(chip);
    });
  }

  function buildRatingFilterChips() {
    pickIdeasRatingChipsEl.innerHTML = '';
    RATINGS.forEach((rating) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'rating-chip';
      chip.textContent = rating;
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', () => {
        selectSingleChip(pickIdeasRatingChipsEl, chip, rating, activeRatingFilter, (v) => (activeRatingFilter = v));
      });
      pickIdeasRatingChipsEl.appendChild(chip);
    });
  }

  buildCategoryFilterChips();
  buildRatingFilterChips();

  function resetPickIdeasFilters() {
    pickIdeasSearchInput.value = '';
    activeCategoryFilter = '';
    activeRatingFilter = '';
    pickIdeasCategoryChipsEl.querySelectorAll('.category-chip').forEach((chip) => {
      chip.classList.remove('active');
      chip.setAttribute('aria-pressed', 'false');
    });
    pickIdeasRatingChipsEl.querySelectorAll('.rating-chip').forEach((chip) => {
      chip.classList.remove('active');
      chip.setAttribute('aria-pressed', 'false');
    });
  }

  // נשמר רק בזיכרון, לא ב-Firestore - מתאפס בכל פתיחה מחדש של מודל
  // "בניית תכנית תוכן" (ראו open-builder-btn למטה).
  let pinnedIdeaIds = new Set();
  // תגי ה"X/Y" לכל קטגוריה מתעדכנים ישירות (בלי לרנדר את כל הרשימה
  // מחדש) בכל סימון checkbox בודד - כדי שגלילה לא תתאפס תוך כדי שמסמנים
  // כמה רעיונות ברצף. נבנה מחדש בכל renderPickIdeasList.
  const categoryQuotaBadges = new Map();

  function updatePickIdeasBtnLabel() {
    pickIdeasBtn.textContent = pinnedIdeaIds.size
      ? `🎯 בחירת רעיונות ספציפיים (${pinnedIdeaIds.size} נבחרו)`
      : '🎯 בחירת רעיונות ספציפיים (אופציונלי)';
  }

  function updatePickIdeasCount() {
    pickIdeasCountEl.textContent = pinnedIdeaIds.size ? `${pinnedIdeaIds.size} נבחרו` : 'לא נבחר כלום';
  }

  function updateCategoryQuotaBadge(category, allIdeasInCategory, quota) {
    const badge = categoryQuotaBadges.get(category);
    if (!badge) return;
    const pinnedInCategory = allIdeasInCategory.filter((idea) => pinnedIdeaIds.has(idea.id)).length;
    badge.textContent = `${pinnedInCategory}/${quota} נבחרו`;
    badge.classList.toggle('content-plan-pick-ideas-quota-over', pinnedInCategory > quota);
  }

  function renderPickIdeasList() {
    pickIdeasList.innerHTML = '';
    categoryQuotaBadges.clear();

    const pieceCount = Number(document.getElementById('content-plan-piece-count').value) || MIN_PIECE_COUNT;
    const quotas = computeCategoryQuotas(pieceCount);
    const readyIdeas = [...getReadyIdeas()].sort((a, b) => ratingRank(a.rating) - ratingRank(b.rating));
    const byCategory = {};
    for (const idea of readyIdeas) {
      (byCategory[idea.category] = byCategory[idea.category] || []).push(idea);
    }

    const searchQuery = pickIdeasSearchInput.value.trim().toLowerCase();

    updatePickIdeasCount();

    for (const category of CATEGORIES) {
      // סינון סוג-תוכן קובע אילו קטגוריות שלמות מוצגות בכלל - לא רק אילו
      // רעיונות בתוכן, אחרת "אני רוצה רק בעל ערך ומכירתי" עדיין היה מציג
      // את שאר הקטגוריות ריקות.
      if (activeCategoryFilter && category !== activeCategoryFilter) continue;
      const allIdeasInCategory = byCategory[category] || [];
      if (!allIdeasInCategory.length) continue;

      // "בחר הכל" בוחר רק את מה שבפועל גלוי כרגע (אחרי חיפוש/סינון) -
      // התנהגות אינטואיטיבית של "בחר הכל שרואים", לא כל הקטגוריה בעיוור.
      const visibleIdeas = allIdeasInCategory.filter((idea) => {
        if (searchQuery && !idea.title.toLowerCase().includes(searchQuery)) return false;
        if (activeRatingFilter && idea.rating !== activeRatingFilter) return false;
        return true;
      });
      if (!visibleIdeas.length) continue;

      const quota = quotas[category] || 0;

      const heading = document.createElement('div');
      heading.className = 'content-plan-pick-ideas-heading';
      heading.style.setProperty('--card-color', categoryColorVar(category));

      const headingLabel = document.createElement('span');
      headingLabel.className = 'content-plan-pick-ideas-heading-label';
      headingLabel.textContent = `${categoryIcon(category)} ${category}`;
      heading.appendChild(headingLabel);

      const quotaBadge = document.createElement('span');
      quotaBadge.className = 'content-plan-pick-ideas-quota';
      heading.appendChild(quotaBadge);
      categoryQuotaBadges.set(category, quotaBadge);
      updateCategoryQuotaBadge(category, allIdeasInCategory, quota);

      const selectAllBtn = document.createElement('button');
      selectAllBtn.type = 'button';
      selectAllBtn.className = 'content-plan-pick-ideas-select-all-btn';
      selectAllBtn.textContent = 'בחר הכל';
      selectAllBtn.addEventListener('click', () => {
        visibleIdeas.forEach((idea) => pinnedIdeaIds.add(idea.id));
        updatePickIdeasBtnLabel();
        renderPickIdeasList();
      });
      heading.appendChild(selectAllBtn);

      pickIdeasList.appendChild(heading);

      for (const idea of visibleIdeas) {
        const label = document.createElement('label');
        label.className = 'content-plan-pick-idea-row';
        // סימון = צובע בצבע סוג התוכן שלו, לא בצבע אחיד גנרי - זה מה
        // שמאיה ציינה כהכי חשוב לה.
        label.style.setProperty('--card-color', categoryColorVar(category));
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = pinnedIdeaIds.has(idea.id);
        label.classList.toggle('content-plan-pick-idea-row-checked', checkbox.checked);
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) pinnedIdeaIds.add(idea.id);
          else pinnedIdeaIds.delete(idea.id);
          label.classList.toggle('content-plan-pick-idea-row-checked', checkbox.checked);
          updatePickIdeasCount();
          updateCategoryQuotaBadge(category, allIdeasInCategory, quota);
          updatePickIdeasBtnLabel();
        });
        label.appendChild(checkbox);
        const title = document.createElement('span');
        title.className = 'content-plan-pick-idea-title';
        title.textContent = idea.title;
        label.appendChild(title);
        if (idea.rating) {
          const ratingEl = document.createElement('span');
          ratingEl.className = 'content-plan-pick-idea-rating';
          ratingEl.textContent = idea.rating;
          label.appendChild(ratingEl);
        }
        pickIdeasList.appendChild(label);
      }
    }
  }

  document.getElementById('content-plan-open-builder-btn').addEventListener('click', async () => {
    pinnedIdeaIds = new Set();
    updatePickIdeasBtnLabel();
    refreshGate();
    modal.hidden = false;
    await refreshAudienceGate();
  });

  pickIdeasBtn.addEventListener('click', () => {
    resetPickIdeasFilters();
    renderPickIdeasList();
    pickIdeasModal.hidden = false;
  });

  pickIdeasSearchInput.addEventListener('input', renderPickIdeasList);
  pickIdeasClearBtn.addEventListener('click', () => {
    pinnedIdeaIds.clear();
    updatePickIdeasBtnLabel();
    renderPickIdeasList();
  });

  function closePickIdeasModal() {
    pickIdeasModal.hidden = true;
  }
  document.getElementById('content-plan-pick-ideas-close-btn').addEventListener('click', closePickIdeasModal);
  document.getElementById('content-plan-pick-ideas-cancel-btn').addEventListener('click', closePickIdeasModal);
  document.getElementById('content-plan-pick-ideas-save-btn').addEventListener('click', closePickIdeasModal);
  pickIdeasModal.addEventListener('click', (e) => {
    if (e.target === pickIdeasModal) closePickIdeasModal();
  });

  // כמות התכנים המבוקשת יכולה להשתנות אחרי שהשער כבר עבר (למשל: עבר
  // ל-16, ואז המשתמשת מעלה ל-60) - בלי לבדוק מחדש, השער נשאר "תקוע" על
  // הכמות הישנה בזמן שהיצע הרעיונות בפועל כבר לא מספיק לכמות החדשה.
  document.getElementById('content-plan-piece-count').addEventListener('input', refreshGate);

  function closeAudienceModal() {
    audienceModal.hidden = true;
  }
  document.getElementById('audience-edit-close-btn').addEventListener('click', closeAudienceModal);
  document.getElementById('audience-edit-cancel-btn').addEventListener('click', closeAudienceModal);
  audienceModal.addEventListener('click', (e) => {
    if (e.target === audienceModal) closeAudienceModal();
  });
  document.getElementById('audience-edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const primaryAudience = document.getElementById('audience-edit-primary').value.trim();
    const secondaryAudience = document.getElementById('audience-edit-secondary').value.trim();
    const audienceErrorEl = document.getElementById('audience-edit-error');
    if (!primaryAudience) {
      audienceErrorEl.textContent = 'צריך למלא קהל יעד עיקרי';
      audienceErrorEl.hidden = false;
      return;
    }
    const saveAudienceBtn = document.getElementById('audience-edit-save-btn');
    saveAudienceBtn.disabled = true;
    try {
      // merge בלבד (לא setDoc מלא) - נוגע רק בשני השדות האלה, לא מוחק
      // או דורס name/pronoun/business שכבר נשמרו בשיחת ההיכרות.
      await saveProfile({ primaryAudience, secondaryAudience });
      closeAudienceModal();
      showToast('✓ קהל היעד נשמר');
      refreshGate();
      await refreshAudienceGate();
    } catch (err) {
      console.error('saveProfile (audience) failed:', err);
      audienceErrorEl.textContent = 'משהו השתבש בשמירה, נסו שוב';
      audienceErrorEl.hidden = false;
    } finally {
      saveAudienceBtn.disabled = false;
    }
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
    const { selected, droppedPinned } = selectIdeasForRatio(readyIdeas, pieceCount, pinnedIdeaIds);
    const cappedIdeas = selected.slice(0, MAX_IDEAS_SENT);

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

    const includeSecondaryAudience = secondaryAudienceRow.hidden ? true : includeSecondaryCheckbox.checked;

    try {
      const result = await generateContentPlan({ pieceCount, ideas: ideasPayload, includeSecondaryAudience });
      currentPlan = enrichPlanFromBank(result.data.plan, cappedIdeas);
      if (readyIdeas.length > cappedIdeas.length) {
        currentPlan.truncatedFrom = readyIdeas.length;
        currentPlan.selectedCount = cappedIdeas.length;
      }
      if (droppedPinned.length) {
        currentPlan.droppedPinnedTitles = droppedPinned.map((idea) => idea.title);
      }
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
