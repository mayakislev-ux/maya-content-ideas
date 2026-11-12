/* 12/11/2026 (מאיה): "צריך לוודא בבניית סרטון מ-0 שכל פעם שחוזרים שלב אחורה
   זה לא ימחק את השלב שחוזרים אליו". הולכים את כל המסלול עד הסיכום, וחוזרים
   צעד אחרי צעד: כל מה שנכתב או נבחר נשאר בכל שלב, עד מסך הרעיון. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_STATE, nextStep } from '../js/video-assistant-flow.js';
import { buildHookFindingPrompt } from '../js/video-assistant-content.js';

const walk = (s, actions) => actions.reduce((acc, a) => nextStep(acc, a), s);

test('מ-0: חזרה מהסיכום עד מסך הרעיון לא מוחקת אף שלב', () => {
  let s = walk({ ...INITIAL_STATE, history: [] }, [
    { type: 'CHOOSE_IDEA' },
    { type: 'IDEA_SHARPENED', idea: 'רעיון', topic: 'נושא', punchline: 'מסר', startingPoint: 'סיפור אישי' },
    { type: 'SCRATCH_DUMP_READY', text: 'מגילה' },
    { type: 'PACKAGING_CHOSEN', packaging: 'קריאייטיב' },
    { type: 'FORMAT_SELECTED', format: 'וויס אובר' },
    { type: 'SCRATCH_HOOK_CHOSEN', hook: 'הוק' },
    { type: 'SCRATCH_REINFORCEMENT_CHOSEN', text: 'חיזוק' },
    { type: 'SCRATCH_SCRIPT_READY', text: 'תסריט' },
    { type: 'SCRATCH_SCENE_DONE', text: '' },
  ]);
  assert.equal(s.screen, 'summary');
  const expectScreens = ['scratch-scene', 'scratch-distill', 'scratch-hook-reinforce', 'scratch-hook', 'format-choice', 'creative-packaging', 'scratch-dump', 'idea-sharpen'];
  for (const screen of expectScreens) {
    s = nextStep(s, { type: 'BACK' });
    assert.equal(s.screen, screen);
    assert.equal(s.rawDump, 'מגילה', `המגילה נמחקה בחזרה ל-${screen}`);
    assert.equal(s.ideaTopic, 'נושא', `הנושא נמחק בחזרה ל-${screen}`);
    assert.equal(s.ideaPunchline, 'מסר', `המסר נמחק בחזרה ל-${screen}`);
    assert.equal(s.startingPoint, 'סיפור אישי', `נקודת היציאה נמחקה בחזרה ל-${screen}`);
    assert.equal(s.packaging, 'קריאייטיב', `הקריאייטיב נמחק בחזרה ל-${screen}`);
    assert.equal(s.selectedFormat, 'וויס אובר', `הפורמט נמחק בחזרה ל-${screen}`);
    assert.equal(s.hook, 'הוק', `ההוק נמחק בחזרה ל-${screen}`);
    assert.equal(s.hookReinforcement, 'חיזוק', `החיזוק נמחק בחזרה ל-${screen}`);
    assert.equal(s.draftScript, 'תסריט', `התסריט נמחק בחזרה ל-${screen}`);
  }
});

test('פרומפט ההוק מקבל את האריזה הקריאייטיבית שנבחרה, כנתון בין הנתונים', () => {
  const p = buildHookFindingPrompt({ idea: 'רעיון', script: 'מגילה', audience: 'קהל', domain: 'תחום', creative: 'וולוג בזמן הכנת ציפורניים' });
  assert.ok(p.includes('האריזה הקריאייטיבית שבחרתי לסרטון\n[וולוג בזמן הכנת ציפורניים]'));
  assert.ok(p.indexOf('האריזה הקריאייטיבית שבחרתי') < p.indexOf('התסריט:'));
  assert.ok(!buildHookFindingPrompt({ idea: 'רעיון', script: 'מגילה', audience: 'קהל', domain: 'תחום' }).includes('האריזה הקריאייטיבית שבחרתי'));
});
