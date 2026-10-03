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
  { n: 1, job: 'MIRROR', format: 'שקופית טקסט', text: 'אתם מעלים סרטון.\n87,000 צפיות.\nהבא, 4,200.' },
  { n: 2, job: 'TENSION', format: 'שקופית טקסט', text: 'אז מתחילים לנחש:\nאולי ההוק?\nאולי השעה?' },
  { n: 3, job: 'COST', format: 'דיבור למצלמה', speech: 'תחשבו מה זה אומר בפועל: חודש אחד אלפיים עוקבים, וחודש אחרי כלום.' },
  { n: 4, job: 'ROOT', format: 'שקופית טקסט', text: 'מצלמים ← עורכים ← מעלים\nגם אחרי 50, מתחילים מאפס ב-51.' },
  { n: 5, job: 'REFRAME', format: 'דיבור למצלמה', speech: 'אתם פשוט לא יודעים מה גרם למישהו לעצור.' },
  { n: 6, job: 'LANDING', format: 'שקופית טקסט מינימלית', text: 'הבעיה היא לא שסרטון אחד הצליח.', small: 'מה שלא יודעים להסביר,\nלא יודעים לשחזר.' },
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

test('תופס קלישאה שהיא פוסלת, לפי תדירות', () => {
  /* 03/10/2026 (בדיקה): הכלל שלה הוא תדירות, "אם הם מופיעים הרבה", ולכן
     מופע אחד עובר ושניים נופלים. 'ופה בדיוק' הוסר מהרשימה לגמרי, כי הוא
     מופיע בדוגמת הזהב שלה עצמה ("ופה בדיוק הטעות"). */
  const oneCliche = good.map((s, i) => (i === 3 ? { ...s, text: 'בעולם של היום כולם מצלמים' } : s));
  assert.deepEqual(checkSequence(oneCliche, head), [], 'מופע אחד עוד נסבל');

  const cliche = good.map((s, i) => (
    i === 3 ? { ...s, text: 'בעולם של היום כולם מצלמים' }
      : i === 1 ? { ...s, text: 'בואו נדבר על מה שקורה באמת' } : s));
  assert.ok(checkSequence(cliche, head).some((t) => /שפה אוטומטית/.test(t)));

  const ok = good.map((s, i) => (i === 3 ? { ...s, text: 'ופה בדיוק הטעות שלכם' } : s));
  assert.deepEqual(checkSequence(ok, head), [], 'ופה בדיוק הוא ניסוח שלה, לא קלישאה');
});

/* 03/10/2026 (בדיקה): הרשימה פסלה ארבעה מתוך שבעת הרצפים שמאיה כתבה, כי
   הערכים הקצרים שבה הם הניסוח המובן מאליו לנושאים האלה. עכשיו יש פתח
   יציאה: משפט שהגיע מהנושא או מההקשר שהיא כתבה אינו העתקה. */

/* 03/10/2026 (בדיקה): מה שהכריע את רשימת ההעתקה הוא השאלה מה מתוכה נמצא
   בכלל בפרומפט שהמודל מקבל. ארבעה מחמישה המשפטים לא היו שם, כלומר הוא לא
   יכול היה להעתיק אותם, והם פסלו ארבעה מתוך שבעת הרצפים של מאיה עצמה.
   החמישי כן נמסר, ולכן נוסחה מחדש שורת הפרומפט שמסרה אותו, ואז גם הוא
   נשאר בלי מה לשמור עליו. הרשימה ריקה בכוונה, עם המנגנון. */

test('אין איסור על משפט שהמודל לא רואה בפרומפט', () => {
  const promptNow = buildStorySequencePrompt({ topic: 'x', context: '', cta: '', assets: [] });
  const gone = [
    'ממומן הוא מגבר', 'איכות הפקה לא מפצה', 'כנראה שהקהל שלי פשוט לא מגיב',
    'מופנמות היא אופי', 'הייתי 4 חודשים בסוכנות',
  ];
  for (const sentence of gone) {
    assert.ok(!promptNow.includes(sentence), `${sentence} אינו בפרומפט, ולכן אין מה לאסור`);
    const seq = good.map((s, i) => (i === 3 ? { ...s, text: sentence } : s));
    assert.deepEqual(checkSequence(seq, head), [], sentence);
  }
});

