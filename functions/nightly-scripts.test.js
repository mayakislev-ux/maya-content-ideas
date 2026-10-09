/* בדיקות לשער האיכות של מפעל התוכן.
 *
 * כל מקרה כאן הוא תקלה אמיתית שראיתי בתוצרים של 09/10/2026, ולא
 * המצאה תיאורטית. בלי הבדיקות האלה הכלל חוזר להיות בקשה בפרומפט,
 * ובקשה בפרומפט נשברת.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { parseScript, rejectReason, pickReferences } = require('./nightly-scripts');

const HOOK = 'את יודעת שכמות העוקבים שלך מספרת בדיוק למה אין לך לידים?';
const good = {
  mechanism: 'מיון הצופה לקטגוריה לפי נתון מדיד, ואז אבחנה קצרה לכל קטגוריה.',
  hook: HOOK,
  script: HOOK + '\n' + 'ש'.repeat(400),
  production: 'טוק ישר למצלמה, עם כל טווח כטקסט גדול על המסך.',
};

test('תוצר תקין עובר', () => {
  assert.strictEqual(rejectReason(good), null);
});

test('קו מפריד ארוך נפסל, גם כשהוא רק בתסריט', () => {
  const r = rejectReason({ ...good, script: HOOK + ' שורה אחת — שורה שנייה' + 'ש'.repeat(400) });
  assert.strictEqual(r, 'קו מפריד ארוך');
});

test('גם המקף הבינוני נפסל', () => {
  const r = rejectReason({ ...good, hook: 'הוק – עם מקף' });
  assert.strictEqual(r, 'קו מפריד ארוך');
});

test('קו מפריד בהנגשה או במנגנון נפסל גם הוא', () => {
  assert.strictEqual(rejectReason({ ...good, production: 'א — ב' }), 'קו מפריד ארוך');
  assert.strictEqual(rejectReason({ ...good, mechanism: 'א — ב' }), 'קו מפריד ארוך');
});

test('תסריט קצר נפסל, כי מתמלול דל יצא תסריט של 269 תווים', () => {
  const r = rejectReason({ ...good, script: HOOK + 'ש'.repeat(200) });
  assert.match(r, /תסריט קצר מדי/);
});

test('חסר הוק או חסר תסריט נפסל', () => {
  assert.strictEqual(rejectReason({ ...good, hook: '' }), 'אין הוק');
  assert.strictEqual(rejectReason({ ...good, script: '' }), 'אין תסריט');
});

test('שדות חסרים לגמרי לא מפילים את השער', () => {
  assert.strictEqual(rejectReason({ hook: 'א', script: 'א' + 'ש'.repeat(400) }), null);
});

test('תשובת "לא מתאים" מזוהה ולא מפורקת לשדות', () => {
  const p = parseScript('לא מתאים: המנגנון הוא פרסומת לטיפול ואין לו מקבילה אמיתית');
  assert.strictEqual(p.unfit, 'המנגנון הוא פרסומת לטיפול ואין לו מקבילה אמיתית');
  assert.strictEqual(p.script, undefined);
});

test('"לא מתאים" בלי סיבה עדיין נחשב פסילה', () => {
  assert.ok(parseScript('לא מתאים:').unfit);
});

test('תוצר במבנה המלא מפורק לארבעת החלקים', () => {
  const raw = [
    'מנגנון: שאלה שהצופה עונה עליה בראש',
    'הוק: את מוציאה תוכן ולא קורה כלום',
    'תסריט:',
    'שורה ראשונה',
    'שורה שנייה',
    'הנגשה: טלפון ביד, בלי קאטים',
  ].join('\n');
  const p = parseScript(raw);
  assert.strictEqual(p.mechanism, 'שאלה שהצופה עונה עליה בראש');
  assert.strictEqual(p.hook, 'את מוציאה תוכן ולא קורה כלום');
  assert.strictEqual(p.script, 'שורה ראשונה\nשורה שנייה');
  assert.strictEqual(p.production, 'טלפון ביד, בלי קאטים');
});

/* 10/10/2026: תסריט אחד נפתח ב"ורגע, תתכונני", כלומר באמצע מחשבה,
   בזמן שההוק נשאר רק בשדה שלו ולא נאמר בסרטון. */
