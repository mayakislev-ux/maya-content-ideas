// 30/09/2026 (מאיה): "קודם זה מעביר אותן לדף מסודר כמו טבלה, אולי צריך UI UX
// חזק, ששם הן צריכות לעשות עוד עבודה ולמלא, אין מה לעשות... ורק אז אחרי שיש
// טבלה יהיה למעלה כפתור של לבנות תכנית ולאיזה קהל".
//
// המסך הזה בא לפני בניית התוכנית ולא במקומה. הוא מראה מה כבר נשלף מהקובץ
// האישי, מבקש במקום את מה שאף גיליון לא יכול להכיל, ופותח את כפתור הבנייה
// רק כשהכל שם.
//
// כל ההיגיון הטהור נמצא ב-story-table-render.js ונבדק שם. כאן נשארו רק
// אירועים, טעינה ושמירה.

import {
  loadStoryTable,
  syncStoryTable,
  saveOverride,
  listStoryTables,
  loadStoryTableFor,
} from './story-table-store.js';
import {
  addedGroupHtml,
  renderStoryTable,
  planChoicesHtml,
  planInputs,
  selectedAudience,
  defaultTable,
} from './story-table-render.js';
import { showToast } from './toast.js';
import { auth } from './firebase-init.js';
import { onAuthChange } from './auth.js';
import { wireStoryAssets } from './story-assets.js';
import { wireStorySequence } from './story-sequence.js';

const OWNER_EMAIL = 'mayakislev@gmail.com';

const state = { table: null, audienceId: null, busy: false, preview: false, planAudienceId: null };

function el(id) {
  return document.getElementById(id);
}

function refresh({ keepFocus = null } = {}) {
  const host = el('story-table');
  if (!host) return;
  host.innerHTML = renderStoryTable(state.table, state.audienceId);
  if (!keepFocus) return;
  const again = host.querySelector(`.st-input[data-row="${keepFocus}"]`);
  const field = again && again.closest('.st-field');
  if (field && !field.hidden) again.focus();
}

function setSaved(input, ok) {
  const row = input.closest('.st-row');
  if (!row) return;
  row.classList.toggle('is-saved', ok === true);
  row.classList.toggle('is-savefail', ok === false);
}

/** שמירה על יציאה מהשדה, ולא בכל הקלדה - זה היה כותב ל-Firestore בכל אות */
async function persist(input) {
  const audience = selectedAudience(state.table, state.audienceId);
  if (!audience) return;
  if (state.preview) {
    showToast('את צופה בטבלה של לקוחה. עריכה כאן לא נשמרת.');
    return;
  }
  const key = input.dataset.row;
  const text = input.value.trim();
  // כל עריכה היא override. אין יותר שדות שמבקשים תוכן, ולכן אין "answers"
  // חדשים - המילים שלה תמיד באות במקום מה שהוצג, או נוספות עליו.
  const bucket = state.table.overrides;
  const before = (bucket[audience.id] || {})[key] || '';
  if (before.trim() === text) return;

  bucket[audience.id] = { ...(bucket[audience.id] || {}), [key]: text };
  try {
    await saveOverride(audience.id, key, text);
    setSaved(input, true);
    // 30/09/2026, ביקורת 10 סוכנים: refresh מלא בנה מחדש 216KB של HTML,
    // סגר כל קבוצה שהיא פתחה, סגר את התיבה וזרק את הפוקוס. עכשיו מתעדכנת
    // רק השורה שנגעו בה.
    const inSlot = input.closest(".st-slot");
    if (inSlot) {
      // משבצת ידנית מציגה את מה שנכתב בה, ומתעדכנת לבדה
      refresh({ keepFocus: null });
    } else {
      const host = input.closest(".st-row");
      const box = host && host.querySelector("[data-added]");
      if (box) box.innerHTML = addedGroupHtml(text);
    }
  } catch (err) {
    console.error('story table save failed:', err);
    // מחזירים את המצב הקודם, אחרת המסך מראה שנשמר משהו שלא נשמר
    bucket[audience.id][key] = before;
    setSaved(input, false);
    showToast('לא הצלחנו לשמור. אפשר לנסות שוב.');
  }
}