test('מנגנון ההעתקה נשאר, עם פתח למשפט שהגיע מהנושא שלה', () => {
  const sp = readFileSync(new URL('../functions/story-sequence-prompt.js', import.meta.url), 'utf8');
  assert.match(sp, /const BORROWED = \[\];/, 'ריקה בכוונה, לא מוסרת');
  assert.match(sp, /BORROWED\.find\(\(t\) => whole\.includes\(t\) && !supplied\.includes\(t\)\)/);
});

/* 03/10/2026 (בדיקה): סתירה בפרומפט עצמו. בלוק המבנים מסר למודל שעה
   מדויקת כהמחשה של שיקוף טוב, ובלוק החשיבה אוסר שעה מדויקת כספציפיות
   מומצאת, ולכן מודל שחיקה את ההמחשה שקיבל נדחה ושילם תשעים שניות. */

test('הפרומפט לא מוסר שעה מדויקת כהמחשה, והכלל נגדה נשאר', () => {
  const promptNow = buildStorySequencePrompt({ topic: 'x', context: '', cta: '', assets: [] });
  /* שעה מדויקת מותרת בפרומפט רק בתוך האיסור עצמו. אסור שהיא תופיע בבלוק
     המבנים, שהוא מה שהמודל מחקה. */
  const structures = promptNow.slice(promptNow.indexOf('## המבנים'));
  const block = structures.slice(0, structures.indexOf('\n# '));
  assert.ok(block.length > 500, 'נמצא בלוק המבנים');
  assert.ok(!/\b\d{1,2}:\d{2}\b/.test(block), 'אין שעה מדויקת בהמחשות');
  assert.match(promptNow, /שעה כמו/, 'והאיסור עצמו נשאר');

  const clock = [
    { n: 1, job: 'MIRROR', format: 'טקסט', text: '11:37. נזכרתם שלא העליתם כלום.' },
    { n: 2, job: 'LANDING', format: 'טקסט', text: 'מסר', small: 'ש' },
  ];
  assert.ok(
    checkSequence(clock, { ...head, goal: 'מודעות לבעיה' }).some((t) => /ספציפיות שלא ניתנה/.test(t))
  );
});

test('הוכחה חוזרת מוגבלת בתקרה, לא בפטור', () => {
  const wall = (n) => {
    const rows = Array.from({ length: n }, (_, i) => ({
      n: i + 1, job: 'PROOF', format: 'צילום מסך', text: `הוכחה שונה מספר ${i + 1}`,
    }));
    rows.push({ n: n + 1, job: 'LANDING', format: 'טקסט', text: 'מסר', small: 'ש' });
    return rows;
  };
  assert.deepEqual(checkSequence(wall(3), { ...head, goal: 'סמכות' }), [], 'שלוש הוכחות סבירות');
  assert.ok(
    checkSequence(wall(6), { ...head, goal: 'סמכות' }).some((t) => /PROOF מופיע 6 פעמים/.test(t)),
    'שש הן אותו תפקיד שחוזר, גם כשהמטרה היא להוכיח'
  );
  assert.ok(
    checkSequence(wall(3), { ...head, goal: 'בידול' }).some((t) => /אותו תפקיד שחוזר/.test(t)),
    'במטרה אחרת התקרה נשארת שתיים'
  );
});

test('שתי אופציות זהות אינן סקר', () => {
  const same = good.map((s, i) => (
    i === 2 ? { ...s, poll: { question: '', a: 'מוכר לי', b: 'מוכר לי' } } : s));
  assert.ok(checkSequence(same, head).some((t) => /זהות/.test(t)));
});

