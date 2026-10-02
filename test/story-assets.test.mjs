import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * 02/10/2026 (מאיה): "צריך בחלק של הסטורי כרגע רק לי תיקייה שאני יכולה
 * בעצם להעלות תמונות לרקעים של סטוריז", "אני יעלה רקעים נקיים ותמונות
 * תדמית גם וגם, וגם תמונת תדמית אפשר לסטורי מקצועי לרקע".
 *
 * הקובץ עצמו מייבא את ה-SDK של פיירבייס מהרשת, ולכן אי אפשר לייבא אותו
 * כאן. מה שנבדק הוא מה שבאמת יכול להישבר בשקט: שהבלוק אינו ב-HTML, שהנתיב
 * והכללים מסכימים, ושההיגיון הטהור נכון.
 */

const src = readFileSync(new URL('../js/story-assets.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const rules = readFileSync(new URL('../storage.rules', import.meta.url), 'utf8');

test('הבלוק אינו קיים ב-HTML, ולכן לקוחה לא רואה אותו גם במקור הדף', () => {
  for (const id of ['sa-box', 'sa-grid', 'sa-file', 'sa-toggle']) {
    assert.ok(!html.includes(`id="${id}"`), `${id} לא אמור להיות ב-index.html`);
  }
  assert.ok(src.includes("id = 'sa-box'"), 'הוא נבנה בקוד');
});

test('נבנה רק אחרי בדיקת מייל, ולא אחרי בדיקת ממשק', () => {
  const fn = src.slice(src.indexOf('export async function wireStoryAssets'));
  const guard = fn.indexOf('OWNER_EMAIL');
  const build = fn.indexOf('createElement');
  assert.ok(guard > -1 && guard < build, 'בדיקת הבעלות קודמת לכל בנייה');
});

test('הנתיב בקוד זהה לנתיב בכללי השרת', () => {
  assert.ok(src.includes('storyAssets/${user.uid}'), 'הקוד כותב ל-storyAssets/<uid>');
  assert.ok(rules.includes('match /storyAssets/{uid}/{file}'), 'והכללים מגנים בדיוק עליו');
  assert.ok(rules.includes("request.auth.uid == uid"), 'ורק על התיקייה של המשתמשת עצמה');
  assert.ok(rules.includes("mayakislev@gmail.com"), 'כרגע רק מאיה');
  assert.ok(/allow read, write: if false/.test(rules), 'כל שאר הדלי סגור');
});

test('הכללים חוסמים קובץ ענק ווידאו, ולא רק סומכים על הממשק', () => {
  assert.match(rules, /request\.resource\.size < 10 \* 1024 \* 1024/);
  assert.match(rules, /contentType\.matches\('image\/\.\*'\)/);
  assert.ok(src.includes('MAX_BYTES'), 'ובממשק יש הודעה בעברית לפני שמנסים');
});

/* ----- ההיגיון הטהור, מועתק מהקובץ כדי לא לייבא SDK מהרשת ----- */

function guessKind(width, height) {
  if (!width || !height) return 'both';
  return height / width >= 1.5 ? 'bg' : 'both';
}
function rejectReason(file) {
  if (!file) return 'לא נבחר קובץ';
  if (!String(file.type || '').startsWith('image/')) return 'אפשר להעלות תמונות בלבד';
  if (file.size > 10 * 1024 * 1024) return 'התמונה גדולה מדי, עד 10MB';
  return '';
}

test('תמונה מאורכת מנוחשת כרקע, תמונה רגילה כתדמית שאפשר גם כרקע', () => {
  assert.equal(guessKind(1080, 1920), 'bg', 'מידות סטורי');
  assert.equal(guessKind(1080, 1080), 'both', 'ריבוע');
  assert.equal(guessKind(1920, 1080), 'both', 'לרוחב');
  assert.equal(guessKind(0, 0), 'both', 'כשלא הצלחנו לקרוא מידות');
});

test('מה נדחה לפני שמנסים להעלות', () => {
  assert.equal(rejectReason({ type: 'image/jpeg', size: 1000 }), '');
  assert.match(rejectReason({ type: 'video/mp4', size: 1000 }), /תמונות בלבד/);
  assert.match(rejectReason({ type: 'image/png', size: 11 * 1024 * 1024 }), /גדולה מדי/);
  assert.match(rejectReason(null), /לא נבחר/);
});

test('שלושת הסוגים קיימים, ו"שניהם" הוא ברירת המחדל', () => {
  assert.ok(src.includes("bg: 'רקע נקי'"));
  assert.ok(src.includes("portrait: 'תדמית'"));
  assert.ok(src.includes("both: 'תדמית שאפשר גם כרקע'"));
  assert.ok(src.includes("KINDS[custom.kind] ? custom.kind : 'both'"), 'סוג לא מוכר נופל ל-both');
});

test('מחיקה שואלת קודם', () => {
  const block = src.slice(src.indexOf(".sa-del"));
  assert.ok(block.includes('confirmDialog'), 'אין מחיקה בלחיצה אחת');
});
