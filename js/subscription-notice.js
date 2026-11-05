/* 31/10/2026 (מאיה: "לפתוח לשבוע בלבד... לכתוב להן על המסך אם תרצו לחדש מנוי
   ב-79 שקלים חודשי מתחדש ולשים לינק ישיר לוואטסאפ שלי עם הודעה מובנית").
   חל רק על מי שסומנה renewOffer ב-allowlist. השעון של מנוי חודש בודד נשאר כמו שהיה. */
const RENEW_MESSAGE = 'היי מאיה, אשמח לחדש את המנוי לאפליקציית הרפרנסים ב-79 ש"ח לחודש';
export const RENEW_WHATSAPP_URL = `https://wa.me/972554353889?text=${encodeURIComponent(RENEW_MESSAGE)}`;

const RENEW_OFFER = 'אם תרצו לחדש: מנוי ב-79 ש"ח לחודש, מתחדש.';
const renewLink = () => `<a href="${RENEW_WHATSAPP_URL}" target="_blank" rel="noopener">לחידוש בוואטסאפ</a>`;

/* שעון ספירה לאחור למנוי שנגמר ולא מתחדש (22/10/2026).
   מופיע רק למי שסומנה showCountdown, כלומר מנוי לחודש בודד.
   ללקוחה עם הוראת קבע זה היה רעש מלחיץ ולא מידע. */
export function showSubscriptionCountdown(access, now = Date.now()) {
  if (!access || !access.showCountdown || !access.paidUntil) return;
  if (document.querySelector('.sub-countdown')) return;

  const MS_DAY = 24 * 60 * 60 * 1000;
  /* גישה שנגמרת בתאריך נספרת בימי לוח בישראל: ב-7.11 בצהריים נשאר "היום", לא "מחר". */
  const israelDay = (t) => Date.parse(new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }));
  const days = access.renewOffer
    ? Math.round((israelDay(access.paidUntil.getTime()) - israelDay(now)) / MS_DAY)
    : Math.ceil((access.paidUntil.getTime() - now) / MS_DAY);
  if (days < 0) return;

  const date = access.paidUntil.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', timeZone: 'Asia/Jerusalem' });
  const left = days === 0 ? 'היום' : days === 1 ? 'מחר' : `בעוד ${days} ימים`;

  const bar = document.createElement('div');
  bar.className = 'sub-countdown' + (days <= 3 ? ' is-urgent' : '');
  bar.setAttribute('role', 'status');
  bar.innerHTML = access.renewOffer
    ? `<span>הגישה שלך נגמרת ${left} <b>(${date})</b>. ${RENEW_OFFER}</span>${renewLink()}`
    : `<span>המנוי שלך למאגר הרפרנסים נגמר ${left} <b>(${date})</b></span>`;
  document.body.prepend(bar);
  syncTopBarHeight();
}

/* 05/11/2026: הפס הזה (וגם הפס הסגול של תצוגה כלקוחה) דביק למעלה ב-z 9999,
   והכותרת הדביקה של האפליקציה נדחפה מתחתיו, יחד עם כפתורי התפריט שלה.
   הגובה האמיתי של הפסים נכתב ל---top-bar-h, והכותרת יושבת מתחתיו. */
const TOP_BARS = '.sub-countdown, .preview-bar';
let topBarObserver = null;
export function syncTopBarHeight() {
  const root = document.documentElement;
  if (!root || !root.style || typeof root.style.setProperty !== 'function') return;
  const measure = () => {
    let h = 0;
    document.querySelectorAll(TOP_BARS).forEach((b) => { h += b.offsetHeight || 0; });
    root.style.setProperty('--top-bar-h', `${h}px`);
  };
  measure();
  if (typeof ResizeObserver === 'function') {
    if (!topBarObserver) topBarObserver = new ResizeObserver(measure);
    document.querySelectorAll(TOP_BARS).forEach((b) => topBarObserver.observe(b));
  }
}

/** ההודעה במסך ההתחברות אחרי שהתאריך עבר. */
export function showExpiredNotice(errorEl, access) {
  if (access && access.renewOffer) {
    errorEl.innerHTML = `הגישה הסתיימה. ${RENEW_OFFER} ${renewLink()}`;
  } else {
    errorEl.textContent = 'המנוי הסתיים. אנא פני למאיה כדי לחדש';
  }
  errorEl.hidden = false;
}