test('תופס יותר מדי דיבורים, שניים ברצף, סטורי ריק ואורך לא תקין', () => {
  const threeHeads = good.map((s, i) => (i === 1 ? { ...s, text: '', speech: 'עוד דיבור' } : s));
  assert.ok(checkSequence(threeHeads, head).some((t) => /מותר עד שני דיבורים/.test(t)));

  const inRow = good.map((s, i) => (i === 3 ? { ...s, text: '', speech: 'דיבור' } : s));
  assert.ok(checkSequence(inRow, head).some((t) => /שני דיבורים למצלמה ברצף/.test(t)));

  /* 03/10/2026 (בדיקה): הבדיקה שהייתה כאן, "סטורי N ריק", לא יכלה לרוץ
     אף פעם: המפרק מסנן סטורי בלי טקסט ובלי דיבור לפני שהוא מגיע לכאן.
     מה שכן יכול לחסר, והיא צריכה אותו כדי לצלם, הוא הפורמט. */
  const noFormat = good.map((s) => ({ ...s, format: '' }));
  assert.ok(checkSequence(noFormat, head).some((t) => /אין פורמט לאף סטורי/.test(t)));

  const longSpeech = good.map((s, i) => (
    i === 2 ? { ...s, speech: Array.from({ length: 130 }, () => 'מילה').join(' ') } : s));
  assert.ok(checkSequence(longSpeech, head).some((t) => /מונולוג ארוך/.test(t)));

  assert.ok(checkSequence([good[0]], head).some((t) => /בין 2 ל-7/.test(t)));
  assert.ok(checkSequence([...good, ...good], head).some((t) => /בין 2 ל-7/.test(t)));
  assert.ok(checkSequence(null, head).length > 0, 'קלט שבור לא מפיל');
});

test('רצף קצר של שניים הוא תקין, כי האורך הוא המינימלי שמספיק', () => {
  const short = [
    { n: 1, job: 'HOOK', format: 'שקופית טקסט', text: 'אתם שולחים הצעת מחיר ואז שקט.' },
    { n: 2, job: 'LANDING', format: 'שקופית טקסט', text: 'הצעה היא לא מסמך סגור.', small: 'היא פתח לשיחה.' },
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
    { n: 1, job: 'HOOK', format: 'דיבור למצלמה', text: 'אולי זו דעה לא פופולרית: זו טעות מקצועית.' },
    { n: 2, job: 'LANDING', format: 'שקופית טקסט', text: 'מסר', small: 'א\nב' },
  ];
  for (const goal of ['ביקורת מקצועית', 'שריפת גשר', 'סמכות', 'מכירה']) {
    assert.deepEqual(checkSequence(stance, { goal, a: 'x', b: 'y', why: 'כי זה הכיוון' }), [], goal);
  }
  const singular = [
    { n: 1, job: 'MIRROR', format: 'שקופית טקסט', text: 'הסברת את התהליך. ענית על כל שאלה.' },
    { n: 2, job: 'LANDING', format: 'שקופית טקסט', text: 'מסר', small: 'א\nב' },
  ];
  for (const goal of ['חוק השתקפות', 'מודעות לבעיה']) {
    assert.ok(
      checkSequence(singular, { goal, a: 'x', b: 'y', why: 'כי זה הכיוון' }).some((t) => /אינו פונה ב"אתם"/.test(t)),
      goal
    );
  }
});

/* 03/10/2026 (בדיקה): ‎\b ב-JS מוגדר מול אותיות אנגליות, ולכן שלוש מתוך
   שבע האפשרויות בכלל הפנייה ברבים היו קוד מת ולא התאימו בשום קלט. פנייה
   דרך הטיית פועל, בלי כינוי גוף, נדחתה בטעות ועלתה תשעים שניות המתנה. */

test('פנייה ברבים נתפסת גם דרך הטיית פועל, בלי המילה אתם', () => {
  const verbsOnly = [
    { n: 1, job: 'MIRROR', format: 'שקופית טקסט', text: 'גוללים בפיד. עוצרים על רילס. ממשיכים.' },
    { n: 2, job: 'COST', format: 'דיבור למצלמה', speech: 'וזה חוזר כל יום' },
    { n: 3, job: 'ROOT', format: 'שקופית טקסט', text: 'ואז מגיע יום שבו אין רעיון' },
    { n: 4, job: 'LANDING', format: 'שקופית טקסט', text: 'מסר', small: 'שורה' },
  ];
  assert.deepEqual(
    checkSequence(verbsOnly, { goal: 'מודעות לבעיה', a: 'x', b: 'y', why: 'ז' }),
    [],
    'קניתם, גוללים, תוצאות: כולם פנייה ברבים'
  );
});

