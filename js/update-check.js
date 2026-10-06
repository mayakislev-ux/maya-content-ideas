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

// אותה רשימה כמו ב-sw.js: קבצים שכתובתם משתנה כשהתוכן משתנה, ולכן אין שום
// סיכון שגרסה ישנה שלהם תישאר.
function isImmutableAsset(url) {
  return (
    /\/assets\/fonts\//.test(url) ||
    /\/assets\/favicon\.png(?:\?|$)/.test(url) ||
    /\/assets\/inspiration-thumbnails\//.test(url) ||
    /\/assets\/(app|header)-background\.jpg(?:\?|$)/.test(url) ||
    url.includes('gstatic.com/firebasejs/')
  );
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
      // 06/10/2026, מהביקורת: עדכון מחק את כל המטמון, כלומר כל עדכון זרק
      // ~11MB של תמונות thumbnail והן ירדו מחדש על חבילת הגלישה. הקבצים
      // שה-URL שלהם לא משתנה בין גרסאות (פונטים, תמונות המאגר) נשארים -
      // בדיוק אותה רשימה כמו ב-sw.js.
      await Promise.all((await caches.keys()).map(async (key) => {
        const cache = await caches.open(key);
        const reqs = await cache.keys();
        await Promise.all(reqs.map((req) => (isImmutableAsset(req.url) ? null : cache.delete(req))));
      }));
    }
  } catch (err) {
    console.warn('update cleanup failed (reloading anyway):', err);
  }
  const url = new URL(window.location.href);
  url.searchParams.set('v', String(Date.now()));
  window.location.replace(url.toString());
}

// 05/10/2026 (מאיה: "במובייל שום דבר לא התעדכן, לא יודעת"):
//
// השרת היה תקין לגמרי והקוד החדש היה באוויר. מה שלא עבד זה הדרך פנימה:
// המנגנון רק הציע לעדכן בחלון קופץ, ובאפליקציה מותקנת בטלפון אין כפתור
// רענון. חלון שלא נראה לה פירושו גרסה שלא מתעדכנת לעולם.
//
// אותו פתרון שכבר הופעל בפורטל: מתעדכנים לבד, בשקט, ולא מבקשים ממנה
// ללחוץ. החלון נשאר רק למקרה שאי אפשר לעדכן בבטחה.
const AUTO_KEY = 'moach.autoUpdatedAt';
const AUTO_AFTER_MS = 90 * 1000;
let autoTimer = null;
const AUTO_COOLDOWN_MS = 2 * 60 * 1000;

// לא לעדכן מתחת לידיים: באמצע הקלדה, או כשיש טקסט שלא נשמר בשום שדה
function safeToReload() {
  const el = document.activeElement;
  if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable)) return false;
  for (const field of document.querySelectorAll('textarea, input[type="text"]')) {
    if (field.value && field.value.trim().length > 2) return false;
  }
  return true;
}

