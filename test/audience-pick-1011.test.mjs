/* 10/11/2026 (מאיה): "כפתור כזה בצד שאפשר תמיד לשנות, וזה יהיה בדיפולט על
   העיקרי, ושאר הקהלים לפי טבלת הקהל יעד שלכם, שתמיד העמודה הראשונה זה
   העיקרי". */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { audienceOptions, pickedAudience, audienceChipLabel } from '../js/audience-pick.js';
import { hasJsdom, setupAssistant, store, until, SESSION } from './helpers/va-dom.mjs';

const TABLE = {
  primaryAudience: 'שכירות תקועות שרוצות קריירה',
  secondaryAudience: 'נייליסטיות שרוצות לעלות רמה',
  audiences: [
    { name: 'מתחילות מאפס', line: 'שכירות תקועות שרוצות קריירה' },
    { name: 'נייליסטיות', line: 'נייליסטיות שרוצות לעלות רמה' },
    { name: 'בעלות סלון', line: 'בעלות סלון שרוצות עובדת ראשונה' },
  ],
};

describe('רשימת הקהלים', () => {
  test('מהטבלה, לפי הסדר, והראשון הוא העיקרי', () => {
    const o = audienceOptions(TABLE);
    assert.deepEqual(o.map((x) => [x.name, x.tag]), [['מתחילות מאפס', 'עיקרי'], ['נייליסטיות', 'משני'], ['בעלות סלון', 'נוסף']]);
  });
  test('בלי טבלה: העיקרי והמשני מהפרופיל', () => {
    const o = audienceOptions({ primaryAudience: 'א', secondaryAudience: 'ב' });
    assert.deepEqual(o.map((x) => [x.name, x.line]), [['הקהל העיקרי', 'א'], ['הקהל המשני', 'ב']]);
    assert.deepEqual(audienceOptions({}), []);
  });
  test('שורה שמאיה כתבה ביד לעיקרי גוברת על השורה מהטבלה', () => {
    const o = audienceOptions({ ...TABLE, primaryAudience: 'של מאיה' });
    assert.equal(o[0].line, 'של מאיה');
    assert.equal(o[0].name, 'מתחילות מאפס');
  });
  test('משני שנערך ביד גובר על השורה מהטבלה', () => {
    assert.equal(audienceOptions({ ...TABLE, secondaryAudience: 'משני חדש' })[1].line, 'משני חדש');
    assert.equal(audienceOptions({ ...TABLE, secondaryAudience: 'משני חדש' })[2].line, 'בעלות סלון שרוצות עובדת ראשונה');
  });
  test('בלי בחירה: העיקרי. בחירה שכבר לא קיימת: חוזרים לעיקרי', () => {
    assert.equal(pickedAudience(null, TABLE).line, 'שכירות תקועות שרוצות קריירה');
    assert.equal(pickedAudience({ key: 'a2', line: 'בעלות סלון שרוצות עובדת ראשונה' }, TABLE).name, 'בעלות סלון');
    assert.equal(pickedAudience({ key: 'a7', line: 'נמחק' }, TABLE).role, 'primary');
    assert.equal(pickedAudience({ custom: true, line: 'מורות ליוגה' }, TABLE).line, 'מורות ליוגה');
    assert.equal(audienceChipLabel(pickedAudience(null, TABLE)), 'קהל: מתחילות מאפס (עיקרי)');
  });
});

describe('כפתור הקהל בעוזר (jsdom)', { skip: hasJsdom ? false : 'jsdom לא מותקן במחשב הזה' }, () => {
  let ui;
  before(async () => {
    ui = await setupAssistant();
    store.set('profiles/u1', { name: 'מיכל', pronoun: 'את', business: 'ציפורניים', ...TABLE });
  });
  const promptText = () => [...document.querySelectorAll('.va-copy-btn')]
    .map((b) => decodeURIComponent(b.getAttribute('data-copy-text') || '')).join('\n');

  test('ברירת מחדל עיקרי, מחליפים לקהל אחר בלחיצה, והפרומפט מתעדכן', async () => {
    const { $, $$, open, check } = ui;
    await open({ branch: 'scratch', screen: 'scratch-hook', ideaDescription: 'רעיון', rawDump: 'מגילה' }, '#va-scratch-hook-input');
    await until(() => $('#va-aud-chip') && !$('#va-aud-chip').hidden, 'אין כפתור קהל');
    assert.equal($('#va-aud-chip-label').textContent, 'קהל: מתחילות מאפס (עיקרי)');
    await until(() => promptText().includes('שכירות תקועות שרוצות קריירה'), 'העיקרי לא בפרומפט');

    $('#va-aud-chip').click();
    await until(() => $$('input[name="va-aud"]').length === 4, 'אין 3 קהלים + אחר');
    check($$('input[name="va-aud"]').find((r) => r.value === 'a2'));
    $('#va-aud-save').click();
    await until(() => $('#va-aud-chip-label') && $('#va-aud-chip-label').textContent === 'קהל: בעלות סלון', 'הכפתור לא התעדכן');
    await until(() => promptText().includes('בעלות סלון שרוצות עובדת ראשונה'), 'הפרומפט לא התעדכן');
    assert.ok(!promptText().includes('שכירות תקועות שרוצות קריירה'), 'העיקרי נשאר בפרומפט');
    await until(() => store.get(SESSION).audiencePick && store.get(SESSION).audiencePick.key === 'a2', 'הבחירה לא נשמרה');
  });

  test('קהל אחר: חובה לכתוב, ואז הוא נכנס', async () => {
    const { $, $$, open, check, type } = ui;
    await open({ branch: 'scratch', screen: 'scratch-hook', ideaDescription: 'רעיון2', rawDump: 'מגילה' }, '#va-scratch-hook-input');
    await until(() => $('#va-aud-chip') && !$('#va-aud-chip').hidden, 'אין כפתור קהל');
    $('#va-aud-chip').click();
    await until(() => $('#va-aud-custom'), 'אין תיבה');
    check($$('input[name="va-aud"]').find((r) => r.value === 'custom'));
    assert.equal($('#va-aud-custom').hidden, false);
    $('#va-aud-save').click();
    assert.ok($('#va-aud-save'), 'נסגר בלי טקסט');
    type($('#va-aud-custom'), 'מורות ליוגה שפותחות סטודיו');
    $('#va-aud-save').click();
    await until(() => promptText().includes('מורות ליוגה שפותחות סטודיו'), 'הקהל האחר לא בפרומפט');
    assert.equal($('#va-aud-chip-label').textContent, 'קהל: אחר');
  });

  test('במסך הפתיחה אין כפתור', async () => {
    const { $, open } = ui;
    await open({ screen: 'opening' }, '#va-card');
    await until(() => !$('#va-scratch-hook-input'), 'המסך הקודם עדיין');
    assert.equal($('#va-aud-chip'), null);
  });
});