/* ========== הכללים שהתווספו אחרי שהרצפים של מאיה נבדקו מול הבודק ========== */

test('WHY חובה, כמו שהפרומפט מצהיר', () => {
  const { why, ...noWhy } = head;
  assert.ok(checkSequence(good, noWhy).some((t) => /חסר WHY/.test(t)));
});

test('הנחיתה היא אחת, לא שתיים', () => {
  const twoLandings = good.map((s, i) => (i === 0 ? { ...s, job: 'LANDING' } : s));
  assert.ok(checkSequence(twoLandings, head).some((t) => /הנחיתה היא אחת/.test(t)));
});

/* 02/10/2026 (מאיה) על רצף שנכשל: "אמר את כל הטיעון כבר בסטורי הראשון ואז
   חזר עליו חמש פעמים". 03/10/2026 (בדיקה): זה לא נבדק בכלל, ושש שקופיות
   עם אותו משפט בדיוק עברו נקי. */

test('שקופית שחוזרת על מה שכבר נאמר נתפסת', () => {
  const same = { n: 1, job: 'MIRROR', format: 'טקסט', text: 'אתם מעלים סרטון אחד והוא עושה המון צפיות' };
  const repeat = [
    same,
    { ...same, n: 2, job: 'TENSION' },
    { n: 3, job: 'LANDING', format: 'טקסט', text: 'מסר אחר לגמרי', small: 'שורה' },
  ];
  assert.ok(checkSequence(repeat, head).some((t) => /חוזר על מה שכבר נאמר/.test(t)));
  assert.deepEqual(checkSequence(good, head), [], 'הרצף שלה לא נתפס כחזרתי');
});

test('אותו תפקיד שחוזר שלוש פעמים אינו הסלמה', () => {
  const flat = [
    { n: 1, job: 'TENSION', format: 'טקסט', text: 'אתם מנחשים מה עבד' },
    { n: 2, job: 'TENSION', format: 'טקסט', text: 'ואז בודקים את השעה שהעליתם' },
    { n: 3, job: 'TENSION', format: 'טקסט', text: 'ומשנים את ההוק בלי לדעת למה' },
    { n: 4, job: 'LANDING', format: 'טקסט', text: 'מסר', small: 'שורה' },
  ];
  assert.ok(checkSequence(flat, { ...head, goal: 'חוק השתקפות' }).some((t) => /אותו תפקיד שחוזר/.test(t)));
});

/* 02/10/2026 (מאיה), הטיוטה שפסלה: "חסר פה ה'אז מה?'... המחיר האמיתי הוא
   שאין להם שליטה על הצמיחה שלהם". ההבדל בינה לגרסה שאישרה הוא ש-SOLUTION
   הוחלף ב-REFRAME, ומודעות לבעיה לא פותרת בתוך עצמה. */

test('מודעות לבעיה לא נגמרת בפתרון או בהצעה', () => {
  const solving = good.map((s, i) => (i === 4 ? { ...s, job: 'SOLUTION' } : s));
  assert.ok(checkSequence(solving, head).some((t) => /אין מקום ל-SOLUTION/.test(t)));
  assert.deepEqual(
    checkSequence(solving, { ...head, goal: 'מודעות לפתרון' }),
    [],
    'באותו רצף בדיוק, כמודעות לפתרון, הפתרון הוא המקום הנכון'
  );
});

test('מטרה דורשת את הפעימה שמגדירה אותה, מארבעה סטוריז ומעלה', () => {
  const noMirror = good.map((s, i) => (i === 0 ? { ...s, job: 'HOOK' } : s));
  assert.ok(
    checkSequence(noMirror, { ...head, goal: 'חוק השתקפות' }).some((t) => /צריך לפחות 1 MIRROR/.test(t))
  );
  const two = [
    { n: 1, job: 'HOOK', format: 'טקסט', text: 'אתם מעלים ואף אחד לא מגיב' },
    { n: 2, job: 'LANDING', format: 'טקסט', text: 'מסר', small: 'שורה' },
  ];
  assert.deepEqual(
    checkSequence(two, { ...head, goal: 'חוק השתקפות' }),
    [],
    'רצף של שניים הוא המינימלי שמספיק, ואי אפשר לדרוש ממנו כל פעימה'
  );
});

