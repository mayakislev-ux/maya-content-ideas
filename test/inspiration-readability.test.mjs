// 05/10/2026 (מאיה: "לא כולן מבינות שפות אחרות, וגם לא כל הסרטונים הם
// דיבור, אז לפעמים זה בעיה").
//
// מדידה על 453 הסרטונים: 209 רוסית, 129 אנגלית, 59 עברית בלבד. 65 זרים
// בלי תרגום כלל, ו-119 כמעט בלי טקסט מדובר.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readabilityOf, languageName, passesReadability, READABILITY } from '../js/inspiration-readability.js';

const long = (c) => c.repeat(300);

test('עברית מדוברת מזוהה כעברית', () => {
  assert.equal(readabilityOf({ sourceLanguage: 'he', transcriptHe: long('א') }).id, 'hebrew');
});

test('זר עם תרגום הוא מתורגם, זר בלי תרגום הוא חסום', () => {
  assert.equal(readabilityOf({ sourceLanguage: 'ru', translationHe: long('ב') }).id, 'translated');
  assert.equal(readabilityOf({ sourceLanguage: 'ru', transcript: long('щ') }).id, 'untranslated');
});

test('סרטון כמעט בלי דיבור הוא ויזואלי, לא חסום', () => {
  // זאת הנקודה: סרטון בלי דיבור דווקא נגיש לכולן, בלי קשר לשפת המקור
  assert.equal(readabilityOf({ sourceLanguage: 'ru', transcript: '' }).id, 'visual');
  assert.equal(readabilityOf({ sourceLanguage: 'en', transcript: 'hi there' }).id, 'visual');
  assert.equal(readabilityOf({}).id, 'visual');
  assert.equal(readabilityOf(null).id, 'visual');
});

test('"מה שאני יכולה להבין" מוציא רק את מה שבאמת חסום', () => {
  const he = { sourceLanguage: 'he', transcriptHe: long('א') };
  const tr = { sourceLanguage: 'ru', translationHe: long('ב') };
  const vis = { sourceLanguage: 'ru', transcript: '' };
  const blocked = { sourceLanguage: 'ru', transcript: long('щ') };
  for (const v of [he, tr, vis]) assert.ok(passesReadability(v, 'understandable'), 'היה אמור לעבור');
  assert.ok(!passesReadability(blocked, 'understandable'), 'סרטון בלי תרגום לא היה אמור לעבור');
});

test('מסנן ריק מעביר הכל, כולל מה שחסום', () => {
  assert.ok(passesReadability({ sourceLanguage: 'ru', transcript: long('щ') }, ''));
});

test('מסנן ספציפי מחזיר רק את הקבוצה שלו', () => {
  const tr = { sourceLanguage: 'ru', translationHe: long('ב') };
  assert.ok(passesReadability(tr, 'translated'));
  assert.ok(!passesReadability(tr, 'hebrew'));
  assert.ok(!passesReadability(tr, 'visual'));
});

test('שם השפה בעברית, וגם כשלא ידוע לא נשבר', () => {
  assert.equal(languageName({ sourceLanguage: 'ru' }), 'רוסית');
  assert.equal(languageName({ sourceLanguage: 'en' }), 'אנגלית');
  assert.equal(languageName({}), null);
  assert.equal(languageName({ sourceLanguage: 'zz' }), 'zz');
});

test('לכל מצב יש תווית ותגית, אחרת הכרטיס מציג ריק', () => {
  for (const r of Object.values(READABILITY)) {
    assert.ok(r.label && r.label.length > 2, `חסרה תווית ל-${r.id}`);
    assert.ok(r.chip && r.chip.length > 1, `חסרה תגית ל-${r.id}`);
  }
});
