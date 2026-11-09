/* 05/11/2026 (מאיה): "✍️ תיאור לסרטון" בסיכום של העוזר. הכללים שלה:
   "מה שמעניין זה רק תיאור. לרוב התיאור תלוי מה הסרטון: אם זה בירול קצר
   עם טקסט אז תיאור יותר ארוך שמפרט; אם זה סרטון ארוך של דיבור אז לרוב
   התיאור אמור להיות או המסר בקצרה או משפט שמסקרן; ואם יש הנעה לפעולה
   בסרטון אז להוסיף גם אותה. קאבר אין צורך. כן הוק של טקסט (טקסט על
   המסך) כהצעה, כאופציה." */
// 06/11/2026 (מאיה): "בכפתור של תיאור לסרטון הוא צריך לקחת את התיאור
// מהתסריט אוטומטי שימי לב", "התיאור לסרטון שואל אותי שאלות אבל אני רוצה
// כבר שיידע לבד את התשובות וישר יכתוב".
/* לכן אין יותר שאלות (איזה סרטון, יש הנעה לפעולה): הלחיצה שולחת לשרת את
   כל מה שהעוזר כבר יודע (התסריט, הרעיון, המסר/השורה התחתונה, הזווית,
   ההוק, ההנעה לפעולה שנבחרה, התחום, הקהל ולשון הפנייה) והתיאור נכתב מיד.
   סוג הסרטון מנוחש מהפורמט, ואם לא ברור השרת מסיק לבד מהתסריט.
   התוצאה נשמרת בפריט ב"התסריטים שלי" (state.videoDescription). */
import { functions } from './firebase-init.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

/* 06/11/2026: תיאור שנשמר לפני התיקון נכתב מאפס ("הוא המציא סתם משהו"),
   ולכן לא מציגים אותו. פתיחה של סרטון כזה כותבת תיאור חדש מהתסריט. */
export const DESCRIPTION_VERSION = 2;

/* ההנעה לפעולה שנבחרה בזיקוק התסריט (כתיבה מאפס) */
const CTA_TEXT = {
  'מעורבות': 'תגובה, לייק או שמירה',
  'עוקבים': 'לעקוב אחרי העמוד',
  'מכירה': 'לרכוש',
};

/** ההנעה לפעולה שכבר נבחרה בעוזר, אם נבחרה. ריק כשלא. */
export function ctaFromState(state) {
  const s = state || {};
  if (!s.ctaType) return '';
  if (s.ctaType === 'משפך') return String(s.ctaFunnel || '').trim() || 'משפך';
  return CTA_TEXT[s.ctaType] || String(s.ctaType);
}

/** ניחוש של סוג הסרטון לפי הפורמט, רק כשהוא ברור. אחרת ריק, והשרת מסיק. */
export function guessVideoType(state) {
  const f = (state && state.selectedFormat) || '';
  if (f === 'תוכן ויזואלי יפה' || f === 'טקסט דינמי') return 'בירול קצר עם טקסט';
  if (f === 'דיבור למצלמה' || f === 'שאלות מהתיבה בסטורי' || f === 'תגובה לתגובה' || f === 'ראיון / שיחה') return 'סרטון דיבור';
  return '';
}

const cut = (v, n) => String(v || '').trim().slice(0, n);

/** כל מה שהעוזר כבר יודע על הסרטון, בדיוק כמו שהיא כתבה. בלי לשאול כלום. */
export function descriptionPayload(state, script, ctx) {
  const s = state || {};
  const c = ctx || {};
  return {
    script: cut(script, 8000),
    idea: cut(s.ideaTopic || s.ideaBeforePackaging || s.ideaDescription, 2000),
    message: cut(s.ideaPunchline, 1000),
    angle: cut(s.packaging, 1000),
    hook: cut(s.hook, 1000),
    hookReinforcement: cut(s.hookReinforcement, 1000),
    videoType: guessVideoType(s),
    cta: cut(ctaFromState(s), 300),
    ctaType: cut(s.ctaType, 40),
    domain: cut(c.domain, 300),
    audience: cut(c.audience, 600),
    pronoun: cut(c.pronoun, 10),
  };
}

