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

describe('הכתום במסך הפורמטים (jsdom)', { skip: hasJsdom ? false : 'jsdom לא מותקן במחשב הזה' }, () => {
  let ui;
  before(async () => { ui = await setupAssistant(); });

  /* 09/11/2026 (מאיה): ההמלצה באה מהשרת, שקורא רעיון + מסר + אריזה. */
  test('ההמלצה מהשרת: 2 פורמטים מדורגים, הראשון "הכי מתאים", נימוק בפנים, וכל השאר נשארים ונבחרים', async () => {
    const { $, $$, open, type } = ui;
    let release;
    const gate = new Promise((r) => { release = r; });
    handlers.recommendFormatsForIdea = async () => { await gate; return { data: { picks: [
      { name: 'דיבור למצלמה', why: 'זה סיפור אישי ודעה, והיא צריכה להיות על המסך' },
      { name: 'ראיון / שיחה', why: 'אפשר לפתוח בשאלה "למה לא העלית מחיר?"' },
    ] } }; };
    await open({ branch: 'idea', screen: 'creative-packaging', ideaDescription: 'רעיון', ideaTopic: 'לא העליתי מחיר לפני שהשיווק שיקף אותי', ideaPunchline: 'מחיר שמשקף את הרשתות' }, '#va-packaging-input');
    type($('#va-packaging-input'), 'את מחזיקה עוגה ומוזגת קטשופ, מסתכלת למצלמה ושואלת. הוק (קריינות/דיבור)');
    $('[data-start="סיפור אישי"]').click();
    $('#va-packaging-done-btn').click();
    await until(() => $$('[data-pick-format]').length, 'מסך הפורמטים');

    /* בזמן ההמתנה: אין כתום בכלל, רק "רגע, בודקים" */
    assert.equal($$('.is-recommended').length, 0);
    assert.ok($('.cosmic-recommend-loading'));
    const sent = calls.filter((c) => c.name === 'recommendFormatsForIdea').pop();
    assert.equal(sent.payload.idea, 'לא העליתי מחיר לפני שהשיווק שיקף אותי');
    assert.equal(sent.payload.message, 'מחיר שמשקף את הרשתות');
    assert.equal(sent.payload.startingPoint, 'סיפור אישי');
    assert.match(sent.payload.packaging, /קטשופ/);

    /* פותחת פורמט לקריאה בזמן ההמתנה: כשההמלצה מגיעה הוא נשאר פתוח, אותו אלמנט */
    const talkEl = $('[data-format="דיבור למצלמה"]');
    talkEl.open = true;
    release();
    await until(() => $$('.is-recommended').length === 2, 'ההמלצה לא הגיעה');
    assert.equal($('[data-format="דיבור למצלמה"]'), talkEl, 'המסך נבנה מחדש');
    assert.equal(talkEl.open, true, 'הפורמט הפתוח נסגר');
    const items = $$('.cosmic-accordion-item');
    assert.equal(items.length, FORMATS.length, 'פורמט הוסתר');
    assert.deepEqual($$('.is-recommended').map((d) => d.dataset.format), ['דיבור למצלמה', 'ראיון / שיחה']);
    assert.deepEqual($$('.cosmic-recommend-tag').map((t) => t.textContent), ['הכי מתאים לרעיון הזה', 'מומלץ לאריזה הזו']);
    assert.match($('[data-format="דיבור למצלמה"] .cosmic-recommend-why').textContent, /סיפור אישי ודעה/);
    assert.equal($('.cosmic-recommend-loading'), null);
    assert.match($('.cosmic-recommend-hint').textContent, /הראשון הכי חזק.*זו רק הצעה, אפשר לבחור כל פורמט אחר/);
    assert.deepEqual(items.map((d) => d.dataset.format), FORMATS.map((f) => f.name));

    const vo = items.find((d) => d.dataset.format === 'וויס אובר');
    vo.querySelector('[data-pick-format]').click();
    await until(() => store.get(SESSION).selectedFormat === 'וויס אובר', 'הפורמט שנבחר לא נשמר');
    delete handlers.recommendFormatsForIdea;
  });

  /* 09/11/2026 (מאיה: הכתום מגיע בדיליי): הבקשה יוצאת כבר בזמן ההדבקה */
  test('ההמלצה נשלחת כבר במסך האריזה, ובמסך הפורמטים היא מוכנה מיד', async () => {
    const { $, $$, open, type } = ui;
    handlers.recommendFormatsForIdea = async () => ({ data: { picks: [{ name: 'דיבור למצלמה', why: 'סיבה' }, { name: 'ראיון / שיחה', why: 'סיבה 2' }] } });
    const before = calls.filter((c) => c.name === 'recommendFormatsForIdea').length;
    await open({ branch: 'idea', screen: 'creative-packaging', ideaDescription: 'רעיון', ideaTopic: 'לידים קרים ודייט ראשון', ideaPunchline: 'קודם מחממים' }, '#va-packaging-input');
    type($('#va-packaging-input'), 'את יושבת מול המצלמה עם כוס יין ושואלת: הייתם מתחתנים בדייט הראשון?');
    await until(() => calls.filter((c) => c.name === 'recommendFormatsForIdea').length === before + 1, 'לא נשלח בזמן ההדבקה');
    $('[data-start="סיפור אישי"]').click();
    $('#va-packaging-done-btn').click();
    await until(() => $$('[data-pick-format]').length, 'מסך הפורמטים');
    assert.equal($('.cosmic-recommend-loading'), null, 'עדיין "בודקים"');
    assert.deepEqual($$('.is-recommended').map((d) => d.dataset.format), ['דיבור למצלמה', 'ראיון / שיחה']);
    assert.equal(calls.filter((c) => c.name === 'recommendFormatsForIdea').length, before + 1, 'נשלח פעמיים');
    delete handlers.recommendFormatsForIdea;
  });

  test('השרת נכשל: חוזרים לחיפוש המילים ולא נתקעים על "בודקים"', async () => {
    const { $, $$, open } = ui;
    handlers.recommendFormatsForIdea = async () => { throw new Error('boom'); };
    await open({ branch: 'idea', screen: 'format-choice', formatFor: 'idea', ideaDescription: 'רעיון אחר', packaging: 'POV, משחק תפקידים בין שתי דמויות' }, '[data-pick-format]');
    await until(() => $$('.is-recommended').length === 1, 'לא חזר לחיפוש המילים');
    assert.equal($('.is-recommended').dataset.format, 'משחק תפקידים');
    assert.equal($('.cosmic-recommend-loading'), null);
    assert.equal($('.cosmic-recommend-why'), null);
    delete handlers.recommendFormatsForIdea;
  });

  test('בלי אריזה אין קריאה לשרת ואין כתום', async () => {
    const { $, $$, open } = ui;
    const before = calls.filter((c) => c.name === 'recommendFormatsForIdea').length;
    await open({ branch: 'idea', screen: 'format-choice', formatFor: 'idea', ideaDescription: 'רעיון', packaging: '' }, '[data-pick-format]');
    assert.equal($$('.is-recommended').length, 0);
    assert.equal($('.cosmic-recommend-hint'), null);
    assert.equal(calls.filter((c) => c.name === 'recommendFormatsForIdea').length, before);
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
    assert.match(p, /2 או 3 פורמטים/);
  });
  test('ניקוי: רק שמות אמיתיים, בלי כפולים, עד 3, בלי מקף ארוך', () => {
    const picks = parseFormatPicks('הנה: {"picks":[{"name":"דיבור למצלמה","why":"כי — היא מספרת"},{"name":"פורמט מומצא","why":"x"},{"name":"דיבור למצלמה","why":"שוב"},{"name":"ראיון / שיחה","why":"a"},{"name":"וויס אובר","why":"b"},{"name":"מסך ירוק","why":"c"}]}');
    assert.deepEqual(picks.map((p) => p.name), ['דיבור למצלמה', 'ראיון / שיחה', 'וויס אובר']);
    assert.equal(picks[0].why, 'כי, היא מספרת');
    assert.deepEqual(parseFormatPicks('לא JSON'), []);
  });
});

describe('פרומפט ההוקים נצמד לקריאייטיב ולרעיון (09/11/2026)', () => {
  test('ההוראה וגם תזכורת בסוף, עם הקריאייטיב והרעיון עצמם', async () => {
    const { buildHookFindingPrompt } = await import('../js/video-assistant-content.js');
    const creative = 'ההוק:"תגידו, הייתם מסכימים להתחתן עם מישהו בדייט הראשון?"';
    const p = buildHookFindingPrompt({ idea: 'לידים קרים', script: 'תסריט', audience: 'בעלות עסקים', domain: 'שיווק', creative });
    assert.match(p, /כל הוק עושה שני דברים יחד/);
    assert.match(p, /גם על אלה שנבנים מהתבניות/);
    assert.match(p, /אסור להדביק את אותו משפט פתיחה מילה במילה/);
    const tail = p.slice(p.lastIndexOf('תזכורת אחרונה'));
    assert.ok(tail.includes(creative) && tail.includes('לידים קרים'), 'התזכורת בסוף בלי הקריאייטיב או הרעיון');
    assert.ok(!buildHookFindingPrompt({ idea: 'x', script: 'y', audience: 'a', domain: 'd', creative: '' }).includes('תזכורת אחרונה'));
  });
});