// שתי רשתות ביטחון מפני לולאת רענון: סימון בזיכרון הלשונית, וזמן צינון.
// בלעדיהן, שעון שרת שמקדים בשנייה היה מרענן אותה בלי סוף
function autoUpdatedRecently() {
  try {
    const at = Number(sessionStorage.getItem(AUTO_KEY) || 0);
    return Number.isFinite(at) && Date.now() - at < AUTO_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markAutoUpdated() {
  try {
    sessionStorage.setItem(AUTO_KEY, String(Date.now()));
  } catch {
    // בלי אחסון עדיין נעדכן, רק בלי הגנת הלולאה
  }
}

function buildDialog() {
  const wrap = document.createElement('div');
  wrap.id = 'update-dialog';
  wrap.className = 'up2-backdrop';
  wrap.setAttribute('role', 'alertdialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-labelledby', 'update-dialog-title');
  // 05/10/2026 (מאיה: "הפופאפ של העדכון גרסה מאוד קטן ונבלע וקל לפספס
  // ולא כמו בפורטל"). המחלקות הכלליות הצמידו אותו לראש המסך בקופסה צרה
  // עם שני כפתורים קטנים זה לצד זה. עכשיו מחלקות משלו, באותו טיפול שכבר
  // אושר בפורטל: רקע מלא, כרטיס ממורכז, וכפתור שתופס את כל הרוחב.
  wrap.innerHTML = `
    <div class="up2-card" role="alertdialog" aria-modal="true" aria-labelledby="update-dialog-title" dir="rtl">
      <div class="up2-icon" aria-hidden="true">✨</div>
      <h2 id="update-dialog-title" class="up2-title">יש גרסה חדשה</h2>
      <p class="up2-text" id="update-dialog-text">כדי שהכול יעבוד כמו שצריך צריך לעדכן. זה לוקח שנייה, ושום דבר לא נמחק.</p>
      <button type="button" class="up2-btn" id="update-dialog-now">לעדכן עכשיו</button>
      <button type="button" class="up2-later" id="update-dialog-later">עוד 10 דקות</button>
    </div>`;
  document.body.appendChild(wrap);
  wrap.querySelector('#update-dialog-now').addEventListener('click', (e) => updateNow(e.currentTarget));
  // 06/10/2026: הייתה כאן לחיצה על הרקע כ"עוד 10 דקות", אבל MAX_SNOOZES=0
  // מסתיר את "אחר כך" תמיד, ולכן הקוד הזה לא יכול היה לרוץ אף פעם. מאיה
  // ביקשה במפורש חלון שאי אפשר להתעלם ממנו, אז הדרך החוצה לא חוזרת - רק
  // הקוד המת יורד, ובמקומו החלון לא מופיע כשיש טקסט שלא נשמר (showUpdateDialog).
  wrap.querySelector('#update-dialog-later').addEventListener('click', () => {
    snoozes += 1;
    snoozedUntil = Date.now() + SNOOZE_MS;
    wrap.hidden = true;
    dialogOpen = false;
    // דחייה מבטלת גם את רשת הביטחון. בלי זה היינו מרעננים אותה 90 שניות
    // אחרי שבחרה במפורש להמשיך לעבוד
    clearTimeout(autoTimer);
  });
  return wrap;
}

function showUpdateDialog() {
  if (dialogOpen || Date.now() < snoozedUntil) return;
  // 06/10/2026 (מאיה: "ביקשתי שהפופאפ יהיה באמצע המסך שלא יהיה אפשר
  // להתעלם, כמו בפורטל"). ב-05/10 הפכתי את העדכון לשקט לגמרי, אחרי
  // שהתלוננה שבמובייל שום דבר לא התעדכן - וזה ביטל בדיוק את החלון שהיא
  // ביקשה שישתפר. שתי הבקשות מתקיימות ככה: החלון מוצג תמיד, ממורכז
  // ובלתי אפשרי לפספס, והעדכון האוטומטי הוא רק רשת ביטחון למי שלא
  // נוגעת בו - כך שאף אחת לא נתקעת על גרסה ישנה, ואף אחת לא מופתעת.
  // 19/09/2026 (פיילוט): לא באמצע כתיבה של רעיון או צ'אט - יופיע בבדיקה הבאה
  //
  // 06/10/2026: כאן הוחלפה הבדיקה ב-safeToReload(), שבודק *כל* שדה טקסט
  // בדף. זאת הייתה טעות חמורה, והיא בוטלה: שלושה שדות נטענים מ-localStorage
  // בלי שאף אחת נגעה בהם בסשן הזה (טיוטת "הוספה מהירה", ושני שדות החימום),
  // ושדות החיפוש לא מתנקים. כלומר לקוחה שהתחילה לכתוב רעיון פעם אחת ולא
  // שלחה אותו - החלון לא היה קופץ אצלה שוב לעולם, וגם רשת הביטחון של
  // 90 השניות לא הייתה נוצרת, כי היא נבנית רק אחרי השורה הזאת. באפליקציה
  // מותקנת אין כפתור רענון, ולכן זאת גרסה ישנה לנצח - בדיוק התקלה שהמודול
  // הזה קיים בשבילה.
  // ההפרדה הנכונה: *כפתור* שמופיע הוא לא מסוכן, היא לוחצת עליו כשמתאים לה.
  // מה שמוחק עבודה הוא הרענון האוטומטי, והוא בודק safeToReload() בעצמו
  // (למטה). אז החלון נחסם רק באמצע הקלדה ממש.
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

  // רשת הביטחון: אם החלון נשאר פתוח 90 שניות בלי שנגעו בו, מתעדכנים לבד.
  // זה מה שמונע את המצב הקודם, שבו גרסה ישנה נשארה לנצח כי החלון לא נראה.
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => {
    if (dialogOpen && safeToReload() && !autoUpdatedRecently()) {
      markAutoUpdated();
      updateNow(null);
    }
  }, AUTO_AFTER_MS);
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

// 05/10/2026: חותמת הגרסה שמוצגת בתחתית המסך. document.lastModified הוא
// זמן הפרסום של הקבצים שהדפדפן באמת מחזיק, ולכן הוא אומר את האמת על מה
// שפתוח במכשיר הזה - לא על מה שקיים בשרת.
export function showAppVersion() {
  const el = document.getElementById('app-version');
  if (!el) return;
  const t = Date.parse(document.lastModified);
  if (!Number.isFinite(t)) return;
  const d = new Date(t);
  const two = (n) => String(n).padStart(2, '0');
  el.textContent = `גרסה ${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`;
  el.hidden = false;
}