test('תסריט שלא נפתח בהוק נפסל', () => {
  const r = rejectReason({ ...good, script: 'ורגע, תתכונני: ' + 'ש'.repeat(400) });
  assert.strictEqual(r, 'התסריט לא נפתח בהוק');
});

test('הוק בפתיחה עם פיסוק שונה עדיין עובר', () => {
  const r = rejectReason({ ...good, script: HOOK.replace('?', '!') + ' ' + 'ש'.repeat(400) });
  assert.strictEqual(r, null);
});

test('בלי הוק בכלל לא נבדקת הפתיחה אלא נופל על חוסר ההוק', () => {
  assert.strictEqual(rejectReason({ ...good, hook: '' }), 'אין הוק');
});

/* 10/10/2026: הפרסור הקודם דרש בדיוק "תווית:" בדיוק בסדר הזה, ולכן תוצר
   תקין עם כוכביות או עם מקף חזר כ"אין הוק" או כתסריט בן 39 תווים. */
test('תוויות עם כוכביות מפורקות נכון', () => {
  const raw = [
    '**מנגנון:** שאלה שהצופה עונה עליה בראש',
    '**הוק:** את מוציאה תוכן ולא קורה כלום',
    '**תסריט:**',
    'גוף התסריט',
    '**הנגשה:** טלפון ביד',
  ].join('\n');
  const p = parseScript(raw);
  assert.strictEqual(p.hook, 'את מוציאה תוכן ולא קורה כלום');
  assert.strictEqual(p.script, 'גוף התסריט');
  assert.strictEqual(p.production, 'טלפון ביד');
});

test('תווית עם מקף במקום נקודתיים מפורקת נכון', () => {
  const raw = 'מנגנון - א\nהוק - ב\nתסריט -\nגוף\nהנגשה - ג';
  const p = parseScript(raw);
  assert.strictEqual(p.hook, 'ב');
  assert.strictEqual(p.script, 'גוף');
});

test('סדר תוויות שונה לא שובר את הפרסור', () => {
  const raw = 'הוק: ההוק\nמנגנון: המנגנון\nתסריט:\nגוף התסריט\nהנגשה: ההנגשה';
  const p = parseScript(raw);
  assert.strictEqual(p.hook, 'ההוק');
  assert.strictEqual(p.mechanism, 'המנגנון');
  assert.strictEqual(p.script, 'גוף התסריט');
});

test('תווית חסרה לא גוררת את התסריט לשדה אחר', () => {
  const p = parseScript('הוק: ההוק\nתסריט:\nשורה\nעוד שורה');
  assert.strictEqual(p.script, 'שורה\nעוד שורה');
  assert.strictEqual(p.production, '');
});

test('המילה הנגשה בתוך התסריט לא נחשבת תווית', () => {
  const p = parseScript('הוק: ההוק\nתסריט:\nדיברנו על הנגשה של תוכן\nהנגשה: ההנגשה');
  assert.strictEqual(p.script, 'דיברנו על הנגשה של תוכן');
  assert.strictEqual(p.production, 'ההנגשה');
});

test('"לא מתאים" עם כוכביות מזוהה', () => {
  assert.ok(parseScript('**לא מתאים:** המנגנון דורש סיפור אינטימי').unfit);
});

/* סלבה ושרה ביקשו שלא יצוינו סכומים שלהן. זאת בקשה של לקוחה, ולכן
   היא נבדקת בקוד ולא נשארת בקשה בפרומפט. */
test('סכום כספי ליד סלבה נפסל', () => {
  const r = rejectReason({ ...good, script: HOOK + ' סלבה עלתה ל-45,000 שקל בחודש. ' + 'ש'.repeat(400) });
  assert.strictEqual(r, 'סכום כספי ליד סלבה');
});

