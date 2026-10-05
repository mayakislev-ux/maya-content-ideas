// 05/10/2026 (מאיה: "בגרסת מובייל משהו נדפק במסך, הכל סופר ענק ואין
// פופאפים ולא נוח. אנחנו עובדות המון מהמובייל ונוחות מקסימלית חייבת").
//
// הסיבה הייתה תגיות הזווית שנוספו לכרטיס: טקסט ארוך כמו "בעיה או תסכול
// ספציפיים של הקהל" בתוך כפתור שלא שובר שורה. הכפתור קבע רוחב מינימלי
// לכרטיס, הכרטיס לעמודה, ועמודת 1fr אינה יכולה להצטמצם מתחת לתוכן שלה -
// אז הרשת גלשה מרוחב המסך והדף נפרס רחב.
//
// הבדיקות כאן שומרות בדיוק על שלושת התנאים שמונעים את זה.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');

function ruleBody(selector) {
  const i = CSS.indexOf(selector);
  if (i === -1) return null;
  const open = CSS.indexOf('{', i);
  const close = CSS.indexOf('}', open);
  return CSS.slice(open + 1, close);
}

test('עמודות הרשת יכולות להצטמצם, אחרת כרטיס רחב מרחיב את כל הדף', () => {
  const bad = [...CSS.matchAll(/\.inspiration-grid[^{]*\{[^}]*grid-template-columns:\s*repeat\((\d+),\s*1fr\)/g)];
  assert.deepEqual(
    bad.map((m) => m[0].slice(-30)),
    [],
    'יש עדיין repeat(n, 1fr) ברשת המאגר. צריך minmax(0, 1fr)'
  );
  assert.ok(/\.inspiration-grid\s*\{[^}]*repeat\(4,\s*minmax\(0, 1fr\)\)/.test(CSS), 'שולחן עבודה');
  assert.ok(/repeat\(3,\s*minmax\(0, 1fr\)\)/.test(CSS), 'טאבלט');
  assert.ok(/repeat\(2,\s*minmax\(0, 1fr\)\)/.test(CSS), 'טלפון');
});

test('תוכן הכרטיס רשאי להצטמצם', () => {
  const body = ruleBody('.inspiration-card-info {');
  assert.ok(body, 'לא נמצא .inspiration-card-info');
  assert.ok(/min-width:\s*0/.test(body), 'חסר min-width: 0 ב-.inspiration-card-info');
});

test('תגיות הזווית שוברות שורה ולא דוחפות רוחב', () => {
  const i = CSS.indexOf('.inspiration-card-angle,');
  assert.ok(i > -1, 'חסר הכלל שמאפשר שבירת שורה בתגיות');
  const block = CSS.slice(i, CSS.indexOf('}', i));
  assert.ok(/white-space:\s*normal/.test(block), 'התגית עדיין לא שוברת שורה');
  assert.ok(/overflow-wrap:\s*anywhere/.test(block), 'חסר overflow-wrap');
  assert.ok(/max-width:\s*100%/.test(block), 'חסר max-width');
});

test('בטלפון הפופאפ תופס את כל המסך, כדי שהכפתורים לא ייצאו מהתצוגה', () => {
  const i = CSS.lastIndexOf('.ip-box {');
  const block = CSS.slice(i, CSS.indexOf('}', i));
  assert.ok(/max-width:\s*100%\s*!important/.test(block), 'הרוחב שנקבע ב-JS עדיין גובר בטלפון');
  assert.ok(/height:\s*100%/.test(block), 'הפופאפ לא תופס את גובה המסך בטלפון');
});

test('הבדיקה באמת קוראת את הקובץ הנכון', () => {
  assert.ok(CSS.length > 50000, 'גיליון הסגנונות קצר מדי, כנראה נקרא קובץ אחר');
  assert.ok(CSS.includes('.inspiration-card'), 'לא נמצאו כללי המאגר');
});

// 05/10/2026 (מאיה: "במובייל שום דבר לא התעדכן, לא יודעת"): השרת היה
// תקין והקוד היה באוויר. מה שנכשל היה הדרך פנימה - המנגנון רק הציע
// לעדכן בחלון קופץ, ובאפליקציה מותקנת בטלפון אין כפתור רענון.
import { readFileSync as read2 } from 'node:fs';
const UPDATE = read2(new URL('../js/update-check.js', import.meta.url), 'utf8');
const HTML = read2(new URL('../index.html', import.meta.url), 'utf8');

test('גרסה חדשה מתעדכנת לבד, ולא רק מציעה', () => {
  assert.ok(/safeToReload\(\)\s*&&\s*!autoUpdatedRecently\(\)/.test(UPDATE), 'אין עדכון אוטומטי');
  assert.ok(UPDATE.includes('updateNow(null)'), 'העדכון האוטומטי לא קורא ל-updateNow');
});

test('לא מעדכנים מתחת לידיים של מי שכותבת', () => {
  const i = UPDATE.indexOf('function safeToReload');
  const block = UPDATE.slice(i, i + 700);
  assert.ok(/TEXTAREA/.test(block), 'לא נבדק שדה פעיל');
  assert.ok(/field\.value/.test(block), 'לא נבדק טקסט שלא נשמר');
});

test('יש הגנה מלולאת רענון', () => {
  assert.ok(/AUTO_COOLDOWN_MS/.test(UPDATE), 'אין זמן צינון');
  assert.ok(/sessionStorage/.test(UPDATE), 'אין סימון בזיכרון הלשונית');
});

test('חותמת הגרסה קיימת גם ב-HTML וגם בקוד', () => {
  assert.ok(HTML.includes('id="app-version"'), 'אין מקום לחותמת ב-HTML');
  assert.ok(UPDATE.includes('export function showAppVersion'), 'אין פונקציה שמציגה אותה');
});

// 05/10/2026 (מאיה: "הפופאפ של העדכון גרסה מאוד קטן ונבלע וקל לפספס ולא
// כמו בפורטל, תשני אצל כולן"). קודם הוא נשען על .modal הכללי, שמצמיד
// לראש המסך בקופסה צרה, ועל שני כפתורים קטנים זה לצד זה.
const CSS2 = read2(new URL('../css/style.css', import.meta.url), 'utf8');

test('חלון העדכון ממורכז ומעל הכל, לא נצמד לראש', () => {
  const i = CSS2.indexOf('.up2-backdrop {');
  assert.ok(i > -1, 'אין מחלקה ייעודית לחלון העדכון');
  const block = CSS2.slice(i, CSS2.indexOf('}', i));
  assert.ok(/align-items:\s*center/.test(block), 'החלון לא ממורכז אנכית');
  assert.ok(/z-index:\s*10000/.test(block), 'z-index נמוך מדי, אלמנטים אחרים יכסו אותו');
  assert.ok(/position:\s*fixed/.test(block));
});

test('הכפתור תופס את כל הרוחב ובגובה אצבע', () => {
  const i = CSS2.indexOf('.up2-btn {');
  const block = CSS2.slice(i, CSS2.indexOf('}', i));
  assert.ok(/width:\s*100%/.test(block), 'הכפתור לא מלא');
  assert.ok(/min-height:\s*5\dpx/.test(block), 'הכפתור נמוך מ-50 פיקסל');
});

test('החלון לא נשען יותר על המחלקות הכלליות', () => {
  assert.ok(!UPDATE.includes("'modal confirm-dialog-modal'"), 'עדיין משתמש ב-.modal הכללי');
  assert.ok(UPDATE.includes("'up2-backdrop'"), 'לא עבר למחלקה הייעודית');
});

test('הכרטיס לא גולש ממסך נמוך', () => {
  const i = CSS2.indexOf('.up2-card {');
  const block = CSS2.slice(i, CSS2.indexOf('}', i));
  assert.ok(/max-height/.test(block), 'אין הגבלת גובה, בטלפון נמוך הכפתור ייצא מהמסך');
  assert.ok(/overflow-y:\s*auto/.test(block), 'אין גלילה בתוך הכרטיס');
  assert.ok(/min\(380px,\s*100%\)/.test(block), 'הרוחב לא מוגבל נכון');
});

// 05/10/2026, מתוך ביקורת 10 הממדים (85 סוכנים). שלושת הממצאים החוסמים
// ומה שנוגע ישירות למה שמאיה תיארה: "הפופאפ לא עובד", "כל המסך נראה מוזר".
const APPJS = read2(new URL('../js/app.js', import.meta.url), 'utf8');
const POPJS = read2(new URL('../js/inspiration-popup.js', import.meta.url), 'utf8');
const VIEWJS = read2(new URL('../js/inspiration-view.js', import.meta.url), 'utf8');

test('חוסם: שכבת הסרטון נעלמת באמת, ולא נשארת פרושה על המסך', () => {
  // display:flex גובר על התכונה hidden. בלי הכלל הזה שכבה שקופה נשארה
  // על כל המסך אחרי סגירת סרטון ובלעה כל נגיעה, עד רענון
  assert.ok(/\.ip\[hidden\]\s*\{[^}]*display:\s*none/.test(CSS2), 'חסר .ip[hidden]');
  assert.ok(POPJS.includes('host.remove()'), 'ה-JS לא מסיר את השכבה מה-DOM');
  assert.ok(POPJS.includes('host = null'), 'ההפניה לא מתאפסת');
});

test('חוסם: מסכים שהיו מתחת לסרגל התחתון קיבלו מרווח', () => {
  for (const sel of ['.feedback-view', '.inspiration-view', '.client-usage-view']) {
    const i = CSS2.lastIndexOf(sel + ' {');
    assert.ok(i > -1, `אין כלל מובייל ל-${sel}`);
    const block = CSS2.slice(i, CSS2.indexOf('}', i));
    assert.ok(/bottom-nav-h/.test(block), `${sel} עדיין בלי מרווח מהסרגל`);
  }
});

test('חוסם: כפתור הסגירה של הסרטון לא יושב מתחת למגרעת', () => {
  const i = CSS2.lastIndexOf('.ip-bar {');
  const block = CSS2.slice(i, CSS2.indexOf('}', i));
  assert.ok(/safe-area-inset-top/.test(block), 'אין מרווח בטוח מלמעלה');
});

test('כפתור שמוסתר ב-JS באמת נעלם', () => {
  // display:inline-flex גבר על hidden, ולכן "העתקת הטקסט" הופיע בכל כרטיס
  assert.ok(/\.inspiration-card-copy-btn\[hidden\]/.test(CSS2), 'חסר כלל לכפתור ההעתקה');
  assert.ok(/\.inspiration-card-accuracy-warning\[hidden\]/.test(CSS2), 'חסר כלל לאזהרה');
});

test('נגיעה בטקסט שנפתח לא זורקת לאינסטגרם', () => {
  const i = VIEWJS.indexOf("closest('button, .inspiration-card-translation')");
  assert.ok(i > -1);
  assert.ok(VIEWJS.slice(i, i + 90).includes('preventDefault'), 'הנגיעה עדיין נופלת לקישור');
});

test('האזהרה על דיוק התרגום נפתחת עם הטקסט ולא לפניו', () => {
  assert.ok(VIEWJS.includes('accuracyWarning.hidden = true'), 'האזהרה עדיין קבועה על הכרטיס');
  assert.ok(VIEWJS.includes('accuracyWarning.hidden = textBox.hidden'), 'היא לא נפתחת יחד עם הטקסט');
});

test('שורת הזוויות שומרת מיקום ומביאה את הפעילה לתצוגה', () => {
  assert.ok(VIEWJS.includes('const prevLeft = row.scrollLeft'), 'מיקום הגלילה לא נשמר');
  assert.ok(VIEWJS.includes('scrollIntoView'), 'הזווית הפעילה לא מובאת לתצוגה');
});

test('חלון פתוח נועל את גלילת הדף', () => {
  assert.ok(APPJS.includes('function lockScroll'), 'אין נעילת גלילה');
  assert.ok(/scrollLocks\s*\+=\s*1/.test(APPJS), 'הנעילה אינה מונה, שני חלונות ישברו אותה');
  assert.ok(APPJS.includes('window.scrollTo(0, lockedAt)'), 'מיקום הגלילה לא משוחזר');
  const i = APPJS.indexOf('observer.observe(modal');
  assert.ok(APPJS.slice(Math.max(0, i - 400), i).includes('lockScroll()'), 'החלונות לא נועלים');
});

test('שדות קלט לא גורמים לאייפון להגדיל את הדף', () => {
  assert.ok(/font-size:\s*max\(16px/.test(CSS2), 'אין רצפת 16 פיקסל לשדות במובייל');
});

test('מטרות נגיעה סבירות', () => {
  const i = CSS2.lastIndexOf('.btn-text {');
  const block = CSS2.slice(i, CSS2.indexOf('}', i));
  assert.ok(/min-height:\s*44px/.test(block), 'כפתור משני עדיין קטן מדי לאצבע');
});
