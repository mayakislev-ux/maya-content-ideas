// 31/10/2026 (מאיה): פרומפט "השלכה לתוך סצנה" אחרי זיקוק התסריט, במידת הצורך.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSceneRewritePrompt, buildScriptDistillationPrompt, FORMATS } from '../js/video-assistant-content.js';
import { INITIAL_STATE, nextStep } from '../js/video-assistant-flow.js';
import { buildParts } from '../js/video-assistant-build.js';

const distilled = { ...INITIAL_STATE, branch: 'scratch', screen: 'scratch-distill', ideaDescription: 'רעיון' };

test('הפרומפט מתמלא לבד: התסריט, התחום והקהל, בלי מקומות ריקים', () => {
  const p = buildSceneRewritePrompt({ script: 'התסריט שלי', audience: 'מעצבות', domain: 'עיצוב' });
  assert.match(p, /^התחום שלי הוא: עיצוב\n/);
  assert.match(p, /קהל היעד והכאב המרכזי: \[מעצבות\. את הכאב המרכזי תזהה לבד מתוך התסריט\]/);
  assert.match(p, /התסריט \/ הרעיון הגולמי שלי: \[התסריט שלי\]/);
  assert.match(p, /מילת הקוד להנעה לפעולה \(אם יש\): \[תיקח מההנעה לפעולה שכבר בתסריט/);
  for (const blank of ['הכניסי', 'הדביקי', 'סיסטם / הדרכה']) assert.ok(!p.includes(blank), blank);
});

test('הפרומפט בנוסח שלה', () => {
  const p = buildSceneRewritePrompt({ script: 'x' });
  for (const line of [
    'אתה במאי תוכן ועורך תסריטים מומחה לווידאו קצר (Reels/TikTok) ברמת High-Status וסמכות שקטה.',
    'שכתב את התסריט לפי מודל "השלכה לתוך סצנה" (Scene-First), כך שיישמע כמו מונולוג אמת ישיר, חד וקולנועי.',
    'עד 45 שניות הקראה (קצר, מהודק, בלי אף מילה מיותרת).',
  ]) assert.ok(p.includes(line), line);
});

test('בלי קהל בפרופיל, ChatGPT מזהה לבד', () => {
  assert.match(buildSceneRewritePrompt({ script: 'x' }), /קהל היעד והכאב המרכזי: \[תזהה לבד מתוך התסריט\]/);
});

test('אחרי הזיקוק מגיע מסך השכתוב, ודילוג משאיר את התסריט', () => {
  let s = nextStep(distilled, { type: 'SCRATCH_SCRIPT_READY', text: 'מזוקק' });
  assert.equal(s.screen, 'scratch-scene');
  s = nextStep(s, { type: 'SCRATCH_SCENE_DONE', text: '' });
  assert.equal(s.screen, 'summary');
  assert.equal(s.draftScript, 'מזוקק');
  assert.equal(s.sceneRewritten, false);
});

test('גרסה שהודבקה מחליפה את התסריט', () => {
  let s = nextStep(distilled, { type: 'SCRATCH_SCRIPT_READY', text: 'מזוקק' });
  s = nextStep(s, { type: 'SCRATCH_SCENE_DONE', text: 'סצנה' });
  assert.equal(s.draftScript, 'סצנה');
  assert.equal(s.sceneRewritten, true);
});

test('חזרה מהמסך לזיקוק לא מוחקת את התסריט שהודבק', () => {
  const s = nextStep(nextStep(distilled, { type: 'SCRATCH_SCRIPT_READY', text: 'מזוקק' }), { type: 'BACK' });
  assert.equal(s.screen, 'scratch-distill');
  assert.equal(s.draftScript, 'מזוקק');
});

test('חזרה מהסיכום שומרת את הגרסה ששוכתבה, ומבטלת את הסימון עד שממשיכים שוב', () => {
  let s = nextStep(distilled, { type: 'SCRATCH_SCRIPT_READY', text: 'מזוקק' });
  s = nextStep(nextStep(s, { type: 'SCRATCH_SCENE_DONE', text: 'סצנה' }), { type: 'BACK' });
  assert.equal(s.screen, 'scratch-scene');
  assert.equal(s.draftScript, 'מזוקק');
  assert.equal(s.sceneRewrite, 'סצנה');
  assert.equal(s.sceneRewritten, false);
  const again = nextStep(s, { type: 'SCRATCH_SCENE_DONE', text: 'סצנה' });
  assert.equal(again.draftScript, 'סצנה');
  assert.equal(again.sceneRewrite, null);
});

test('חזרה מהסיכום בלי שכתוב לא ממציאה גרסה', () => {
  let s = nextStep(distilled, { type: 'SCRATCH_SCRIPT_READY', text: 'מזוקק' });
  s = nextStep(nextStep(s, { type: 'SCRATCH_SCENE_DONE', text: '' }), { type: 'BACK' });
  assert.equal(s.sceneRewrite, null);
});

test('התסריט נשאר גם בחזרה של כמה שלבים, עד תחילת הכתיבה', () => {
  let s = nextStep({ ...distilled, screen: 'scratch-hook-reinforce' }, { type: 'SCRATCH_REINFORCEMENT_CHOSEN', text: 'חיזוק' });
  s = nextStep(s, { type: 'SCRATCH_SCRIPT_READY', text: 'מזוקק' });
  s = nextStep(nextStep(s, { type: 'BACK' }), { type: 'BACK' });
  assert.equal(s.screen, 'scratch-hook-reinforce');
  assert.equal(s.draftScript, 'מזוקק');
});

test('בתסריט שנבנה, התסריט הוא מה שעובדים עליו עכשיו', () => {
  const parts = buildParts({ ...distilled, screen: 'scratch-scene', draftScript: 'מזוקק' });
  assert.equal(parts.find((p) => p.key === 'script').status, 'now');
});

test('קרוסלה: שם הפורמט זהה לזה שברשימה, אחרת התנאי לא יתקיים לעולם', () => {
  assert.ok(FORMATS.some((f) => f.name === 'פוסט קרוסלה'));
});

test('קרוסלה: ההוראה נוספת לפרומפט רק כשבוחרים בה, ובסופו', () => {
  const base = { idea: 'א', hook: 'ב', hookReinforcement: 'ג', rawScript: 'ד', ctaType: 'מעורבות' };
  const plain = buildScriptDistillationPrompt(base);
  const carousel = buildScriptDistillationPrompt({ ...base, carousel: true });
  assert.ok(!plain.includes('שקופית'));
  assert.ok(carousel.startsWith(plain), 'שאר הפרומפט השתנה');
  assert.match(carousel, /עד 10 שקופיות מקסימום, אבל לא בכוח 10/);
  assert.match(carousel, /השקופית הראשונה = ההוק/);
  assert.match(carousel, /השקופית האחרונה = סיכום והנעה לפעולה/);
});

test('קרוסלה: אחרי הזיקוק ישר לסיכום, בלי שכתוב למונולוג, והתסריט לא נמחק בחזרה', () => {
  const s = nextStep({ ...distilled, selectedFormat: 'פוסט קרוסלה' }, { type: 'SCRATCH_SCRIPT_READY', text: 'שקופיות' });
  assert.equal(s.screen, 'summary');
  assert.equal(s.draftScript, 'שקופיות');
  const back = nextStep(s, { type: 'BACK' });
  assert.equal(back.screen, 'scratch-distill');
  assert.equal(back.draftScript, 'שקופיות');
});

test('פורמט אחר ממשיך למסך השכתוב', () => {
  const s = nextStep({ ...distilled, selectedFormat: 'טוקינג הד' }, { type: 'SCRATCH_SCRIPT_READY', text: 'תסריט' });
  assert.equal(s.screen, 'scratch-scene');
});