// 01/10/2026 (מאיה): "לחצתי על בניית תוכנית אבל אין כפתור התחל". לחיצה
// על קהל רק בוחרת אותו, והבנייה קורית רק בלחיצה על הכפתור.
function paintChoices() {
  const choices = el('st-plan-choices');
  if (!choices || !state.table) return;
  choices.innerHTML = planChoicesHtml(state.table, state.planAudienceId);
}

function openPlanSheet() {
  const sheet = el('st-plan-sheet');
  if (!sheet || !state.table) return;
  state.planAudienceId = state.audienceId;
  paintChoices();
  sheet.hidden = false;
  const go = el('st-plan-go');
  if (go) go.focus();
}

/**
 * בניית התוכנית.
 *
 * ממלאת את שלושת השדות שהטופס הקיים ממילא מקבל ושולחת אותו. כך כל מה
 * שעובד היום - הסטרימינג, הניסיון החוזר, השמירה והצגת התוכנית - נשאר
 * בדיוק כמו שהוא, ורק מה שנכנס לפרומפט משתנה.
 */
function buildPlan(audienceId) {
  const audience = selectedAudience(state.table, audienceId);
  const form = el('warming-form');
  if (!audience || !form) return;
  const inputs = planInputs(audience, state.table);
  el('warming-product').value = inputs.product;
  el('warming-audience').value = inputs.audience;
  el('warming-context').value = inputs.extraContext;
  el('st-plan-sheet').hidden = true;
  // 30/09/2026, ביקורת 10 סוכנים: הסתרת הפאנל הסתירה גם את הודעת השגיאה
  // של הטופס, ולכן כישלון בבניית תוכנית נראה כמו מסך לבן. הטבלה נשארת
  // גלויה, והתוצאה מופיעה מתחתיה.
  el('story-table-panel').hidden = true;
  if (form.requestSubmit) form.requestSubmit();
  else form.dispatchEvent(new Event('submit', { cancelable: true }));
}

function showStatus(text, warn = false) {
  const status = el('st-status');
  if (!status) return;
  status.hidden = !text;
  status.textContent = text || '';
  status.className = warn ? 'st-status st-status--warn' : 'st-status';
}

/**
 * 30/09/2026 (מאיה): "לא רוצה את המסך הזה בכלל, רוצה ישר את הטבלה של
 * הסטורי ולמעלה כפתור כמו שאמרתי לך".
 *
 * אין מסך ביניים, אין טופס, ואין מסך שגיאה. כשאין תוכן מהקובץ, מוצגת
 * הטבלה עם הנושאים בלבד, והכפתור למעלה עובד בדיוק אותו דבר.
 */
function showTable(table) {
  state.table = table;
  state.audienceId = (table.audiences[0] || {}).id || null;
  el('warming-form').hidden = true;
  el('st-resync-btn').hidden = false;
  refresh();
}

async function runSync(quiet = false) {
  if (state.busy) return;
  state.busy = true;
  if (!quiet) showStatus('קוראים את הקובץ שלך...');
  try {
    const res = await syncStoryTable();
    if (!res.ready) {
      // 01/10/2026, ביקורת 10 סוכנים: כשלון רענון החליף טבלה אמיתית בטבלת
      // נושאים ריקה. טבלה שכבר על המסך לא נמחקת בגלל קריאה שנכשלה.
      showStatus("");
      if (!state.table) showTable(defaultTable());
      return;
    }
    const saved = await loadStoryTable();
    const next = saved && saved.audiences.length ? saved : { audiences: res.audiences, answers: {}, overrides: {} };
    showStatus("");
    // ברענון שקט מציירים מחדש רק אם באמת השתנה משהו בקובץ, כדי לא לסגור
    // קבוצה שהיא פתחה בדיוק עכשיו
    const before = JSON.stringify((state.table || {}).audiences || null);
    if (quiet && before === JSON.stringify(next.audiences)) {
      state.table = next;
      return;
    }
    showTable(next);
  } catch (err) {
    console.error('syncStoryTable failed:', err);
    showStatus("");
    if (!state.table) showTable(defaultTable());
  } finally {
    state.busy = false;
  }
}

