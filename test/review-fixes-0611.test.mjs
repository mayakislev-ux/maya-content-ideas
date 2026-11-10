import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { INITIAL_STATE, nextStep } from '../js/video-assistant-flow.js';

const require = createRequire(import.meta.url);
const vd = require('../functions/video-description.js');

test('חזרה מהאריזה למסך הרעיון משאירה את מה שנכתב', () => {
  const atIdea = { ...INITIAL_STATE, screen: 'idea-input', history: [] };
  const sharpened = nextStep(atIdea, { type: 'IDEA_SHARPENED', idea: 'רעיון', topic: 'לידים קפואים', punchline: 'הבעיה לא בממומן', startingPoint: 'כללי' });
  /* 10/11/2026: בין הרעיון לאריזה יושבת עכשיו המגילה */
  assert.equal(sharpened.screen, 'scratch-dump');
  const packaging = nextStep(sharpened, { type: 'SCRATCH_DUMP_READY', text: 'מגילה' });
  assert.equal(packaging.screen, 'creative-packaging');
  const back = nextStep(nextStep(packaging, { type: 'BACK' }), { type: 'BACK' });
  assert.equal(back.screen, 'idea-input');
  assert.equal(back.ideaTopic, 'לידים קפואים');
  assert.equal(back.ideaPunchline, 'הבעיה לא בממומן');
});

test('מקף עברי בתסריט מול מקף רגיל אצל המודל לא מפיל שורה אמיתית', () => {
  const script = 'רוצים להגיע ל־100 אלף בחודש?';
  assert.equal(vd.isGrounded('רוצים להגיע ל-100 אלף בחודש?', vd.sourceSet([script])), true);
  assert.equal(vd.isGrounded('רוצים להגיע ל־100 אלף בחודש?', vd.sourceSet(['רוצים להגיע ל-100 אלף בחודש?'])), true);
});
