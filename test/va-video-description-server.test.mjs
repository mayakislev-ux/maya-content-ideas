/* 05/11/2026 (מאיה): writeVideoDescription, הפונקציה בשרת של "✍️ תיאור
   לסרטון". הכללים שלה חייבים להגיע לפרומפט מילה במילה, ומה שחוזר עובר
   ניקוי: בלי האשטגים, בלי קו ארוך. ההרשאה, המכסה והמודל מדומים.

   06/11/2026 (מאיה): "הוא צריך לקחת את התיאור מהתסריט שלי, או מסר שורה
   תחתונה או משפט מסקרן ולהוסיף את ההנעה לפעולה. הוא המציא סתם משהו".
   הבדיקות כאן משתמשות בשני התסריטים האמיתיים שעליהם נכתבו התיאורים הגרועים
   (05/11), ובשורות שהמודל המציא אז, ובודקות שהן לא עוברות יותר. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const vd = require('../functions/video-description.js');
const INDEX = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');

class FakeHttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const AI_SCRIPT = `[יושבת בבית קפה, מציגה לאדם שתי פרסומות]

״תגיד לי רגע, איזו מהפרסומות האלה נראית לך יותר אמינה?״

אתם יושבים, מעצבים מודעה ב-AI, מסתכלים עליה ואומרים לעצמכם: ״וואו, איזה מקצועי זה נראה.״

רק שהבן אדם בצד השני אפילו לא עוצר. הוא רואה עוד פרסומת שנראית כמו AI וממשיך לגלול.

הכי מצחיק שאתם בכלל משלמים כדי שאנשים ידלגו עליכם.

אז די להסתתר מאחורי תמונות AI. תעמדו מול המצלמה, תדברו כמו בני אדם.

ועכשיו תגידו לי, על איזו משתי הפרסומות אתם הייתם עוצרים?`;
const AI_MESSAGE = 'פרסומת ממומנת עם עיצוב של בינה מלאכותית במקום תמונה אמיתית שלך - הורגת אמון במקום לבנות אותו';

const SYSTEM_SCRIPT = `״העסק שלי מכניס מעל 150 אלף שקל בחודש, אני מוציאה 20 אלף על ממומן, והיועצת מכירות שלי כבר מותשת.״

[מרימה מבט למצלמה]

בעלת העסק הזאת הגיעה אליי אחרי שנים שהיא מסתמכת בעיקר על פרסום ממומן.

אבל יודעים מה הרבה יותר קשה?

לשכנע במשך שנים אנשים שלא מכירים אתכם לקנות מכם.

רוצים את הסיסטם שעוזר לי להגיע ל־100 אלף שקל בחודש בלי שיחות מכירה מתישות? כתבו ״סיסטם״ בתגובות.`;

const AUTH = { auth: { uid: 'u1', token: { email: 'a@b.c' } } };

function handlerWith(reply, seen) {
  return vd.createVideoDescriptionHandler({
    HttpsError: FakeHttpsError,
    enforceAllowlist: async () => {},
    enforceRateLimit: async () => {},
    callModel: async (prompt) => { if (seen) seen.push(prompt); return typeof reply === 'function' ? reply(prompt) : reply; },
  });
}

test('הפרומפט: התסריט המלא, המסר, הזווית וההנעה לפעולה מהתסריט, וחוקי "לא להמציא"', () => {
  const input = vd.validateInput({
    script: SYSTEM_SCRIPT, message: 'מספר גבוה בעסק לא מספר את כל הסיפור', idea: 'העסק של הדס',
    angle: 'מיתוס', hook: 'ההוק', ctaType: 'משפך', cta: 'הסיסטם שלי', domain: 'שיווק', audience: 'בעלי עסקים', pronoun: 'את',
    videoType: 'סרטון דיבור',
  }, FakeHttpsError);
  const p = vd.buildVideoDescriptionPrompt(input);
  assert.ok(p.includes(SYSTEM_SCRIPT), 'התסריט המלא לא בפרומפט');
  assert.ok(p.includes(vd.MAYA_RULES));
  assert.ok(p.includes(vd.MAYA_RULES_0611));
  assert.match(p, /המסר \/ השורה התחתונה שלה, במילים שלה: "מספר גבוה בעסק לא מספר את כל הסיפור"/);
  assert.match(p, /הזווית \/ האריזה הקריאייטיבית: "מיתוס"/);
  assert.match(p, /ההנעה לפעולה שכבר כתובה בסוף התסריט \(להעתיק אותה כמו שהיא\): "רוצים את הסיסטם/);
  assert.match(p, /התחום של העסק: שיווק/);
  assert.match(p, /קהל היעד: בעלי עסקים/);
  assert.match(p, /אסור להמציא/);
  assert.match(p, /אסור לנסח מחדש/);
  assert.match(p, /לא לשאול שאלות/);
  assert.match(p, /לא להניח שהקהל נשים/);
  assert.match(p, /בלי האשטגים/);
  /* שתי דוגמאות של "תסריט נכנס, תיאור יוצא" שמעתיקות את השורות שלה */
  assert.match(p, /דוגמה 1[\s\S]*הכי מצחיק שאתם בכלל משלמים[\s\S]*דוגמה 2[\s\S]*לשכנע במשך שנים/);
  assert.doesNotMatch(p, /—/, 'קו ארוך בפרומפט');

  /* בלי תסריט כתוב (מסלול "יש לי רעיון"): עדיין כותבים, מהמסר */
  const noScript = vd.buildVideoDescriptionPrompt(vd.validateInput({ message: 'המסר', ctaType: 'עוקבים' }, FakeHttpsError));
  assert.match(noScript, /אין תסריט כתוב/);
  assert.match(noScript, /עקבו לעוד תוכן כזה/);
});