/**
 * 30/09/2026 (מאיה: "אבל למה לא מפורט?"): היא הסתכלה על החשבון שלה, שהקובץ
 * שלו ריק, וראתה טבלה של נושאים בלי מילים. השורה הזאת נותנת לה לראות את
 * הטבלה של לקוחה אמיתית, ומוצגת רק לה.
 */
async function wireOwnerBar() {
  // 01/10/2026 (מאיה): "אני לא רוצה אפילו שיראו את האופציה לצפות אחת
  // לשנייה". לכן השורה הזאת אינה קיימת ב-HTML בכלל, ונבנית בקוד רק
  // כשהמייל הוא של מאיה. לקוחה לא רואה אותה גם אם תפתח את מקור הדף.
  if ((auth.currentUser && auth.currentUser.email) !== OWNER_EMAIL) return;
  const host = el('story-table-panel');
  const anchor = el('story-table');
  if (!host || !anchor) return;
  let bar = el('st-owner-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'st-owner-bar';
    bar.className = 'st-owner-bar';
    bar.hidden = true;
    const label = document.createElement('label');
    label.setAttribute('for', 'st-owner-pick');
    label.textContent = 'לצפות בטבלה של';
    const sel = document.createElement('select');
    sel.id = 'st-owner-pick';
    bar.append(label, sel);
    host.insertBefore(bar, anchor);
  }
  const pick = el('st-owner-pick');
  let rows = [];
  try {
    rows = await listStoryTables();
  } catch (err) {
    console.error('listStoryTables failed:', err);
    return;
  }
  if (!rows.length) return;

  pick.innerHTML =
    '<option value="">הטבלה שלי</option>' +
    rows.map((r) => `<option value="${r.uid}">${r.name} (${r.count} קהלים)</option>`).join('');
  bar.hidden = false;

  pick.addEventListener('change', async () => {
    const uid = pick.value;
    if (!uid) {
      state.preview = false;
      const mine = await loadStoryTable();
      showTable(mine && mine.audiences.length ? mine : defaultTable());
      return;
    }
    try {
      const other = await loadStoryTableFor(uid);
      state.preview = true;
      showTable(other && other.audiences.length ? other : defaultTable());
    } catch (err) {
      console.error('loadStoryTableFor failed:', err);
      showToast('לא הצלחנו לטעון את הטבלה של הלקוחה.');
    }
  });
}

/**
 * 01/10/2026 (מאיה): "בניית תוכנית לוקחת יותר מדי זמן, ואז שבונה לא ברור
 * לי איפה זה". התוכנית נבנתה מתחת לטבלה הארוכה והמסך נשאר איפה שהיה.
 * עכשיו הטבלה מתחבאת לזמן הבנייה, התוכנית מופיעה למעלה, ויש חזרה ברורה.
 * וכשהבנייה נכשלת הטבלה חוזרת מיד עם ההודעה, במקום מסך ריק.
 */
