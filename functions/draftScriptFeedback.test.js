const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPrompt, _internal } = require('./draftScriptFeedback');

const { METHOD, VOICE, ESCALATE, REVISION, REFERENCE_RULE } = _internal;

/**
 * 10/10/2026 (מאיה): "שהכל בשפה שלי במילים שלי בשיטה שלי".
 *
 * השיטה חולצה מ-98 פידבקים אמיתיים שלה ואושרה על ידה. הבדיקות כאן
 * שומרות שהיא לא תישחק בעריכות עתידיות.
 */

const block = {
  title: 'תסריט 2',
  idea: 'אם המדריכת ציפורניים שלך עושה את זה תברחי',
  videoType: 'בעל ערך',
  format: 'דיבור למצלמה',
  cta: 'מעורבות הצופה 25% מהתוכן',
  body: 'א'.repeat(400),
};

test('שמונת שלבי הבדיקה נמצאים, לפי הסדר', () => {
  const steps = ['הוק ורפרנס', 'הרפרנס מתאים לקהל', 'קהל היעד שהוגדר',
    'שוכפל הרעיון', 'נאמן למנגנון', 'חוק הספציפיות', 'אורך ושומן', 'הערת ביצוע'];
  let at = -1;
  steps.forEach((s) => {
    const i = METHOD.indexOf(s);
    assert.ok(i > -1, `השלב "${s}" נעלם מהשיטה`);
    assert.ok(i > at, `השלב "${s}" יצא מהסדר`);
    at = i;
  });
});

test('והכלל שלא מתקנים למטה כשמשהו שבור למעלה', () => {
  /* זה הדבר הכי בולט בפידבקים שלה, ובלעדיו הסוכן ידייק ניסוחים
     בתסריט שצריך רפרנס אחר לגמרי */
  assert.match(METHOD, /עוצרים בשלב הראשון שנכשל/);
  assert.match(METHOD, /להחליף רפרנס, לא לתקן תסריט/);
});

test('ושכפול הרעיון ולא המילים מסומן ככלל המרכזי', () => {
  assert.match(METHOD, /הכלל המרכזי/);
});

test('הקול שלה: שבח בפתיחה, "הייתי" ולא "תעשי", ובלי מקף ארוך', () => {
  assert.match(VOICE, /שבח אמיתי/);
  assert.match(VOICE, /כ"הייתי\.\.\." ולא כ"תעשי"/);
  assert.match(VOICE, /בלי מקף ארוך/);
  assert.ok(!VOICE.includes('—'), 'יש מקף ארוך בהוראות על הקול');
  assert.ok(!METHOD.includes('—'), 'יש מקף ארוך בשיטה');
});

test('שתי ההכרעות ששייכות למאיה מסומנות ולא מומצאות', () => {
  assert.match(ESCALATE, /קהל היעד כשהלקוחה מתלבטת/);
  assert.match(ESCALATE, /סיפור החיים/);
  assert.match(ESCALATE, /צריך אותך:/);
});

test('הפרומפט נושא את כל הקשר התסריט, ולא רק את הטקסט', () => {
  const p = buildPrompt({ block, history: [] });
  ['רעיון התסריט', 'סוג הסרטון', 'פורמט', 'הנעה לפעולה'].forEach((k) => {
    assert.ok(p.includes(k), `${k} חסר בפרומפט`);
  });
  assert.ok(p.includes(block.idea));
  assert.ok(p.includes(block.videoType));
});

test('פידבקים קודמים לאותה לקוחה נכנסים, כי שם הקול האמיתי', () => {
  const p = buildPrompt({
    block,
    history: [{ feedback: 'ב'.repeat(200) }, { feedback: 'ג'.repeat(200) }],
  });
  assert.ok(p.includes('פידבק קודם 1'));
  assert.ok(p.includes('פידבק קודם 2'));
});

test('ופידבק קצר מדי אינו דוגמה', () => {
  const p = buildPrompt({ block, history: [{ feedback: 'אלופה!' }] });
  assert.ok(!p.includes('פידבק קודם 1'), 'שארית קצרה נכנסה כדוגמה');
});

test('ובלי היסטוריה הפרומפט עדיין תקין', () => {
  const p = buildPrompt({ block });
  /* הכלל על הרפרנס מזכיר "פידבק קודם", ולכן הבדיקה היא על הבלוק עצמו */
  assert.ok(!p.includes('פידבק קודם 1'));
  assert.ok(p.includes(block.body));
});

test('סרטון בידורי מאושר ולא מבוקר', () => {
  const p = buildPrompt({ block: { ...block, videoType: 'בידורי' }, history: [] });
  assert.match(p, /בידורי/);
  assert.match(p, /לא מבקשת תסריט מראש/);
});

test('ונאמר במפורש שהטיוטה לא נשלחת לאף אחת', () => {
  /* מאיה: "שיבדוק לבד אבל לא ישלח להם" */
  const p = buildPrompt({ block, history: [] });
  assert.match(p, /לא נשלחת לאף אחת/);
  assert.match(p, /מאיה קוראת אותה, עורכת, ושולחת בעצמה/);
});

