/* 05/11/2026 (מאיה): "✍️ תיאור לסרטון" בסיכום של העוזר. הכללים שלה:
   "מה שמעניין זה רק תיאור. לרוב התיאור תלוי מה הסרטון: אם זה בירול קצר
   עם טקסט אז תיאור יותר ארוך שמפרט; אם זה סרטון ארוך של דיבור אז לרוב
   התיאור אמור להיות או המסר בקצרה או משפט שמסקרן; ואם יש הנעה לפעולה
   בסרטון אז להוסיף גם אותה. קאבר אין צורך. כן הוק של טקסט (טקסט על
   המסך) כהצעה, כאופציה."

   לכן שאלה אחת קצרה (איזה סרטון זה, ויש הנעה לפעולה?), ואז השרת
   (writeVideoDescription) מחזיר תיאור ושלושה הוקים של טקסט. בלי האשטגים
   ובלי קאבר. התוצאה נשמרת בפריט ב"התסריטים שלי" (state.videoDescription). */
import { functions } from './firebase-init.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

export const VIDEO_TYPES = ['בירול קצר עם טקסט', 'סרטון דיבור', 'אחר'];

/* ההנעה לפעולה שנבחרה בזיקוק התסריט (כתיבה מאפס), כמשפט לתיאור */
const CTA_TEXT = {
  'מעורבות': 'לייק, תגובה או שמירה',
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

/** ניחוש של סוג הסרטון לפי הפורמט, רק כשהוא ברור. אחרת ריק, והיא בוחרת. */
export function guessVideoType(state) {
  const f = (state && state.selectedFormat) || '';
  if (f === 'תוכן ויזואלי יפה' || f === 'טקסט דינמי') return 'בירול קצר עם טקסט';
  if (f === 'דיבור למצלמה' || f === 'שאלות מהתיבה בסטורי' || f === 'תגובה לתגובה') return 'סרטון דיבור';
  return '';
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

function chipsHtml(list, picked, attr) {
  return list.map((x) => `<button type="button" class="cosmic-btn cosmic-chip-btn${picked === x ? ' cosmic-chip-btn--on' : ''}" ${attr}="${escapeHtml(x)}" aria-pressed="${picked === x}">${escapeHtml(x)}</button>`).join('');
}

/**
 * פותח את חלון התיאור.
 * deps: {
 *   state                 הסטייט של הסרטון
 *   script                הטקסט הסופי
 *   getContext()          Promise<{ domain, audience }> מהפרופיל
 *   onSave(result)        שמירה בפריט (state.videoDescription)
 *   openModal, copyBtn, wireCopyButtons, showToast, serverErrorText
 *   call(payload)         להזרקה בבדיקות, ברירת מחדל: הפונקציה בשרת
 * }
 */
export function openDescriptionTool(deps) {
  const { state } = deps;
  const saved = state.videoDescription || null;
  let videoType = (saved && saved.videoType) || guessVideoType(state);
  const prefillCta = saved ? (saved.cta || '') : ctaFromState(state);
  let hasCta = saved ? Boolean(saved.cta) : Boolean(prefillCta);
  let busy = false;

  const overlay = deps.openModal(`<div id="va-desc" class="va-desc">
    <h2 style="margin-top:0">✍️ תיאור לסרטון</h2>
    <p class="va-desc__lede">תיאור לפוסט ושלוש הצעות להוק כתוב על המסך. בלי האשטגים ובלי קאבר.</p>
    <p class="cosmic-field-label">איזה סרטון זה?</p>
    <div class="cosmic-chip-row" id="va-desc-type-row">${chipsHtml(VIDEO_TYPES, videoType, 'data-vtype')}</div>
    <p class="cosmic-field-label" style="margin-top:14px">יש בסרטון הנעה לפעולה?</p>
    <div class="cosmic-chip-row" id="va-desc-cta-row">${chipsHtml(['כן', 'לא'], hasCta ? 'כן' : 'לא', 'data-hascta')}</div>
    <div class="va-desc__cta" id="va-desc-cta-wrap"${hasCta ? '' : ' hidden'}>
      <label class="cosmic-field-label" for="va-desc-cta">מה הצופים צריכים לעשות?</label>
      <input type="text" class="cosmic-textarea va-desc__input" id="va-desc-cta" placeholder="למשל: לכתוב &quot;מדריך&quot; בתגובות" value="${escapeHtml(prefillCta)}">
    </div>
    <div class="cosmic-btn-row" style="margin-top:16px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-desc-go">${saved ? 'לכתוב תיאור חדש' : 'לכתוב תיאור'}</button>
    </div>
    <div id="va-desc-result" aria-live="polite"></div>
  </div>`, { backdropClose: false });

  const $ = (sel) => overlay.querySelector(sel);
  const result = $('#va-desc-result');
  const ctaWrap = $('#va-desc-cta-wrap');
  const ctaInput = $('#va-desc-cta');
  const goBtn = $('#va-desc-go');

  function pick(rowSel, attr, value) {
    overlay.querySelectorAll(`${rowSel} [${attr}]`).forEach((b) => {
      const on = b.getAttribute(attr) === value;
      b.classList.toggle('cosmic-chip-btn--on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }
  overlay.querySelectorAll('#va-desc-type-row [data-vtype]').forEach((b) => b.addEventListener('click', () => {
    videoType = b.getAttribute('data-vtype');
    pick('#va-desc-type-row', 'data-vtype', videoType);
  }));
  overlay.querySelectorAll('#va-desc-cta-row [data-hascta]').forEach((b) => b.addEventListener('click', () => {
    hasCta = b.getAttribute('data-hascta') === 'כן';
    pick('#va-desc-cta-row', 'data-hascta', hasCta ? 'כן' : 'לא');
    ctaWrap.hidden = !hasCta;
    if (hasCta && !ctaInput.value.trim()) ctaInput.focus();
  }));

  function showResult(r) {
    const hooks = (r.textHooks || []).filter(Boolean);
    result.innerHTML = `<div class="va-desc__out">
      <p class="va-desc__label">התיאור:</p>
      <div class="cosmic-prompt-box va-desc__text" id="va-desc-text">${escapeHtml(r.description)}</div>
      ${deps.copyBtn(r.description, 'להעתיק את התיאור')}
      ${hooks.length ? `<p class="va-desc__label" style="margin-top:16px">הצעות להוק כתוב על המסך (לא חובה):</p>
      <ul class="va-desc__hooks">${hooks.map((h) => `<li><p>${escapeHtml(h)}</p>${deps.copyBtn(h, 'להעתיק')}</li>`).join('')}</ul>` : ''}
    </div>`;
    deps.wireCopyButtons(result);
  }

  /* תיאור קודם לא נמחק בגלל ניסיון חדש שנכשל */
  let last = saved && saved.description ? saved : null;
  if (last) showResult(last);

  goBtn.addEventListener('click', async () => {
    if (busy) return;
    if (!videoType) {
      deps.showToast('קודם לבחור איזה סרטון זה');
      return;
    }
    const cta = hasCta ? ctaInput.value.trim() : '';
    if (hasCta && !cta) {
      deps.showToast('לכתוב מה ההנעה לפעולה, או לבחור "לא"');
      ctaInput.focus();
      return;
    }
    busy = true;
    goBtn.disabled = true;
    goBtn.textContent = 'כותבים...';
    result.innerHTML = '<p class="va-desc__wait">כותבים את התיאור, זה לוקח כמה שניות...</p>';
    try {
      let ctx = { domain: '', audience: '' };
      try { ctx = { ...ctx, ...(await deps.getContext()) }; } catch (err) { console.error('description context failed:', err); }
      const s = deps.state;
      const payload = {
        script: String(deps.script || '').slice(0, 8000),
        idea: String(s.ideaBeforePackaging || s.ideaDescription || '').slice(0, 2000),
        hook: String(s.hook || '').slice(0, 1000),
        videoType,
        cta: cta.slice(0, 300),
        domain: String(ctx.domain || '').slice(0, 300),
        audience: String(ctx.audience || '').slice(0, 600),
      };
      const r = await (deps.call || writeVideoDescription)(payload);
      if (!r || !r.description) throw new Error('empty description');
      const out = { description: r.description, textHooks: (r.textHooks || []).slice(0, 3), videoType, cta, createdAt: Date.now() };
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
      goBtn.disabled = false;
      goBtn.textContent = last ? 'לכתוב תיאור חדש' : 'לכתוב תיאור';
    }
  });
  return overlay;
}
