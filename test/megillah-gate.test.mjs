/* 28/10/2026 (מאיה: "הרבה מפספסים את ה-SOS, שזה שלב קריטי... ויוצא להם
   גרוע"). בנתונים: מגילה של 23 מילים ושפיכות של 40 ו-46 מילים הגיעו עד
   תסריט, ואף אחת לא עברה ב-SOS. המחסום: מתחת ל-120 מילים אין מעבר. */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

// הקובץ שמור ב-CRLF, ולכן מנרמלים לפני חיתוך לפי שורות
const src = readFileSync(new URL('../js/video-assistant.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
// גוף הפונקציה, עד הסוגר הראשון בתחילת שורה
const fn = (name) => {
  const from = src.search(new RegExp(`(async )?function ${name}\\(`));
  assert.ok(from > -1, `לא נמצאה ${name}`);
  return src.slice(from, src.indexOf('\n}\n', from) + 2);
};

test('הרף הוא 120 מילים', () => {
  assert.match(src, /export const MEGILLAH_MIN_WORDS = 120;/);
});

test('ספירת המילים: רווחים ושורות ריקות לא נספרים', () => {
  const countWords = new Function(`${fn('countWords')}\nreturn countWords;`)();
  assert.strictEqual(countWords(''), 0);
  assert.strictEqual(countWords('  אחת   שתיים\n\nשלוש  '), 3);
  assert.strictEqual(countWords(null), 0);
});

test('שני המסכים עוברים דרך המחסום, ולא שולחים ישר', () => {
  const herWords = fn('renderHerWords');
  const scratch = fn('renderScratchDump');
  for (const [name, body, action] of [['מגילה', herWords, 'HER_WORDS_SUBMITTED'], ['שפיכה', scratch, 'SCRATCH_DUMP_READY']]) {
    assert.match(body, /wireMegillahGate\(/, `${name}: אין מחסום`);
    assert.match(body, new RegExp(`onGo: \\(text\\) => dispatch\\(\\{ type: '${action}'`), `${name}: המעבר רק דרך onGo`);
    assert.strictEqual(body.split(action).length - 1, 1, `${name}: אין שליחה נוספת שעוקפת את המחסום`);
  }
});

test('מתחת לרף, להמשיך פותח רק SOS וחזרה, בלי כפתור מעבר', () => {
  const gate = fn('wireMegillahGate');
  assert.match(gate, /countWords\(text\) < MEGILLAH_MIN_WORDS[\s\S]*megillahTooShort[\s\S]*return;/);
  const short = fn('megillahTooShort');
  assert.match(short, /va-short-sos-btn/);
  assert.doesNotMatch(short, /onGo|dispatch\(/, 'אין דרך להמשיך מתוך פופאפ הקצר מדי');
});
