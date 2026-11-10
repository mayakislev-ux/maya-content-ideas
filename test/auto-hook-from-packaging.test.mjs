/* 09/11/2026 (מאיה: "אם באריזה הקריאייטיבית יש בוודאות הוק חזק שיזין את
   ההוק, אבל שיסמן אותו בצהוב ויכתוב שהוא זוהה אוטומטית מהאריזה ... אם לא
   אהבת, גש לפרומפט ... אבל לא בכוח, רק אם קיים וזיהה"). */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { hookFromPackaging } from '../js/video-assistant-content.js';
import { hasJsdom, setupAssistant, store, until, SESSION } from './helpers/va-dom.mjs';

const MAYA = 'ויזואל פתיחה (0-3 שניות): את מחזיקה עוגת שוקולד חמה ומושחתת (או בראוניז), ובלי להסס, לוקחת בקבוק קטשופ ומוזגת פס אדום ומזעזע מלמעלה. את מסתכלת למצלמה בפרצוף לגמרי רציני ושואלת: הוק (קריינות/דיבור):"הייתם אוכלים עוגת שוקולד עם קטשופ?" · סיפור אישי';

describe('זיהוי הוק מתוך האריזה', () => {
  test('האריזה של מאיה: ההוק בדיוק, בלי המירכאות', () => {
    assert.equal(hookFromPackaging(MAYA), 'הייתם אוכלים עוגת שוקולד עם קטשופ?');
  });
  test('מירכאות עבריות ותווית פשוטה', () => {
    assert.equal(hookFromPackaging('הוק: ״אף אחד לא סיפר לך את זה על גבות״'), 'אף אחד לא סיפר לך את זה על גבות');
    assert.equal(hookFromPackaging('ההוק: "3 דברים שלמדתי"'), '3 דברים שלמדתי');
  });
  test('הדגשה, מקף, מירכאות בודדות או « », ומילה עם מירכאה בפנים (צה"ל)', () => {
    assert.equal(hookFromPackaging('**הוק:** "שאלה על צה"ל ומה עוד?"'), 'שאלה על צה"ל ומה עוד?');
    assert.equal(hookFromPackaging("הוק – 'למה את מחכה?'"), 'למה את מחכה?');
    assert.equal(hookFromPackaging('הוק: «שלוש טעויות»'), 'שלוש טעויות');
  });
  test('לא בכוח: בלי תווית "הוק" עם משפט במירכאות אין כלום', () => {
    assert.equal(hookFromPackaging(''), '');
    assert.equal(hookFromPackaging(null), '');
    assert.equal(hookFromPackaging('את מסתכלת למצלמה ושואלת "למה?"'), '', 'שאלה במירכאות בלי תווית הוק');
    assert.equal(hookFromPackaging('פתיחה עם הוק חזק שתופס'), '', 'המילה הוק בלי משפט');
    assert.equal(hookFromPackaging('הוק: נבחר בהמשך'), '', 'בלי מירכאות');
  });
});

describe('מסך מציאת הוק (jsdom)', { skip: hasJsdom ? false : 'jsdom לא מותקן במחשב הזה' }, () => {
  let ui;
  before(async () => { ui = await setupAssistant(); });

  /* 10/11/2026 (מאיה): ההוק מהאריזה הוא הצעה ולא ברירת מחדל */
  test('יש הוק באריזה: התיבה ריקה, כרטיס הצעה, הפרומפט פתוח ובודק אותו, וכפתור לבחור אותו', async () => {
    const { $, open, type } = ui;
    await open({ branch: 'scratch', screen: 'scratch-hook', ideaDescription: 'רעיון', rawDump: 'מגילה', packaging: MAYA }, '#va-scratch-hook-input');
    await until(() => $('#va-auto-hook-note'), 'אין כרטיס הצעה');
    const input = $('#va-scratch-hook-input');
    assert.equal(input.value, '', 'ההוק נכנס לתיבה לבד');
    assert.match($('#va-auto-hook-note').textContent, /באריזה הקריאייטיבית היה הוק מוצע/);
    assert.ok($('#va-auto-hook-note').textContent.includes('הייתם אוכלים עוגת שוקולד עם קטשופ?'));
    assert.equal($('.va-auto-hook-more'), null, 'הפרומפט מקופל');
    const prompt = [...document.querySelectorAll('.va-copy-btn')].map((b) => decodeURIComponent(b.getAttribute('data-copy-text'))).find((p) => p.includes('בנק')) || '';
    assert.ok(prompt.includes('באריזה הקריאייטיבית הוצע ההוק: "הייתם אוכלים עוגת שוקולד עם קטשופ?"'), 'ההוק לא בפרומפט');
    assert.match(prompt, /אם הוא חלש, תכתוב גרסה משופרת שלו/);

    $('#va-scratch-hook-done-btn').click();
    assert.equal(store.get(SESSION).hook ?? null, null, 'המשיכו בלי לבחור הוק');

    $('#va-use-pack-hook').click();
    assert.equal(input.value, 'הייתם אוכלים עוגת שוקולד עם קטשופ?');
    await until(() => input.classList.contains('va-auto-hook'), 'לא מסומן');
    type(input, 'הוק אחר שלי');
    assert.equal(input.classList.contains('va-auto-hook'), false);
    $('#va-use-pack-hook').click();
    $('#va-scratch-hook-done-btn').click();
    await until(() => store.get(SESSION).hook === 'הייתם אוכלים עוגת שוקולד עם קטשופ?', 'ההוק לא נשמר');
  });

  test('אין הוק באריזה: המסך כמו קודם, תיבה ריקה בלי צהוב', async () => {
    const { $, open } = ui;
    await open({ branch: 'scratch', screen: 'scratch-hook', ideaDescription: 'רעיון', rawDump: 'מגילה', packaging: 'את מחזיקה עוגה ומסתכלת למצלמה' }, '#va-scratch-hook-input');
    await until(() => !$('#va-auto-hook-note'), 'המסך הקודם עדיין');
    assert.equal($('#va-scratch-hook-input').value, '');
    assert.equal($('#va-auto-hook-note'), null);
    assert.equal($('.va-auto-hook-more'), null);
    assert.ok($('.va-copy-btn'), 'הפרומפט נעלם');
  });
  test('כבר יש הוק שהיא כתבה: התיבה שלה ולא צהובה', async () => {
    const { $, open } = ui;
    await open({ branch: 'scratch', screen: 'scratch-hook', ideaDescription: 'רעיון', rawDump: 'מגילה', packaging: MAYA, hook: 'ההוק שלי' }, '#va-scratch-hook-input');
    /* המסך הקודם הוא אותו מסך, מחכים שהחדש באמת עלה */
    await until(() => $('#va-scratch-hook-input').value === 'ההוק שלי', 'ההוק שלה לא בתיבה');
    /* 10/11/2026: ההצעה מהאריזה עדיין מוצגת, אבל התיבה שלה ולא צהובה */
    assert.ok($('#va-auto-hook-note'));
    assert.equal($('#va-scratch-hook-input').classList.contains('va-auto-hook'), false);
  });

});
