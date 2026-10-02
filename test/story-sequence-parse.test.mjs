import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseSequence: parseRaw, parsePoll } = require('../functions/story-sequence-parse.js');
const parseSequence = (raw) => parseRaw(raw).stories;
const parseJob = (raw) => parseRaw(raw).job;

/**
 * 02/10/2026 (מאיה): "הגיוני שלוקח המון זמן?". מהלוג: התשובה הראשונה
 * הסתיימה תקין אבל לא הצליחה להיפרס, ולכן יצאה קריאה שנייה שלמה, וסך הכל
 * 148 שניות.
 *
 * הסיבה: ביקשנו JSON, והיא כותבת בעברית עם מרכאות בפנים. משפט כמו
 * `הכול קורה בלחץ של "מה נעלה היום?"` שובר מחרוזת JSON. זאת מחלקה שלמה של
 * כשלים, והיא נעלמת ברגע שהפורמט אינו JSON.
 */

const lines = (...rows) => rows.join('\n');

test('מרכאות בתוך טקסט לא שוברות כלום, וזאת כל הסיבה לשינוי', () => {
  const out = parseSequence(lines(
    '@@STORY 1',
    '@role עצירה',
    '@text',
    'הכול קורה בלחץ של "מה נעלה היום?"',
    'ואז "אולי זה ההוק?"',
  ));
  assert.equal(out.length, 1);
  assert.match(out[0].text, /"מה נעלה היום\?"/);
  assert.match(out[0].text, /"אולי זה ההוק\?"/);
});

test('אימוג׳ים, חצים ומשוואות עוברים כמו שהם', () => {
  const out = parseSequence(lines(
    '@@STORY 1',
    '@text',
    'מצלמים ← עורכים ← מעלים ← מחכים 🤞',
    'עוד תנועה ≠ שיווק טוב יותר 😭',
  ));
  assert.match(out[0].text, /←/);
  assert.match(out[0].text, /🤞/);
  assert.match(out[0].text, /≠/);
});

test('שורות ריקות בתוך טקסט נשמרות, כי הן חלק מהעיצוב', () => {
  const out = parseSequence(lines(
    '@@STORY 1',
    '@text',
    'שורה א',
    '',
    'שורה ב',
  ));
  assert.equal(out[0].text, 'שורה א\n\nשורה ב');
});

test('טקסט שהמודל מוסיף לפני ואחרי נזרק', () => {
  const out = parseSequence(lines(
    'בשמחה, הנה הרצף שביקשת:',
    '@@STORY 1',
    '@text',
    'תוכן',
    '@@END',
    'אשמח לעזור בעוד משהו!',
  ));
  assert.equal(out.length, 1);
  assert.equal(out[0].text, 'תוכן');
});

test('כל השדות נקראים, וסקר מתפרק נכון', () => {
  const out = parseSequence(lines(
    '@@STORY 3',
    '@role הטוויסט',
    '@format דיבור למצלמה',
    '@asset רקע לבן',
    '@poll מוכר לי מדי | דווקא לא',
    '@note כאן לעצור',
    '@speech',
    'אבל זה לא נכון.',
    '@small',
    'שורה קטנה',
  ));
  const s = out[0];
  assert.equal(s.n, 3);
  assert.equal(s.role, 'הטוויסט');
  assert.equal(s.format, 'דיבור למצלמה');
  assert.equal(s.asset, 'רקע לבן');
  assert.equal(s.note, 'כאן לעצור');
  assert.equal(s.speech, 'אבל זה לא נכון.');
  assert.equal(s.small, 'שורה קטנה');
  assert.deepEqual(s.poll, { question: '', a: 'מוכר לי מדי', b: 'דווקא לא' });
});

test('סקר עם שאלה, בלי שאלה, וריק', () => {
  assert.deepEqual(parsePoll('זה מוכר? | כן | לא'), { question: 'זה מוכר?', a: 'כן', b: 'לא' });
  assert.deepEqual(parsePoll('כן | לא'), { question: '', a: 'כן', b: 'לא' });
  assert.deepEqual(parsePoll(''), { question: '', a: '', b: '' });
  assert.deepEqual(parsePoll(null), { question: '', a: '', b: '' });
});

test('סטורי בלי טקסט ובלי דיבור אינו סטורי', () => {
  const out = parseSequence(lines(
    '@@STORY 1',
    '@role ריק',
    '@@STORY 2',
    '@text',
    'יש תוכן',
  ));
  assert.equal(out.length, 1);
  assert.equal(out[0].n, 2, 'המספר המקורי נשמר');
});

test('שדה לא מוכר נזרק ולא מפיל את הפירוק', () => {
  const out = parseSequence(lines(
    '@@STORY 1',
    '@colour כחול',
    '@text',
    'תוכן',
  ));
  assert.equal(out.length, 1);
  assert.equal(out[0].text, 'תוכן');
});

test('תשובה שנחתכה באמצע עדיין נותנת את הסטוריז השלמים שלפניה', () => {
  const out = parseSequence(lines(
    '@@STORY 1',
    '@text',
    'ראשון',
    '@@STORY 2',
    '@text',
    'שני',
    '@@STORY 3',
    '@role נחתך כאן',
  ));
  assert.equal(out.length, 2, 'השניים השלמים נשמרים');
});

test('קלט שבור לא מפיל', () => {
  assert.deepEqual(parseSequence(''), []);
  assert.deepEqual(parseSequence(null), []);
  assert.deepEqual(parseSequence('סתם טקסט בלי שום סימון'), []);
});

test('@@STORY בלי מספר מקבל מספר לפי הסדר', () => {
  const out = parseSequence(lines(
    '@@STORY',
    '@text',
    'א',
    '@@STORY',
    '@text',
    'ב',
  ));
  assert.deepEqual(out.map((s) => s.n), [1, 2]);
});

test('@@JOB נקרא, וברירת המחדל היא שיקוף', () => {
  assert.equal(parseJob(lines('@@JOB stance', '@@STORY 1', '@text', 'א')), 'stance');
  assert.equal(parseJob(lines('@@JOB mirror', '@@STORY 1', '@text', 'א')), 'mirror');
  assert.equal(parseJob(lines('@@STORY 1', '@text', 'א')), 'mirror', 'בלי השורה, שיקוף');
  assert.equal(parseJob(lines('@@JOB שטות', '@@STORY 1', '@text', 'א')), 'mirror');
});
