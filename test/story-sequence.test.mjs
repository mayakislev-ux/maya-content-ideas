import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildStorySequencePrompt, checkSequence } = require('../functions/story-sequence-prompt.js');

const src = readFileSync(new URL('../js/story-sequence.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const server = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');

/**
 * 02/10/2026 (מאיה): "לוקח לי נושא ונגיד מפרק לי אותו ל2-6 סטוריז... הוא לא
 * מייצר, הוא אומר תפתחי מצלמה ותדברי ככה". הפורמט נלמד משתי דוגמאות שהיא
 * כתבה בעצמה, ולכן מה שנבדק כאן הוא שהכללים שלה באמת נמצאים בפרומפט.
 */



test('הכלל שהיא הדגישה הכי חזק נמצא שם במילים שלה', () => {
  const p = buildStorySequencePrompt({ topic: 'נושא', context: '', cta: '', assets: [] });
  assert.match(p, /ולא ארבע הרצאות למצלמה/, 'הפורמטים חייבים להתחלף');
  assert.match(p, /ולא שניים ברצף/);
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

/* 02/10/2026 (מאיה): "מי ביקש ממנו לבחור זווית? כבר כתבתי את הרעיון. הוא בנה
   לי סטוריז מזעזע", ואז שלחה את הרצף שהיא כן רצתה. ההבדל הוא קצב, לא ניסוח:
   הרצף שנכשל אמר את כל הטיעון כבר בסטורי 1 ואז חזר עליו חמש פעמים. */

test('לא בוחרים לה זווית, הנושא שלה הוא הנושא', () => {
  const p = buildStorySequencePrompt({ topic: 'נושא', context: '', cta: '', assets: [] });
  assert.match(p, /הנושא שהיא נתנה הוא הנושא/);
  assert.match(p, /לא לחדד אותו/);
  assert.ok(!/חידוד הזווית/.test(p), 'השלב הזה הוסר לגמרי');
  assert.ok(!/"angle"/.test(p), 'וגם לא מבוקש בתשובה');
});

test('הכלל שהכי חשוב לה: סטורי 1 לא מסיק מסקנה', () => {
  const p = buildStorySequencePrompt({ topic: 'נושא', context: '', cta: '', assets: [] });
  assert.match(p, /סטורי 1 אינו מכיל שום דבר מהטענה/);
  assert.match(p, /בלי מסקנה עדיין/);
  assert.match(p, /סטורי 1 אינו מסיק מסקנה/, 'גם בכללים הקשיחים');
  // הדוגמה השלילית שלה עצמה, כדי שהמודל יראה בדיוק מה אסור
  assert.match(p, /ועדיין לא מבינה למה זה לא\s+מביא תוצאות/);
});

test('הפעימות של הרצף, כולל אלה שהיו חסרות לגמרי', () => {
  const p = buildStorySequencePrompt({ topic: 'נושא', context: '', cta: '', assets: [] });
  assert.match(p, /אימות התסכול/, 'קודם מסכימים איתם ורק אחר כך מתקנים');
  assert.match(p, /המחשבות שבראש שלהם/, 'סטורי של שאלות פנימיות בציטוט');
  assert.match(p, /הטוויסט הוא הסטורי היחיד שהוא הטענה שלה/);
  assert.match(p, /כאן לעצור/);
});

test('חוק הקונקרטיות, במספרים ולא בכלליות', () => {
  const p = buildStorySequencePrompt({ topic: 'נושא', context: '', cta: '', assets: [] });
  assert.match(p, /1,247 צפיות/);
  assert.match(p, /0 פניות/);
  assert.match(p, /לא "השקיעו"/);
});

test('הפורמטים העשירים שהיא משתמשת בהם, לא רק רקע וטקסט', () => {
  const p = buildStorySequencePrompt({ topic: 'נושא', context: '', cta: '', assets: [] });
  assert.match(p, /B-roll/);
  assert.match(p, /צילום מסך של Notes/);
  assert.match(p, /ולא ארבע הרצאות למצלמה/);
  assert.match(p, /בדיוק שניים מהרצף הם דיבור למצלמה/);
});

test('הערת בימוי היא חלק מהתוצר, לא קישוט', () => {
  const p = buildStorySequencePrompt({ topic: 'נושא', context: '', cta: '', assets: [] });
  assert.match(p, /הערת בימוי/);
  assert.match(p, /"note":"<הערת בימוי/);
});

test('סקר יכול להיות קליל, כולל אימוג׳י כאפשרות', () => {
  const p = buildStorySequencePrompt({ topic: 'נושא', context: '', cta: '', assets: [] });
  assert.match(p, /יותר מדי פעמים/);
  assert.match(p, /נלווה לסטורי של התוצאה, לא בהכרח לראשון/);
});

/* 02/10/2026, אחרי שמאיה ביקשה ניתוח לעומק של שלוש הדוגמאות שלה מול הרצף
   שנכשל. המנגנון שלה: הרצף אינו טיעון מחולק לחלקים, הוא שחזור של החוויה של
   הצופה, מוחזר אליו, עד שהוא בפנים, ורק אז משנים מילה אחת. */

test('המכונה והכלל המחולל נמצאים בפרומפט', () => {
  const p = buildStorySequencePrompt({ topic: 'נושא', context: '', cta: '', assets: [] });
  assert.match(p, /כל סטורי מוסיף בדיוק דבר אחד חדש/);
  assert.match(p, /ברגע שסטורי מכיל גם את המצב וגם את המשמעות שלו, הרצף מת/);
  assert.match(p, /מבחן הבעלות/, 'חמישה מתוך שישה שייכים לצופה');
});

test('שתי הטעויות שהרסו את הרצף שנכשל אסורות במפורש', () => {
  const p = buildStorySequencePrompt({ topic: 'נושא', context: '', cta: '', assets: [] });
  assert.match(p, /מישהי שהשקיעה אלפי שקלים/, 'הדוגמה השלילית עצמה');
  assert.match(p, /הצופה הוא הגיבור, לא הקהל/);
  assert.match(p, /כיסא המאבחנת/);
  assert.match(p, /ראיתי את זה שוב השבוע/);
});

test('הטוויסט הוא סיווג מחדש ולא הגברה', () => {
  const p = buildStorySequencePrompt({ topic: 'נושא', context: '', cta: '', assets: [] });
  assert.match(p, /סיווג מחדש, אף פעם לא הגברה/);
  assert.match(p, /אסור "תעשו יותר" או "תעשו טוב\s+יותר"/);
  assert.match(p, /אופי הופך למיומנות/);
});

test('ההסתייגות נכנסת בתוך הרצף ולא כהקדמה', () => {
  const p = buildStorySequencePrompt({ topic: 'נושא', context: '', cta: '', assets: [] });
  assert.match(p, /בשורה הקטנה של סטורי 1 או בדיבור של סטורי 2/);
  assert.match(p, /לא כהקדמה\s*\n?\s*נפרדת/);
});

test('הפורמט מוגדר כמי מדבר, לא כמגוון ויזואלי', () => {
  const p = buildStorySequencePrompt({ topic: 'נושא', context: '', cta: '', assets: [] });
  assert.match(p, /הפורמט הוא מי מדבר/);
  assert.match(p, /הם, קוראים את הראש של עצמם/);
});

/* ----- הבדיקה המכנית ----- */

const good = [
  { n: 1, text: 'קניתם תאורה.\nשדרגתם מצלמה.', note: 'בלי מסקנה עדיין' },
  { n: 2, text: '1,247 צפיות.\n0 פניות.' },
  { n: 3, speech: 'ואני באמת מבינה את התסכול הזה.' },
  { n: 4, text: '"אולי העריכה לא מספיק טובה?"' },
  { n: 5, speech: 'יכול להיות שהוא פשוט צריך להיות מעניין יותר.' },
  { n: 6, text: 'איכות הפקה לא מפצה על חוסר עניין.', small: 'קודם המסר, אחר כך האריזה.' },
];

test('רצף תקין עובר בלי הערות', () => {
  assert.deepEqual(checkSequence(good), []);
});

test('הבדיקה תופסת את הרצף שמאיה כינתה מזעזע', () => {
  const bad = [
    { n: 1, text: 'ראיתי את זה שוב השבוע\nמישהי שהשקיעה אלפי שקלים\nועדיין לא מבינה למה זה לא מביא תוצאות' },
    { n: 2, speech: 'אני רואה את זה כל הזמן.' },
    { n: 3, text: 'וידאו מושקע\nבלי מסר ברור' },
    { n: 4, speech: 'ואני אגיד לכם משהו שאולי לא יהיה נעים.' },
    { n: 5, text: 'פרודקשן זה מגבר\nלא תחליף למסר', small: 'קודם תדעו למה.' },
  ];
  const problems = checkSequence(bad);
  assert.ok(problems.some((t) => /מישהו אחר או מכיסא המאבחנת/.test(t)), 'גוף שלישי וכיסא המאבחנת');
  assert.ok(problems.some((t) => /כבר מסיק מסקנה/.test(t)), 'המסקנה כבר בסטורי 1');
});

test('הבדיקה תופסת שני דיבורים ברצף', () => {
  const bad = [...good];
  bad[3] = { n: 4, speech: 'עוד דיבור' };
  const problems = checkSequence(bad);
  assert.ok(problems.some((t) => /שני דיבורים למצלמה ברצף/.test(t)));
});

test('הבדיקה תופסת מספר דיבורים שגוי, סטורי ריק, וסיום בלי שורה קטנה', () => {
  assert.ok(checkSequence(good.map((s) => ({ ...s, speech: '' }))).some((t) => /בדיוק שני סטוריז של דיבור/.test(t)));
  const withEmpty = good.map((s, i) => (i === 1 ? { n: 2 } : s));
  assert.ok(checkSequence(withEmpty).some((t) => /סטורי 2 ריק/.test(t)));
  const noSmall = good.map((s, i) => (i === good.length - 1 ? { ...s, small: '' } : s));
  assert.ok(checkSequence(noSmall).some((t) => /חסרה השורה הקטנה/.test(t)));
});

test('הבדיקה תופסת אורך לא תקין', () => {
  assert.ok(checkSequence(good.slice(0, 3)).some((t) => /צריך 5 עד 6/.test(t)));
  assert.ok(checkSequence([...good, { n: 7, text: 'עוד' }]).some((t) => /צריך 5 עד 6/.test(t)));
  assert.ok(checkSequence(null).length > 0, 'קלט שבור לא מפיל');
});

test('השרת מבקש תיקון כשכלל הופר, ולוקח את השנייה רק אם היא טובה יותר', () => {
  const fn = server.slice(server.indexOf('exports.breakdownStorySequence'));
  const body = fn.slice(0, fn.indexOf('\n);'));
  assert.match(body, /checkSequence\(stories\)/);
  assert.match(body, /checkSequence\(secondStories\)\.length < problems\.length/);
});
