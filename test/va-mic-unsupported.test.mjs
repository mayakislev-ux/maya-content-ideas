/* 05/11/2026: מיקרופון בעוזר, בדפדפן בלי זיהוי דיבור (למשל Firefox בטלפון).
   הכפתור לא מופיע בכלל, אין שורת הסבר בתוך הכרטיס, והכתיבה עובדת כרגיל.
   קובץ נפרד, כי התמיכה נקבעת פעם אחת בטעינת voice-input.js. */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { hasJsdom, setupAssistant, store, SESSION, until } from './helpers/va-dom.mjs';

let ui;

describe('מיקרופון בלי תמיכה בדפדפן (jsdom)', { skip: hasJsdom ? false : 'jsdom לא מותקן במחשב הזה' }, () => {
  before(async () => {
    ui = await setupAssistant({ withSpeech: false });
  });

  test('הכפתור מוסתר, בלי הודעה, והתיבה ממשיכה לעבוד ולהישמר', async () => {
    const { $, open, type } = ui;
    await open({ branch: 'scratch', screen: 'scratch-dump', ideaDescription: 'רעיון' }, '#va-scratch-dump-input');
    const mic = $('#va-scratch-dump-input-mic');
    assert.ok(mic, 'הכפתור לא נוצר בכלל');
    assert.equal(mic.hidden, true, 'כפתור מיקרופון מוצג בדפדפן שלא תומך');
    assert.equal(mic.closest('.va-mic-row').hidden, true);
    assert.doesNotMatch($('#va-card').textContent, /הקלטה קולית לא זמינה/);
    type($('#va-scratch-dump-input'), 'כתיבה רגילה');
    await until(() => (store.get(SESSION).drafts || {})['scratch-dump|va-scratch-dump-input'] === 'כתיבה רגילה', 'הכתיבה לא נשמרה');
  });
});
