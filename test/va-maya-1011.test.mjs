/* 10/11/2026 (מאיה): הדמות שלה נשענת על המסך בעוזר ומחליפה פרצוף בכל שלב */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { poseFor, POSES, mayaVisibleFor, mountMaya } from '../js/va-maya.js';
import { hasJsdom, setupAssistant, until } from './helpers/va-dom.mjs';

describe('תנוחה לכל מסך', () => {
  test('פתיחה מצביעה, כתיבה חושבת, סיכום חוגגת, הגרלה קורצת, השאר נשענת', () => {
    assert.equal(poseFor('opening'), 'point');
    assert.equal(poseFor('scratch-hook'), 'think');
    assert.equal(poseFor('summary'), 'celebrate');
    assert.equal(poseFor('pulled-idea'), 'wink');
    assert.equal(poseFor('relevance-check'), 'lean');
  });
  test('עד האישור רק מאיה רואה את הדמות', () => {
    assert.equal(mayaVisibleFor('mayakislev@gmail.com'), true);
    assert.equal(mayaVisibleFor('client@example.com'), false);
  });
  test('כל חמש התמונות קיימות', () => {
    for (const p of POSES) assert.ok(existsSync(new URL(`../assets/maya/maya-${p}.webp`, import.meta.url)), p);
  });
});

describe('הדמות בעוזר (jsdom)', { skip: hasJsdom ? false : 'jsdom לא מותקן במחשב הזה' }, () => {
  let ui;
  before(async () => { ui = await setupAssistant(); });
  test('בכל מסך יש דמות אחת, והתנוחה מתחלפת עם המסך', async () => {
    const { $, $$, open } = ui;
    await open({ branch: 'scratch', screen: 'scratch-hook', ideaDescription: 'רעיון', rawDump: 'מגילה' }, '#va-scratch-hook-input');
    assert.equal($('.va-maya'), null, 'לקוחה רואה את הדמות לפני האישור');
    /* כמו אצל מאיה: הדמות מתווספת לכרטיס */
    mountMaya($('#va-card'), 'scratch-hook');
    await until(() => $('.va-maya img'), 'אין דמות');
    assert.equal($$('.va-maya').length, 1);
    assert.match($('.va-maya img').getAttribute('src'), /maya-think\.webp$/);
    await open({ screen: 'opening' }, '#va-card');
    await until(() => !$('#va-scratch-hook-input'), 'המסך הקודם עדיין');
    mountMaya($('#va-card'), 'opening');
    await until(() => $('.va-maya img') && /maya-point/.test($('.va-maya img').getAttribute('src')), 'לא התחלפה לתנוחת הצבעה');
    assert.ok($('.va-maya').classList.contains('is-changing'));
  });
});
