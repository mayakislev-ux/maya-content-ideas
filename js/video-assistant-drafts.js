// 26/10/2026 (מאיה, בשם הבנות): "בעזרה בבניית סרטון במוח השיווקי בנות
// התלוננו שהתסריטים לא נשמרים אוטומטית, אז צריך להוסיף לשם כפתור נוח".
//
// מה באמת קרה: הסשן נשמר רק ב-dispatch, כלומר רק כשעוברים מסך. כל מה
// שהוקלד או הודבק במסך הנוכחי לא היה קיים בשום מקום עד שלחצו על הכפתור
// שממשיך הלאה. רענון, נעילת מסך או חזרה אחורה מחקו אותו. וגם אחרי
// שמירה - רוב תיבות הטקסט לא מילאו את עצמן חזרה מהסטייט, ולכן גם מה
// שכן נשמר נראה כאילו נעלם.
//
// כאן זה נפתר במקום אחד, ולכן זה חל על כל המסכים: כל תיבת טקסט בכרטיס
// נשמרת תוך כדי הקלדה, חוזרת לעצמה כשהמסך מצויר מחדש, ויש שורה שאומרת
// מתי נשמר לאחרונה עם כפתור "לשמור עכשיו".
//
// בלי DOM גלובלי ובלי Firestore כאן: הלוגיקה טהורה ונבדקת ישירות
// (ראה test/video-assistant-drafts.test.mjs).

export const DEBOUNCE_MS = 800;

/** המפתח של תיבה בודדת. המסך הוא חלק ממנו, כדי ששתי תיבות באותו שם
    במסכים שונים לא ידרסו זו את זו. */
export function draftKey(screen, id) {
  return `${screen}|${id}`;
}

/** האם התיבה הזאת בכלל נשמרת. שדות סיסמה וכפתורים לא. */
export function isDraftField(el) {
  if (!el || !el.id) return false;
  const tag = String(el.tagName || '').toLowerCase();
  if (tag === 'textarea') return true;
  if (tag !== 'input') return false;
  const type = String(el.type || 'text').toLowerCase();
  return type === 'text' || type === 'url' || type === 'search';
}

/**
 * מה לכתוב בתיבה כשהמסך מצויר מחדש.
 *
 * מה שהגיע מהסטייט עצמו גובר תמיד: הוא המקור הרשמי, והטיוטה היא רק
 * מה שעוד לא הספיק להפוך לסטייט. מחרוזת ריקה שנשמרה היא כן תשובה -
 * ככה תיבה שנוקתה בכוונה לא מתמלאת שוב לבד.
 */
export function valueFor(drafts, screen, id, currentValue) {
  if (currentValue) return currentValue;
  const k = draftKey(screen, id);
  return Object.prototype.hasOwnProperty.call(drafts || {}, k) ? drafts[k] : currentValue;
}

/** כתיבת טיוטה, בלי לשנות את האובייקט הקיים. */
export function withDraft(drafts, screen, id, value) {
  return { ...(drafts || {}), [draftKey(screen, id)]: value };
}

/**
 * ניקוי הטיוטות של מסך שהסתיים.
 *
 * כשתיבה כבר הפכה לסטייט אמיתי אין טעם להחזיק אותה פעמיים, והטיוטה
 * הישנה רק מסכנת: היא עלולה למלא מחדש תיבה שנוקתה במכוון.
 */
export function clearScreenDrafts(drafts, screen) {
  const out = {};
  for (const [k, v] of Object.entries(drafts || {})) {
    if (!k.startsWith(`${screen}|`)) out[k] = v;
  }
  return out;
}

/** "נשמר 18:42". זמן מקומי, כי זה מה שהיא רואה על השעון. */
export function savedLabel(ms, now = Date.now()) {
  if (!ms) return 'נשמר אוטומטית תוך כדי כתיבה';
  const diff = Math.max(0, now - ms);
  if (diff < 5000) return 'נשמר ✓';
  const t = new Date(ms).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `נשמר ב-${t} ✓`;
}

export const SAVE_BAR_HTML = `
<div class="va-save-bar" id="va-save-bar">
  <span class="va-save-bar__state" id="va-save-state" role="status" aria-live="polite">נשמר אוטומטית תוך כדי כתיבה</span>
  <button type="button" class="cosmic-btn va-save-bar__btn" id="va-save-now">לשמור עכשיו</button>
</div>`;

/**
 * חיבור הכרטיס המצויר לשמירה.
 *
 * card    אלמנט הכרטיס
 * screen  שם המסך הנוכחי
 * getDrafts/setDrafts  קריאה וכתיבה של הטיוטות בסטייט
 * save()  שמירה בפועל, מחזירה Promise
 * timers  להזרקה בבדיקות
 */
export function mountDrafts(card, {
  screen, getDrafts, setDrafts, save,
  setTimer = setTimeout, clearTimer = clearTimeout,
}) {
  if (!card) return null;
  const fields = [...card.querySelectorAll('textarea, input')].filter(isDraftField);
  if (!fields.length) return null;

  for (const el of fields) {
    el.value = valueFor(getDrafts(), screen, el.id, el.value) || '';
  }

  card.insertAdjacentHTML('beforeend', SAVE_BAR_HTML);
  const stateEl = card.querySelector('#va-save-state');
  const btn = card.querySelector('#va-save-now');

  let pending = null;
  let lastSaved = 0;

  const flush = async () => {
    if (pending) { clearTimer(pending); pending = null; }
    if (stateEl) stateEl.textContent = 'שומר...';
    try {
      await save();
      lastSaved = Date.now();
      if (stateEl) stateEl.textContent = savedLabel(lastSaved);
    } catch {
      /* 26/10/2026: כישלון שמירה נאמר, ולא נבלע. תיבה שנראית שמורה ואינה
         שמורה היא בדיוק התקלה שהבנות דיווחו עליה. */
      if (stateEl) stateEl.textContent = 'השמירה לא עברה. אפשר ללחוץ "לשמור עכשיו"';
    }
  };

  const onInput = (e) => {
    const el = e.target;
    if (!isDraftField(el)) return;
    setDrafts(withDraft(getDrafts(), screen, el.id, el.value));
    if (stateEl) stateEl.textContent = 'נשמר בעוד רגע...';
    if (pending) clearTimer(pending);
    pending = setTimer(flush, DEBOUNCE_MS);
  };

  card.addEventListener('input', onInput);
  if (btn) btn.addEventListener('click', flush);

  return { flush, fields, stateEl, btn };
}