function wirePlanOutcome() {
  const back = el('st-back-to-table');
  if (!back) return;

  document.addEventListener('warming-plan-ready', () => {
    back.hidden = false;
    const view = el('warming-view');
    if (view && view.scrollIntoView) view.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.addEventListener('warming-plan-failed', (e) => {
    const panel = el('story-table-panel');
    if (panel) panel.hidden = false;
    back.hidden = true;
    showStatus((e.detail && e.detail.message) || 'לא הצלחנו לבנות את התוכנית. אפשר לנסות שוב.', true);
  });

  back.addEventListener('click', () => {
    back.hidden = true;
    el('warming-result').innerHTML = '';
    el('warming-missing-info').hidden = true;
    el('warming-save-btn').hidden = true;
    el('warming-save-btn-top').hidden = true;
    el('story-table-panel').hidden = false;
    showStatus('');
  });
}

export async function wireStoryTableView() {
  const panel = el('story-table-panel');
  const sheet = el('st-plan-sheet');
  if (!panel || !sheet) return;
  wirePlanOutcome();

  panel.addEventListener('click', (e) => {
    const pill = e.target.closest('.st-pill');
    if (pill) {
      state.audienceId = pill.dataset.audience;
      refresh();
      return;
    }
    const slotAdd = e.target.closest('.st-slot__add');
    if (slotAdd) {
      const field = slotAdd.closest('.st-slot').querySelector('.st-field');
      field.hidden = false;
      field.querySelector('textarea').focus();
      return;
    }
    const edit = e.target.closest('.st-edit');
    if (edit) {
      const field = edit.closest('.st-row').querySelector('.st-field');
      field.hidden = false;
      edit.hidden = true;
      field.querySelector('textarea').focus();
      return;
    }
    if (e.target.closest('#st-build-btn')) openPlanSheet();
    else if (e.target.closest('#st-resync-btn')) runSync();
  });

  // blur לא עולה למעלה, ולכן capture
  panel.addEventListener(
    'blur',
    (e) => {
      if (e.target.classList && e.target.classList.contains('st-input')) persist(e.target);
    },
    true
  );

  sheet.addEventListener('click', (e) => {
    if (e.target === sheet || e.target.closest('#st-plan-close')) {
      sheet.hidden = true;
      return;
    }
    const choice = e.target.closest('.st-choice');
    if (choice && !choice.disabled) {
      state.planAudienceId = choice.dataset.audience;
      paintChoices();
      return;
    }
    if (e.target.closest('#st-plan-go')) buildPlan(state.planAudienceId || state.audienceId);
  });

  // 30/09/2026 (מאיה: "למה לא התעדכן אצלי?"): הפונקציה הזאת רצה באתחול,
  // והמשתמש נכנס רק מאוחר יותר ב-onAuthChange. לכן הקריאה לנתונים הייתה
  // מתבצעת כש-auth.currentUser עדיין null, נכשלת בשקט, ונופלת לטבלת
  // הנושאים - בכל פתיחה, בלי קשר למה שבאמת שמור. הטעינה מחכה עכשיו
  // למשתמש, והחיווט של האירועים למעלה נשאר מיידי.
  let loadedFor = null;
  onAuthChange(async (user) => {
    if (!user) {
      loadedFor = null;
      return;
    }
    if (loadedFor === user.uid) return;
    loadedFor = user.uid;
    await loadInitial();
  });
}

async function loadInitial() {
  try {
    const saved = await loadStoryTable();
    if (saved && saved.audiences.length) {
      showTable(saved);
      wireOwnerBar();
      wireStoryAssets();
      wireStorySequence();
      // 01/10/2026 (מאיה: "אם מישהי מעדכנת בטבלת הפרסונה או קהל יעד, זה
      // מסונכרן?"): עד כאן הסנכרון רץ רק כשלא הייתה טבלה בכלל, או בלחיצה
      // על הכפתור. מי שעדכנה את הגיליון לא ראתה את זה אף פעם. עכשיו הקובץ
      // נקרא מחדש בכל פתיחה, ברקע, אחרי שהטבלה השמורה כבר על המסך - כך
      // שאין המתנה, והתוכן תמיד עדכני.
      runSync(true);
      return;
    }
  } catch (err) {
    console.error('loadStoryTable failed:', err);
  }
  // הטבלה עולה מיד עם הנושאים, והסנכרון ממלא אותה ברקע כשהוא מצליח
  showTable(defaultTable());
  runSync();
  wireOwnerBar();
  wireStoryAssets();
  wireStorySequence();
}
