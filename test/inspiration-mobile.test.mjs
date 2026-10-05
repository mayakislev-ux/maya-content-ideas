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
