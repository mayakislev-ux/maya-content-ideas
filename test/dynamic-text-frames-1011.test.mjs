/* 10/11/2026 (מאיה): טקסט דינמי נכתב לפריימים. פריים 1 ההוק, פריים 2 החיזוק,
   ומשם משפט אחד קצר וחד בכל פריים. ובלי שכתוב למונולוג אחרי הזיקוק. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScriptDistillationPrompt } from '../js/video-assistant-content.js';
import { INITIAL_STATE, nextStep, isDynamicText } from '../js/video-assistant-flow.js';

const base = { idea: 'רעיון', hook: 'הוק', hookReinforcement: 'חיזוק', rawScript: 'מגילה', ctaType: 'משפך' };

test('טקסט דינמי: הפרומפט מבקש פריימים, הוק בראשון וחיזוק בשני', () => {
  const p = buildScriptDistillationPrompt({ ...base, dynamicText: true });
  assert.match(p, /פריים 1: ההוק\./);
  assert.match(p, /פריים 2: חיזוק ההוק\./);
  assert.match(p, /משפט אחד בכל פריים/);
  assert.doesNotMatch(p, /זה לא תסריט לסרטון אלא פוסט קרוסלה/);
});

test('בלי טקסט דינמי הפרומפט לא משתנה', () => {
  const p = buildScriptDistillationPrompt({ ...base });
  assert.doesNotMatch(p, /פריים 1/);
});

test('אחרי הזיקוק, טקסט דינמי הולך ישר לסיכום ולא לשכתוב למונולוג', () => {
  const s = { ...INITIAL_STATE, branch: 'scratch', screen: 'scratch-distill', selectedFormat: 'טקסט דינמי' };
  assert.equal(isDynamicText(s), true);
  assert.equal(nextStep(s, { type: 'SCRATCH_SCRIPT_READY', text: 'פריים 1: הוק' }).screen, 'summary');
  const talk = { ...s, selectedFormat: 'דיבור למצלמה' };
  assert.equal(nextStep(talk, { type: 'SCRATCH_SCRIPT_READY', text: 'x' }).screen, 'scratch-scene');
});
