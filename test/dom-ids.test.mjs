import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/**
 * כל מזהה שהקוד פונה אליו בלי בדיקה חייב להתקיים ב-index.html.
 *
 * 01/10/2026: אחרי שמסך התסריטים הוסר, האפליקציה נתקעה על מסך הפתיחה ולא
 * נפתחה בכלל. הסיבה: הכפתור focus-mode-btn ישב בתוך המסך שהוסר, ו-app.js
 * פנה אליו ישירות ברמה העליונה בלי בדיקה. getElementById החזיר null, השורה
 * נפלה, כל הקובץ מת, ו-onAuthChange אף פעם לא נרשם. מסך הפתיחה מוסתר בשורה
 * הראשונה שלו, ולכן הוא נשאר על המסך לנצח בלי שום הודעת שגיאה.
 *
 * 03/10/2026 (בדיקה): הבדיקה כיסתה רק פנייה ישירה,
 * getElementById('x').something, ולכן הדפוס שבו הקוד שומר את התוצאה
 * במשתנה ואז משתמש בה לא נבדק בכלל, בדיוק הדפוס של חמישה מזהים באפליקציה.
 * עכשיו נבדק **כל** מזהה שהקוד פונה אליו: אם הוא לא ב-index.html וגם לא
 * נוצר בקוד, אין לו על מה לעבוד, גם אם יש בדיקת null.
 */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));

const files = readdirSync(new URL('../js/', import.meta.url)).filter((f) => f.endsWith('.js'));

/* מזהה שהקוד עצמו יוצר לגיטימי ואינו חסר, בשתי הדרכים: innerHTML עם
   id="..." וגם השמה ישירה, element.id = '...'. */
const createdInJs = new Set();
for (const file of files) {
  const src = readFileSync(new URL(`../js/${file}`, import.meta.url), 'utf8');
  for (const m of src.matchAll(/id="([^"${}]+)"/g)) createdInJs.add(m[1]);
  for (const m of src.matchAll(/\.id\s*=\s*'([^']+)'/g)) createdInJs.add(m[1]);
}

test('כל מזהה שהקוד פונה אליו קיים ב-index.html או נוצר בקוד', () => {
  const missing = [];
  for (const file of files) {
    const src = readFileSync(new URL(`../js/${file}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/getElementById\('([^']+)'\)/g)) {
      const id = m[1];
      if (id.includes('$')) continue;           // מזהה מורכב, נבדק בזמן ריצה
      if (!ids.has(id) && !createdInJs.has(id)) missing.push(`${id}  (js/${file})`);
    }
  }
  assert.deepEqual(missing, [], `מזהים שלא קיימים ב-index.html:\n${missing.join('\n')}`);
});

/* חמישה מזהים באפליקציה נכתבים בדפוס שהבדיקה הקודמת לא כיסתה, ולכן
   נבדקים כאן במפורש, כדי שהכיסוי לא ייעלם בשקט אם מישהו ישנה את הבדיקה. */

test('המזהים שנשמרים במשתנה לפני השימוש מכוסים גם הם', () => {
  for (const id of ['offline-banner', 'policy-modal', 'view-tabs', 'menu-overlay', 'scroll-top-btn']) {
    assert.ok(ids.has(id) || createdInJs.has(id), id);
  }
});

test('מסך התסריטים הוסר לגמרי, בלי שאריות', () => {
  assert.ok(!ids.has('script-view'), 'אין יותר מסך תסריטים');
  assert.ok(!ids.has('hub-link-script'), 'אין יותר כפתור בלובי');
  assert.ok(!ids.has('focus-mode-btn'), 'מצב מיקוד היה שייך למסך הזה');
  for (const file of files) {
    const src = readFileSync(new URL(`../js/${file}`, import.meta.url), 'utf8');
    assert.ok(!/focus-mode/.test(src), `focus-mode עדיין מופיע ב-js/${file}`);

  }
});

test('כל ייבוא מצביע על קובץ שקיים', () => {
  const broken = [];
  for (const file of files) {
    const src = readFileSync(new URL(`../js/${file}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*'(\.\.?\/[^']+)'/g)) {
      try {
        readFileSync(new URL(m[1], new URL(`../js/${file}`, import.meta.url)));
      } catch {
        broken.push(`${m[1]}  (js/${file})`);
      }
    }
  }
  assert.deepEqual(broken, [], `ייבוא שבור מפיל את כל האפליקציה:\n${broken.join('\n')}`);
});
