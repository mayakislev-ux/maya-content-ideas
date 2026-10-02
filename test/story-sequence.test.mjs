import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildStorySequencePrompt, checkSequence } = require('../functions/story-sequence-prompt.js');

const src = readFileSync(new URL('../js/story-sequence.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const server = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
const prompt = buildStorySequencePrompt({ topic: 'נושא', context: '', cta: '', assets: [] });

/**
 * 02/10/2026. הפורמט נלמד מארבע דוגמאות מלאות שמאיה כתבה בעצמה, מול שני
 * רצפים שהכלי הוציא והיא פסלה. ההוראה שלה, שהיא המפתח לכל השאר:
 * "קודם כל שיקוף, לא ישר הנה 5 טיפים להעלות מעורבות. אני רוצה שהם ירגישו
 * שאת מתארת את הרגע הזה שהם מעלים סטורי ואז חוזרים לבדוק אם מישהו הגיב".
 */

/* ========== המכונה ========== */

test('שיקוף, לא מסירת עצה', () => {
  assert.match(prompt, /קודם כל שיקוף, לא ישר הנה 5 טיפים/);
  assert.match(prompt, /אם הרצף מרגיש כמו עצה/);
  assert.match(prompt, /סטוריז 1 עד 3 הם שיקוף בלבד, בלי שום עצה/);
});

test('סצנה בהווה, לא תיק מקרה בעבר', () => {
  assert.match(prompt, /סצנה, לא תיק מקרה/);
  assert.match(prompt, /הסברת את התהליך/, 'הדוגמה השלילית מהרצף שנפסל');
  assert.match(prompt, /אתם מעלים סטורי/, 'והדוגמה החיובית שלה');
  assert.match(prompt, /לשון עבר מסכמת/);
});

test('הכלל המחולל ומבחן הבעלות', () => {
  assert.match(prompt, /מעמיקה בכל סטורי/);
  assert.match(prompt, /מבחן הבעלות/);
  assert.match(prompt, /חמישה שייכים לצופה/);
});

/* ========== הפנייה ========== */

test('תמיד אתם, והקול הפנימי ביחיד', () => {
  assert.match(prompt, /תמיד \*\*"אתם"\*\*/);
  assert.match(prompt, /לא "את", לא "אתה"/);
  assert.match(prompt, /אלייך הם אתם, לעצמם הם אני/);
});

/* ========== הקצב ========== */

test('הקצב מוגדר כמבנה, עם ארבעת הסימנים שלה', () => {
  assert.match(prompt, /הקצב הוא מבנה, לא סגנון/);
  assert.match(prompt, /מדברים\. משתפים\. מסבירים\./, 'פעלים קטועים');
  assert.match(prompt, /אימוג׳י מסכן/, 'סולם שלילה');
  assert.match(prompt, /עוברת שעה…/, 'שלוש נקודות כפעימת זמן');
  assert.match(prompt, /איפה כולם\?\?\?\?/, 'פיסוק גולמי');
});

/* ========== הפעימות ========== */

test('שיקוף, מחיר, טענה, מסר', () => {
  assert.match(prompt, /1 ו-2 הם שיקוף/);
  assert.match(prompt, /3 ו-4 הם המחיר/);
  assert.match(prompt, /5 הוא הטענה שלה/);
});

test('המחיר הוא פעימה, ולא הערה', () => {
  assert.match(prompt, /פה נכנס המחיר/);
  assert.match(prompt, /להכאיב עוד/);
  assert.match(prompt, /שתי פעימות שלמות מוקדשות למחיר/);
  assert.match(prompt, /הרצף נכון ולא כואב/);
});

test('הגשר שמתרגם מהרגשה לעסק', () => {
  assert.match(prompt, /נשמע כמו בעיה קטנה, אבל תחשבו מה זה אומר בפועל/);
  assert.match(prompt, /המחיר נמדד בעסק, לא ברגש/);
  assert.match(prompt, /לא "מתיש", לא "מבלבל"/);
});

test('שלושת כלי ההכאבה והתיוג על המסך', () => {
  assert.match(prompt, /מצלמים ← עורכים ← מעלים ← מחכים/, 'לולאת עבודה');
  assert.match(prompt, /כישלון סימטרי/);
  assert.match(prompt, /מספר מצטבר שמכמת את הבזבוז/);
  assert.match(prompt, /⬅️ זה המחיר/);
});

test('סולם הניחושים, ולא משפט פנימי אחד', () => {
  assert.match(prompt, /סולם של ארבעה עד שישה "אולי" קצרים/);
  assert.match(prompt, /כנראה האלגוריתם/);
});

test('פעימה 4 נגמרת במסקנה שנובעת מהנושא הזה בלבד', () => {
  assert.match(prompt, /שנובעת מהנושא הזה בלבד/);
  assert.match(prompt, /פעימה 4 מניחה את המטרה שפעימה 5 מפילה/);
});

/* ========== מהלכים ========== */

test('האנומליה היא אפשרות ולא פעימה קבועה', () => {
  assert.match(prompt, /מהלך אפשרי ולא פעימה קבועה/);
  assert.match(prompt, /להכניס מישהו שהצליח שובר את השיקוף/);
  assert.match(prompt, /שובר את השיקוף/);
});

test('הטוויסט הוא סיווג מחדש', () => {
  assert.match(prompt, /סיווג מחדש, ולרוב של זהות/);
  assert.match(prompt, /אופי הופך למיומנות/);
  assert.match(prompt, /מי הם צריכים\s+להיות/);
});

test('ההסתייגות נכנסת בתוך הרצף ולא כהקדמה', () => {
  assert.match(prompt, /בשורה הקטנה של סטורי 1 או בדיבור של סטורי 2/);
  assert.match(prompt, /לא כהקדמה/);
  assert.match(prompt, /לא לשנות, לא לחדד, ולא להציע במקומו/);
});

/* ========== קונקרטיות ========== */

test('המספרים שלהם טווח, המספרים שלה מדויקים', () => {
  assert.match(prompt, /כשהנקודה היא "זה אתם"/);
  assert.match(prompt, /300 \/ 500 \/ 1,000/);
  assert.match(prompt, /נכון רק לאדם אחד/);
  assert.match(prompt, /המספרים שלה מדויקים תמיד/);
  assert.match(prompt, /4 חודשים בסוכנות קמפיינים/);
});

/* ========== פרטים שהיו כללים שגויים אצלי ========== */

test('אימוג׳י מותר בטקסט, בניגוד לכלל שהיה קודם', () => {
  assert.match(prompt, /אימוג'ים מותרים בטקסט/);
  assert.match(prompt, /נשמע מתלונן/);
});

test('הסקר בסטורי 1 בלי שאלה, בקול שלהם', () => {
  assert.match(prompt, /הסקר בסטורי 1 הוא בלי שאלה/);
  assert.match(prompt, /מוכר לי מדי/);
  assert.match(prompt, /לא שאלה של מראיינת/);
});

test('השורה הקטנה שייכת למסר האחרון, והיא שתי שורות', () => {
  assert.match(prompt, /השורה הקטנה שייכת למסר האחרון/);
  assert.match(prompt, /שתי שורות: הגדרה ואז ההשלכה שלה/);
  assert.match(prompt, /לא לשים שורה קטנה על סטורי 1/);
});

test('המסר האחרון הוא מבנה מקביל ולא אפוריזם', () => {
  assert.match(prompt, /מבנה מקביל/);
  assert.match(prompt, /צפיות אומרות שיש אנשים/);
});

test('הפורמט מוגדר כמי מדבר', () => {
  assert.match(prompt, /הפורמט הוא מי מדבר/);
  assert.match(prompt, /הם קוראים את הראש של עצמם/);
  assert.match(prompt, /לפעימה 3 ולטוויסט בלבד/);
});

/* ========== הכללים הקשיחים ========== */

test('הכללים הקשיחים מכסים את כל מה שנפסל', () => {
  const hard = prompt.slice(prompt.indexOf('כללים קשיחים'));
  assert.match(hard, /פונים ב"אתם"/);
  assert.match(hard, /בהווה מתמשך, לא בלשון עבר/);
  assert.match(hard, /אין עליו שורה קטנה/);
  assert.match(hard, /שיקוף בלבד, בלי שום עצה/);
  assert.match(hard, /מצטט ומכחיש את המסקנה המוטעית/);
  assert.match(hard, /בדיוק שני סטוריז של דיבור למצלמה/);
});

/* ========== הבדיקה המכנית ========== */

const good = [
  { n: 1, text: 'אתם מעלים סרטון.\n87,000 צפיות.\nהסרטון הבא, 4,200.\nושניהם, מבחינתכם, היו טובים.', note: 'בלי מסקנה עדיין' },
  { n: 2, text: 'אז מתחילים לנחש:\nאולי ההוק?\nאולי הנושא?\nאולי השעה?' },
  { n: 3, speech: 'וזה נשמע כמו בעיה קטנה, אבל תחשבו מה זה אומר בפועל: חודש אחד אלפיים עוקבים, וחודש אחרי אותה כמות תוכן וכלום.' },
  { n: 4, text: 'מצלמים ← עורכים ← מעלים ← מחכים\nגם אחרי 50 סרטונים,\nאתם מתחילים מאפס ב-51.\n"כנראה שזה פשוט האלגוריתם."' },
  { n: 5, speech: 'אבל זה לא האלגוריתם. אתם פשוט לא יודעים מה בתוך הסרטון גרם למישהו לעצור.' },
  { n: 6, text: 'הבעיה היא לא שסרטון אחד הצליח.\nהבעיה היא שאין לכם מושג למה.', small: 'כי מה שאתם לא יודעים להסביר,\nאתם גם לא יודעים לשחזר.' },
];

test('רצף תקין עובר בלי הערות', () => {
  assert.deepEqual(checkSequence(good), []);
});

test('תופס את הרצף שמאיה כינתה מזעזע', () => {
  const bad = [
    { n: 1, text: 'ראיתי את זה שוב השבוע\nמישהי שהשקיעה אלפי שקלים\nועדיין לא מבינה למה זה לא מביא תוצאות' },
    { n: 2, speech: 'אני רואה את זה כל הזמן.' },
    { n: 3, text: 'וידאו מושקע\nבלי מסר ברור' },
    { n: 4, speech: 'ואני אגיד לכם משהו שאולי לא יהיה נעים.' },
    { n: 5, text: 'פרודקשן זה מגבר\nלא תחליף למסר', small: 'קודם תדעו למה.' },
  ];
  const problems = checkSequence(bad);
  assert.ok(problems.some((t) => /מישהו אחר או מכיסא המאבחנת/.test(t)));
  assert.ok(problems.some((t) => /כבר מסיק מסקנה/.test(t)));
});

test('תופס לשון יחיד, שזאת הטעות של הרצף השני שנפסל', () => {
  const bad = [...good];
  bad[0] = { n: 1, text: 'הסברת את התהליך.\nענית על כל שאלה.\nהראת תוצאות.' };
  assert.ok(checkSequence(bad).some((t) => /אינו פונה ב"אתם"/.test(t)));
});

test('תופס שורה קטנה על סטורי 1', () => {
  const bad = [...good];
  bad[0] = { ...good[0], small: 'זו לא עוד שיטת מכירות אגרסיבית' };
  assert.ok(checkSequence(bad).some((t) => /לסטורי 1 יש שורה קטנה/.test(t)));
});

test('תופס עצה בשלושת הראשונים', () => {
  const bad = [...good];
  bad[2] = { n: 3, speech: 'אז כדאי לכם להתחיל לשאול שאלות בסטורי.' };
  assert.ok(checkSequence(bad).some((t) => /נותן עצה/.test(t)));
});

test('תופס שני דיבורים ברצף, מספר שגוי, סטורי ריק וסיום בלי שורה קטנה', () => {
  const twoInRow = [...good];
  twoInRow[3] = { n: 4, speech: 'עוד דיבור' };
  assert.ok(checkSequence(twoInRow).some((t) => /שני דיבורים למצלמה ברצף/.test(t)));

  assert.ok(checkSequence(good.map((s) => ({ ...s, speech: '' }))).some((t) => /בדיוק שני סטוריז של דיבור/.test(t)));

  const withEmpty = good.map((s, i) => (i === 1 ? { n: 2 } : s));
  assert.ok(checkSequence(withEmpty).some((t) => /סטורי 2 ריק/.test(t)));

  const noSmall = good.map((s, i) => (i === good.length - 1 ? { ...s, small: '' } : s));
  assert.ok(checkSequence(noSmall).some((t) => /חסרה השורה הקטנה/.test(t)));
});

test('תופס אורך לא תקין, וקלט שבור לא מפיל', () => {
  assert.ok(checkSequence(good.slice(0, 3)).some((t) => /צריך 5 עד 6/.test(t)));
  assert.ok(checkSequence([...good, { n: 7, text: 'עוד' }]).some((t) => /צריך 5 עד 6/.test(t)));
  assert.ok(checkSequence(null).length > 0);
});

/* ========== השרת והמסך ========== */

test('השרת חוסם לפי מייל לפני כל קריאה ל-AI', () => {
  const fn = server.slice(server.indexOf('exports.breakdownStorySequence'));
  const body = fn.slice(0, fn.indexOf('\n);'));
  assert.match(body, /email !== 'mayakislev@gmail\.com'/);
  assert.ok(body.indexOf('mayakislev@gmail.com') < body.indexOf('buildStorySequencePrompt'));
});

test('השרת מבקש תיקון כשכלל הופר, ולוקח את השנייה רק אם היא טובה יותר', () => {
  const fn = server.slice(server.indexOf('exports.breakdownStorySequence'));
  const body = fn.slice(0, fn.indexOf('\n);'));
  assert.match(body, /checkSequence\(stories\)/);
  assert.match(body, /checkSequence\(secondStories\)\.length < problems\.length/);
});

test('הגבול הועלה, וחיתוך מזוהה במקום להיראות כמו JSON שבור', () => {
  const fn = server.slice(server.indexOf('exports.breakdownStorySequence'));
  const body = fn.slice(0, fn.indexOf('\n);'));
  assert.match(body, /max_tokens: 8000/);
  assert.match(body, /stop_reason === 'max_tokens'/);
  assert.match(body, /callAndParse\(attempt \+ 1, shorter\)/);
  assert.match(body, /הרצף יצא ארוך מדי ונחתך/);
});

test('הבלוק אינו קיים ב-HTML', () => {
  for (const id of ['sq-box', 'sq-topic', 'sq-go']) {
    assert.ok(!html.includes(`id="${id}"`), `${id} לא אמור להיות ב-index.html`);
  }
  assert.ok(src.includes("box.id = 'sq-box'"), 'נבנה בקוד בלבד');
});

test('שדה ריק לא מצייר שורה ריקה, וטקסט לא יכול להזריק HTML', () => {
  assert.match(src, /replace\(\/&\/g, '&amp;'\)/);
  for (const guard of ['if (format)', 'if (asset)', 'if (speech)', 'if (text)', 'if (small)', 'if (poll.question)', 'if (note)']) {
    assert.ok(src.includes(guard), `חסר תנאי: ${guard}`);
  }
});

test('יש גבול זמן לפירוק', () => {
  assert.match(src, /AbortController/);
  assert.match(src, /AbortError/);
  assert.match(src, /BUDGET_MS/);
});
