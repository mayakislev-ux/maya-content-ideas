const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPrompt, _internal } = require('./draftScriptFeedback');

const { METHOD, VOICE, ESCALATE } = _internal;

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
  assert.ok(!p.includes('פידבק קודם'));
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
