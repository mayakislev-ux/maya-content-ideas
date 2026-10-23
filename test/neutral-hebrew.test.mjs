/* 23/10/2026 (מאיה: "מעצבן שכל החלק של העוזר ליצירת סרטון לא כותב הכל
   בגוף זכר ופשוט כתוב את/אתה - זה סתם מכוער בעין ומאריך, באלי פשוט
   שהכל יהיה כתוב כמה שיותר בגוף ניטרלי").

   לשון ניטרלית בעברית נעשית בשם פועל ובשם פעולה, לא בלוכסנים. הבדיקה
   תופסת לוכסן שחוזר להיכנס, ומתעלמת מלוכסן שמשמעותו "או" בין שתי
   מילים שלמות (הטקסט/תסריט, הקהל/תחום). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(ROOT, 'js', 'video-assistant.js'), 'utf8');

/* סיומות הטיה קצרות הן הסימן לפנייה ממוגדרת. מילה שלמה אחרי הלוכסן
   היא בחירה בין שתי אפשרויות, וזה בסדר גמור. */
const GENDERED = /[א-ת]{2,}\/(?:[יהת]|[א-ת]{1,2}י)(?![א-ת])/g;

test('אין פנייה ממוגדרת בלוכסן בעוזר ליצירת סרטון', () => {
  const lines = src.split('\n');
  const hits = [];
  lines.forEach((line, i) => {
    // הערות קוד מתעדות את ההיסטוריה ומותר שיצטטו את הניסוח הישן
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    const found = line.match(GENDERED);
    if (found) hits.push(`${i + 1}: ${found.join(', ')}`);
  });
  assert.deepEqual(hits, [], 'נמצאו פניות ממוגדרות');
});

test('הניסוחים הניטרליים באמת שם', () => {
  for (const phrase of ['להדביק', 'להעתיק', 'לבחור', 'להקריא בקול']) {
    assert.ok(src.includes(phrase), `חסר הניסוח "${phrase}"`);
  }
});
