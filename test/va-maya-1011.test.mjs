/* 10/11/2026 (מאיה): הדמות שלה מחבקת את הכרטיס מהצד בעוזר, ובחמישה רגעים
   היא עושה משהו: שטרות ב"ממיר", אביזר לפי פורמט, קפה במגילה, חכה בהוק, קלאפר בסיכום. */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { poseFor, poseForFormat, nodSeconds, saysConverting, POSES, mayaVisibleFor, mountMaya, setMayaPose, vagueCount, numberCount, wordCount } from '../js/va-maya.js';
import { hasJsdom, setupAssistant, until } from './helpers/va-dom.mjs';

describe('תנוחה לכל מסך ולכל רגע', () => {
  test('כתיבה מציצה, פורמט חיבוק, מגילה קפה, הוק חכה, סיכום קלאפר, והשאר מתחלף', () => {
    assert.equal(poseFor('idea-sharpen'), 'peek');
    assert.equal(poseFor('format-choice'), 'hug');
    assert.ok(['swing', 'backlean', 'hug'].includes(poseFor('opening')));
    assert.equal(poseFor('opening'), poseFor('opening'), 'אותו מסך, אותה תנוחה');
    assert.equal(poseFor('scratch-dump'), 'coffee');
    assert.equal(poseFor('her-words'), 'coffee');
    assert.equal(poseFor('scratch-hook'), 'fishing');
    assert.equal(poseFor('prompt1'), 'fishing');
    assert.equal(poseFor('summary'), 'clapper');
  });
  test('אביזר לפי פורמט', () => {
    assert.equal(poseForFormat('דיבור למצלמה'), 'camera');
    assert.equal(poseForFormat('וויס אובר'), 'mic');
    assert.equal(poseForFormat('ראיון / שיחה'), 'chairs');
    assert.equal(poseForFormat('טקסט דינמי'), 'sign');
    assert.equal(poseForFormat('סיפור אישי'), 'hug');
  });
  test('ככל שיש יותר מילים במגילה, ההנהון מהיר יותר', () => {
    assert.ok(nodSeconds(0) > nodSeconds(60));
    assert.ok(nodSeconds(60) > nodSeconds(120));
    assert.equal(nodSeconds(5000), 0.35);
  });
  test('"ממיר" בתוצאה הסופית מפעיל את השטרות, "חשיפה" לא', () => {
    assert.ok(saysConverting('**כמה קרוב לכסף:** ממיר, כי...'));
    assert.ok(!saysConverting('**כמה קרוב לכסף:** חשיפה'));
  });
  test('עד האישור רק מאיה רואה את הדמות', () => {
    assert.equal(mayaVisibleFor('mayakislev@gmail.com'), true);
    assert.equal(mayaVisibleFor('client@example.com'), false);
  });
  test('שלב 2: מזהה מילה כללית, מספר וכמות מילים', () => {
    assert.equal(vagueCount('יש לי הרבה לקוחות וכולם אוהבים'), 2);
    assert.equal(vagueCount('הרבהההה'), 0);
    assert.equal(numberCount('הרווחתי 11,000 שקל בגיל 32'), 3);
    assert.equal(wordCount('  שלוש מילים פה '), 3);
  });
  test('כל התמונות קיימות', () => {
    for (const p of POSES) assert.ok(existsSync(new URL(`../assets/maya/maya-${p}.webp`, import.meta.url)), p);
  });
});

describe('הדמות בעוזר (jsdom)', { skip: hasJsdom ? false : 'jsdom לא מותקן במחשב הזה' }, () => {
  let ui;
  before(async () => { ui = await setupAssistant(); });
  test('לקוחה לא רואה, ומאיה: דמות אחת שמחליפה תנוחה', async () => {
    const { $, $$, open } = ui;
    await open({ branch: 'scratch', screen: 'scratch-hook', ideaDescription: 'רעיון', rawDump: 'מגילה' }, '#va-scratch-hook-input');
    assert.equal($('.va-maya'), null, 'לקוחה רואה את הדמות לפני האישור');
    mountMaya($('#va-card'), 'scratch-hook');
    await until(() => $('.va-maya img'), 'אין דמות');
    assert.equal($$('.va-maya').length, 1);
    /* בכניסה הראשונה היא נכנסת בהליכה, ואז נעמדת עם החכה */
    await until(() => /maya-fishing\.webp$/.test($('.va-maya img').getAttribute('src')), 'החכה לא הופיעה אחרי הכניסה', 600);
    setMayaPose('camera');
    assert.match($('.va-maya img').getAttribute('src'), /maya-camera\.webp$/);
    assert.ok($('.va-maya').classList.contains('is-changing'));
  });
});
