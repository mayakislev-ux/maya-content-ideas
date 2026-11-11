/* 05/11/2026 (מאיה): מד האורך ודף הצילום, בלי דפדפן. הקצב (2.3 מילים
   לשנייה) מוגדר במקום אחד, הטקסט שעל המסך לא נספר כדיבור, והשוטים נבנים
   מהפורמט ומהשורות של התסריט. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  HEBREW_WORDS_PER_SEC, estimateSeconds, lengthInfo, secondsLabel, spokenPart, duplicationRef, lengthMeterHtml,
} from '../js/va-length.js';

const words = (n) => Array.from({ length: n }, () => 'מילה').join(' ');

test('קצב הדיבור מוגדר פעם אחת, רק ב-va-length.js', () => {
  assert.equal(HEBREW_WORDS_PER_SEC, 2.3);
  assert.equal(estimateSeconds(23), 10);
  const others = readdirSync(new URL('../js/', import.meta.url))
    .filter((f) => f.endsWith('.js') && f !== 'va-length.js')
    .filter((f) => /\b2\.3\b/.test(readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8')));
  assert.deepEqual(others, [], 'הקבוע הועתק לקובץ אחר');
});

test('אדום רק מעל 20% מהמקור, והטקסט שעל המסך לא נספר', () => {
  assert.equal(lengthInfo(words(60), words(50)).tooLong, false);
  assert.equal(lengthInfo(words(61), words(50)).tooLong, true);
  assert.equal(lengthInfo(words(61), '').tooLong, false);
  assert.equal(spokenPart(`${words(3)}\n\nטקסט על המסך:\n• א ב ג\n\nמה רואים בסרטון:\n1. משהו`), words(3));
  assert.equal(secondsLabel(45), 'כ-45 שניות');
  assert.equal(secondsLabel(60), 'כדקה');
  assert.equal(secondsLabel(75), 'כדקה ו-15 שניות');
  assert.equal(lengthMeterHtml(''), '');
  assert.equal(duplicationRef({ branch: 'scratch', transcript: 'x' }), '');
  assert.equal(duplicationRef({ branch: 'idea-search', transcript: 'x' }), 'x');
});

test('בלי קו ארוך (—) בטקסטים של הכלים החדשים', () => {
  for (const f of ['va-length.js', 'va-description.js', 'va-smart-paste.js', 'va-mic.js', 'va-summary-tools.js']) {
    assert.doesNotMatch(readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8'), /—/, f);
  }
});
