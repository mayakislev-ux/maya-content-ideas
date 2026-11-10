/* 10/11/2026 (מאיה): הצ'אט לא ידע לזהות אם רעיון ממיר. דגש 8 נבנה מסימון
   שלה על 33 רעיונות אמיתיים: ממיר / חשיפה / חלש, ותוכן אישי הוא חשיפה. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { FEEDBACK_RULES, buildSystemPrompt } = require('../functions/system-prompt.js');

test('דגש 8 קיים, עם שלושת הסוגים והכללים של מאיה', () => {
  assert.match(FEEDBACK_RULES, /8\. כמה הרעיון קרוב לכסף/);
  assert.match(FEEDBACK_RULES, /ממיר = /);
  assert.match(FEEDBACK_RULES, /חשיפה = /);
  assert.match(FEEDBACK_RULES, /חלש = רק שני מקרים/);
  assert.match(FEEDBACK_RULES, /תוכן אישי הוא תמיד חשיפה ולא חלש/);
  assert.match(FEEDBACK_RULES, /שמן עץ התה/);
  assert.match(FEEDBACK_RULES, /בספק בין חשיפה לחלש, זה חשיפה/);
});

test('התוצאה הסופית כוללת "כמה קרוב לכסף", ובשלב א\' נאמר רק "חלש"', () => {
  const p = buildSystemPrompt({ name: 'מיכל', pronoun: 'את', business: 'קוסמטיקה', primaryAudience: 'נשים עם אקנה' }, null);
  assert.ok(p.includes('**כמה קרוב לכסף:**'));
  assert.ok(p.includes('כמה הוא קרוב לכסף (דגש 8: רק "חלש" נאמר כבר כאן)'));
  assert.ok(p.indexOf('**התפקיד השיווקי:**') < p.indexOf('**כמה קרוב לכסף:**'));
});