/* 02/10/2026 (מאיה): "שתי האופציות חייבות להיות אמיתיות, אסור 'רוצים
   להצליח? כן / ברור'. ולא לפתוח כל רצף בסקר". 03/10/2026 (בדיקה): אף אחד
   משני הכללים לא נאכף, ורצף ששלח בדיוק את הסקר האסור עבר נקי. */

test('סקר עצלן נתפס, וסקר בלי שאלה הוא תקין לגמרי', () => {
  const lazy = good.map((s, i) => (
    i === 2 ? { ...s, poll: { question: 'רוצים להצליח?', a: 'כן', b: 'ברור' } } : s));
  assert.ok(checkSequence(lazy, head).some((t) => /שתי דרכים להגיד כן/.test(t)));

  const partial = good.map((s, i) => (i === 2 ? { ...s, poll: { question: 'מה מתוכם?', a: 'זה' } } : s));
  assert.ok(checkSequence(partial, head).some((t) => /חסרה אופציה/.test(t)));

  /* 03/10/2026 (בדיקה): זאת הרגרסיה הכי יקרה שהכנסתי. מפרט הפלט הוא
     "@poll אפשרות | אפשרות", בלי שדה לשאלה בכלל, והמפרק מחזיר אז
     question: ''. הדרישה שלי לשאלה הפכה כל רצף עם סקר לדחייה, שעולה
     תשעים שניות על קריאה מתקנת שאין לה בכלל שדה לתקן בו. */
  const noQuestion = good.map((s, i) => (
    i === 2 ? { ...s, poll: { question: '', a: 'מוכר לי מדי', b: 'דווקא לא' } } : s));
  assert.deepEqual(checkSequence(noQuestion, head), [], 'סקר דו-אופציונלי בלי שאלה הוא הפורמט עצמו');

  /* ושלוש מדוגמאות הזהב שלה פותחות בסקר, ובאחת מהן הוא כלי הזיהוי. */
  const first = good.map((s, i) => (
    i === 0 ? { ...s, poll: { question: '', a: 'כל הזמן', b: 'פחות' } } : s));
  assert.deepEqual(checkSequence(first, head), [], 'סקר בסטורי 1 אינו פגם');

  const fine = good.map((s, i) => (
    i === 2 ? { ...s, poll: { question: 'מה עוצר אתכם?', a: 'אין רעיונות', b: 'אין זמן' } } : s));
  assert.deepEqual(checkSequence(fine, head), [], 'סקר עם שאלה עובר גם הוא');
});

test('הוכחה שחוזרת שלוש פעמים לגיטימית כשזאת מטרת הרצף', () => {
  const proofs = [
    { n: 1, job: 'HOOK', format: 'טקסט', text: 'אתם שואלים אם זה בכלל עובד' },
    { n: 2, job: 'PROOF', format: 'צילום מסך', text: 'תוצאה ראשונה' },
    { n: 3, job: 'PROOF', format: 'צילום מסך', text: 'ועוד אחת מתחום אחר' },
    { n: 4, job: 'PROOF', format: 'צילום מסך', text: 'ואחת מלפני שבוע' },
    { n: 5, job: 'LANDING', format: 'טקסט', text: 'מסר', small: 'שורה' },
  ];
  assert.deepEqual(checkSequence(proofs, { ...head, goal: 'הוכחה' }), [], 'במטרת הוכחה זה המבנה');
  assert.ok(
    checkSequence(proofs, { ...head, goal: 'בידול' }).some((t) => /אותו תפקיד שחוזר/.test(t)),
    'במטרה אחרת זאת שטיחות'
  );
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
});

/* 03/10/2026 (בדיקה): הטסט שהיה כאן נעל בדיוק את הבאג. הוא דרש שהמונה
   ידלג על פעימה שבה שורת המצב מכילה "חושבת" או "מתקנת", וההודעה הזאת
   מגיעה מהשרת בשניות הראשונות ואף פעם לא נמחקת. בפועל הטיימר שהיא ביקשה
   קפא בשנייה השנייה ונשאר קפוא 95 שניות, וההודעה של "לוקח בערך שתי דקות"
   לא יכלה להופיע אף פעם. */

