/* 06/11/2026 (מאיה): "בצ'אט של הבדיקת רעיון במובייל כאילו לא רואים את
   המסל ואז צריך לגלול למעלה, לא נוח במסך, והמסל של הצ'אט מאוד קטן".

   שורת הכתיבה הייתה position: fixed עם bottom שמחושב מ-innerHeight פחות
   ה-visualViewport. באייפון, ובמיוחד באפליקציה שמותקנת במסך הבית, innerHeight
   לא תמיד מתנהג כמו שהחישוב הניח, ו-bottom נמדד מתחתית ה-layout viewport,
   שנשארת מאחורי המקלדת. התוצאה: השורה מתחבאת מאחורי המקלדת או מעליה עם
   רווח, וצריך לגלול כדי למצוא אותה.

   כאן השורה מעוגנת מלמעלה, לפי מה שבאמת נראה על המסך: התחתית של ה-
   visualViewport (offsetTop + height), או ראש התפריט התחתון כשהוא נראה.
   זה נכון גם כשהמקלדת פתוחה, גם כשהדף גלל, וגם כש-innerHeight משתנה.
   בנוסף התיבה גדלה עם הטקסט (אוטומטית, עד גבול), כדי שאפשר יהיה לראות
   מה כותבים. */

const MOBILE_QUERY = '(max-width: 720px)';

/** מגדיל את התיבה לגובה הטקסט. min/max-height ב-CSS קובעים את הגבולות. */
export function autoGrow(textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  const h = textarea.scrollHeight;
  /* בלי פריסה אמיתית (מוסתר, או jsdom) אין גובה למדוד: משאירים ל-CSS */
  textarea.style.height = h > 0 ? `${h + 2}px` : '';
}

/**
 * החישוב עצמו, טהור כדי שאפשר לבדוק אותו.
 * vv: { offsetTop, height }, navRect: { top, height } | null.
 * מחזיר את הקו (בפיקסלים מראש החלון) שהשורה יושבת עליו מלמעלה.
 */
export function dockLine(vv, navRect) {
  const visualBottom = (Number(vv.offsetTop) || 0) + (Number(vv.height) || 0);
  if (navRect && navRect.height > 0 && navRect.top < visualBottom) return Math.round(navRect.top);
  return Math.round(visualBottom);
}

function isMobile() {
  try {
    return Boolean(window.matchMedia && window.matchMedia(MOBILE_QUERY).matches);
  } catch {
    return false;
  }
}

/**
 * מחבר את שורת הכתיבה של הצ'אט לתחתית המסך הנראה במובייל.
 * @param {{ form: HTMLElement, textarea: HTMLTextAreaElement, view: HTMLElement }} opts
 * @returns {{ update: () => void }}
 */
export function wireChatComposer({ form, textarea, view }) {
  const root = document.documentElement;
  const nav = document.getElementById('bottom-nav');

  function update() {
    const vv = window.visualViewport;
    if (!vv || !isMobile() || !view || view.hidden) {
      root.classList.remove('chat-docked');
      return;
    }
    let navRect = null;
    if (nav && !nav.hidden) {
      const r = nav.getBoundingClientRect();
      navRect = { top: r.top, height: r.height };
    }
    root.style.setProperty('--chat-dock-line', `${dockLine(vv, navRect)}px`);
    root.style.setProperty('--chat-composer-h', `${form.offsetHeight || 0}px`);
    root.classList.add('chat-docked');
  }

  textarea.addEventListener('input', () => { autoGrow(textarea); update(); });
  textarea.addEventListener('focus', update);
  textarea.addEventListener('blur', () => setTimeout(update, 50));
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', update);
    window.visualViewport.addEventListener('scroll', update);
  }
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  /* הצ'אט נפתח ונסגר דרך hidden על המסך */
  if (view && typeof MutationObserver !== 'undefined') {
    new MutationObserver(update).observe(view, { attributes: true, attributeFilter: ['hidden'] });
  }
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(update).observe(form);
  }
  update();
  return { update };
}