test('סכום כספי ליד שרה נפסל, גם בסימן שקל', () => {
  const r = rejectReason({ ...good, script: HOOK + ' שרה הגיעה ל₪ 50000 בחודש. ' + 'ש'.repeat(400) });
  assert.strictEqual(r, 'סכום כספי ליד שרה');
});

/* 10/10/2026: שלושה תסריטים אמיתיים הבטיחו נכס שלא קיים. אם מאיה
   מצלמת את זה היא נשארת עם הבטחה שאינה יכולה לקיים. */
test('הבטחת שיעור חינמי נפסלת', () => {
  const r = rejectReason({ ...good, script: HOOK + ' יש לי שיעור חינמי שבו אני מסבירה. ' + 'ש'.repeat(400) });
  assert.strictEqual(r, 'מבטיח נכס שלא קיים');
});

test('"כתבי מילה בתגובות ואני אשלח לך את זה בחינם" נפסל', () => {
  const r = rejectReason({ ...good, script: HOOK + ' כתבי בתגובות "לידים" ואני אשלח לך את זה בחינם. ' + 'ש'.repeat(400) });
  assert.strictEqual(r, 'מבטיח נכס שלא קיים');
});

test('הבטחת מדריך חינמי נפסלת גם בלשון נקבה', () => {
  const r = rejectReason({ ...good, script: HOOK + ' הכנתי סדנה חינמית בשבילך. ' + 'ש'.repeat(400) });
  assert.strictEqual(r, 'מבטיח נכס שלא קיים');
});

test('הפניה לשאלון האבחון או לעקיבה עוברת', () => {
  const ok1 = rejectReason({ ...good, script: HOOK + ' שאלון האבחון מחכה בפרופיל. ' + 'ש'.repeat(400) });
  const ok2 = rejectReason({ ...good, script: HOOK + ' אם את רוצה עוד על תמחור, תעקבי אחריי. ' + 'ש'.repeat(400) });
  assert.strictEqual(ok1, null);
  assert.strictEqual(ok2, null);
});

/* 10/10/2026: תסריט אמיתי כתב "מ-15 אלף ל-45 אלף שקל בחודש", והביטוי
   הראשון שלי דרש מספר צמוד למילה שקל, ולכן לא תפס את זה בכלל. */
test('סכום בנוסח "45 אלף שקל" ליד שרה נפסל', () => {
  const r = rejectReason({ ...good, script: HOOK + ' שרה עברה ל-45 אלף שקל בחודש. ' + 'ש'.repeat(400) });
  assert.strictEqual(r, 'סכום כספי ליד שרה');
});

test('סכום בנוסח מיליון ליד סלבה נפסל', () => {
  const r = rejectReason({ ...good, script: HOOK + ' סלבה הגיעה למיליון שקל. ' + 'ש'.repeat(400) });
  assert.strictEqual(r, 'סכום כספי ליד סלבה');
});

test('סלבה בלי סכום עוברת', () => {
  const r = rejectReason({ ...good, script: HOOK + ' סלבה עלתה מ-2,830 עוקבים ל-4,593 עוקבים. ' + 'ש'.repeat(400) });
  assert.strictEqual(r, null);
});

test('סכום של רון עובר, כי אצלה זה מותר', () => {
  const r = rejectReason({ ...good, script: HOOK + ' רון עלתה מ-15,000 ל-45,000 שקל בחודש. ' + 'ש'.repeat(400) });
  assert.strictEqual(r, null);
});

/* 10/10/2026, מהביקורת: כאן הייתה בדיקה שקיבעה את פרצת 220 התווים
   כהתנהגות רצויה. הכלל האמיתי הוא "לא באותה פסקה", ולכן זה נבדק לפי
   פסקאות: סכום של רון בפסקה אחרת מותר, באותה פסקה כשסלבה מוזכרת לא. */