/** מועתק מהמקור, כי הוא חי בתוך מאזין שדורש DOM */
function statusLine(phase, sec) {
  return sec > 90
    ? `${phase}... ${sec} שניות. רצף שלם לוקח בערך שתי דקות`
    : `${phase}... ${sec} שניות`;
}

test('השניות ממשיכות לזוז גם כששלב החשיבה מוצג', () => {
  assert.equal(statusLine('מפרקת', 2), 'מפרקת... 2 שניות');
  assert.equal(statusLine('חושבת על הכיוון השיווקי', 42), 'חושבת על הכיוון השיווקי... 42 שניות');
  assert.equal(
    statusLine('חושבת על הכיוון השיווקי', 97),
    'חושבת על הכיוון השיווקי... 97 שניות. רצף שלם לוקח בערך שתי דקות',
    'ההודעה המרגיעה חייבת להופיע גם בזמן חשיבה, אחרת היא לא מופיעה אף פעם'
  );
  assert.equal(statusLine('מתקנת את הרצף', 150), 'מתקנת את הרצף... 150 שניות. רצף שלם לוקח בערך שתי דקות');
});

test('השלב והשניות הם שני דברים נפרדים, ואין יציאה מוקדמת מהמונה', () => {
  assert.ok(!/if \(\/חושבת\|מתקנת\/\.test\(status\.textContent\)\) return;/.test(src),
    'היציאה המוקדמת היא מה שהקפיא את הטיימר');
  assert.match(src, /let phase = 'מפרקת';/);
  assert.match(src, /const tick = setInterval\(paintStatus, 1000\);/);
  assert.match(src, /phase = 'חושבת על הכיוון השיווקי'; paintStatus\(\);/);
  assert.match(src, /phase = 'מתקנת את הרצף'; paintStatus\(\);/);
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

/* ========== 03/10/2026, מה שסוכני הבדיקה מצאו בצד המסך ========== */

test('שגיאה לא מוחקת סטוריז שכבר הופיעו', () => {
  const fn = src.slice(src.indexOf("el('sq-go').addEventListener"));
  assert.match(fn, /out\.querySelector\('\.sq-card'\)/, 'בודקים אם יש כרטיסים לפני שמחליפים את התוכן');
  assert.match(fn, /insertAdjacentHTML\(\s*'afterbegin'/, 'ההודעה נכנסת מעליהם ולא במקומם');
});

test('הודעה שאינה בעברית היא הודעה של הדפדפן ולא מגיעה למסך', () => {
  const fn = src.slice(src.indexOf("el('sq-go').addEventListener"));
  assert.match(fn, /\/\[\\u0590-\\u05FF\]\/\.test\(raw\)/);
  assert.match(fn, /ours \? raw : 'משהו השתבש, נסו שוב בבקשה\.'/);
});

test('תשובה בלי סטוריז לא נשמרת ולא מציעה להעתיק', () => {
  const fn = src.slice(src.indexOf("el('sq-go').addEventListener"));
  const save = fn.indexOf('saveSequence(topic, result)');
  const guard = fn.indexOf('Array.isArray(result.stories) && result.stories.length');
  assert.ok(guard > -1, 'יש בדיקה שיש סטוריז');
  assert.ok(guard < save, 'והיא קודמת לשמירה');
  const copy = fn.indexOf("el('sq-copy').hidden = false");
  assert.ok(guard < copy, 'וגם לכפתור ההעתקה');
});

test('רשימת הרצפים שלא נטענה אומרת את זה, ולא נעלמת', () => {
  const fn = src.slice(src.indexOf('async function refreshSaved'));
  const body = fn.slice(0, fn.indexOf('\n  }'));
  assert.match(body, /לא הצלחנו לטעון את הרצפים השמורים/);
  assert.ok(!/console\.error\('listSequences failed:', err\);\s*box\.hidden = true;/.test(body),
    'הסתרה בלי הודעה נראית כמו שאין רצפים בכלל');
});

/* 03/10/2026 (בדיקה): שתי הפונקציות האלה async, ונקראו בלי await ובלי
   catch, ולכן כל שגיאה בתוכן הפכה ל-unhandled rejection בלי שורה בקונסולה
   ששני הפאנלים של מאיה פשוט לא הופיעו בלי הסבר. */

test('הפאנלים של מאיה לא נופלים בשקט', () => {
  const table = readFileSync(new URL('../js/story-table.js', import.meta.url), 'utf8');
  assert.match(table, /function wireOwnerPanels\(\)/);
  assert.match(table, /wireStoryAssets\(\)\.catch/);
  assert.match(table, /wireStorySequence\(\)\.catch/);
  assert.ok(!/^\s+wireStoryAssets\(\);$/m.test(table), 'אין קריאה בלי catch');
  assert.ok(!/^\s+wireStorySequence\(\);$/m.test(table), 'אין קריאה בלי catch');
});

/* 03/10/2026 (בדיקה): השרת מחזיר סיבה בעברית לכל מצב "לא מוכן", ואף אחת
   מהן לא הגיעה למסך. לקוחה לחצה "לרענן את הקובץ" ולא קרה כלום. */

test('הסיבה שהקובץ לא מוכן מגיעה למסך של הלקוחה', () => {
  const table = readFileSync(new URL('../js/story-table.js', import.meta.url), 'utf8');
  const fn = table.slice(table.indexOf('async function runSync'));
  assert.match(fn.slice(0, 1200), /if \(res\.message\) showStatus\(res\.message, true\);/);

  const server = readFileSync(new URL('../functions/story-table.js', import.meta.url), 'utf8');
  for (const reason of ['no-sheet', 'no-access']) {
    assert.ok(server.includes(reason), reason);
  }
});

/* 03/10/2026 (בדיקה): כאן הושווה מערך מקוצץ מול שורה לא מקוצצת, ולכן שורה
   אחרונה עם רווח בהתחלה החזירה -1 והשורה החזקה נעלמה מהתצוגה. */

/** מועתק מהמקור, שמייבא SDK מהרשת */
function splitPunch(text) {
  const all = String(text).split(/\r?\n/);
  let body = text;
  let punch = '';
  if (all.length > 1) {
    let lastIdx = -1;
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].trim()) { lastIdx = i; break; }
    }
    if (lastIdx > 0) {
      punch = all[lastIdx];
      body = all.slice(0, lastIdx).join('\n');
    }
  }
  return { body, punch };
}