test('ההנעה לפעולה נלקחת מסוף התסריט, כולל שאלה לקהל', () => {
  assert.match(vd.scriptCta(SYSTEM_SCRIPT), /^רוצים את הסיסטם[\s\S]*כתבו ״סיסטם״ בתגובות\.$/);
  assert.equal(vd.scriptCta(AI_SCRIPT), 'ועכשיו תגידו לי, על איזו משתי הפרסומות אתם הייתם עוצרים?');
  assert.equal(vd.scriptCta('שורה אחת.\nעוד שורה רגילה.'), '');
  assert.deepEqual(vd.spokenLines('[הוראת במה]\n\nשורה\n"ציטוט"'), ['שורה', 'ציטוט']);
});

test('שורה שהמודל המציא נזרקת, ושורה מהתסריט עוברת כמו שהיא', async () => {
  const seen = [];
  /* מה שבאמת נכתב ב-05/11 על התסריט הזה */
  const invented = handlerWith(JSON.stringify({
    opening: 'אתם משלמים כדי שאנשים ידלגו עליכם? בואו נדבר על הפרסומות של AI שמקטילות את האמון במקום לבנות אותו.',
    lines: ['יכול להיות לי 150 אלף בחודש, אבל אני משלמת מחיר כבד.'],
    cta: 'לייק, תגובה או שמירה אם אתם מוכנים לעמוד מול המצלמה באמת.',
    textHooks: ['א', 'ב', 'ג'],
  }), seen);
  const out = await invented({ ...AUTH, data: { script: AI_SCRIPT, message: AI_MESSAGE, ctaType: 'מעורבות' } });
  assert.ok(seen[0].includes(AI_SCRIPT));
  assert.doesNotMatch(out.description, /בואו נדבר|מקטילות|150 אלף|לייק/);
  assert.equal(out.description,
    'פרסומת ממומנת עם עיצוב של בינה מלאכותית במקום תמונה אמיתית שלך, הורגת אמון במקום לבנות אותו\nועכשיו תגידו לי, על איזו משתי הפרסומות אתם הייתם עוצרים?');

  const good = handlerWith(JSON.stringify({
    opening: 'הכי מצחיק שאתם בכלל משלמים כדי שאנשים ידלגו עליכם.',
    lines: ['אז די להסתתר מאחורי תמונות AI. תעמדו מול המצלמה, תדברו כמו בני אדם.'],
    cta: 'ועכשיו תגידו לי, על איזו משתי הפרסומות אתם הייתם עוצרים?',
    textHooks: ['משלמים כדי שידלגו עליכם', 'AI או בן אדם?', 'איזו הייתם עוצרים?'],
  }));
  const ok = await good({ ...AUTH, data: { script: AI_SCRIPT, message: AI_MESSAGE } });
  assert.equal(ok.description, [
    'הכי מצחיק שאתם בכלל משלמים כדי שאנשים ידלגו עליכם.',
    'אז די להסתתר מאחורי תמונות AI. תעמדו מול המצלמה, תדברו כמו בני אדם.',
    'ועכשיו תגידו לי, על איזו משתי הפרסומות אתם הייתם עוצרים?',
  ].join('\n'));
  assert.equal(ok.textHooks.length, 3);
});

test('ההנעה לפעולה: מהתסריט מילה במילה, ובלי הנעה בתסריט לא ממציאים הצעה', async () => {
  const offer = handlerWith('{"opening": "לשכנע במשך שנים אנשים שלא מכירים אתכם לקנות מכם.", "lines": [], "cta": "כתבו מדריך בתגובות ותקבלו 50% הנחה"}');
  const a = await offer({ ...AUTH, data: { script: SYSTEM_SCRIPT } });
  assert.match(a.description, /כתבו ״סיסטם״ בתגובות\.$/);
  assert.doesNotMatch(a.description, /הנחה|מדריך/);

  const noCtaScript = 'הכי חשוב זה להיות עקביים.\nגם כשאין כוח, מעלים סרטון.';
  const b = await offer({ ...AUTH, data: { script: noCtaScript, ctaType: 'עוקבים' } });
  assert.doesNotMatch(b.description, /הנחה|מדריך/, 'הצעה שהומצאה עברה');
  assert.match(b.description, /עקבו לעוד תוכן כזה$/);
});

