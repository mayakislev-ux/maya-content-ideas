import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildStorySequencePrompt, checkSequence, GOAL_NAMES, SLIDE_JOBS,
} = require('../functions/story-sequence-prompt.js');

const src = readFileSync(new URL('../js/story-sequence.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const server = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
const prompt = buildStorySequencePrompt({ topic: 'נושא' });

/**
 * 02/10/2026: הפרומפט נבנה על ה-STORY STRATEGIST Master Prompt שמאיה מסרה,
 * אחרי שש דוגמאות ושלושה סבבי תיקון שבהם ניסיתי להסיק את המנגנון מהתוצרים
 * שלה והמצאתי כללים שגויים. המסמך שלה שמור ב-
 * .claude/skills/story-sequence-breakdown/references/master-prompt.md
 */

/* ========== הזהות והמשפט המנחה ========== */

test('אסטרטג לפני קופירייטר, והמשפט המנחה', () => {
  assert.match(prompt, /STORY STRATEGIST/);
  assert.match(prompt, /אסטרטג לפני קופירייטר/);
  assert.match(prompt, /איזה שינוי מחשבתי\s*\n?צריך לקרות אצל הצופה/);
  assert.match(prompt, /לא נשמע כמו\s*\n?מצגת, שיעור או AI/);
});

/* ========== A→B ========== */

test('A→B קודם לכתיבה, ובלעדיו הרעיון לא מפוצח', () => {
  assert.match(prompt, /A הוא המודל הנוכחי בראש הקהל/);
  assert.match(prompt, /אם אי אפשר לנסח את השינוי במשפט אחד, הרעיון עדיין לא מפוצח/);
});

test('לא ממציאים הוכחות, כותבים placeholder', () => {
  assert.match(prompt, /אם חסרה עובדה, תוצאה או הוכחה, לא\s*\n?להמציא/);
  assert.match(prompt, /\[כאן להכניס צילום מסך אמיתי/);
});

/* ========== 11 המטרות ועץ ההחלטה ========== */

test('כל אחת עשרה המטרות נמצאות', () => {
  assert.equal(GOAL_NAMES.length, 11);
  for (const goal of GOAL_NAMES) assert.ok(prompt.includes(goal), goal);
});

test('עץ ההחלטה בוחר מטרה לפי איפה הקהל נמצא', () => {
  assert.match(prompt, /עץ ההחלטה/);
  assert.match(prompt, /לא מזהה את עצמו ← חוק השתקפות/);
  assert.match(prompt, /מזהה אבל לא מבין את המחיר ← מודעות לבעיה/);
  assert.match(prompt, /כבר מבין בעיה, פתרון ואמון ← מכירה/);
});

test('לכל מטרה יש מבנה משלה, ולא מבנה אחד לכולן', () => {
  assert.match(prompt, /רגע קונקרטי ← פעולה מוכרת/, 'חוק השתקפות');
  assert.match(prompt, /סימפטום ← אז מה\?/, 'מודעות לבעיה');
  assert.match(prompt, /האמונה ← למה היא מרגישה נכונה/, 'שבירת אמונה');
  assert.match(prompt, /מה הקהל מקווה שהחלופה תעשה/, 'שריפת גשר');
  assert.match(prompt, /Hot take ← ניואנס/, 'ביקורת מקצועית');
});

test('מטרה שנבחרה מראש נכנסת לפרומפט, ואחרת המודל בוחר', () => {
  const picked = buildStorySequencePrompt({ topic: 'נושא', goal: 'שריפת גשר' });
  assert.match(picked, /המטרה נקבעה מראש: \*\*שריפת גשר\*\*/);
  assert.match(prompt, /המטרה לא נקבעה\. לבחור אותה לפי עץ ההחלטה/);
});

/* ========== הכללים שהיא הדגישה ========== */

test('מבחן אז מה, עד מחיר אמיתי ובלי לנפח', () => {
  assert.match(prompt, /אז מה\?/);
  assert.match(prompt, /אל תנפח\s*\n?מחיר מלאכותי/);
});

test('אל תלעג לאמונה, ואל תבנה איש קש', () => {
  assert.match(prompt, /אל תלעג לאמונה/);
  assert.match(prompt, /בדיקת איש הקש/);
  assert.match(prompt, /היה יכול להגיד שהטיעון הוגן/);
});

test('ביקורת מגדירה סטנדרט ולא מלכלכת, והסיפור האישי אינו ההוכחה היחידה', () => {
  assert.match(prompt, /מגדירים סטנדרט ולא מלכלכים על אנשים/);
  assert.match(prompt, /הטיעון צריך לעמוד גם בלעדיו/);
});

test('תפקיד אחד לכל שקופית, ומבחן הסטורי הבא', () => {
  assert.equal(SLIDE_JOBS.length, 12);
  for (const job of SLIDE_JOBS) assert.ok(prompt.includes(job), job);
  assert.match(prompt, /מבחן הסטורי הבא/);
  assert.match(prompt, /לא חייב\s*\n?cliffhanger/);
  assert.match(prompt, /כל שקופית חייבת להוסיף שכבה/);
});

test('פורמט, סקר ואורך', () => {
  assert.match(prompt, /1 עד 2 דיבור למצלמה בלבד/);
  assert.match(prompt, /סקר צריך לבצע עבודה/);
  assert.match(prompt, /רוצים להצליח\? כן \/ ברור/, 'הדוגמה השלילית שלה');
  assert.match(prompt, /מספר הסטוריז המינימלי שמספיק/);
  assert.match(prompt, /CTA אינו חובה/);
});

test('השפה, והקלישאות שהיא פוסלת', () => {
  for (const cliche of ['אם גם אתם', 'האמת היא', 'ופה בדיוק', 'בואו נדבר על', 'בעולם של היום']) {
    assert.ok(prompt.includes(cliche), cliche);
  }
  assert.match(prompt, /הפנייה היא "אתם"/);
  assert.match(prompt, /סצנה בהווה, לא דוח בעבר/);
});

test('האיסורים, כולל העתקה מהדוגמאות', () => {
  assert.match(prompt, /לא להאשים את הקהל/);
  assert.match(prompt, /הדוגמאות בפרומפט הזה מלמדות צורה, לא טקסט/);
  assert.match(prompt, /לא לבלבל בין צפיות, עוקבים, לידים/);
});

test('QA לפני הפלט, עם הבדיקה החשובה ביותר', () => {
  assert.match(prompt, /הבדיקה החשובה ביותר/);
  assert.match(prompt, /או שפשוט הודיעו לו מה לחשוב/);
});

test('תבנית הפלט מבקשת קודם את הכיוון האסטרטגי', () => {
  assert.match(prompt, /@@GOAL/);
  assert.match(prompt, /@@A /);
  assert.match(prompt, /@@B /);
  assert.match(prompt, /@@WHY/);
  assert.match(prompt, /@job </);
  const hard = prompt.slice(prompt.indexOf('כללים קשיחים'));
  assert.match(hard, /בין 2 ל-7 סטוריז/);
  assert.match(hard, /האחרון הוא LANDING/);
});

/* ========== הבדיקה המכנית ========== */

const head = {
  goal: 'מודעות לבעיה',
  a: 'אני לא מספיק יצירתי',
  b: 'אני צריך מערכת שמורידה ממני החלטה יומית',
  why: 'אין להם שליטה על הצמיחה',
};

const good = [
  { n: 1, job: 'MIRROR', text: 'אתם מעלים סרטון.\n87,000 צפיות.\nהבא, 4,200.' },
  { n: 2, job: 'TENSION', text: 'אז מתחילים לנחש:\nאולי ההוק?\nאולי השעה?' },
  { n: 3, job: 'COST', speech: 'תחשבו מה זה אומר בפועל: חודש אחד אלפיים עוקבים, וחודש אחרי כלום.' },
  { n: 4, job: 'ROOT', text: 'מצלמים ← עורכים ← מעלים\nגם אחרי 50, מתחילים מאפס ב-51.' },
  { n: 5, job: 'REFRAME', speech: 'אתם פשוט לא יודעים מה גרם למישהו לעצור.' },
  { n: 6, job: 'LANDING', text: 'הבעיה היא לא שסרטון אחד הצליח.', small: 'מה שלא יודעים להסביר,\nלא יודעים לשחזר.' },
];

test('רצף תקין עובר בלי הערות', () => {
  assert.deepEqual(checkSequence(good, head), []);
});

test('בלי כיוון אסטרטגי הרצף נפסל', () => {
  assert.ok(checkSequence(good, {}).some((t) => /חסרה המטרה/.test(t)));
  assert.ok(checkSequence(good, { goal: 'מודעות לבעיה' }).some((t) => /חסר A/.test(t)));
  assert.ok(checkSequence(good, { goal: 'מודעות לבעיה', a: 'x' }).some((t) => /חסר B/.test(t)));
});

test('מטרה שאינה אחת מ-11 נפסלת', () => {
  assert.ok(checkSequence(good, { ...head, goal: 'משהו אחר' }).some((t) => /אינה אחת מ-11/.test(t)));
});

test('תפקיד שקופית חסר או לא מוכר נתפס, והאחרון חייב להיות LANDING', () => {
  const noJob = good.map((s, i) => (i === 2 ? { ...s, job: '' } : s));
  assert.ok(checkSequence(noJob, head).some((t) => /אין תפקיד/.test(t)));

  const badJob = good.map((s, i) => (i === 2 ? { ...s, job: 'MAGIC' } : s));
  assert.ok(checkSequence(badJob, head).some((t) => /אינו תפקיד שקופית מוכר/.test(t)));

  const noLanding = good.map((s, i) => (i === good.length - 1 ? { ...s, job: 'PROOF' } : s));
  assert.ok(checkSequence(noLanding, head).some((t) => /אינו LANDING/.test(t)));
});

test('תופס את שתי הטעויות שמאיה פסלה בסטורי 1', () => {
  const thirdPerson = [{ ...good[0], text: 'מישהי שהשקיעה אלפי שקלים' }, ...good.slice(1)];
  assert.ok(checkSequence(thirdPerson, head).some((t) => /מכיסא המאבחנת/.test(t)));

  const singular = [{ ...good[0], text: 'הסברת את התהליך.\nענית על כל שאלה.' }, ...good.slice(1)];
  assert.ok(checkSequence(singular, head).some((t) => /אינו פונה ב"אתם"/.test(t)));
});

test('תופס משפט שאול מדוגמה, וקלישאה שהיא פוסלת', () => {
  const borrowed = good.map((s, i) => (i === 3 ? { ...s, text: 'כנראה שהקהל שלי פשוט לא מגיב' } : s));
  assert.ok(checkSequence(borrowed, head).some((t) => /מעתיק משפט מדוגמה/.test(t)));

  const cliche = good.map((s, i) => (i === 3 ? { ...s, text: 'ופה בדיוק הטעות שלכם' } : s));
  assert.ok(checkSequence(cliche, head).some((t) => /שפה אוטומטית/.test(t)));
});

test('תופס יותר מדי דיבורים, שניים ברצף, סטורי ריק ואורך לא תקין', () => {
  const threeHeads = good.map((s, i) => (i === 1 ? { ...s, text: '', speech: 'עוד דיבור' } : s));
  assert.ok(checkSequence(threeHeads, head).some((t) => /מותר עד שני דיבורים/.test(t)));

  const inRow = good.map((s, i) => (i === 3 ? { ...s, text: '', speech: 'דיבור' } : s));
  assert.ok(checkSequence(inRow, head).some((t) => /שני דיבורים למצלמה ברצף/.test(t)));

  const empty = good.map((s, i) => (i === 1 ? { n: 2, job: 'TENSION' } : s));
  assert.ok(checkSequence(empty, head).some((t) => /סטורי 2 ריק/.test(t)));

  assert.ok(checkSequence([good[0]], head).some((t) => /בין 2 ל-7/.test(t)));
  assert.ok(checkSequence([...good, ...good], head).some((t) => /בין 2 ל-7/.test(t)));
  assert.ok(checkSequence(null, head).length > 0, 'קלט שבור לא מפיל');
});

test('רצף קצר של שניים הוא תקין, כי האורך הוא המינימלי שמספיק', () => {
  const short = [
    { n: 1, job: 'HOOK', text: 'אתם שולחים הצעת מחיר ואז שקט.' },
    { n: 2, job: 'LANDING', text: 'הצעה היא לא מסמך סגור.', small: 'היא פתח לשיחה.' },
  ];
  assert.deepEqual(checkSequence(short, head), []);
});

/* ========== השרת והמסך ========== */

test('השרת חוסם לפי מייל לפני כל קריאה ל-AI', () => {
  const fn = server.slice(server.indexOf('exports.breakdownStorySequence'));
  const body = fn.slice(0, fn.indexOf('\n);'));
  assert.match(body, /email !== 'mayakislev@gmail\.com'/);
  assert.ok(body.indexOf('mayakislev@gmail.com') < body.indexOf('buildStorySequencePrompt'));
});

test('השרת מעביר מטרה, בודק מול הכיוון, ומכבד תקציב זמן', () => {
  const fn = server.slice(server.indexOf('exports.breakdownStorySequence'));
  const body = fn.slice(0, fn.indexOf('\n);'));
  assert.match(body, /const goal = String\(/);
  assert.match(body, /checkSequence\(stories, \{ \.\.\.parsed/);
  assert.match(body, /problems\.length && timeLeft\(\) > \d+/);
  assert.match(body, /timeoutSeconds: 300/);
});

test('הדפדפן מחכה יותר מהשרת', () => {
  const clientBudget = Number((src.match(/const BUDGET_MS = (\d+);/) || [])[1]);
  const fn = server.slice(server.indexOf('exports.breakdownStorySequence'));
  const serverBudget = Number((fn.match(/const BUDGET_MS = (\d+);/) || [])[1]);
  assert.ok(clientBudget > serverBudget, `${clientBudget} חייב להיות גדול מ-${serverBudget}`);
});

test('המסך נותן לבחור מטרה, ומראה את הכיוון האסטרטגי', () => {
  assert.match(src, /id="sq-goal"/);
  for (const goal of GOAL_NAMES) assert.ok(src.includes(goal), goal);
  assert.match(src, /export function directionHtml/);
  assert.match(src, /היום הם חושבים:/);
  assert.match(src, /ואחרי זה:/);
  assert.match(src, /sq-job-tag/, 'תפקיד השקופית מוצג');
});

test('הבלוק אינו קיים ב-HTML', () => {
  for (const id of ['sq-box', 'sq-topic', 'sq-go', 'sq-goal']) {
    assert.ok(!html.includes(`id="${id}"`), `${id} לא אמור להיות ב-index.html`);
  }
  assert.ok(src.includes("box.id = 'sq-box'"), 'נבנה בקוד בלבד');
});

test('שדה ריק לא מצויר, וטקסט לא יכול להזריק HTML', () => {
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

/* 02/10/2026 (מאיה): הרצף לקח 175 שניות והיא חיכתה מול מסך ריק. בלוג התברר
   שהקריאה עצמה לקחה 84 שניות, ואז אזעקת שווא שלי גררה קריאה שנייה שלמה:
   הבדיקה דרשה פנייה ב"אתם" בסטורי 1, אבל בביקורת מקצועית סטורי 1 הוא
   ההצהרה שלה ולא הסצנה שלהם. */

test('הדרישה לפנייה ברבים חלה רק על המטרות שבהן סטורי 1 הוא הסצנה שלהם', () => {
  const stance = [
    { n: 1, job: 'HOOK', text: 'אולי זו דעה לא פופולרית: זו טעות מקצועית.' },
    { n: 2, job: 'LANDING', text: 'מסר', small: 'א\nב' },
  ];
  for (const goal of ['ביקורת מקצועית', 'שריפת גשר', 'סמכות', 'מכירה']) {
    assert.deepEqual(checkSequence(stance, { goal, a: 'x', b: 'y' }), [], goal);
  }
  const singular = [
    { n: 1, job: 'MIRROR', text: 'הסברת את התהליך. ענית על כל שאלה.' },
    { n: 2, job: 'LANDING', text: 'מסר', small: 'א\nב' },
  ];
  for (const goal of ['חוק השתקפות', 'מודעות לבעיה']) {
    assert.ok(checkSequence(singular, { goal, a: 'x', b: 'y' }).some((t) => /אינו פונה ב"אתם"/.test(t)), goal);
  }
});

test('השרת מזרים: כיוון אסטרטגי, ואז סטורי אחרי סטורי', () => {
  const fn = server.slice(server.indexOf('exports.breakdownStorySequence'));
  const body = fn.slice(0, fn.indexOf('\n);'));
  assert.match(body, /stream: true/);
  assert.match(body, /direction: \{ goal/, 'הכיוון יוצא ראשון');
  assert.match(body, /\{ story: parsed\.stories\[sentStories\] \}/, 'וכל סטורי בנפרד');
  assert.match(body, /revising: true/, 'וגם כשיש קריאה מתקנת');
});

test('סטורי נשלח רק כשהוא נגמר, ולא חצי סטורי על המסך', () => {
  const fn = server.slice(server.indexOf('exports.breakdownStorySequence'));
  const body = fn.slice(0, fn.indexOf('\n);'));
  assert.match(body, /parsed\.stories\.length - 1/, 'האחרון מוחזק עד שהבא מתחיל');
  assert.match(body, /חצי סטורי על המסך גרוע יותר ממסך ריק/);
});

test('הקריאה המתקנת אינה זורמת, כדי לא לצייר רצף פעמיים', () => {
  const fn = server.slice(server.indexOf('exports.breakdownStorySequence'));
  const body = fn.slice(0, fn.indexOf('\n);'));
  assert.match(body, /callAndParse\(1, '', '', true\)/, 'הראשונה זורמת');
  assert.match(body, /callAndParse\(1, '', retryText\)/, 'והמתקנת לא');
});

test('המסך מצייר תוך כדי, ומחליף בתוצאה המלאה בסוף', () => {
  assert.match(src, /onPartial/);
  assert.match(src, /out\.insertAdjacentHTML\('beforeend'/);
  assert.match(src, /מתקנת את הרצף/);
  const go = src.slice(src.indexOf("el('sq-go').addEventListener"));
  assert.ok(go.indexOf('onPartial') < go.indexOf('sequenceHtml(result, brand)'), 'הציור המלא בא אחרי');
});

/* 02/10/2026, נמדד מול המנוע: 58 שניות מתוך 70 הן חשיבה לפני המילה
   הראשונה, והכתיבה עצמה 11 שניות. ביטול החשיבה מוריד ל-21 שניות אבל פוגע
   באיכות, ולכן החשיבה נשארת ורק מוצגת. */

test('שלב החשיבה מוצג ולא נראה כמסך תקוע', () => {
  const fn = server.slice(server.indexOf('exports.breakdownStorySequence'));
  const body = fn.slice(0, fn.indexOf('\n);'));
  assert.match(body, /event\.delta\.thinking/);
  assert.match(body, /thinking: true/);
  assert.match(body, /58 שניות מתוך 70 הן חשיבה/, 'המדידה תועדה');

  assert.match(src, /חושבת על הכיוון השיווקי/);
  assert.match(src, /חושבת\|מתקנת/, 'מונה השניות לא דורס הודעת מצב אמיתית');
});

/* 02/10/2026 (מאיה): "אם יהיו מלא רצפים זה ייראה עמוס לעין, צריך כמו כפתור
   נפתח עם תאריך, ושתמיד האחרון יהיה למעלה". */

test('הרשימה היא כפתור נפתח, וסגורה כברירת מחדל', () => {
  assert.match(src, /id="sq-saved-toggle"/);
  assert.match(src, /id="sq-saved-list" hidden/);
  assert.match(src, /aria-expanded="false"/);
  assert.match(src, /sq-saved-count/, 'כתוב כמה יש בלי לפתוח');
});

test('בכל שורה נושא, מטרה ותאריך', () => {
  assert.match(src, /export function savedRowHtml/);
  assert.match(src, /sq-saved-topic/);
  assert.match(src, /sq-saved-meta/);
  assert.match(src, /export function whenText/);
});

test('האחרון תמיד למעלה, גם אם השרת החזיר אחרת', () => {
  assert.match(src, /export function newestFirst/);
  assert.match(src, /newestFirst\(await listSequences\(\)\)/);
});

test('בחירת רצף סוגרת את הרשימה', () => {
  const handler = src.slice(src.indexOf("el('sq-saved-list').addEventListener('click'"));
  assert.match(handler.slice(0, 900), /sq-saved-list'\)\.hidden = true/);
  assert.match(handler.slice(0, 900), /הרשימה דוחפת את הרצף למטה/);
});

/* 02/10/2026 (מאיה): "למדת את התחביר של השיטה, אבל עוד לא את החשיבה שלה".
   הפידבק חולק לשלושה רבדים: אסטרטגיה, פורמט, כתיבה. */

test('המסגרת היא כלי עזר ולא טופס למלא', () => {
  assert.match(prompt, /המסגרת היא כלי עזר, לא טופס/);
  assert.match(prompt, /הסלמה לוגית שבה בכל סטורי הקורא מבין משהו/);
  assert.match(prompt, /מה הצופה יודע עכשיו שהוא לא ידע לפני עשר שניות/);
  assert.match(prompt, /בלי פשוט להגיד לו אותה/);
});

test('ארבע הטעויות שהיא מנתה', () => {
  assert.match(prompt, /אל תמציא ספציפיות/);
  assert.match(prompt, /19:42/, 'הדוגמה שלה');
  assert.match(prompt, /אל תקבע סיבתיות שאי אפשר לדעת/);
  assert.match(prompt, /להפעיל "אז מה\?" לפחות פעמיים או/);
  assert.match(prompt, /ROOT צריך להיות רחב ומדויק/);
});

test('בלוק הכתיבה, כולל המבנים שהיא סימנה כ-AI', () => {
  assert.match(prompt, /WRITING STYLE, קריטי/);
  assert.match(prompt, /תפסיק לנסות לייצר punchline בכל שקופית/);
  for (const shape of ['X הוא לא Y, הוא Z', 'הבעיה היא לא X, הבעיה היא Y', 'בלי לשים לב', 'נכנס קול נוסף']) {
    assert.ok(prompt.includes(shape), shape);
  }
  assert.match(prompt, /הודעה קולית לחברה חכמה/);
  assert.match(prompt, /שהצופה יגיע לתובנה במקום שיכריזו עליה/);
  assert.match(prompt, /וזה הקטע/, 'המעברים הטבעיים שהיא נתנה');
});

test('בלוק הפורמט, כולל האיסור על עיצוב ועל תמונה שרירותית', () => {
  assert.match(prompt, /FORMAT SELECTION, קריטי/);
  assert.match(prompt, /אל תחליף פורמטים מכנית רק כדי לייצר גיוון/);
  assert.match(prompt, /למה הדרך הזאת טובה יותר/);
  assert.match(prompt, /רק בגלל שהיא קיימת/);
  assert.match(prompt, /פשוט עדיף על מעוצב/);
  assert.match(prompt, /רקע כהה דרמטי עם טקסט לבן במרכז/, 'הדוגמה השלילית שלה');
});

test('תבנית ה-punchline נתפסת כשהיא חוזרת', () => {
  const rows = [
    { n: 1, job: 'MIRROR', text: 'אתם שולחים מחיר ונעלם.' },
    { n: 2, job: 'ROOT', text: 'ליד בלי הקשר הוא לא ליד חם, הוא ניחוש.' },
    { n: 3, job: 'LANDING', text: 'הבעיה היא לא המחיר. הבעיה היא ההקשר.', small: 'א\nב' },
  ];
  const head = { goal: 'מודעות לבעיה', a: 'x', b: 'y' };
  assert.ok(checkSequence(rows, head).some((t) => /נשמע מיוצר/.test(t)));
});

test('ספציפיות מומצאת נתפסת, אבל לא כשהיא ניתנה', () => {
  const rows = [
    { n: 1, job: 'MIRROR', text: '19:42 מגיעה הודעה.' },
    { n: 2, job: 'TENSION', text: 'ואחרי יומיים V אפור.' },
    { n: 3, job: 'LANDING', text: 'מסר', small: 'א\nב' },
  ];
  const head = { goal: 'מודעות לבעיה', a: 'x', b: 'y' };
  assert.ok(checkSequence(rows, head).some((t) => /ספציפיות שלא ניתנה/.test(t)));
  assert.ok(!checkSequence(rows, { ...head, topic: 'הודעה ב-19:42 ואז V אפור' }).some((t) => /ספציפיות שלא ניתנה/.test(t)));
});

test('השרת מעביר לבדיקה את מה שהיא באמת נתנה', () => {
  const fn = server.slice(server.indexOf('exports.breakdownStorySequence'));
  const body = fn.slice(0, fn.indexOf('\n);'));
  assert.match(body, /checkSequence\(stories, \{ \.\.\.parsed, topic, context \}\)/);
});
