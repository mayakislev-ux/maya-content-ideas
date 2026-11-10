/* 10/11/2026 שלב 3 מתוך 6 של הדמות: רגעי שיא. מגפון ב"חשיפה", יד על המצח
   ב"חלש", כובע קוסמים בהגרלה, פפיון באריזה, לוח עם השורה הראשונה בטקסט
   דינמי, מסך ירוק, קפה שני במגילה ארוכה, דג ענק עם ההוק, משקולת בחיזוק,
   תסריט מודפס בסיכום. */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { poseFor, poseForFormat, closenessOf, signLine, POSES, LONG_MEGILLAH_WORDS } from '../js/va-maya.js';
import { hasJsdom, setupAssistant, until } from './helpers/va-dom.mjs';

describe('שלב 3: איזו תנוחה מתי', () => {
  test('אריזה = מתנה, חיזוק הוק = משקולת', () => {
    assert.equal(poseFor('creative-packaging'), 'gift');
    assert.equal(poseFor('scratch-hook-reinforce'), 'dumbbell');
    assert.equal(poseFor('scratch-hook'), 'fishing');
  });
  test('טקסט דינמי = לוח, מסך ירוק = מסך ירוק', () => {
    assert.equal(poseForFormat('טקסט דינמי'), 'sign');
    assert.equal(poseForFormat('מסך ירוק'), 'greenscreen');
  });
  test('קורא את "כמה קרוב לכסף" מהתוצאה הסופית', () => {
    assert.equal(closenessOf('**כמה קרוב לכסף:** חשיפה, כי...'), 'חשיפה');
    assert.equal(closenessOf('כמה קרוב לכסף: חלש'), 'חלש');
    assert.equal(closenessOf('**כמה קרוב לכסף:** ממיר'), 'ממיר');
    assert.equal(closenessOf('בלי שורה כזאת'), null);
  });
  test('על הלוח: השורה הראשונה, מקוצרת', () => {
    assert.equal(signLine('\n  הפסקתי לעבוד 14 שעות\nועוד'), 'הפסקתי לעבוד 14 שעות');
    assert.equal(signLine(''), 'השורה הראשונה שלך כאן');
    assert.ok(signLine('א'.repeat(80)).length <= 46);
  });
  test('כל התנוחות החדשות ברשימה', () => {
    for (const p of ['megaphone', 'facepalm', 'magic', 'gift', 'sign', 'greenscreen', 'coffee2', 'bigfish', 'dumbbell', 'script']) assert.ok(POSES.includes(p), p);
    assert.equal(new Set(POSES).size, POSES.length, 'אין כפילויות');
  });
  test('הצ\'אט מפעיל את רגע השיא רק לבעלת החשבון', () => {
    const src = readFileSync(new URL('../js/idea-chat.js', import.meta.url), 'utf8');
    assert.match(src, /if \(mayaVisibleFor\([^)]*\)\) closenessShow\(reply\)/);
  });
});

describe('שלב 3 בעוזר (jsdom)', { skip: hasJsdom ? false : 'jsdom לא מותקן' }, () => {
  let ui;
  before(async () => { ui = await setupAssistant(); });
  test('לוח עם הטקסט, קפה שני, רגע שיא על המסך', async () => {
    const { $, open, w: window } = ui;
    const m = await import('../js/va-maya.js');
    await open({ branch: 'scratch', screen: 'scratch-dump', ideaDescription: 'הפסקתי לעבוד 14 שעות ביום' }, 'textarea');
    m.mountMaya($('#va-card'), 'scratch-dump');
    await until(() => $('.va-maya img'), 'אין דמות');
    await until(() => /maya-coffee\.webp$/.test($('.va-maya img').getAttribute('src')), 'לא נעמדה עם קפה', 1800);
    /* 11/11/2026: מגילה ארוכה לא מחליפה תנוחה, רק בועה */
    m.setMayaNod(LONG_MEGILLAH_WORDS + 5);
    assert.match($('.va-maya img').getAttribute('src'), /maya-coffee\.webp$/);
    assert.match($('.va-maya .va-maya-bubble').textContent, /קפה/);
    m.setSignText('הפסקתי לעבוד 14 שעות ביום');
    m.setMayaPose('sign');
    assert.equal($('.va-maya .va-maya-sign').textContent, 'הפסקתי לעבוד 14 שעות ביום');
    m.setMayaPose('hug');
    assert.equal($('.va-maya .va-maya-sign'), null, 'הלוח נשאר אחרי שהחליפה תנוחה');
    assert.ok(m.bigFishHook('הוק חד\nשורה שנייה'));
    assert.equal(window.document.querySelector('.va-stage-bubble').textContent, '🎣 הוק חד');
    m.closenessShow('**כמה קרוב לכסף:** חשיפה');
    assert.equal(window.document.querySelectorAll('.va-stage-show').length, 1, 'רגע שיא אחד בכל פעם');
    assert.ok(window.document.querySelector('.va-stage--megaphone'));
  });
});

describe('הדמות צמודה לכרטיס כשגוללים', () => {
  test('כרטיס קצר: התחתית שלה בתחתית הכרטיס, לא בתחתית החלון', async () => {
    const { stickBottom } = await import('../js/va-maya.js');
    assert.equal(stickBottom(475, 1000), 525);
  });
  test('כרטיס ארוך מהחלון: נעצרת 24 פיקסלים מעל תחתית החלון', async () => {
    const { stickBottom } = await import('../js/va-maya.js');
    assert.equal(stickBottom(2400, 1000), 24);
  });
});