test('סכום של לקוחה אחרת, בפסקה אחרת, מותר', () => {
  const far = HOOK + ' סלבה עלתה ל-4,593 עוקבים.' + String.fromCharCode(10)
    + 'ורון הגיעה ל-45,000 שקל. ' + 'ש'.repeat(400);
  assert.strictEqual(rejectReason({ ...good, script: far }), null);
});

test('סכום באותה פסקה שבה סלבה מוזכרת נפסל', () => {
  const near = HOOK + ' סלבה עלתה, ורון הגיעה ל-45,000 שקל. ' + 'ש'.repeat(400);
  assert.strictEqual(rejectReason({ ...good, script: near }), 'סכום כספי ליד סלבה');
});

/* חמש הדליפות שאומתו בביקורת, כל אחת בנוסח שבו תסריט אמיתי כותב סכום. */
test('סכום צמוד להופעה השנייה של השם נפסל', () => {
  const t = HOOK + ' שרה היא לקוחה שלי. ושרה עברה ל-50,000 שקל בחודש. ' + 'ש'.repeat(400);
  assert.strictEqual(rejectReason({ ...good, script: t }), 'סכום כספי ליד שרה');
});

test('"45 אלף" בלי המילה שקל נפסל', () => {
  const t = HOOK + ' שרה עברה מ-15 אלף ל-45 אלף בחודש. ' + 'ש'.repeat(400);
  assert.strictEqual(rejectReason({ ...good, script: t }), 'סכום כספי ליד שרה');
});

test('"50K" נפסל', () => {
  const t = HOOK + ' שרה הגיעה ל-50K בחודש. ' + 'ש'.repeat(400);
  assert.strictEqual(rejectReason({ ...good, script: t }), 'סכום כספי ליד שרה');
});

test('המילה הכנסה עם מספר נפסלת, גם בלי מטבע', () => {
  const t = HOOK + ' ההכנסה של שרה הוכפלה פי חמש ל-50,000 בחודש. ' + 'ש'.repeat(400);
  assert.strictEqual(rejectReason({ ...good, script: t }), 'סכום כספי ליד שרה');
});

/* 10/10/2026, מהביקורת: indexOf תפס את "שרה" בתוך מילים עבריות תמימות,
   ודווקא יחד עם הסכומים שמופיעים בבנק העובדות ומותרים במפורש. */
test('מילים שמכילות את "שרה" לא פוסלות סכום מותר', () => {
  for (const word of ['לקוחה התקשרה ואמרה שהוציאה 100,000 שקל על קורסים',
    'היא אישרה לי לספר שעלתה ל-45,000 שקל',
    'הכשרה שעלתה 30,000 שקל',
    'זו פשרה של 2,000 שקל בחודש']) {
    const t = HOOK + ' ' + word + '. ' + 'ש'.repeat(400);
    assert.strictEqual(rejectReason({ ...good, script: t }), null, word);
  }
});

/* הבחירה: מקור דל הפיק תסריט דל, ולכן יש רצפה לאורך התמלול. */
const asDoc = (id, text, extra) => ({ id, data: () => ({ translationHe: text, url: 'https://x.test/' + id, ...extra }) });

test('רפרנס עם תמלול קצר לא נבחר בכלל', () => {
  const picked = pickReferences([asDoc('a', 'ש'.repeat(290))], new Set(), 5);
  assert.strictEqual(picked.length, 0);
});

test('רפרנס ששוכפל או שנפסל לא נבחר שוב', () => {
  const docs = [asDoc('a', 'ש'.repeat(900)), asDoc('b', 'ש'.repeat(900))];
  const picked = pickReferences(docs, new Set(['a']), 5);
  assert.deepStrictEqual(picked.map((p) => p.id), ['b']);
});

test('תמלול בלי תרגום נחשב גם הוא', () => {
  const docs = [{ id: 'x', data: () => ({ transcriptHe: 'ש'.repeat(700), url: 'https://x.test/x' }) }];
  assert.strictEqual(pickReferences(docs, new Set(), 2).length, 1);
});

/* 10/10/2026, מהביקורת: הפורטל דורש refUrl ודוחה בלעדיו, ולכן רפרנס בלי
   כתובת שילם על קריאה ל-Anthropic ולא הגיע לשום מקום. */
