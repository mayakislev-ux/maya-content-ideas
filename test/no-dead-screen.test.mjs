/* 23/10/2026 (מאיה: "פשוט תקוע ככה גם במחשב גם במובייל... זה חמור ביותר
   ושלא יקרה לעולם").

   מסך הפתיחה הוסתר, ואז הקוד חזר בלי להציג שום דבר. התוצאה היא רקע כהה
   עם לוגו, בלי שום דבר ללחוץ עליו, ובלי שרענון יעזור. מבחוץ זה נראה
   בדיוק כמו "האפליקציה לא נפתחת".

   הכלל: כל מסלול שמסתיר את מסך הפתיחה חייב להשאיר מסך אמיתי. הבדיקה
   עוברת על כל return שאחרי ההסתרה ומוודאת שמשהו הוצג לפניו. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(ROOT, 'js', 'app.js'), 'utf8');

/** גוף הפונקציה שמטפלת בשינוי מצב ההתחברות */
function authHandler() {
  const from = src.indexOf('onAuthChange(async (user) => {');
  assert.ok(from > 0, 'לא נמצא המטפל בהתחברות');
  const to = src.indexOf('\n});', from);
  return src.slice(from, to);
}

test('כל יציאה אחרי הסתרת מסך הפתיחה מציגה מסך אמיתי', () => {
  const body = authHandler();
  const hideAt = body.indexOf("getElementById('launch-splash').hidden = true");
  assert.ok(hideAt > 0, 'מסך הפתיחה לא מוסתר כאן בכלל');

  const lines = body.slice(hideAt).split('\n');
  /* מה נחשב "הוצג מסך": מסך התחברות, מסך האפליקציה, מעבר לתצוגה, או
     ניתוק - שמחזיר ממילא למסך ההתחברות. */
  const SHOWS = /login-screen'\)\.hidden = false|app-screen'\)\.hidden = false|showView\(|signOutUser\(/;
  const problems = [];

  lines.forEach((line, i) => {
    if (!/^\s+return;\s*$/.test(line)) return;
    const back = lines.slice(Math.max(0, i - 20), i).join('\n');
    if (!SHOWS.test(back)) {
      problems.push(`שורה ${i + 1}: ${lines.slice(Math.max(0, i - 2), i + 1).join(' | ').trim().slice(0, 100)}`);
    }
  });

  assert.deepEqual(problems, [], 'יש יציאה שמשאירה מסך ריק');
});

test('הכשל הזמני מציג את מסך ההתחברות ואת קוד השגיאה', () => {
  const body = authHandler();
  const i = body.indexOf('if (transient)');
  assert.ok(i > 0, 'לא נמצא הטיפול בכשל זמני');
  const block = body.slice(i, i + 900);
  assert.match(block, /login-screen'\)\.hidden = false/, 'לא מוצג מסך ההתחברות');
  assert.match(block, /login-error/, 'לא מוצגת הודעת שגיאה');
  assert.match(block, /err && err\.code/, 'קוד השגיאה לא מוצג, ואי אפשר לאבחן');
});
