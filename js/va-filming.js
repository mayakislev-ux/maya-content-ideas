/* 05/11/2026 (מאיה): "דף צילום". הסיכום אמר "לעבור על הצ'קליסט לריל
   מנצח", וצ'קליסט כזה לא היה קיים בשום מקום באפליקציה. עכשיו יש דף אמיתי,
   שנפתח מהסיכום ומכל סרטון ב"התסריטים שלי":
   1. רשימת בדיקה לפני הצילום ואחריו, עם סימון. הסימון נשמר לכל סרטון
      בנפרד (state.filmingChecks, בתוך הפריט ב"התסריטים שלי").
   2. רשימת שוטים קצרה: לפי הפורמט שנבחר, ולפי השורות של התסריט עצמו.

   ניסוחים שכבר היו באפליקציה נלקחו משם: "האם ההתחלה מעניינת תוך 2
   שניות?", "מומלץ להוסיף הוק כתוב על המסך, כדי שיבינו את ההקשר מיד",
   "להוסיף כתוביות" (מסכי הקטע שצולם). השאר נכתב כאן ומחכה לאישור שלה. */

export const FILMING_CHECKS = [
  { id: 'light', label: 'אור: אור טבעי על הפנים (חלון מול הפנים, לא מאחור)' },
  { id: 'sound', label: 'סאונד: מיקרופון מחובר, ובלי רעש ברקע' },
  { id: 'frame', label: 'מסגור: הטלפון בגובה העיניים, והפנים במרכז הפריים' },
  { id: 'lens', label: 'לנגב את העדשה של הטלפון לפני שמצלמים' },
  { id: 'hook', label: '2 השניות הראשונות הן ההוק, בלי "היי" ובלי הקדמה' },
  { id: 'texthook', label: 'הוק כתוב על המסך, כדי שיבינו את ההקשר מיד' },
  { id: 'captions', label: 'להוסיף כתוביות' },
];

/* מה מצלמים בכל פורמט, במשפט אחד, ואיך נקרא כל שוט */
const FORMAT_SHOTS = {
  'דיבור למצלמה': { tip: 'כל משפט בטייק נפרד, ישר לעדשה. אפשר לצלם כל משפט כמה פעמים ולבחור בעריכה.', label: 'למצלמה' },
  'וויס אובר': { tip: 'קודם מקליטים את הקול של כל התסריט, ואז מצלמים סצנה יומיומית לכל משפט.', label: 'סצנה' },
  'ראיון / שיחה': { tip: 'שתי זוויות: אחת על מי ששואל ואחת על מי שעונה.', label: 'בשיחה' },
  'תוכן ויזואלי יפה': { tip: 'צילום אסתטי ונקי, והמסר עולה כטקסט על המסך.', label: 'צילום + טקסט' },
  'טקסט דינמי': { tip: 'קטעים קצרים מהחיים או מהעבודה, ועל כל קטע משפט אחד מהתסריט כטקסט.', label: 'קטע + טקסט' },
  'שאלות מהתיבה בסטורי': { tip: 'השאלה ככותרת על המסך, ואז עונים ישר למצלמה.', label: 'למצלמה' },
  'סדרת תוכן': { tip: 'לפתוח עם מספר הפרק, ולסיים במשהו שיגרום לחזור לפרק הבא.', label: 'למצלמה' },
  'משחק תפקידים': { tip: 'כל דמות בזווית אחרת, או עם אביזר קטן שמבדיל ביניהן.', label: 'דמות' },
  'פוסט קרוסלה': { tip: 'לא מצלמים: מעצבים שקופית לכל חלק בטקסט.', label: 'שקופית' },
  'לוח / טאבלט': { tip: 'המצלמה על הלוח, וכותבים או מציירים תוך כדי ההסבר.', label: 'על הלוח' },
  "סטיץ' (תגובה לסרטון ויראלי)": { tip: 'קודם הסרטון המקורי (או מסך מפוצל), ואז התגובה למצלמה.', label: 'תגובה' },
  'תגובה לתגובה': { tip: 'התגובה על המסך כצילום מסך או כטקסט, ואז עונים למצלמה.', label: 'למצלמה' },
  'מסך ירוק': { tip: 'מצלמים מול רקע אחיד, ובעריכה שמים מאחור את מה שמדברים עליו.', label: 'למצלמה' },
  'מסך חצוי': { tip: 'מצלמים את ההסבר, ומשאירים מקום במסך לדוגמאות שיתווספו בעריכה.', label: 'למצלמה' },
};
const DEFAULT_FORMAT = 'דיבור למצלמה';
const MAX_SHOTS = 8;

