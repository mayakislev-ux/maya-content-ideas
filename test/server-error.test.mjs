import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { serverErrorText } from '../js/server-error.js';

/* 12/10/2026. שלושה מסכים הציגו "החיבור נכשל, כנראה בגלל רשת לא יציבה"
   לכל שגיאה שאינה בעברית. אבל כל כישלון שאינו מהשרת שלנו נראה בדיוק כך:
   חיוב מנותק, פונקציה שלא נפרסה, CORS, DNS, או 5xx לפני גוף התשובה.

   ב-11/10 זה קרה לאורך יום שלם: החיוב בפרויקט היה מנותק, והלקוחה קיבלה
   הודעה שהבעיה ברשת שלה. היא ניסתה מחיבור אחר במקום לספר למאיה. */

test('שגיאה בעברית מהשרת עוברת כמו שהיא', () => {
  const t = serverErrorText(new Error('הגעת למכסת השימוש היומית'), 'הבדיקה');
  assert.match(t, /הגעת למכסת השימוש היומית/);
});

test('וכישלון טכני נאמר כתקלה אצלנו, לא אצל הלקוחה', () => {
  const t = serverErrorText(new TypeError('Failed to fetch'), 'בניית התכנית');
  assert.match(t, /השרת לא זמין/);
  assert.ok(!t.includes('רשת לא יציבה'), 'עדיין מאשים את הרשת של הלקוחה');
});

test('רק ניתוק אמיתי נאמר כניתוק', () => {
  assert.match(serverErrorText(new TypeError('Load failed'), 'x', { online: false }), /אין חיבור לאינטרנט/);
  assert.match(serverErrorText(new TypeError('Load failed'), 'x', { online: true }), /השרת לא זמין/);
});

test('והנוסח המטעה לא חזר לאף מסך', () => {
  const bad = [];
  for (const f of readdirSync(new URL('../js/', import.meta.url))) {
    if (!f.endsWith('.js')) continue;
    const src = readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8');
    /* רק מחרוזות שמוצגות ללקוחה. ההערה ב-update-check.js מתארת מצב
       רשת אמיתי של בדיקת גרסה, ולכן היא מותרת ואינה טקסט על המסך. */
    const code = src.split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith('//')).join(String.fromCharCode(10));
    if (/'[^']*רשת לא יציבה[^']*'/.test(code)) bad.push(f);
  }
  assert.deepEqual(bad, [], `הנוסח חזר ב: ${bad.join(', ')}`);
});