test('השורה האחרונה בתצוגת המותג לא נעלמת, גם עם רווח בהתחלה', () => {
  assert.deepEqual(splitPunch('שורה 1\n   השורה האחרונה'), { body: 'שורה 1', punch: '   השורה האחרונה' });
  assert.deepEqual(splitPunch('שורה 1\nשורה 2'), { body: 'שורה 1', punch: 'שורה 2' });
  assert.deepEqual(splitPunch('רק שורה אחת'), { body: 'רק שורה אחת', punch: '' });
  assert.equal(splitPunch('שורה 1\nשורה 2\n').punch, 'שורה 2', 'שורה ריקה בסוף אינה השורה החזקה');

  const brand = readFileSync(new URL('../js/story-brand.js', import.meta.url), 'utf8');
  assert.ok(!/lastIndexOf\(all\.filter/.test(brand), 'ההשוואה השבורה הוסרה');
});

/* ========== 03/10/2026, השאריות ========== */

/* הסוגר של ההערה שלפני callAndParse אבד בשכתוב, ובלוק התיעוד שמתחת נבלע
   לתוכה. התחביר עבר ושום קוד לא אבד, אבל מחיקה או הזזה של בלוק התיעוד
   הייתה משאירה סימן פתיחה תלוי ומעלימה בשקט את כל שאר ה-handler. */

test('כל הערה בקובץ השרת נסגרת בעצמה', () => {
  let depth = 0;
  let i = 0;
  let line = 1;
  while (i < server.length) {
    if (server[i] === '\n') line += 1;
    if (server.startsWith('/*', i)) {
      assert.equal(depth, 0, `הערה נפתחת בתוך הערה, שורה ${line}`);
      depth = 1;
      i += 2;
      continue;
    }
    if (server.startsWith('*/', i)) { depth = 0; i += 2; continue; }
    i += 1;
  }
  assert.equal(depth, 0, 'יש הערה שלא נסגרה');
  assert.match(server, /להתקצר\./, 'המשפט שנקטע הושלם');
});

test('השרת מפסיק לעבוד כשהלקוחה סגרה את הקריאה', () => {
  const fn = server.slice(server.indexOf('exports.breakdownStorySequence'));
  assert.match(fn, /req\.on\('close', \(\) => \{ clientGone = true; \}\);/);
  assert.match(fn, /if \(clientGone\) throw new Error/);
});

test('אירוע זרימה שנופל לא נעלם בשקט, בשני הצדדים', () => {
  for (const [name, code] of [['שרת', server], ['לקוחה', src]]) {
    assert.ok(!/catch \{ continue; \}/.test(code), `${name}: אין בליעה שקטה`);
    assert.match(code, /bad SSE event/, name);
  }
});

/* רצף שנשמר בדיוק עכשיו, שהחותמת שלו עוד לא חזרה מהשרת, קיבל 0 וצנח
   לתחתית הרשימה. זה הפוך מ"האחרון תמיד למעלה", כי הוא החדש מכולם. */

/** מועתק מהמקור, שמייבא SDK מהרשת */
function newestFirstCopy(rows) {
  const at = (r) => {
    const c = r && r.createdAt;
    if (!c) return Number.MAX_SAFE_INTEGER;
    if (typeof c.toDate === 'function') return c.toDate().getTime();
    if (c.seconds) return c.seconds * 1000;
    return new Date(c).getTime() || 0;
  };
  return [...(rows || [])].sort((a2, b2) => at(b2) - at(a2));
}

test('רצף שהחותמת שלו עוד לא חזרה נמצא למעלה, לא למטה', () => {
  const rows = [
    { id: 'old', createdAt: { seconds: 1000 } },
    { id: 'new', createdAt: { seconds: 9000 } },
    { id: 'justnow', createdAt: null },
  ];
  assert.deepEqual(newestFirstCopy(rows).map((r) => r.id), ['justnow', 'new', 'old']);
  assert.match(src, /if \(!c\) return Number\.MAX_SAFE_INTEGER;/, 'והמקור מתנהג כך');
});

test('שם שמגיע מאסימון ההתחברות לא שובר את רשימת הלקוחות', () => {
  const table = readFileSync(new URL('../js/story-table.js', import.meta.url), 'utf8');
  assert.match(table, /escapeHtml\(r\.name\)/);
  assert.match(table, /escapeHtml\(r\.uid\)/);
  assert.match(table, /import \{ wireStorySequence, escapeHtml \}/);
});

test('ה-bucket שרשום כברירת מחדל הוא זה שקיים בפרויקט', () => {
  const init = readFileSync(new URL('../js/firebase-init.js', import.meta.url), 'utf8');
  const assets = readFileSync(new URL('../js/story-assets.js', import.meta.url), 'utf8');
  assert.match(init, /storageBucket: 'content-ideas-becd7-story-assets'/);
  assert.ok(!init.includes('content-ideas-becd7.firebasestorage.app'), 'ה-bucket הזה לא קיים בפרויקט');
  assert.match(assets, /gs:\/\/content-ideas-becd7-story-assets/, 'והתיקייה ממשיכה לציין אותו במפורש');
});

test('המטמון לא שומר תשובה שגויה, וכתיבה שנכשלת לא נעלמת', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /if \(!response \|\| !response\.ok\) return;/, 'תשובה שגויה לא נשמרת');
  assert.match(sw, /event\.waitUntil\(/);
  assert.match(sw, /cache put failed/);
  assert.ok(!/caches\.open\(CACHE_NAME\)\.then\(\(cache\) => cache\.put\(event\.request, copy\)\);/.test(sw),
    'אין יותר כתיבה בלי catch');
});

test('ההבטחות ב-app.js מוגנות', () => {
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /loadAdminModules\(\)[\s\S]{0,2000}?\}\)\.catch\(/);
  assert.match(app, /adminModulesWired = false;/, 'כישלון מאפשר ניסיון נוסף');
  assert.match(app, /tourDone = await hasCompletedTour\(\);/);
  assert.match(app, /console\.error\('hasCompletedTour failed:'/);
});
