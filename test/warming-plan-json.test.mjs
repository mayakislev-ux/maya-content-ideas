import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * 11/10/2026. לקוחות: "בנו חימום לסטורי ויש תקלה, זה כמה ימים ככה".
 *
 * הלוג של 08/10 הראה בדיוק מה קרה. המודל ענה באנגלית, בפרוזה:
 *   "I need you to provide: who is the product? who is the target audience?"
 * במקום להחזיר JSON. הניסיון החוזר שלח בדיוק את אותו prompt וקיבל בדיוק
 * את אותה תשובה, ואז כל הבקשה נפלה.
 *
 * שתי ההגנות שנוספו נבדקות כאן, כי שתיהן קלות להסרה בטעות בעריכה עתידית.
 */

const SRC = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');

/** גוף הפונקציה שבונה את תוכנית החימום */
const BLOCK = (() => {
  const at = SRC.indexOf('exports.generateWarmingPlan');
  const next = SRC.indexOf('exports.', at + 30);
  return SRC.slice(at, next === -1 ? SRC.length : next);
})();

test('הבקשה למודל כוללת system שאוסר לשאול שאלות', () => {
  assert.match(BLOCK, /system: PLAN_SYSTEM/, 'אין system בקריאה');
  assert.match(BLOCK, /אל תשאלי שאלות/, 'ה-system לא אוסר שאלות');
  assert.match(BLOCK, /JSON בלבד/, 'ה-system לא דורש JSON בלבד');
});

test('ויש prefill שמכריח את התשובה להיות JSON', () => {
  /* זאת ההגנה החזקה: היא לא מבקשת מהמודל להתנהג יפה, היא לא
     מאפשרת לו אחרת. בלעדיה system לבדו כבר נכשל פעם. */
  assert.match(BLOCK, /role: 'assistant', content: PREFILL/, 'אין prefill');
  assert.match(BLOCK, /const PREFILL = '\{'/, 'ה-prefill אינו סוגר מסולסל');
});

test('והפירוק מחזיר את ה-prefill שלא חוזר בתשובה', () => {
  /* בלי זה כל תשובה תקינה הייתה נכשלת בפירוק, כלומר התיקון היה
     הופך את הבאג לקבוע במקום לפתור אותו. */
  assert.match(BLOCK, /raw\.trimStart\(\)\.startsWith\('\{'\) \? raw : PREFILL \+ raw/);
});

test('ההחזרה עובדת על תשובה עם ובלי הסוגר הפותח', () => {
  const PREFILL = '{';
  const restore = (raw) => (raw.trimStart().startsWith('{') ? raw : PREFILL + raw);
  // מה שהמודל מחזיר אחרי prefill: ההמשך בלבד
  assert.equal(JSON.parse(restore('"week1": []}')).week1.length, 0);
  // ואם בכל זאת החזיר אובייקט שלם, לא מכפילים את הסוגר
  assert.equal(JSON.parse(restore('{"week1": []}')).week1.length, 0);
  assert.equal(JSON.parse(restore('  {"week1": []}')).week1.length, 0);
});

test('הניסיון החוזר נשאר יחיד', () => {
  /* שתי הקריאות רצות ב-Promise.all, ושילוש העלות על תקלה שכבר
     מטופלת במקור שלה אינו נכון. */
  assert.match(BLOCK, /if \(attempt < 2\) return callAndParse/);
});

test('ושגיאת פירוק לא מציפה את הלוג בתשובה שלמה', () => {
  /* 08/10: התשובה כולה נכתבה ללוג ובלעה אותו */
  assert.match(BLOCK, /text\.slice\(0, 500\)/);
});
