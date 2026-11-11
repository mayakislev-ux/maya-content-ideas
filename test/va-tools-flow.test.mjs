/* 05/11/2026 (מאיה): הכלים החדשים בעוזר לסרטון, כמו שהיא רואה ולוחצת,
   בעוזר האמיתי ב-jsdom:
   19. הדבקה חכמה: מדביקים תשובה שלמה, לוחצים על כרטיס, וזה מה שממשיך.
   20. מיקרופון במגילה ובמסך הרעיון: מה שנאמר נכנס לתיבה, למד המילים ולשמירה.
   21. מד אורך במסך "להקריא בקול" ובסיכום, ואדום כשהתסריט ארוך מהמקור.
   24. דף צילום מהסיכום ומ"התסריטים שלי", והסימונים נשמרים לכל סרטון.
   25. תיאור לסרטון: לחיצה אחת שולחת הכל לשרת בלי שאלות (06/11), העתקה
       ושמירה בפריט. */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasJsdom, setupAssistant, store, calls, handlers, speech, until, SESSION,
} from './helpers/va-dom.mjs';

const item = (id) => store.get(`videoAssistantScripts/u1/items/${id}`);
const words = (n, w = 'מילה') => Array.from({ length: n }, () => w).join(' ');

const HOOKS_ANSWER = `מעולה, הנה 3 הוקים באותו מנגנון:

1. למה הלקוחות שלך לא חוזרות אחרי טיפול אחד?
2. **הטעות שעולה לך שלוש לקוחות בחודש**
3. אף אחד לא מספר לך את זה על גבות

רוצה עוד גרסאות?`;

let ui;

