/* 10/11/2026 (מאיה): בפרומפט האריזה נכנס רק המסר, פעמיים, בלי הרעיון.
   אצל מור אדרי שתי התיבות היו אותו משפט. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ideaWithMessage, sameIdeaAndMessage } from '../js/video-assistant-flow.js';

const M = 'שורה תחתונה שהקהל יבין שאפשר לייצר הכנסה נוספת וגדולה יותר מקורס הלחמת ריסים';
test('אותו משפט בשתי התיבות: נכנס פעם אחת', () => {
  assert.equal(ideaWithMessage(M, M), M);
  assert.equal(sameIdeaAndMessage(M, `${M}.`), true);
});
test('רעיון ומסר שונים: שניהם נכנסים, כל אחד עם הכותרת שלו', () => {
  assert.equal(ideaWithMessage('איך הגעתי מ-0 ל-30 לקוחות', 'אפשר להרוויח מריסים יותר ממשכורת'), 'הרעיון: איך הגעתי מ-0 ל-30 לקוחות. המסר: אפשר להרוויח מריסים יותר ממשכורת');
  assert.equal(sameIdeaAndMessage('א', 'ב'), false);
});
test('המסך חוסם המשך כשבשתי התיבות אותו משפט', () => {
  const src = readFileSync(new URL('../js/video-assistant.js', import.meta.url), 'utf8');
  assert.match(src, /sameIdeaAndMessage\(box\.value, punchBox\.value\)/);
  /* 12/11/2026: בנוסח במאי הקריאייטיב הרעיון והמסר בשדות נפרדים, ומשפט זהה לא נכנס פעמיים */
  assert.match(src, /sameIdeaAndMessage\(state\.ideaTopic \|\| '', state\.ideaPunchline \|\| ''\)/);
});

/* סריקה מעמיקה, 10/11/2026 */
import { sharpenedIdea, ideaForPrompt, normText, INITIAL_STATE, nextStep } from '../js/video-assistant-flow.js';
/* idea-chat.js נטען עם כל הצ'אט (Firebase, localStorage). את הפונקציה הטהורה
   לוקחים מהמקור עצמו. */
const chatSrc = readFileSync(new URL('../js/idea-chat.js', import.meta.url), 'utf8');
const fnSrc = chatSrc.slice(chatSrc.indexOf('export function assistantSeedText'), chatSrc.indexOf('export function startIdeaChatFromAssistant')).replace('export ', '');
const assistantSeedText = new Function(`${fnSrc}; return assistantSeedText;`)();
import { register } from 'node:module';
register('./helpers/cdn-stub-hooks.mjs', import.meta.url);
globalThis.__fbStub = new Proxy({}, { get: (_, k) => (k === 'enableIndexedDbPersistence' ? () => Promise.resolve() : () => ({})) });
const { descriptionPayload } = await import('../js/va-description.js');

test('רווח כפול או ירידת שורה לא עוקפים את הבדיקה, והאות s לא נמחקת', () => {
  assert.equal(sameIdeaAndMessage('אבא  שלי', 'אבא\nשלי'), true);
  assert.equal(normText('sales posts'), 'sales posts');
});
test('המשפט שממשיך מ"רעיון ומסר": "למה X" מול "X" לא נכפל', () => {
  assert.equal(sharpenedIdea('למה לידים קרים לא קונים בהודעה הראשונה', 'לידים קרים לא קונים בהודעה הראשונה'), 'למה לידים קרים לא קונים בהודעה הראשונה');
  assert.equal(sharpenedIdea('הנושא', 'המסר'), 'המסר. נושא הסרטון: הנושא');
  assert.equal(sharpenedIdea('', 'המסר'), 'המסר');
});
test('בפרומפטים הרעיון נכנס בלי האריזה (היא כבר בבלוק הקריאייטיב)', () => {
  const s = { ideaBeforePackaging: 'המסר. נושא הסרטון: הנושא', ideaDescription: 'המסר. נושא הסרטון: הנושא. האריזה הקריאייטיבית: מסע בזמן', packaging: 'מסע בזמן' };
  assert.equal(ideaForPrompt(s), 'המסר. נושא הסרטון: הנושא');
  assert.equal(ideaForPrompt({ ideaDescription: 'רעיון' }), 'רעיון');
});
test('הצ\'אט לחידוד רעיון: אותו משפט נשלח פעם אחת', () => {
  assert.equal(normText(assistantSeedText({ topic: M, punchline: `${M}.` })), normText(M));
  assert.equal(assistantSeedText({ topic: 'א', punchline: 'ב' }), 'על מה הסרטון: א\nהמסר: ב');
});
test('תיאור הסרטון: בלי נושא, המסר לא נכפל', () => {
  const p = descriptionPayload({ ideaTopic: '', ideaPunchline: 'המסר', ideaBeforePackaging: 'המסר. זווית ההנגשה: א' }, 'תסריט', {});
  assert.equal(p.idea, '');
  assert.equal(p.message, 'המסר');
});
test('חזרה עד מסך הפתיחה לא גוררת את הרעיון של הסרטון הנטוש', () => {
  let s = { ...INITIAL_STATE };
  s = nextStep(s, { type: 'CHOOSE_IDEA' }) || s;
  const fake = { ...INITIAL_STATE, screen: 'creative-packaging', branch: 'idea', ideaTopic: 'T', ideaPunchline: 'P', history: [{ ...INITIAL_STATE, screen: 'opening' }] };
  const back = nextStep(fake, { type: 'BACK' });
  assert.equal(back.screen, 'opening');
  assert.equal(back.ideaTopic ?? null, null);
  assert.equal(back.ideaPunchline ?? null, null);
});