test('בלי שאלות: גם בלי סוג סרטון ובלי הנעה לפעולה, וגם כשהמודל החזיר זבל, יש תיאור', async () => {
  const junk = handlerWith('סליחה, איזה סוג סרטון זה? ויש הנעה לפעולה?');
  const out = await junk({ ...AUTH, data: { script: SYSTEM_SCRIPT, message: 'מספר גבוה בעסק לא מספר את כל הסיפור' } });
  assert.doesNotMatch(out.description, /\?\s*ויש|איזה סוג/);
  assert.match(out.description, /^מספר גבוה בעסק לא מספר את כל הסיפור\n/);
  assert.match(out.description, /כתבו ״סיסטם״ בתגובות\.$/);
  assert.deepEqual(out.textHooks, []);

  /* רק רעיון, בלי תסריט ובלי מסר */
  const onlyIdea = await junk({ ...AUTH, data: { idea: 'למה תעודה לא מספיקה' } });
  assert.equal(onlyIdea.description, 'למה תעודה לא מספיקה\nמה דעתכם? כתבו לי בתגובות');
});

test('ניקוי: קו ארוך, קו מפריד עם רווחים והאשטגים יוצאים מהתיאור ומההוקים', async () => {
  const script = 'שלוש טעויות — ואיך מתקנים אותן היום.\nהטעות הראשונה – לא לענות לתגובות.';
  const h = handlerWith(JSON.stringify({
    opening: 'שלוש טעויות — ואיך מתקנים אותן היום. #גבות #יופי',
    lines: ['הטעות הראשונה – לא לענות לתגובות.'],
    cta: '',
    textHooks: ['"הוק 1"', 'הוק 2 #תג', 'הוק — 3', 'הוק 4'],
  }));
  const out = await h({ ...AUTH, data: { script } });
  assert.doesNotMatch(out.description, /[—–#]| - /);
  assert.match(out.description, /^שלוש טעויות, ואיך מתקנים אותן היום\.\nהטעות הראשונה, לא לענות לתגובות\./);
  assert.deepEqual(out.textHooks, ['הוק 1', 'הוק 2', 'הוק, 3']);
  assert.equal(vd.sanitize('א - ב'), 'א, ב');
  assert.equal(vd.sanitize('ל־100 אלף ו-AI'), 'ל־100 אלף ו-AI', 'מקף בתוך מילה נמחק');
});

test('הקלט: סוג לא מוכר הופך ל"אחר", שדה ארוך מדי נדחה, ובלי תסריט, רעיון ומסר אין מה לכתוב', () => {
  assert.equal(vd.validateInput({ script: 'x', videoType: 'משהו' }, FakeHttpsError).videoType, 'אחר');
  assert.equal(vd.validateInput({ message: 'מסר בלבד' }, FakeHttpsError).message, 'מסר בלבד');
  assert.throws(() => vd.validateInput({ script: 'x'.repeat(8001) }, FakeHttpsError), (e) => e.code === 'invalid-argument');
  assert.throws(() => vd.validateInput({ cta: 'לעקוב' }, FakeHttpsError), (e) => e.code === 'invalid-argument');
});

test('הפונקציה: התחברות, הרשאה, מכסה ואז המודל, בסדר הזה', async () => {
  const log = [];
  const handler = vd.createVideoDescriptionHandler({
    HttpsError: FakeHttpsError,
    enforceAllowlist: async (email) => { log.push(`allow:${email}`); },
    enforceRateLimit: async (uid) => { log.push(`rate:${uid}`); },
    callModel: async (prompt) => {
      log.push('model');
      assert.match(prompt, /סוג הסרטון: סרטון דיבור/);
      return '{"opening": "הכי חשוב זה להיות עקביים.", "lines": [], "cta": "", "textHooks": ["א", "ב", "ג"]}';
    },
  });
  await assert.rejects(handler({ data: { script: 'x' } }), (e) => e.code === 'unauthenticated');
  const out = await handler({ ...AUTH, data: { script: 'הכי חשוב זה להיות עקביים.', videoType: 'סרטון דיבור' } });
  assert.deepEqual(out, { description: 'הכי חשוב זה להיות עקביים.\nמה דעתכם? כתבו לי בתגובות', textHooks: ['א', 'ב', 'ג'] });
  assert.deepEqual(log, ['allow:a@b.c', 'rate:u1', 'model']);
});

test('index.js מייצא את writeVideoDescription, עם מכסה יומית, פתוח למנוי הרפרנסים, ב-Haiku', () => {
  assert.match(INDEX, /DAILY_LIMITS = \{[\s\S]*?writeVideoDescription: \d+,[\s\S]*?\};/);
  assert.match(INDEX, /exports\.writeVideoDescription = onCall\(\{ secrets: \[anthropicApiKey\]/);
  const block = INDEX.slice(INDEX.indexOf('exports.writeVideoDescription'), INDEX.indexOf('exports.writeVideoDescription') + 900);
  assert.match(block, /enforceAllowlist\(email, \{ allowRefs: true \}\)/);
  assert.match(block, /enforceRateLimit\(uid, 'writeVideoDescription'\)/);
  assert.match(block, /claude-haiku-4-5-20251001/);
});