/** הטקסט הסופי של הסרטון. אותו כלל כמו finalScriptText בסיכום. */
export function scriptOf(state) {
  const s = state || {};
  if (s.branch === 'footage') return s.herWords || '';
  if (s.branch === 'scratch') return s.draftScript || s.finalScript || '';
  return s.finalScript || s.draftScript || '';
}

/** השורות של התסריט, ובלי שורות אין סוף משפטים. עד 8, מאוחדות לפי הסדר. */
export function scriptLines(script) {
  let lines = String(script || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    lines = String(script || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/).map((l) => l.trim()).filter(Boolean);
  }
  if (lines.length <= MAX_SHOTS) return lines;
  const per = Math.ceil(lines.length / MAX_SHOTS);
  const out = [];
  for (let i = 0; i < lines.length; i += per) out.push(lines.slice(i, i + per).join(' '));
  return out;
}

/** רשימת השוטים: לפי הפורמט, ושוט לכל שורה בתסריט. השוט הראשון הוא ההוק. */
export function shotList(state) {
  const s = state || {};
  const format = s.selectedFormat && FORMAT_SHOTS[s.selectedFormat] ? s.selectedFormat : DEFAULT_FORMAT;
  const { tip, label } = FORMAT_SHOTS[format];
  const lines = scriptLines(scriptOf(s));
  if (!lines.length && s.hook) lines.push(s.hook);
  const hookNote = format === 'פוסט קרוסלה' ? 'ההוק' : 'ההוק (2 השניות הראשונות)';
  const shots = lines.map((text, i) => ({
    label: i === 0 ? `${label} ${i + 1} · ${hookNote}` : `${label} ${i + 1}`,
    text,
  }));
  return { format, chosen: Boolean(s.selectedFormat), tip, shots };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function filmingHtml(state, { backLabel = '' } = {}) {
  const checks = (state && state.filmingChecks) || {};
  const done = FILMING_CHECKS.filter((c) => checks[c.id]).length;
  const plan = shotList(state);
  return `
    ${backLabel ? `<button type="button" class="va-text-link" id="va-filming-back">${escapeHtml(backLabel)}</button>` : ''}
    <h2 style="margin-top:0">🎬 דף צילום</h2>
    <p class="va-filming__lede">לעבור על הרשימה לפני שמצלמים, ושוב לפני ההעלאה. הסימון נשמר לסרטון הזה.</p>
    <p class="va-filming__count" id="va-filming-count" aria-live="polite">${done} מתוך ${FILMING_CHECKS.length} ✓</p>
    <ul class="va-filming__checks">${FILMING_CHECKS.map((c) => `
      <li><label class="va-filming__check">
        <input type="checkbox" data-check="${c.id}"${checks[c.id] ? ' checked' : ''}>
        <span>${escapeHtml(c.label)}</span>
      </label></li>`).join('')}
    </ul>
    <h3 class="va-filming__h">רשימת שוטים</h3>
    <p class="va-filming__format"><strong>${escapeHtml(plan.format)}${plan.chosen ? '' : ' (ברירת מחדל)'}:</strong> ${escapeHtml(plan.tip)}</p>
    ${plan.shots.length
      ? `<ol class="va-filming__shots">${plan.shots.map((sh) => `
        <li><small>${escapeHtml(sh.label)}</small><p>${escapeHtml(sh.text)}</p></li>`).join('')}</ol>`
      : '<p class="va-filming__empty">אין לסרטון הזה תסריט כתוב, ולכן מצלמים לפי הרעיון.</p>'}`;
}

/**
 * מצייר את דף הצילום לתוך container ומחבר את הסימונים.
 * onChange(checks) נקרא אחרי כל סימון, עם כל הסימונים של הסרטון.
 */
export function mountFilming(container, { state, onChange, onBack = null, backLabel = '' }) {
  let checks = { ...((state && state.filmingChecks) || {}) };
  container.innerHTML = filmingHtml({ ...state, filmingChecks: checks }, { backLabel: onBack ? backLabel : '' });
  const count = container.querySelector('#va-filming-count');
  container.querySelectorAll('[data-check]').forEach((box) => box.addEventListener('change', () => {
    checks = { ...checks, [box.getAttribute('data-check')]: box.checked };
    const done = FILMING_CHECKS.filter((c) => checks[c.id]).length;
    count.textContent = `${done} מתוך ${FILMING_CHECKS.length} ✓`;
    if (onChange) onChange(checks);
  }));
  const back = container.querySelector('#va-filming-back');
  if (back && onBack) back.addEventListener('click', onBack);
}
