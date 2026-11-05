/* 05/11/2026 (מאיה): "לכתוב לפרומפט מראש את המשפטים הכי חזקים בתוך התסריט
   ושבדיפולט יכתוב עליהם את ההוקים לפי השיטה שלי, אבל לא רק", ובחיזוק: "לעיתים
   הפרומפט לא מחבר באופן הגיוני שהחיזוק יהיה המשך טבעי של ההוק". */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHookFindingPrompt, buildHookReinforcementPrompt } from '../js/video-assistant-content.js';

test('הוק: קודם המשפטים החזקים מהתסריט, ורק אחר כך התבניות', () => {
  const p = buildHookFindingPrompt({ idea: 'רעיון', script: 'תסריט', audience: 'קהל' });
  const s0 = p.indexOf('שלב 0 – שליפת המשפטים החזקים');
  assert.ok(s0 > -1);
  assert.ok(s0 < p.indexOf('שלב 1 – ניתוח'), 'שלב 0 חייב לבוא לפני הניתוח והתבניות');
  assert.match(p, /חלק א: המשפטים החזקים מהתסריט/);
  assert.match(p, /חלק ב: הוקים מהתבניות/);
});

test('חיזוק הוק: חוק הרצף לפני הפסילות', () => {
  const p = buildHookReinforcementPrompt({ idea: 'רעיון', hook: 'הוק', script: 'תסריט' });
  const r = p.indexOf('חוק הרצף');
  assert.ok(r > -1);
  assert.ok(r < p.indexOf('שלב 7 – פסילות'));
  assert.match(p, /אם אפשר להדביק את אותו חיזוק אחרי הוק אחר → פסול/);
});
