/* 06/11/2026 (מאיה: "אחרי שמסננים אריזה קריאייטיבית קל להחליט איזה פורמטים
   מתאימים אז אולי שיסמן בכתום מה הוא ממליץ? פשוט מפחדת שיטעה").
   1. המיפוי עצמו: מילים בטקסט האריזה ← פורמטים, בלי בינה מלאכותית.
   2. הזרימה האמיתית ב-jsdom: מדביקים אריזה, ממשיכים, ורואים כתום על
      הפורמטים המתאימים בלבד, כל הפורמטים עדיין שם וכל אחד ניתן לבחירה.
   3. הדוגמאות בפופאפ: טיקטוק מוטמע עם קישור מלא, ודוגמה חסומה ככרטיס. */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { FORMATS, FORMAT_RECOMMEND_WORDS, recommendFormats } from '../js/video-assistant-content.js';
import { hasJsdom, setupAssistant, store, until, SESSION } from './helpers/va-dom.mjs';

describe('המיפוי אריזה ← פורמטים', () => {
  test('כל מפתח הוא פורמט אמיתי, ולכל פורמט יש מילים', () => {
    const names = FORMATS.map((f) => f.name);
    assert.deepEqual(Object.keys(FORMAT_RECOMMEND_WORDS).sort(), [...names].sort());
    for (const n of names) assert.ok(FORMAT_RECOMMEND_WORDS[n].length > 0, n);
  });

  test('מזהה את הפורמט מהמילים בכיוון שנבחר', () => {
    assert.deepEqual(recommendFormats('POV: את הלקוחה שנכנסת לטיפול, משחק תפקידים בין שתי דמויות'), ['משחק תפקידים']);
    assert.deepEqual(recommendFormats('וויס אובר על קטעים מהיום שלי בקליניקה'), ['וויס אובר']);
    assert.deepEqual(recommendFormats('קרוסלה של 7 שקופיות'), ['פוסט קרוסלה']);
    assert.deepEqual(recommendFormats('תגובה לתגובה של עוקבת שכתבה שזה יקר'), ['תגובה לתגובה']);
    assert.deepEqual(recommendFormats('סטיץ׳ לסרטון של מתחרה'), ["סטיץ' (תגובה לסרטון ויראלי)"]);
    assert.deepEqual(recommendFormats('Split screen with a voiceover'), ['וויס אובר', 'מסך חצוי']);
  });

  test('לא ממציא: בלי רמז אין המלצה, ושלילה לא נספרת', () => {
    assert.deepEqual(recommendFormats(''), []);
    assert.deepEqual(recommendFormats(null), []);
    assert.deepEqual(recommendFormats('סתם רעיון כללי על הטעות שכולן עושות'), []);
    assert.deepEqual(recommendFormats('היא מסדרת את השיער ומספרת'), [], '"מסדרת" זה לא "סדרת"');
    assert.deepEqual(recommendFormats('לא מסך ירוק'), []);
    assert.deepEqual(recommendFormats('בלי דיבור למצלמה, רק טקסט על המסך'), ['טקסט דינמי']);
  });
});

describe('הכתום במסך הפורמטים (jsdom)', { skip: hasJsdom ? false : 'jsdom לא מותקן במחשב הזה' }, () => {
  let ui;
  before(async () => { ui = await setupAssistant(); });

  test('אחרי אריזה עם רמז: כתום ותווית רק על המתאימים, וכל השאר נשארים ונבחרים', async () => {
    const { $, $$, open, type } = ui;
    await open({ branch: 'idea', screen: 'creative-packaging', ideaDescription: 'רעיון', ideaTopic: 'נושא', ideaPunchline: 'מסר' }, '#va-packaging-input');
    type($('#va-packaging-input'), 'POV של לקוחה מול מטפלת, דיאלוג קצר עם וויס אובר של המחשבות');
    $('[data-start="סיפור לקוח"]').click();
    $('#va-packaging-done-btn').click();
    await until(() => $$('[data-pick-format]').length, 'מסך הפורמטים');

    const items = $$('.cosmic-accordion-item');
    assert.equal(items.length, FORMATS.length, 'פורמט הוסתר');
    const marked = $$('.cosmic-accordion-item.is-recommended').map((d) => d.dataset.format);
    assert.deepEqual(marked, ['וויס אובר', 'משחק תפקידים']);
    for (const d of $$('.cosmic-accordion-item.is-recommended')) {
      assert.equal(d.querySelector('.cosmic-recommend-tag').textContent, 'מומלץ לאריזה הזו');
    }
    assert.equal($$('.cosmic-recommend-tag').length, 2);
    assert.match($('.cosmic-recommend-hint').textContent, /זו רק הצעה, אפשר לבחור כל פורמט אחר/);
    /* הסדר לא השתנה */
    assert.deepEqual(items.map((d) => d.dataset.format), FORMATS.map((f) => f.name));

    /* בוחרים דווקא פורמט שלא הומלץ, וזה עובד */
    const talk = items.find((d) => d.dataset.format === 'דיבור למצלמה');
    talk.querySelector('[data-pick-format]').click();
    await until(() => $('#va-needs-script-yes-btn'), 'המסך שאחרי בחירת פורמט');
    await until(() => store.get(SESSION).selectedFormat === 'דיבור למצלמה', 'הפורמט שנבחר לא נשמר');
  });

  test('אריזה בלי רמז: אין כתום ואין שורת הסבר', async () => {
    const { $, $$, open } = ui;
    await open({ branch: 'idea', screen: 'format-choice', formatFor: 'idea', ideaDescription: 'רעיון', packaging: 'הטעות שכולן עושות לפני טיפול' }, '[data-pick-format]');
    assert.equal($$('.is-recommended').length, 0);
    assert.equal($('.cosmic-recommend-hint'), null);
  });

  test('דוגמאות: טיקטוק מוטמע עם קישור מלא, ודוגמה חסומה מוצגת ככרטיס עם קישור', async () => {
    const { $, $$, open } = ui;
    await open({ branch: 'idea', screen: 'format-choice', formatFor: 'idea', ideaDescription: 'רעיון', packaging: 'וויס אובר' }, '[data-pick-format]');
    const vo = $$('.cosmic-accordion-item').find((d) => d.dataset.format === 'וויס אובר');
    vo.querySelector('[data-format-examples]').click();
    await until(() => $('.cosmic-examples-stage iframe'), 'הדוגמה הראשונה');
    assert.equal($('.cosmic-examples-stage iframe').getAttribute('src'), 'https://www.tiktok.com/embed/v2/7475764014123977992');
    assert.equal($('.cosmic-examples-stage .cosmic-examples-out').getAttribute('href'), 'https://www.tiktok.com/@talia_clinic/video/7475764014123977992');

    $('[data-example="1"]').click();
    assert.equal($('.cosmic-examples-stage iframe'), null, 'דוגמה חסומה נפתחה כחלון שבור');
    assert.ok($('.cosmic-examples-linkcard'));
    assert.equal($('.cosmic-examples-linkcard a').getAttribute('href'), 'https://www.instagram.com/reel/DBmKqNsIvhR/');
    assert.equal($('[data-example="1"]').getAttribute('aria-pressed'), 'true');
    $('#va-modal-close').click();
  });
});
