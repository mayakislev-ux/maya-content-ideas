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

/* 02/10/2026 (מאיה): "גדולות מדי מעצבן תטפלי". תמונה מהטלפון היא בקלות 8 עד
   12MB, והיא גם גדולה בהרבה ממה שסטורי צריך. במקום לדחות, מקטינים בדפדפן. */

function targetSize(width, height, maxEdge = 1920) {
  if (!width || !height) return { width: 0, height: 0 };
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
function shouldShrink(file, width, height) {
  if (!file) return false;
  if (file.size > 1.5 * 1024 * 1024) return true;
  return Math.max(width || 0, height || 0) > 1920;
}

test('תמונה מהטלפון מוקטנת, ויחס הצדדים נשמר', () => {
  const a = targetSize(4032, 3024);
  assert.equal(a.width, 1920);
  assert.equal(a.height, 1440, '4:3 נשמר');
  const b = targetSize(3024, 4032);
  assert.equal(b.height, 1920, 'גם לאורך');
  assert.equal(b.width, 1440);
});

test('תמונה שכבר קטנה לא נוגעים בה', () => {
  assert.deepEqual(targetSize(1080, 1920), { width: 1080, height: 1920 }, 'מידות סטורי מדויקות');
  assert.deepEqual(targetSize(800, 600), { width: 800, height: 600 });
  assert.deepEqual(targetSize(0, 0), { width: 0, height: 0 }, 'כשלא קראנו מידות');
});

test('מתי בכלל מקטינים', () => {
  assert.equal(shouldShrink({ size: 9 * 1024 * 1024 }, 1080, 1920), true, 'כבדה אבל במידות תקינות');
  assert.equal(shouldShrink({ size: 300 * 1024 }, 4032, 3024), true, 'קלה אבל ענקית במידות');
  assert.equal(shouldShrink({ size: 300 * 1024 }, 1080, 1920), false, 'קטנה בשני המובנים');
  assert.equal(shouldShrink(null, 100, 100), false);
});

test('ההעלאה לא נחסמת מראש בגלל גודל, רק אחרי ההקטנה', () => {
  const src2 = readFileSync(new URL('../js/story-assets.js', import.meta.url), 'utf8');
  const handler = src2.slice(src2.indexOf("el('sa-file').addEventListener"));
  assert.ok(handler.includes('const ready = await shrink('), 'מקטינים לפני');
  assert.ok(handler.indexOf('const ready = await shrink(') < handler.indexOf('rejectReason(ready)'),
    'ורק אחר כך בודקים גודל');
  assert.ok(!/const reason = rejectReason\(file\)/.test(handler), 'אין יותר דחייה על גודל המקור');
});

test('כשההקטנה לא אפשרית מעלים את המקור במקום להיכשל', () => {
  const src2 = readFileSync(new URL('../js/story-assets.js', import.meta.url), 'utf8');
  const fn = src2.slice(src2.indexOf('async function shrink'), src2.indexOf('export function assetCardHtml'));
  assert.match(fn, /catch \(err\)[\s\S]*return file/, 'HEIC או פענוח שנכשל לא מפילים העלאה');
});

test('שגיאת טעינה אומרת מה קרה ומציעה לנסות שוב', () => {
  const src2 = readFileSync(new URL('../js/story-assets.js', import.meta.url), 'utf8');
  assert.match(src2, /sa-retry/);
  assert.match(src2, /err\.code \|\| err\.message/);
});