/* ---------------- סבבים ורפרנס ---------------- */
/**
 * מאיה (10/10/2026, תסריט 5 של לין): "הוא לא שם לב שאנחנו בסבב 2 ויש
 * תיקון והוא לא קרא, והוא לא שם לב שיש רפרנס שהוסיפה". הטיוטה דרשה את
 * התיקון שלין כבר ביצעה, כי הפרומפט נשא רק את גרסה 1.
 */

const rounds = [
  { n: 1, text: 'בנות שמשלמות אלפי שקלים על קורס', feedback: 'הייתי לוקחת את ההוק לכיוון הקורסים'.repeat(4) },
  { n: 2, text: 'מדריכות ציפורניים שמבטיחות שני מפגשים' },
];

test('כל הסבבים נכנסים לפרומפט, והאחרון מסומן כגרסה לבדיקה', () => {
  const p = buildPrompt({ block, rounds });
  assert.ok(p.includes(rounds[0].text), 'הגרסה הקודמת נעלמה, ואין מול מה להשוות');
  assert.ok(p.includes(rounds[1].text), 'הגרסה החדשה לא נכנסה לפרומפט');
  assert.match(p, /סבב 2: זאת הגרסה שצריך לפדבק עליה עכשיו/);
  assert.match(p, /סבב 1: גרסה קודמת, רקע בלבד/);
});

test('והפידבק שמאיה כבר כתבה על הגרסה הקודמת נכנס איתם', () => {
  const p = buildPrompt({ block, rounds });
  assert.ok(p.includes(rounds[0].feedback), 'הפידבק מסבב 1 לא נשלח');
  assert.match(p, /מה שמאיה כתבה על הגרסה הזאת/);
});

test('ונאמר במפורש שאסור לדרוש תיקון שכבר בוצע', () => {
  assert.match(REVISION, /הסבב האחרון הוא הגרסה שמפדבקים עליה/);
  assert.match(REVISION, /לא מבקשים אותו שוב/);
  assert.match(REVISION, /עוברים על הפידבק של הסבב הקודם סעיף סעיף/);
});

test('מספר הסבב נאמר בפרומפט', () => {
  assert.match(buildPrompt({ block, rounds }), /זה סבב 2/);
  assert.match(buildPrompt({ block, history: [] }), /זה סבב 1/);
});

test('סבב בודד אינו ציר, והתסריט מוצג כרגיל', () => {
  const p = buildPrompt({ block, rounds: [{ n: 1, text: 'א'.repeat(300) }] });
  assert.ok(!p.includes('גרסה קודמת, רקע בלבד'));
});

test('הרפרנס שהלקוחה הוסיפה מופיע, ונאמר שאין גישה לצפות בו', () => {
  const p = buildPrompt({ block, rounds, referenceUrl: 'https://vt.tiktok.com/ZSbpNHrut/' });
  assert.ok(p.includes('https://vt.tiktok.com/ZSbpNHrut/'), 'הרפרנס לא נכנס לפרומפט');
  assert.match(p, /אין גישה לצפות בו/);
});

test('ובלי קישור נאמר שלא הוגש, בלי להמציא שיש', () => {
  assert.match(buildPrompt({ block, rounds }), /רפרנס: \(לא הוגש קישור\)/);
});

test('אסור לבקש רפרנס שקיים ואסור לשפוט רפרנס שלא נראה', () => {
  assert.match(REFERENCE_RULE, /אסור לבקש רפרנס ואסור לכתוב שאין רפרנס/);
  assert.match(REFERENCE_RULE, /אסור לקבוע שהרפרנס לא מתאים/);
  assert.match(REFERENCE_RULE, /צריך אותך:/);
});

test('ובלי מקף ארוך גם בכללים החדשים', () => {
  assert.ok(!REVISION.includes('—'), 'מקף ארוך בכלל הסבבים');
  assert.ok(!REFERENCE_RULE.includes('—'), 'מקף ארוך בכלל הרפרנס');
});

test('בלי כוכביות וסימני עיצוב', () => {
  /* 10/10/2026: בהרצה האמיתית על תסריט 5 של לין הטיוטה החזירה
     **ההוק.**, וזה מגיע ככוכביות לפורטל ולוואטסאפ */
  assert.match(VOICE, /בלי כוכביות ובלי סימני עיצוב/);
});

test('הטיוטה לא מבטיחה לחזור אחר כך', () => {
  /* 10/10/2026, תסריט 8 של יעל: הטיוטה כתבה "אני חוזרת אלייך על זה
     ממש בקרוב" במקום לפדבק. מאיה לא מבטיחה המשך בפידבק. */
  assert.match(VOICE, /לא מבטיחה לחזור אחר כך/);
});

test('ו"צריך אותך" היא הכרעה, לא סל שאוסף הערות', () => {
  /* באותה הרצה המציאות האמיתיות (הנעה לפעולה חסרה, קטע שמסביר
     במקום להראות) נדחפו לתוך השורה הזאת ולא הגיעו אל הלקוחה */
  assert.match(ESCALATE, /ולא מקום לאסוף אליו הערות/);
  assert.match(ESCALATE, /נכתב בגוף הטיוטה ללקוחה/);
});
