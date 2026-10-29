/* 29/10/2026 (מאיה): "כותבים תסריט וכאילו כל פעם כל שלב נעלם. אני רוצה
   תוך כדי שאני בונה לראות מול העיניים מה אני בונה". */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildParts } from '../js/video-assistant-build.js';
import { INITIAL_STATE, nextStep } from '../js/video-assistant-flow.js';

const pick = (parts) => parts.map((p) => `${p.label}:${p.status}`);

test('לפני שנבנה משהו אין מה להציג', () => {
  assert.deepEqual(buildParts(INITIAL_STATE), []);
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_IDEA' });
  assert.deepEqual(buildParts(s), []);
});

test('מסלול רעיון: הרעיון והמסר נשארים מול העיניים במסך האריזה', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_IDEA' });
  s = nextStep(s, { type: 'IDEA_SHARPENED', idea: 'ממומן רק מביא חשיפה. נושא הסרטון: ממומן', topic: 'ממומן', punchline: 'ממומן רק מביא חשיפה' });
  const parts = buildParts(s);
  assert.deepEqual(pick(parts), ['הרעיון:done', 'המסר:done', 'האריזה:now', 'הפורמט:wait', 'התסריט:wait']);
  assert.equal(parts[0].value, 'ממומן', 'הנושא לא נלקח מהשדה שלו');
  assert.equal(parts[1].value, 'ממומן רק מביא חשיפה');
});

test('מסלול כתיבה: כל חלק שנכתב נשאר, ההוק מודגש', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_IDEA' });
  s = nextStep(s, { type: 'IDEA_SHARPENED', idea: 'מ', topic: 'נושא', punchline: 'מסר' });
  s = nextStep(s, { type: 'PACKAGING_CHOSEN', packaging: 'מכתב לעצמי', startingPoint: 'סיפור לקוח' });
  s = nextStep(s, { type: 'FORMAT_SELECTED', format: 'דיבור למצלמה' });
  s = nextStep(s, { type: 'NEEDS_SCRIPT_YES' });
  s = nextStep(s, { type: 'SCRATCH_DUMP_READY', text: 'כל מה שיש לי להגיד' });
  s = nextStep(s, { type: 'SCRATCH_HOOK_CHOSEN', hook: 'שרפת 5,000 ש"ח?' });
  const parts = buildParts(s);
  assert.deepEqual(pick(parts), ['הרעיון:done', 'המסר:done', 'האריזה:done', 'הפורמט:done',
    'מה יש לך להגיד:done', 'ההוק:done', 'חיזוק ההוק:now', 'התסריט:wait']);
  assert.equal(parts[2].value, 'מכתב לעצמי · סיפור לקוח');
  assert.ok(parts.find((p) => p.label === 'ההוק').big);
});

test('קטע שצולם: מה שנכתב הוא המסר, ואין רעיון ריק', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_FOOTAGE' });
  s = { ...s, screen: 'type-idea' };
  s = nextStep(s, { type: 'IDEA_TYPED', text: 'למה מכשיר אחד' });
  s = nextStep(s, { type: 'IDEA_SHARPENED', idea: 'למה מכשיר אחד ולא שלושה' });
  assert.deepEqual(pick(buildParts(s)), ['המסר:done', 'האריזה:now', 'הפורמט:wait', 'התסריט:wait']);
});

test('שכפול: הרפרנס, ההוק והמילים שלה', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_REFERENCE' });
  s = { ...s, screen: 'transcribe', transcript: 'תמלול של רפרנס', referenceLink: 'https://x.com/v' };
  s = nextStep(s, { type: 'CONFIRM_DONE' });
  assert.deepEqual(pick(buildParts(s)), ['הרפרנס:done', 'ההוק:now', 'מה יש לך להגיד:wait', 'התסריט:wait']);
});

test('במסך הסיכום לא מציגים, הוא מציג הכל בעצמו', () => {
  assert.deepEqual(buildParts({ ...INITIAL_STATE, branch: 'scratch', screen: 'summary', ideaTopic: 'א' }), []);
});

test('חלק שעבר בלי ערך לא מופיע כמחכה', () => {
  const s = { ...INITIAL_STATE, branch: 'idea', screen: 'format-choice', ideaTopic: 'נושא', ideaPunchline: 'מסר', packaging: null };
  assert.deepEqual(pick(buildParts(s)), ['הרעיון:done', 'המסר:done', 'הפורמט:now', 'התסריט:wait']);
});

test('רעיון מוגרל: הכותרת שלו לא מופיעה כהוק מוכן', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_IDEA' });
  s = { ...s, screen: 'pulled-idea', hook: 'כותרת מהבנק', ideaDescription: 'כותרת מהבנק' };
  s = nextStep(s, { type: 'ACCEPT_PICK' });
  assert.equal(s.hook, null);
});

test('קטע שצולם שצריך תסריט: המסר נשאר מסר', () => {
  const s = { ...INITIAL_STATE, branch: 'scratch', footageKind: 'visual', screen: 'scratch-dump',
    ideaBeforePackaging: 'המסר של הקטע', packaging: 'א', selectedFormat: 'ב' };
  const parts = buildParts(s);
  assert.equal(parts[0].label, 'המסר');
  assert.equal(parts[0].value, 'המסר של הקטע');
  assert.ok(!parts.some((p) => p.label === 'הרעיון'));
});

test('מה שאחרי המסך הנוכחי מחכה, גם אם נשאר בו ערך', () => {
  const s = { ...INITIAL_STATE, branch: 'scratch', screen: 'scratch-dump', ideaTopic: 'א', ideaPunchline: 'ב', hook: 'ישן' };
  assert.equal(buildParts(s).find((p) => p.label === 'ההוק').status, 'wait');
});
