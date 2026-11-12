/* 12/11/2026 (מאיה): "בפרומט הסופי של להפוך את התסריט לחד חסר משפט של לא לגעת
   בהוק ובחיזוק הוק" */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSceneRewritePrompt } from '../js/video-assistant-content.js';

test('פרומפט השכתוב אומר לא לגעת בהוק ובחיזוק, ומביא אותם מילה במילה', () => {
  const p = buildSceneRewritePrompt({ script: 'תסריט', audience: 'קהל', domain: 'תחום', hook: 'הפסקתי ללכת לסופר', hookReinforcement: 'וזה הכפיל לי את ההכנסה' });
  assert.ok(p.includes('אל תיגע בהוק ובחיזוק ההוק'));
  assert.ok(p.includes('ההוק: "הפסקתי ללכת לסופר"'));
  assert.ok(p.includes('חיזוק ההוק: "וזה הכפיל לי את ההכנסה"'));
  assert.ok(p.indexOf('אל תיגע בהוק') > p.indexOf('המשימה שלך'), 'המשפט לפני המשימה');
  assert.ok(p.indexOf('אל תיגע בהוק') < p.indexOf('עקרונות השכתוב'), 'המשפט אחרי העקרונות');
});

test('גם בלי הוק שמור, המשפט נשאר, ובכל סוגי ההנעה לפעולה', () => {
  for (const ctaType of ['', 'בלי', 'תגובה']) {
    const p = buildSceneRewritePrompt({ script: 'תסריט', audience: 'קהל', domain: 'תחום', ctaType });
    assert.ok(p.includes('אל תיגע בהוק ובחיזוק ההוק'), ctaType);
  }
});
