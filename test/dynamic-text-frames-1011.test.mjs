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

test('בלי הנעה לפעולה: הפרומפט אוסר להוסיף אחת ומסיים במסר חזק', async () => {
  const { NO_CTA } = await import('../js/video-assistant-content.js');
  const p = buildScriptDistillationPrompt({ ...base, ctaType: NO_CTA });
  assert.match(p, /אל תוסיף הנעה לפעולה/);
  assert.match(p, /5️⃣ הנעה לפעולה: אין/);
  assert.doesNotMatch(p, /סוג 1 של הנעה לפעולה/);
  assert.doesNotMatch(p, /הסוג הרצוי עבור התסריט הזה/);
  // עם הנעה לפעולה רגילה הכל נשאר
  const q = buildScriptDistillationPrompt({ ...base, ctaType: 'משפך' });
  assert.match(q, /סוג 1 של הנעה לפעולה/);
  assert.match(q, /הסוג הרצוי עבור התסריט הזה: משפך/);
});

test('טקסט דינמי כולל את הדוגמה האמיתית של חן', () => {
  const p = buildScriptDistillationPrompt({ ...base, dynamicText: true });
  assert.match(p, /בגיל 19 החלמתי מסרטן/);
});