let callable = null;
function writeVideoDescription(payload) {
  if (!callable) callable = httpsCallable(functions, 'writeVideoDescription', { timeout: 60000 });
  return callable(payload).then((r) => r.data);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * פותח את חלון התיאור, ואם אין תיאור שמור, כותב מיד.
 * deps: {
 *   state                 הסטייט של הסרטון
 *   script                הטקסט הסופי
 *   getContext()          Promise<{ domain, audience, pronoun }> מהפרופיל
 *   onSave(result)        שמירה בפריט (state.videoDescription)
 *   openModal, copyBtn, wireCopyButtons, showToast, serverErrorText
 *   call(payload)         להזרקה בבדיקות, ברירת מחדל: הפונקציה בשרת
 * }
 */
export function openDescriptionTool(deps) {
  const { state } = deps;
  const prev = state.videoDescription || null;
  const saved = prev && prev.description && prev.version === DESCRIPTION_VERSION ? prev : null;
  let busy = false;

  const overlay = deps.openModal(`<div id="va-desc" class="va-desc">
    <h2 style="margin-top:0">✍️ תיאור לסרטון</h2>
    <p class="va-desc__lede">נבנה מהתסריט שלך: המסר או המשפט הכי מסקרן, ובסוף ההנעה לפעולה. בלי האשטגים ובלי קאבר.</p>
    <div id="va-desc-result" aria-live="polite"></div>
    <div class="cosmic-btn-row" style="margin-top:16px">
      <button type="button" class="cosmic-btn" id="va-desc-go"${saved ? '' : ' hidden'}>לכתוב תיאור חדש</button>
    </div>
  </div>`, { backdropClose: false });

  const $ = (sel) => overlay.querySelector(sel);
  const result = $('#va-desc-result');
  const goBtn = $('#va-desc-go');

  function showResult(r) {
    const hooks = (r.textHooks || []).filter(Boolean);
    result.innerHTML = `<div class="va-desc__out">
      <p class="va-desc__label">התיאור:</p>
      <div class="cosmic-prompt-box va-desc__text" id="va-desc-text">${escapeHtml(r.description)}</div>
      ${deps.copyBtn(r.description, 'להעתיק את התיאור')}
      ${hooks.length ? `<p class="va-desc__label" style="margin-top:16px">הצעות להוק כתוב על המסך (לא חובה):</p>
      <p class="cosmic-hint" style="margin:0 0 8px">הטקסט על המסך מחזק את מה שנאמר בפתיחה ולא מגלה לאן הסרטון הולך. לפעמים הכי חזק זה פשוט כתוביות של משפט הפתיחה.</p>
      <ul class="va-desc__hooks">${hooks.map((h) => `<li><p>${escapeHtml(h)}</p>${deps.copyBtn(h, 'להעתיק')}</li>`).join('')}</ul>` : ''}
    </div>`;
    deps.wireCopyButtons(result);
  }

  /* תיאור קודם לא נמחק בגלל ניסיון חדש שנכשל */
  let last = saved;
  if (last) showResult(last);

  async function write() {
    if (busy) return;
    busy = true;
    goBtn.hidden = true;
    result.innerHTML = '<p class="va-desc__wait">כותבים את התיאור מהתסריט שלך, זה לוקח כמה שניות...</p>';
    try {
      let ctx = { domain: '', audience: '', pronoun: '' };
      try { ctx = { ...ctx, ...(await deps.getContext()) }; } catch (err) { console.error('description context failed:', err); }
      const payload = descriptionPayload(deps.state, deps.script, ctx);
      const r = await (deps.call || writeVideoDescription)(payload);
      if (!r || !r.description) throw new Error('empty description');
      const out = {
        description: r.description,
        textHooks: (r.textHooks || []).slice(0, 3),
        videoType: payload.videoType,
        cta: payload.cta,
        version: DESCRIPTION_VERSION,
        createdAt: Date.now(),
      };
      last = out;
      showResult(out);
      deps.onSave(out);
    } catch (err) {
      console.error('writeVideoDescription failed:', err);
      if (last) showResult(last);
      else result.innerHTML = '';
      result.insertAdjacentHTML('afterbegin', `<p class="va-desc__error" role="alert">${escapeHtml(deps.serverErrorText(err, 'כתיבת התיאור'))}</p>`);
    } finally {
      busy = false;
      goBtn.hidden = false;
      goBtn.textContent = last ? 'לכתוב תיאור חדש' : 'לנסות שוב';
    }
  }

  goBtn.addEventListener('click', write);
  if (!saved) write();
  return overlay;
}