test('רפרנס בלי כתובת לא נבחר בכלל', () => {
  const docs = [{ id: 'x', data: () => ({ translationHe: 'ש'.repeat(900) }) }];
  assert.strictEqual(pickReferences(docs, new Set(), 2).length, 0);
});

/* 10/10/2026, מהביקורת: הבדיקה הקודמת כאן ("מקור עשיר נבחר לפני מקור על
   הגבול") עברה רק כי 'rich' קודם ל-'thin' אלפביתית, ותיעדה התנהגות שלא
   קיימת. האורך הוא רצפה, והסדר נקבע לפי תחום. */
test('תחום עסקי קודם לתחום של סיפור חיים', () => {
  const docs = [
    asDoc('a', 'ש'.repeat(900), { domain: 'בריאות נפשית, טיפול ורוח' }),
    asDoc('b', 'ש'.repeat(900), { domain: 'עסקים ויזמות' }),
  ];
  assert.deepStrictEqual(pickReferences(docs, new Set(), 2).map((p) => p.id), ['b', 'a']);
});

/* 10/10/2026, מהביקורת: הערבוב היומי היה (a.id + seed < b.id + seed),
   כלומר שרשור אותה סיומת לשני הצדדים, שלא משנה את ההשוואה בכלל. זה היה
   מיון אלפביתי טהור, ואותם רפרנסים חזרו לראש התור כל לילה. */
test('יום אחר נותן סדר אחר', () => {
  const docs = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => asDoc(id, 'ש'.repeat(900)));
  const day1 = pickReferences(docs, new Set(), 8, { seed: '2026-10-10' }).map((p) => p.id);
  const day2 = pickReferences(docs, new Set(), 8, { seed: '2027-03-14' }).map((p) => p.id);
  assert.notDeepStrictEqual(day1, day2);
  assert.deepStrictEqual([...day1].sort(), [...day2].sort());
});

test('אותו יום נותן אותו סדר בדיוק', () => {
  const docs = ['a', 'b', 'c', 'd'].map((id) => asDoc(id, 'ש'.repeat(900)));
  const once = pickReferences(docs, new Set(), 4, { seed: '2026-10-10' }).map((p) => p.id);
  const twice = pickReferences(docs, new Set(), 4, { seed: '2026-10-10' }).map((p) => p.id);
  assert.deepStrictEqual(once, twice);
});

/* 10/10/2026, מהביקורת: ה-GUARD מתיר במפורש לשכפל דיאלוג, ואז השורה
   הראשונה היא "מאיה: " ואחריה ההוק. בלי זה כל רפרנס שהוא דיאלוג היה
   נפסל פעמיים ומבזבז שתי קריאות. */
test('קידומת של שם דובר לפני ההוק מותרת', () => {
  const r = rejectReason({ ...good, script: 'מאיה: ' + HOOK + ' ' + 'ש'.repeat(400) });
  assert.strictEqual(r, null);
});

/* 10/10/2026, מהביקורת: שורה כמו "לא מתאים לך הפורמט" בתוך גוף התסריט
   נקראה כפסק דין, התסריט נזרק והרפרנס נחסם לצמיתות. */
test('"לא מתאים" בתוך גוף התסריט אינו פסק דין', () => {
  const raw = [
    'מנגנון: שאלה שהצופה עונה עליה בראש',
    'הוק: ' + HOOK,
    'תסריט:',
    HOOK,
    'ואם לא מתאים לך הפורמט הזה, תעשי אותו אחרת.',
    'הנגשה: טלפון ביד',
  ].join(String.fromCharCode(10));
  const p = parseScript(raw);
  assert.strictEqual(p.unfit, undefined);
  assert.ok(p.script.includes('לא מתאים לך הפורמט'));
});

test('"לא מתאים" כשורה ראשונה כן פוסל', () => {
  assert.ok(parseScript('לא מתאים: המנגנון דורש סיפור אינטימי').unfit);
});
