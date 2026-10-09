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

test('סלבה בלי סכום עוברת', () => {
  const r = rejectReason({ ...good, script: HOOK + ' סלבה עלתה מ-2,830 עוקבים ל-4,593 עוקבים. ' + 'ש'.repeat(400) });
  assert.strictEqual(r, null);
});

test('סכום של רון עובר, כי אצלה זה מותר', () => {
  const r = rejectReason({ ...good, script: HOOK + ' רון עלתה מ-15,000 ל-45,000 שקל בחודש. ' + 'ש'.repeat(400) });
  assert.strictEqual(r, null);
});

test('סכום רחוק מהשם לא נפסל בטעות', () => {
  const far = HOOK + ' סלבה עלתה ל-4,593 עוקבים. ' + 'ש'.repeat(500) + ' ורון הגיעה ל-45,000 שקל.';
  assert.strictEqual(rejectReason({ ...good, script: far }), null);
});

/* הבחירה: מקור דל הפיק תסריט דל, ולכן יש רצפה לאורך התמלול. */
const asDoc = (id, text, extra) => ({ id, data: () => ({ translationHe: text, ...extra }) });

test('רפרנס עם תמלול קצר לא נבחר בכלל', () => {
  const picked = pickReferences([asDoc('a', 'ש'.repeat(290))], new Set(), 5);
  assert.strictEqual(picked.length, 0);
});

test('רפרנס ששוכפל או שנפסל לא נבחר שוב', () => {
  const docs = [asDoc('a', 'ש'.repeat(900)), asDoc('b', 'ש'.repeat(900))];
  const picked = pickReferences(docs, new Set(['a']), 5);
  assert.deepStrictEqual(picked.map((p) => p.id), ['b']);
});

test('מקור עשיר נבחר לפני מקור על הגבול', () => {
  const docs = [asDoc('thin', 'ש'.repeat(520)), asDoc('rich', 'ש'.repeat(3000))];
  const picked = pickReferences(docs, new Set(), 2);
  assert.strictEqual(picked[0].id, 'rich');
});

test('תמלול בלי תרגום נחשב גם הוא', () => {
  const docs = [{ id: 'x', data: () => ({ transcriptHe: 'ש'.repeat(700) }) }];
  assert.strictEqual(pickReferences(docs, new Set(), 2).length, 1);
});
