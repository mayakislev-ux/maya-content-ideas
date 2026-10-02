import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildStorySequencePrompt } = require('../functions/story-sequence-prompt.js');

const src = readFileSync(new URL('../js/story-sequence.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const server = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');

/**
 * 02/10/2026 (מאיה): "לוקח לי נושא ונגיד מפרק לי אותו ל2-6 סטוריז... הוא לא
 * מייצר, הוא אומר תפתחי מצלמה ותדברי ככה". הפורמט נלמד משתי דוגמאות שהיא
 * כתבה בעצמה, ולכן מה שנבדק כאן הוא שהכללים שלה באמת נמצאים בפרומפט.
 */

test('הפרומפט נושא את כללי המבנה שלה', () => {
  const p = buildStorySequencePrompt({ topic: 'נושא', context: '', cta: '', assets: [] });
  assert.match(p, /שיתוף אישי/);
  assert.match(p, /הצפת הבעיה/);
  assert.match(p, /המסר שנשאר בראש/);
  assert.match(p, /בין 2 ל-6 סטוריז/);
});

test('הכלל שהיא הדגישה הכי חזק נמצא שם במילים שלה', () => {
  const p = buildStorySequencePrompt({ topic: 'נושא', context: '', cta: '', assets: [] });
  assert.match(p, /ולא ארבע הרצאות למצלמה/, 'הפורמטים חייבים להתחלף');
  assert.match(p, /לא שני "דיבור למצלמה" ברצף/);
});

test('חידוד הזווית קודם לפירוק, עם הדוגמה האמיתית שלה', () => {
  const p = buildStorySequencePrompt({ topic: 'נושא', context: '', cta: '', assets: [] });
  assert.match(p, /קמפיינרים לא עובדים/, 'הדוגמה שלה לניסוח גס שצריך להימנע ממנו');
  assert.ok(p.indexOf('חידוד הזווית') < p.indexOf('הנושא:'), 'מופיע לפני הנושא עצמו');
});

test('הפרומפט יודע אילו תמונות יש לה, ומה לעשות כשאין', () => {
  const empty = buildStorySequencePrompt({ topic: 'נושא', context: '', cta: '', assets: [] });
  assert.match(empty, /אין לה עדיין תמונות/);

  const withAssets = buildStorySequencePrompt({
    topic: 'נושא',
    context: '',
    cta: '',
    assets: [
      { kind: 'bg', title: 'רקע ורוד' },
      { kind: 'portrait', title: 'על הבמה' },
      { kind: 'both', title: 'במשרד' },
    ],
  });
  assert.match(withAssets, /רקע ורוד/);
  assert.match(withAssets, /על הבמה/);
  assert.match(withAssets, /במשרד/);
});

test('בלי הנעה לפעולה לא ממציאים אחת', () => {
  const p = buildStorySequencePrompt({ topic: 'נושא', context: '', cta: '', assets: [] });
  assert.match(p, /לא נתנה הנעה לפעולה/);
  const withCta = buildStorySequencePrompt({ topic: 'נושא', context: '', cta: 'הרשמה לסדנה', assets: [] });
  assert.match(withCta, /הרשמה לסדנה/);
});

test('השרת חוסם לפי מייל ולא מסתמך על זה שהכפתור לא מוצג', () => {
  const fn = server.slice(server.indexOf('exports.breakdownStorySequence'));
  const body = fn.slice(0, fn.indexOf('\n);'));
  assert.match(body, /email !== 'mayakislev@gmail\.com'/);
  assert.ok(body.indexOf('mayakislev@gmail.com') < body.indexOf('buildStorySequencePrompt'),
    'הבדיקה קודמת לכל קריאה ל-AI, כדי שלא נשלם על בקשה חסומה');
});

test('הבלוק אינו קיים ב-HTML', () => {
  for (const id of ['sq-box', 'sq-topic', 'sq-go']) {
    assert.ok(!html.includes(`id="${id}"`), `${id} לא אמור להיות ב-index.html`);
  }
  assert.ok(src.includes("box.id = 'sq-box'"), 'נבנה בקוד בלבד');
});

/* ----- התצוגה, מועתקת מהקובץ כדי לא לייבא מודול שמביא SDK מהרשת ----- */

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function linesHtml(text) {
  return escapeHtml(text).split(/\r?\n/)
    .map((line) => (line.trim() ? `<span class="sq-line">${line}</span>` : '<span class="sq-gap"></span>'))
    .join('');
}

test('שבירות שורה נשמרות, כי הן חלק מהעיצוב של הסטורי', () => {
  const out = linesHtml('שורה א\nשורה ב');
  assert.equal((out.match(/sq-line/g) || []).length, 2);
  assert.match(linesHtml('א\n\nב'), /sq-gap/, 'שורה ריקה היא רווח, לא נעלמת');
});

test('טקסט של לקוחה לא יכול להזריק HTML', () => {
  assert.match(escapeHtml('<img onerror=x>'), /&lt;img/);
  assert.ok(!linesHtml('<script>').includes('<script>'));
});

test('שדה ריק לא מצייר שורה ריקה על המסך', () => {
  // הבדיקה על הקוד עצמו: כל חלק נוסף רק אם יש לו תוכן
  for (const guard of ['if (format)', 'if (asset)', 'if (speech)', 'if (text)', 'if (small)', 'if (poll.question)', 'if (note)']) {
    assert.ok(src.includes(guard), `חסר תנאי: ${guard}`);
  }
});

test('יש גבול זמן לפירוק', () => {
  assert.match(src, /AbortController/);
  assert.match(src, /AbortError/);
  assert.match(src, /BUDGET_MS/);
});

// 02/10/2026, אחרי הרצה אמיתית ראשונה מול השרת: המודל החזיר ב-risk את
// הטקסט "הניסוח הגס: ..." וב-bridge את "הגשר שאת רוצה לשרוף הוא: ...",
// כלומר שכפל את מילות ההוראה לתוך התשובה, והממשק הציג "לא: הניסוח הגס:".
// בנוסף יצא רק דיבור אחד למצלמה מתוך חמישה, ולא היה סקר בכלל.
test('הפרומפט מונע את שלוש הסטיות שנמצאו בהרצה האמיתית', () => {
  const p = buildStorySequencePrompt({ topic: 'נושא', context: '', cta: '', assets: [] });
  assert.match(p, /בלי "הניסוח הגס:"/, 'השדות מכילים תוכן בלבד');
  assert.match(p, /שניים של דיבור למצלמה, לא אחד/);
  assert.match(p, /נלווה אליו סקר/);
});

// 02/10/2026: גם אחרי שהפרומפט ביקש תוכן בלבד, bridge חזר מהשרת החי כ"הגשר
// שאת רוצה לשרוף הוא: ...". הממשק מציג את זה ממילא כ"כן", אז על המסך יצאה
// כפילות. ניקוי בקוד עובד תמיד, גם כשהמודל מתעקש.
test('מסגור שהמודל מדביק לשדה מנוקה בקוד', () => {
  const { stripFraming } = require('../functions/story-sequence-prompt.js');
  assert.equal(stripFraming('הגשר שאת רוצה לשרוף הוא: תוכן שנותן ידע'), 'תוכן שנותן ידע');
  assert.equal(stripFraming('הניסוח הגס: תוכן לא שווה'), 'תוכן לא שווה');
  assert.equal(stripFraming('לא: משהו'), 'משהו');
  assert.equal(stripFraming('"ציטוט שלם"'), 'ציטוט שלם');
  assert.equal(stripFraming('הגשר שאת רוצה לשרוף הוא: "עוד מסגור"'), 'עוד מסגור', 'גם כששניהם יחד');
  assert.equal(stripFraming('משפט רגיל לגמרי'), 'משפט רגיל לגמרי', 'לא נוגע במה שתקין');
  assert.equal(stripFraming(null), '');
});

test('השרת מנקה את שני השדות לפני ששולח ללקוחה', () => {
  assert.match(server, /risk: stripFraming\(/);
  assert.match(server, /bridge: stripFraming\(/);
});

// 02/10/2026 (מאיה): "לא הצלחתי לפרק את הנושא, נסו שוב. מילאתי וזה פשוט לא
// עבד". הלוג הראה תשובה שנחתכה באמצע שדה של סקר: הגבול היה 4000 טוקנים, וזה
// לא מספיק לחמישה סטוריז בעברית עם תסריטי דיבור. הניסיון החוזר שלח בדיוק את
// אותה בקשה ולכן נחתך שוב באותו מקום.
test('הגבול הועלה, וחיתוך מזוהה במקום להיראות כמו JSON שבור', () => {
  const fn = server.slice(server.indexOf('exports.breakdownStorySequence'));
  const body = fn.slice(0, fn.indexOf('\n);'));
  assert.match(body, /max_tokens: 8000/);
  assert.match(body, /stop_reason === 'max_tokens'/);
});

test('הניסיון החוזר מבקש להתקצר, ולא חוזר על אותה בקשה', () => {
  const fn = server.slice(server.indexOf('exports.breakdownStorySequence'));
  const body = fn.slice(0, fn.indexOf('\n);'));
  assert.match(body, /callAndParse\(attempt \+ 1, shorter\)/);
  assert.match(body, /עד 5 סטוריז/);
});

test('כשזה בכל זאת נכשל, ההודעה אומרת מה קרה ומה לעשות', () => {
  const fn = server.slice(server.indexOf('exports.breakdownStorySequence'));
  const body = fn.slice(0, fn.indexOf('\n);'));
  assert.match(body, /הרצף יצא ארוך מדי ונחתך/);
  assert.match(body, /לצמצם את הנושא/);
});

test('הלוג שומר את מה שצריך כדי לאבחן בלי לנחש', () => {
  const fn = server.slice(server.indexOf('exports.breakdownStorySequence'));
  const body = fn.slice(0, fn.indexOf('\n);'));
  assert.match(body, /stop_reason=\$\{data\.stop_reason\}/);
  assert.match(body, /chars=\$\{text\.length\}/);
});
