/* 06/11/2026 (מאיה: "אחרי שמסננים אריזה קריאייטיבית קל להחליט איזה פורמטים
   מתאימים אז אולי שיסמן בכתום מה הוא ממליץ? פשוט מפחדת שיטעה").
   1. המיפוי עצמו: מילים בטקסט האריזה ← פורמטים, בלי בינה מלאכותית.
   2. הזרימה האמיתית ב-jsdom: מדביקים אריזה, ממשיכים, ורואים כתום על
      הפורמטים המתאימים בלבד, כל הפורמטים עדיין שם וכל אחד ניתן לבחירה.
   3. הדוגמאות בפופאפ: טיקטוק מוטמע עם קישור מלא, ודוגמה חסומה ככרטיס. */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { FORMATS, FORMAT_RECOMMEND_WORDS, recommendFormats } from '../js/video-assistant-content.js';
import { hasJsdom, setupAssistant, store, until, SESSION, handlers, calls } from './helpers/va-dom.mjs';
import { createRequire } from 'node:module';
const { FORMAT_NAMES, parseFormatPicks, buildFormatRecommendPrompt } = createRequire(import.meta.url)('../functions/format-recommend.js');

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

describe('מסך הפורמטים (jsdom)', { skip: hasJsdom ? false : 'jsdom לא מותקן במחשב הזה' }, () => {
  let ui;
  before(async () => { ui = await setupAssistant(); });

  /* 18/11/2026 (מאיה: "בחלק של פורמטים מומלצים תמחקי לגמרי, זה מבלבל") */
  test('אין המלצה בכלל: בלי כתום, בלי תגיות ונימוקים, בלי קריאה לשרת, וכל הפורמטים נבחרים', async () => {
    const { $, $$, open, type } = ui;
    const before = calls.filter((c) => c.name === 'recommendFormatsForIdea').length;
    await open({ branch: 'idea', screen: 'creative-packaging', ideaDescription: 'רעיון', ideaTopic: 'לא העליתי מחיר', ideaPunchline: 'מחיר שמשקף' }, '#va-packaging-input');
    type($('#va-packaging-input'), 'את מחזיקה עוגה ומוזגת קטשופ, מסתכלת למצלמה ושואלת. הוק (קריינות/דיבור)');
    $('[data-start="סיפור אישי"]').click();
    $('#va-packaging-done-btn').click();
    await until(() => $$('[data-pick-format]').length, 'מסך הפורמטים');
    await new Promise((r) => setTimeout(r, 1200));
    assert.equal($$('.is-recommended').length, 0);
    assert.equal($$('.cosmic-recommend-tag').length, 0);
    assert.equal($('.cosmic-recommend-why'), null);
    assert.equal($('.cosmic-recommend-hint'), null);
    assert.equal($('.cosmic-recommend-loading'), null);
    assert.ok(!/מומלץ|כתום/.test($('.cosmic-accordion').parentElement.textContent));
    assert.equal(calls.filter((c) => c.name === 'recommendFormatsForIdea').length, before, 'נשלחה בקשת המלצה');
    const items = $$('.cosmic-accordion-item');
    assert.deepEqual(items.map((d) => d.dataset.format), FORMATS.map((f) => f.name));
    items.find((d) => d.dataset.format === 'וויס אובר').querySelector('[data-pick-format]').click();
    await until(() => store.get(SESSION).selectedFormat === 'וויס אובר', 'הפורמט שנבחר לא נשמר');
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

describe('השרת: הפרומפט והניקוי של התשובה (09/11/2026)', () => {
  test('אותם שמות פורמטים בשרת ובאפליקציה', () => {
    assert.deepEqual(FORMAT_NAMES, FORMATS.map((f) => f.name));
  });
  test('הפרומפט כולל את הרעיון, המסר והאריזה, ואת הכלל שקריינות לבד לא אומרת וויס אובר', () => {
    const p = buildFormatRecommendPrompt({ idea: 'רעיון X', message: 'מסר Y', angle: '', startingPoint: 'סיפור אישי', packaging: 'אריזה Z' });
    for (const w of ['רעיון X', 'מסר Y', 'אריזה Z', 'סיפור אישי']) assert.ok(p.includes(w), w);
    assert.match(p, /גם אם כתוב שם "קריינות"/);
    assert.match(p, /3 או 4 פורמטים מסגנונות שונים/);
    assert.match(p, /הולכת ברחוב/);
  });
  test('ניקוי: רק שמות אמיתיים, בלי כפולים, עד 4, בלי מקף ארוך', () => {
    const picks = parseFormatPicks('הנה: {"picks":[{"name":"דיבור למצלמה","why":"כי — היא מספרת"},{"name":"פורמט מומצא","why":"x"},{"name":"דיבור למצלמה","why":"שוב"},{"name":"ראיון / שיחה","why":"a"},{"name":"וויס אובר","why":"b"},{"name":"מסך ירוק","why":"c"},{"name":"טקסט דינמי","why":"d"}]}');
    assert.deepEqual(picks.map((p) => p.name), ['דיבור למצלמה', 'ראיון / שיחה', 'וויס אובר', 'מסך ירוק']);
    assert.equal(picks[0].why, 'כי, היא מספרת');
    assert.deepEqual(parseFormatPicks('לא JSON'), []);
  });
});

/* 10/11/2026 (מאיה): "בכל ההוקים: את יושבת וחותכת תותים... הוקים ממש גרועים,
   לא לפי החוקים ולא לפי התבנית שלי. תמחקי את הקטע הזה מהפרומפט". הבלוק של
   09/11 שהצמיד את ההוקים לקריאייטיב ירד. */
describe('פרומפט ההוקים בלי הקריאייטיב (10/11/2026)', () => {
  /* 12/11/2026 (מאיה): הקריאייטיב חוזר, אבל רק כנתון אחד בין הנתונים בסוף */
  test('הקריאייטיב נכנס כנתון בלבד: בלי ההוראה של 09/11 ובלי התזכורת בסוף', async () => {
    const { buildHookFindingPrompt } = await import('../js/video-assistant-content.js');
    const creative = 'את יושבת וחותכת תותים באופן טבעי, ומתחילה לדבר תוך כדי הפעולה.';
    const args = { idea: 'פערי מעמדות', script: 'תסריט', audience: 'בעלות עסקים', domain: 'שיווק' };
    const withC = buildHookFindingPrompt({ ...args, creative });
    assert.ok(withC.includes(`האריזה הקריאייטיבית שבחרתי לסרטון\n[${creative}]`));
    assert.ok(!buildHookFindingPrompt({ ...args, creative: '' }).includes('תותים'));
    assert.ok(!withC.includes('כל הוק עושה שני דברים יחד'));
    assert.ok(!withC.includes('תזכורת אחרונה'));
  });
});