describe('הכלים החדשים בעוזר (jsdom)', { skip: hasJsdom ? false : 'jsdom לא מותקן במחשב הזה' }, () => {
  before(async () => {
    ui = await setupAssistant({ withSpeech: true });
  });

  test('19. הדבקה חכמה: תשובה שלמה הופכת לכרטיסים, ולחיצה ממלאת את התיבה וזה מה שממשיך', async () => {
    const { $, $$, open, paste, type } = ui;
    await open({ branch: 'scratch', screen: 'scratch-hook', ideaDescription: 'רעיון', rawDump: words(130) }, '#va-scratch-hook-input');
    const input = $('#va-scratch-hook-input');
    const box = input.nextElementSibling;
    assert.ok(box.classList.contains('va-smart-paste'));
    assert.equal(box.hidden, true, 'כרטיסים בלי שהודבק כלום');

    paste(input, HOOKS_ANSWER);
    await until(() => !box.hidden, 'הכרטיסים לא הופיעו אחרי הדבקה');
    const cards = $$('.va-smart-paste__card');
    assert.equal(cards.length, 3);
    assert.match(box.textContent, /זיהינו 3 אפשרויות/);
    assert.equal(cards[1].querySelector('.va-smart-paste__text').textContent, 'הטעות שעולה לך שלוש לקוחות בחודש');

    cards[1].click();
    assert.equal(input.value, 'הטעות שעולה לך שלוש לקוחות בחודש', 'הלחיצה לא מילאה את התיבה');
    assert.equal(cards[1].getAttribute('aria-pressed'), 'true');
    /* אפשר עדיין לערוך */
    type(input, `${input.value}!`);
    $('#va-scratch-hook-done-btn').click();
    await until(() => $('#va-scratch-reinforce-input'), 'מסך חיזוק ההוק');
    await until(() => store.get(SESSION).hook === 'הטעות שעולה לך שלוש לקוחות בחודש!', 'ההוק שנבחר לא נשמר');

    /* אפשרות אחת שהודבקה: בדיוק כמו קודם, בלי כרטיסים */
    const reinforce = $('#va-scratch-reinforce-input');
    paste(reinforce, 'חיזוק אחד בלבד שהודבק');
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(reinforce.nextElementSibling.hidden, true, 'הופיעו כרטיסים להדבקה של אפשרות אחת');
    assert.equal(reinforce.value, 'חיזוק אחד בלבד שהודבק');
  });

  test('19. הדבקה חכמה גם במציאת הוק בשכפול ובאריזה הקריאייטיבית', async () => {
    const { $, $$, open, paste } = ui;
    await open({ branch: 'reference', screen: 'prompt1', transcript: 'ההוק המקורי. ועוד', openingHook: 'ההוק המקורי' }, '#va-hook-input');
    paste($('#va-hook-input'), HOOKS_ANSWER);
    await until(() => $$('.va-smart-paste__card').length === 3, 'כרטיסים במציאת הוק בשכפול');

    await open({ branch: 'idea', screen: 'creative-packaging', ideaDescription: 'רעיון', ideaTopic: 'נושא', ideaPunchline: 'מסר' }, '#va-packaging-input');
    paste($('#va-packaging-input'), '- כיוון ראשון\n- כיוון שני');
    await until(() => $$('.va-smart-paste__card').length === 2, 'כרטיסים באריזה');
    $$('.va-smart-paste__card')[0].click();
    assert.equal($('#va-packaging-input').value, 'כיוון ראשון');
  });

  test('20. מיקרופון במגילה: מה שנאמר נכנס לתיבה, למד המילים ולטיוטה השמורה', async () => {
    const { $, open } = ui;
    await open({ branch: 'scratch', screen: 'scratch-dump', ideaDescription: 'רעיון' }, '#va-scratch-dump-input');
    const mic = $('#va-scratch-dump-input-mic');
    assert.ok(mic, 'אין כפתור מיקרופון במגילה');
    assert.equal(mic.hidden, false, 'הכפתור מוסתר למרות שיש תמיכה');
    mic.click();
    const rec = speech.instances[speech.instances.length - 1];
    assert.ok(rec && rec.started, 'ההקלטה לא התחילה');
    assert.equal(rec.lang, 'he-IL');
    await until(() => /מקליטים/.test(mic.textContent), 'הכפתור לא אומר שמקליטים');

    rec.say('אני רוצה לספר על הלקוחה שהגיעה אליי');
    assert.equal($('#va-scratch-dump-input').value, 'אני רוצה לספר על הלקוחה שהגיעה אליי');
    assert.match($('#va-scratch-meter').textContent, /^7 מתוך 120/, 'מד המילים לא התעדכן מהדיבור');
    await until(() => (store.get(SESSION).drafts || {})['scratch-dump|va-scratch-dump-input'] === 'אני רוצה לספר על הלקוחה שהגיעה אליי',
      'מה שנאמר לא נשמר כטיוטה');
    mic.click();
    await until(() => !/מקליטים/.test(mic.textContent), 'הכפתור לא חזר אחרי עצירה');
  });

  test('20. מיקרופון במגילה ובמסך "על מה הסרטון?"', async () => {
    const { $, open } = ui;
    await open({ branch: 'scratch', screen: 'scratch-dump', ideaDescription: 'רעיון' }, '#va-scratch-dump-input');
    assert.ok($('#va-scratch-dump-input-mic') && !$('#va-scratch-dump-input-mic').hidden, 'אין מיקרופון במגילה');
    await open({ branch: 'idea', screen: 'idea-sharpen' }, '#va-idea-sharp');
    assert.ok($('#va-idea-sharp-mic') && !$('#va-idea-sharp-mic').hidden, 'אין מיקרופון ב"על מה הסרטון?"');
  });

  test('21. שכפול: מד אורך באדום כשהתסריט ארוך מהמקור, ובסיכום אין דף צילום', async () => {
    /* 11/11/2026 (מאיה): "יש שם בסוף דף צילום, תמחקי אותו לגמרי, הוא מבלבל" */
    const { $, open } = ui;
    const transcript = `${words(46, 'מקור')}

טקסט על המסך:
• ${words(20, 'כתוב')}`;
    const finalScript = `שורת ההוק של התסריט
${words(60, 'תסריט')}`;
    await open({ branch: 'reference', screen: 'read-aloud', transcript, hook: 'שורת ההוק של התסריט', finalScript }, '#va-read-done-btn');
    const meter = $('.va-length');
    assert.ok(meter, 'אין מד אורך במסך להקריא בקול');
    assert.ok(meter.classList.contains('is-long'), 'תסריט ארוך ב-39% לא סומן');
    assert.match(meter.textContent, /64 מילים · כ-28 שניות/);
    assert.match(meter.textContent, /הסרטון המשוכפל: 46 מילים · כ-20 שניות/, 'הטקסט שעל המסך נספר כדיבור');
    assert.match($('.va-length__warn').textContent, /ארוך ב-39%/);

    $('#va-read-done-btn').click();
    await until(() => $('#va-desc-btn'), 'מסך הסיכום');
    assert.ok($('.va-length.is-long'), 'אין מד אורך בסיכום');
    assert.equal($('#va-filming-btn'), null, 'דף הצילום עדיין בסיכום');
    assert.doesNotMatch($('.cosmic-summary-list').textContent, /דף צילום/, 'הסיכום עדיין מפנה לדף צילום');
    const id = store.get(SESSION).scriptId;
    assert.ok(id, 'לא נוצר פריט');

    /* וגם לא בסרטון שנשמר ב"התסריטים שלי" */
    $('#video-assistant-scripts-btn').click();
    await until(() => $(`.va-lib-item[data-id="${id}"]`), 'הרשימה');
    $(`.va-lib-item[data-id="${id}"]`).click();
    await until(() => $('#va-lib-resume'), 'פריט');
    assert.equal($('#va-lib-filming'), null, 'דף הצילום עדיין בפריט');
    $('#va-modal-close').click();
  });

  test('21. אורך קרוב למקור: בלי אדום. ובכתיבה מאפס אין השוואה בכלל', async () => {
    const { $, open } = ui;
    await open({ branch: 'reference', screen: 'read-aloud', transcript: words(50), finalScript: words(55) }, '#va-read-done-btn');
    assert.ok($('.va-length'));
    assert.ok(!$('.va-length').classList.contains('is-long'), 'תסריט ארוך ב-10% סומן באדום');
    assert.equal($('.va-length__warn'), null);
  });

  test('25. תיאור לסרטון: לחיצה אחת שולחת את התסריט, המסר וההנעה לפעולה, בלי שום שאלה', async () => {
    /* 06/11/2026 (מאיה): "התיאור לסרטון שואל אותי שאלות אבל אני רוצה כבר
       שיידע לבד את התשובות וישר יכתוב". */
    const { $, $$, open, type } = ui;
    await open({
      branch: 'scratch', screen: 'scratch-distill', ideaDescription: 'למה תעודה לא מספיקה',
      ideaTopic: 'למה תעודה לא מספיקה', ideaPunchline: 'לקוחות לא קונות תעודה, הן קונות תוצאה', packaging: 'מיתוס',
      hook: 'הוק', hookReinforcement: 'חיזוק', rawDump: words(130), selectedFormat: 'דיבור למצלמה',
    }, '#va-scratch-cta-row');
    $('#va-scratch-cta-row [data-cta="משפך"]').click();
    type($('#va-scratch-funnel-input'), 'מדריך חינמי');
    type($('#va-scratch-script-input'), 'התסריט הסופי\nעם עוד שורה');
    $('#va-scratch-script-done-btn').click();
    await until(() => $('#va-scratch-scene-done-btn'), 'מסך הסצנה');
    $('#va-scratch-scene-done-btn').click();
    await until(() => $('#va-desc-btn'), 'הסיכום');
    assert.equal($('.va-length__warn'), null, 'בלי רפרנס אין השוואה');
    assert.ok($('.va-length'), 'אין מד אורך בסיכום של כתיבה מאפס');

    let fail = true;
    handlers.writeVideoDescription = async (payload) => {
      if (fail) { fail = false; throw new Error('השירות לא זמין'); }
      return { data: { description: `תיאור קצר על ${payload.videoType}`, textHooks: ['הוק טקסט 1', 'הוק טקסט 2', 'הוק טקסט 3'] } };
    };
    const before = calls.filter((c) => c.name === 'writeVideoDescription').length;
    $('#va-desc-btn').click();
    /* בלי שאלות: אין בחירת סוג, אין "יש הנעה לפעולה?", אין שדה למלא */
    await until(() => calls.filter((c) => c.name === 'writeVideoDescription').length === before + 1, 'הלחיצה לא שלחה מיד לשרת');
    assert.equal($('#va-desc-type-row'), null, 'עדיין שואל איזה סרטון זה');
    assert.equal($('#va-desc-cta-row'), null, 'עדיין שואל אם יש הנעה לפעולה');
    assert.equal($$('#va-desc input, #va-desc textarea').length, 0, 'יש שדה למלא בחלון התיאור');
    const sent = calls.filter((c) => c.name === 'writeVideoDescription').pop().payload;
    assert.equal(sent.script, 'התסריט הסופי\nעם עוד שורה', 'התסריט לא נשלח');
    assert.equal(sent.message, 'לקוחות לא קונות תעודה, הן קונות תוצאה', 'המסר/השורה התחתונה לא נשלחה');
    assert.equal(sent.idea, 'למה תעודה לא מספיקה');
    assert.equal(sent.angle, 'מיתוס');
    assert.equal(sent.hook, 'הוק');
    assert.equal(sent.cta, 'מדריך חינמי');
    assert.equal(sent.ctaType, 'משפך');
    assert.equal(sent.videoType, 'סרטון דיבור');
    assert.equal(sent.domain, 'שיווק');
    assert.equal(sent.audience, 'בעלות עסקים');
    assert.equal(sent.pronoun, 'את');

    await until(() => $('.va-desc__error'), 'שגיאה לא הוצגה');
    assert.match($('.va-desc__error').textContent, /השירות לא זמין/);
    assert.equal($('#va-desc-go').hidden, false, 'אין כפתור לנסות שוב');

    $('#va-desc-go').click();
    await until(() => $('#va-desc-text'), 'התיאור לא הוצג');
    assert.equal($('#va-desc-text').textContent, 'תיאור קצר על סרטון דיבור');
    assert.equal($$('.va-desc__hooks li').length, 3);
    assert.equal($$('#va-desc-result [data-copy-text]').length, 4, 'חסרים כפתורי העתקה');
    assert.equal(decodeURIComponent($$('.va-desc__hooks [data-copy-text]')[2].getAttribute('data-copy-text')), 'הוק טקסט 3');

    const id = store.get(SESSION).scriptId;
    await until(() => item(id) && item(id).state.videoDescription, 'התיאור לא נשמר בפריט');
    assert.equal(item(id).state.videoDescription.description, 'תיאור קצר על סרטון דיבור');
    assert.equal(item(id).state.videoDescription.version, 2);
    assert.deepEqual(item(id).state.videoDescription.textHooks, ['הוק טקסט 1', 'הוק טקסט 2', 'הוק טקסט 3']);

    /* פתיחה חוזרת מציגה את מה שנשמר, בלי קריאה חדשה */
    $('#va-modal-close').click();
    const n = calls.length;
    $('#va-desc-btn').click();
    await until(() => $('#va-desc-text'), 'התיאור השמור לא מוצג');
    assert.equal(calls.length, n);
    assert.equal($('#va-desc-go').textContent, 'לכתוב תיאור חדש');
    $('#va-modal-close').click();
  });

  test('25ב. תיאור ישן מלפני 06/11 (שהומצא) לא מוצג, ונכתב חדש מהתסריט', async () => {
    const { $, open } = ui;
    handlers.writeVideoDescription = async () => ({ data: { description: 'תיאור חדש מהתסריט', textHooks: [] } });
    await open({
      branch: 'reference', screen: 'read-aloud', transcript: 'שורה מהמקור', hook: 'שורה', finalScript: 'שורה מהתסריט שלי',
      videoDescription: { description: 'תיאור ישן שהומצא', textHooks: [], videoType: 'סרטון דיבור', cta: '', createdAt: 1 },
    }, '#va-read-done-btn');
    $('#va-read-done-btn').click();
    await until(() => $('#va-desc-btn'), 'הסיכום');
    const before = calls.filter((c) => c.name === 'writeVideoDescription').length;
    $('#va-desc-btn').click();
    await until(() => $('#va-desc-text'), 'לא נכתב תיאור חדש');
    assert.doesNotMatch($('#va-desc').textContent, /תיאור ישן שהומצא/);
    assert.equal($('#va-desc-text').textContent, 'תיאור חדש מהתסריט');
    const sent = calls.filter((c) => c.name === 'writeVideoDescription');
    assert.equal(sent.length, before + 1);
    assert.equal(sent.pop().payload.script, 'שורה מהתסריט שלי');
    $('#va-modal-close').click();
  });
});
