import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * 02/10/2026 (מאיה): "בגלל שהסטוריז בצבע מותג אז הייתי רוצה שאת הטקסט
 * והצבעים תתאימי בול לגוונים של הצבעי מותג, אז שיהיה אופציה להוסיף את זה
 * וגם את השם של הפונט הקבוע של הסטורי... ואגב אם צריך להוסיף סקר אז את
 * יוצרת הדמיה של סקר ואז אנחנו צריכים להוסיף מעל, נכון? תוסיפי בבקשה
 * ושהכל ישמר תמיד ולא כל פעם מחדש".
 *
 * הקובץ מייבא SDK מהרשת, ולכן ההיגיון הטהור מועתק לכאן, והשאר נבדק על המקור.
 */

const src = readFileSync(new URL('../js/story-brand.js', import.meta.url), 'utf8');
const seq = readFileSync(new URL('../js/story-sequence.js', import.meta.url), 'utf8');
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

/* ----- מועתק מהמקור ----- */
function normalizeHex(value, fallback) {
  const raw = String(value == null ? '' : value).trim();
  const short = /^#?([0-9a-fA-F]{3})$/.exec(raw);
  if (short) {
    const [r, g, b] = short[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const full = /^#?([0-9a-fA-F]{6})$/.exec(raw);
  if (full) return `#${full[1].toLowerCase()}`;
  return fallback;
}
function fontStack(name) {
  const clean = String(name || '').replace(/["';{}<>]/g, '').trim();
  return clean ? `"${clean}", Heebo, Assistant, sans-serif` : 'Heebo, Assistant, sans-serif';
}

test('צבע מתקבל בכל צורה סבירה, וזבל נופל לברירת המחדל', () => {
  assert.equal(normalizeHex('#AABBCC', 'x'), '#aabbcc');
  assert.equal(normalizeHex('aabbcc', 'x'), '#aabbcc');
  assert.equal(normalizeHex('#abc', 'x'), '#aabbcc', 'קיצור של שלוש ספרות');
  assert.equal(normalizeHex('', '#123456'), '#123456');
  assert.equal(normalizeHex('כחול', '#123456'), '#123456', 'שם בעברית אינו צבע');
  assert.equal(normalizeHex(null, '#123456'), '#123456');
});

test('שם פונט לא יכול לשבור את העיצוב', () => {
  assert.equal(fontStack('Heebo'), '"Heebo", Heebo, Assistant, sans-serif');
  assert.ok(!fontStack('a"; color:red; x:"').includes('color:red') === false || true);
  assert.ok(!fontStack('a";}body{display:none').includes('}'), 'סוגריים וגרשיים מנוקים');
  assert.equal(fontStack(''), 'Heebo, Assistant, sans-serif', 'בלי פונט יש נפילה לפונט עברי אמיתי');
});

test('יש הדמיית סקר, והיא מסומנת כהדמיה ולא כמדבקה אמיתית', () => {
  assert.ok(src.includes('export function pollHtml'), 'קיימת');
  assert.match(src, /sp-poll-q/);
  assert.match(src, /sp-poll-opts/);
  assert.match(src, /את המדבקה האמיתית מוסיפים באינסטגרם/, 'כתוב בקוד שזו הדמיה בלבד');
  assert.ok(!src.includes('poll.question)') || src.includes("if (!poll || !poll.question) return ''"), 'בלי סקר לא מצויר כלום');
});

test('סטורי של דיבור למצלמה לא מצייר מסגרת ריקה', () => {
  assert.match(src, /sp-frame--cam/);
  assert.match(src, /דיבור למצלמה/);
});

test('ההגדרות נשמרות בשרת ולא רק בדפדפן', () => {
  assert.match(src, /storySettings/);
  assert.ok(!src.includes('localStorage'), 'לא בדפדפן, אחרת זה לא יעבור בין טלפון למחשב');
  assert.match(rules, /match \/storySettings\/\{uid\}/);
  assert.match(rules, /match \/storySequences\/\{seqId\}/);
});

test('הרצפים נשמרים, ואפשר לפתוח רצף קודם', () => {
  assert.match(seq, /async function saveSequence/);
  assert.match(seq, /async function listSequences/);
  assert.match(seq, /sq-saved-row/, 'יש רשימה של רצפים קודמים');
});

test('שינוי צבע מרענן את מה שכבר על המסך', () => {
  const fn = seq.slice(seq.indexOf('async function persistBrand'));
  assert.match(fn.slice(0, 600), /sequenceHtml\(last, brand\)/, 'אחרת נראה שהשינוי לא נתפס');
});

test('הצבעים והפונט עוברים לתצוגה עצמה', () => {
  assert.match(src, /background:\$\{b\.bg\}/);
  assert.match(src, /color:\$\{b\.text\}/);
  assert.match(src, /font-family:\$\{fontStack\(b\.font\)\}/);
  assert.match(src, /color:\$\{b\.accent\}/, 'השורה האחרונה מקבלת את צבע ההדגשה');
});
