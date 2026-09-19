// עדכון גרסה אוטומטי (18/09/2026).
// הבעיה: ההודעה "גרסה חדשה מוכנה" הייתה תלויה בשינוי של sw.js, שכמעט אף
// פעם לא משתנה - אז לקוחות עם האפליקציה פתוחה בטלפון נשארו על גרסה ישנה.
// הפתרון: GitHub Pages מחתים כל קובץ באתר בזמן הפרסום האחרון (Last-Modified
// זהה לכל הקבצים). שומרים את החותמת שהייתה כשהדף נטען, ובודקים שוב כשחוזרים
// לאפליקציה ופעם בכמה דקות. חותמת אחרת = גרסה חדשה עלתה.
// החלון חוזר עד שמעדכנים: אפשר לדחות פעמיים, בפעם השלישית אין "אחר כך".

const STAMP_URL = './manifest.json';
const CHECK_EVERY_MS = 5 * 60 * 1000;
const SNOOZE_MS = 10 * 60 * 1000;
// 19/09/2026 (מאיה: "שיקפוץ תמיד עד שמעדכנים"): בלי "אחר כך" בכלל
const MAX_SNOOZES = 0;

let loadedStamp = null;
let snoozedUntil = 0;
let snoozes = 0;
let dialogOpen = false;

async function deployStamp() {
  // HEAD עם cache:no-store עוקף גם את ה-service worker (הוא מטפל רק ב-GET) וגם את מטמון הדפדפן
  const res = await fetch(`${STAMP_URL}?check=${Date.now()}`, { method: 'HEAD', cache: 'no-store' });
  if (!res.ok) return null;
  return res.headers.get('last-modified') || res.headers.get('etag');
}

async function updateNow(button) {
  if (button) {
    button.disabled = true;
    button.textContent = 'מעדכנים...';
  }
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch (err) {
    console.warn('update cleanup failed (reloading anyway):', err);
  }
  const url = new URL(window.location.href);
  url.searchParams.set('v', String(Date.now()));
  window.location.replace(url.toString());
}

function buildDialog() {
  const wrap = document.createElement('div');
  wrap.id = 'update-dialog';
  wrap.className = 'modal confirm-dialog-modal';
  wrap.setAttribute('role', 'alertdialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-labelledby', 'update-dialog-title');
  wrap.innerHTML = `
    <div class="modal-content confirm-dialog-content">
      <p style="font-size:2rem;margin:0 0 .3rem" aria-hidden="true">✨</p>
      <h2 id="update-dialog-title" style="margin:0 0 .5rem;font-size:1.2rem">יש גרסה חדשה של האפליקציה</h2>
      <p class="confirm-dialog-message" id="update-dialog-text">כדי שהכול יעבוד כמו שצריך (כולל בדיקת הרעיונות), צריך לעדכן. זה לוקח שנייה, ושום דבר לא נמחק.</p>
      <div class="confirm-dialog-actions">
        <button type="button" class="btn-text" id="update-dialog-later">עוד 10 דקות</button>
        <button type="button" class="btn-primary" id="update-dialog-now">לעדכן עכשיו</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  wrap.querySelector('#update-dialog-now').addEventListener('click', (e) => updateNow(e.currentTarget));
  wrap.querySelector('#update-dialog-later').addEventListener('click', () => {
    snoozes += 1;
    snoozedUntil = Date.now() + SNOOZE_MS;
    wrap.hidden = true;
    dialogOpen = false;
  });
  return wrap;
}

function showUpdateDialog() {
  if (dialogOpen || Date.now() < snoozedUntil) return;
  // 19/09/2026 (פיילוט): לא באמצע כתיבה של רעיון או צ'אט - יופיע בבדיקה הבאה
  const el = document.activeElement;
  if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable)) return;
  const dialog = document.getElementById('update-dialog') || buildDialog();
  const later = dialog.querySelector('#update-dialog-later');
  const mustUpdate = snoozes >= MAX_SNOOZES;
  later.hidden = mustUpdate;
  dialog.querySelector('#update-dialog-text').textContent = mustUpdate
    ? 'הגרסה שפתוחה אצלך כבר לא מעודכנת, וחלק מהדברים עלולים לא לעבוד. לחיצה אחת ומעדכנים.'
    : 'כדי שהכול יעבוד כמו שצריך (כולל בדיקת הרעיונות), צריך לעדכן. זה לוקח שנייה, ושום דבר לא נמחק.';
  dialog.hidden = false;
  dialogOpen = true;
  dialog.querySelector('#update-dialog-now').focus();
}

// הגרסה של הדף שפתוח עכשיו: document.lastModified מגיע מאותה חותמת של הפרסום.
// דף שנטען מזיכרון (טאב שפתוח ימים, או מהמטמון) נושא את החותמת הישנה שלו,
// אז גם הוא יזוהה כישן כבר בבדיקה הראשונה. אם הדפדפן לא מסר חותמת (אז הוא
// מחזיר את השעה הנוכחית), לוקחים את מה שהשרת אומר בבדיקה הראשונה.
function pageStamp() {
  const t = Date.parse(document.lastModified);
  return Number.isFinite(t) && Math.abs(Date.now() - t) > 60000 ? t : null;
}

async function check() {
  if (!navigator.onLine) return;
  try {
    const stamp = await deployStamp();
    const server = Date.parse(stamp);
    if (!stamp || !Number.isFinite(server)) return;
    if (loadedStamp === null) loadedStamp = pageStamp() ?? server;
    // שנייה של מרווח: GitHub Pages מחתים את כל הקבצים באותה שנייה
    if (server > loadedStamp + 1000) showUpdateDialog();
  } catch (err) {
    // רשת לא יציבה - ננסה בבדיקה הבאה
  }
}

export function startUpdateCheck() {
  check();
  setInterval(check, CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  window.addEventListener('focus', check);
  window.addEventListener('online', check);
}
