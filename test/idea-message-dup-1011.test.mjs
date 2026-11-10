/* 10/11/2026 (מאיה): בפרומפט האריזה נכנס רק המסר, פעמיים, בלי הרעיון.
   אצל מור אדרי שתי התיבות היו אותו משפט. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ideaWithMessage, sameIdeaAndMessage } from '../js/video-assistant-flow.js';

const M = 'שורה תחתונה שהקהל יבין שאפשר לייצר הכנסה נוספת וגדולה יותר מקורס הלחמת ריסים';
test('אותו משפט בשתי התיבות: נכנס פעם אחת', () => {
  assert.equal(ideaWithMessage(M, M), M);
  assert.equal(sameIdeaAndMessage(M, `${M}.`), true);
});
test('רעיון ומסר שונים: שניהם נכנסים, כל אחד עם הכותרת שלו', () => {
  assert.equal(ideaWithMessage('איך הגעתי מ-0 ל-30 לקוחות', 'אפשר להרוויח מריסים יותר ממשכורת'), 'הרעיון: איך הגעתי מ-0 ל-30 לקוחות. המסר: אפשר להרוויח מריסים יותר ממשכורת');
  assert.equal(sameIdeaAndMessage('א', 'ב'), false);
});
test('המסך חוסם המשך כשבשתי התיבות אותו משפט', () => {
  const src = readFileSync(new URL('../js/video-assistant.js', import.meta.url), 'utf8');
  assert.match(src, /sameIdeaAndMessage\(box\.value, punchBox\.value\)/);
  assert.match(src, /withAngle\(ideaWithMessage\(state\.ideaTopic, state\.ideaPunchline\), state\.ideaAngle\)/);
});
