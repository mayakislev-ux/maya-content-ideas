import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_STATE, nextStep } from '../js/video-assistant-flow.js';

test('initial state is the opening screen with empty history', () => {
  assert.equal(INITIAL_STATE.screen, 'opening');
  assert.deepEqual(INITIAL_STATE.history, []);
});

test('footage path: footage -> relevance check -> "what did you film?"', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_FOOTAGE' });
  assert.equal(s.screen, 'relevance-check');
  assert.equal(s.branch, 'footage');
  s = nextStep(s, { type: 'RELEVANCE_CONFIRMED' });
  assert.equal(s.screen, 'footage-type-choice');
});

test('footage, speech clip: one sequence (find -> shorten -> sharpen -> done), not a choice (18/10)', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_FOOTAGE' });
  s = nextStep(s, { type: 'RELEVANCE_CONFIRMED' });
  s = nextStep(s, { type: 'FOOTAGE_IS_SPEECH' });
  assert.equal(s.screen, 'footage-speech-find');
  s = nextStep(s, { type: 'FOOTAGE_SPEECH_NEXT' });
  assert.equal(s.screen, 'footage-speech-shorten');
  s = nextStep(s, { type: 'FOOTAGE_SPEECH_NEXT' });
  assert.equal(s.screen, 'footage-speech-sharpen');
  s = nextStep(s, { type: 'FOOTAGE_SPEECH_NEXT' });
  assert.equal(s.screen, 'footage-speech-done');
  s = nextStep(s, { type: 'FOOTAGE_SPEECH_DONE' });
  assert.equal(s.screen, 'summary');
});

test('FOOTAGE_SPEECH_NEXT throws from a screen outside the sequence', () => {
  const base = { ...INITIAL_STATE, screen: 'footage-visual-scan', branch: 'footage' };
  assert.throws(() => nextStep(base, { type: 'FOOTAGE_SPEECH_NEXT' }), /FOOTAGE_SPEECH_NEXT not valid/);
});

test('footage, visual clip, found a moment -> extraction guidance -> summary', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_FOOTAGE' });
  s = nextStep(s, { type: 'RELEVANCE_CONFIRMED' });
  s = nextStep(s, { type: 'FOOTAGE_IS_VISUAL' });
  assert.equal(s.screen, 'footage-visual-scan');
  s = nextStep(s, { type: 'FOOTAGE_VISUAL_FOUND_MOMENT' });
  assert.equal(s.screen, 'footage-visual-extract');
  s = nextStep(s, { type: 'FOOTAGE_VISUAL_EXTRACT_DONE' });
  assert.equal(s.screen, 'summary');
});

test('footage, visual clip, no moment found -> reframe into message/story only (18/10: objection removed) -> summary', () => {
  const base = { ...INITIAL_STATE, screen: 'footage-visual-scan', branch: 'footage' };
  let s = nextStep(base, { type: 'FOOTAGE_VISUAL_NO_MOMENT' });
  assert.equal(s.screen, 'footage-visual-reframe');

  let msg = nextStep(s, { type: 'FOOTAGE_VISUAL_FOUND_MESSAGE' });
  assert.equal(msg.screen, 'footage-visual-message');
  assert.equal(nextStep(msg, { type: 'FOOTAGE_VISUAL_READY' }).screen, 'summary');

  let story = nextStep(s, { type: 'FOOTAGE_VISUAL_FOUND_STORY' });
  assert.equal(story.screen, 'footage-visual-story');
  assert.equal(nextStep(story, { type: 'FOOTAGE_VISUAL_READY' }).screen, 'summary');
});

test('footage branch records which path was actually taken, for a concrete summary (18/10)', () => {
  // 18/10/2026 (מאיה: "הסיכום כללי מדי, לא מובן איך אני בונה את הסרטון
  // שלי") - בלי footageKind/footageOutcome מסך הסיכום לא יכול לדעת מה
  // באמת קרה במסלול הזה.
  let speech = nextStep(INITIAL_STATE, { type: 'CHOOSE_FOOTAGE' });
  speech = nextStep(speech, { type: 'RELEVANCE_CONFIRMED' });
  speech = nextStep(speech, { type: 'FOOTAGE_IS_SPEECH' });
  assert.equal(speech.footageKind, 'speech');

  let visual = nextStep(INITIAL_STATE, { type: 'CHOOSE_FOOTAGE' });
  visual = nextStep(visual, { type: 'RELEVANCE_CONFIRMED' });
  visual = nextStep(visual, { type: 'FOOTAGE_IS_VISUAL' });
  assert.equal(visual.footageKind, 'visual');

  const extracted = nextStep(visual, { type: 'FOOTAGE_VISUAL_FOUND_MOMENT' });
  assert.equal(extracted.footageOutcome, 'extract');

  const reframed = nextStep(visual, { type: 'FOOTAGE_VISUAL_NO_MOMENT' });
  assert.equal(nextStep(reframed, { type: 'FOOTAGE_VISUAL_FOUND_MESSAGE' }).footageOutcome, 'message');
  assert.equal(nextStep(reframed, { type: 'FOOTAGE_VISUAL_FOUND_STORY' }).footageOutcome, 'story');
});

test('reference path: opening choice leads to a has/pull sub-choice first (17/10)', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_REFERENCE' });
  assert.equal(s.screen, 'reference-source-choice');
  assert.equal(s.branch, 'reference');
});

test('reference path, pull from bank: sub-choice -> pulled-reference -> relevance -> transcribe', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_REFERENCE' });
  s = nextStep(s, { type: 'CHOOSE_PULL_REFERENCE' });
  assert.equal(s.screen, 'pulled-reference');
  s = nextStep(s, { type: 'ACCEPT_PICK' });
  assert.equal(s.screen, 'relevance-check');
  s = nextStep(s, { type: 'RELEVANCE_CONFIRMED' });
  assert.equal(s.screen, 'transcribe');
});

test('reference path, already has one: sub-choice skips the pick screen entirely', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_REFERENCE' });
  s = nextStep(s, { type: 'CHOOSE_HAS_REFERENCE' });
  assert.equal(s.screen, 'relevance-check');
  s = nextStep(s, { type: 'RELEVANCE_CONFIRMED' });
  assert.equal(s.screen, 'transcribe');
});

test('idea path (typed) -> relevance -> format selection -> needs script yes -> choose method -> reverse duplication', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_IDEA' });
  assert.equal(s.screen, 'idea-source-choice');
  s = nextStep(s, { type: 'CHOOSE_TYPE_IDEA' });
  assert.equal(s.screen, 'type-idea');
  s = nextStep(s, { type: 'IDEA_TYPED', text: 'הסיפור שלי על בולמיה' });
  assert.equal(s.screen, 'relevance-check');
  assert.equal(s.ideaDescription, 'הסיפור שלי על בולמיה');
  s = nextStep(s, { type: 'RELEVANCE_CONFIRMED' });
  assert.equal(s.screen, 'format-choice');
  assert.equal(s.formatFor, 'idea');
  s = nextStep(s, { type: 'FORMAT_SELECTED', format: 'דיבור למצלמה' });
  assert.equal(s.screen, 'needs-script-check');
  s = nextStep(s, { type: 'NEEDS_SCRIPT_YES' });
  assert.equal(s.screen, 'has-idea-choice');
  s = nextStep(s, { type: 'CHOOSE_REVERSE_DUPLICATION' });
  assert.equal(s.screen, 'transcribe');
  assert.equal(s.branch, 'idea-search');
});

test('idea path -> needs script NO ends at the summary without forcing a script', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_IDEA' });
  s = nextStep(s, { type: 'CHOOSE_TYPE_IDEA' });
  s = nextStep(s, { type: 'IDEA_TYPED', text: 'רעיון' });
  s = nextStep(s, { type: 'RELEVANCE_CONFIRMED' });
  s = nextStep(s, { type: 'FORMAT_SELECTED', format: 'דיבור למצלמה' });
  s = nextStep(s, { type: 'NEEDS_SCRIPT_NO' });
  assert.equal(s.screen, 'summary');
});

test('idea path from the saved ideas bank also goes through relevance + format + needs-script', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_IDEA' });
  s = nextStep(s, { type: 'CHOOSE_PULL_IDEA' });
  assert.equal(s.screen, 'pulled-idea');
  s = nextStep(s, { type: 'ACCEPT_PICK' });
  assert.equal(s.screen, 'relevance-check');
  s = nextStep(s, { type: 'RELEVANCE_CONFIRMED' });
  assert.equal(s.screen, 'format-choice');
  s = nextStep(s, { type: 'FORMAT_SELECTED', format: 'ראיון / שיחה' });
  assert.equal(s.screen, 'needs-script-check');
});

test('has-idea-choice -> from-scratch starts the real 4-prompt chain', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_IDEA' });
  s = nextStep(s, { type: 'CHOOSE_TYPE_IDEA' });
  s = nextStep(s, { type: 'IDEA_TYPED', text: 'רעיון' });
  s = nextStep(s, { type: 'RELEVANCE_CONFIRMED' });
  s = nextStep(s, { type: 'FORMAT_SELECTED', format: 'דיבור למצלמה' });
  s = nextStep(s, { type: 'NEEDS_SCRIPT_YES' });
  s = nextStep(s, { type: 'CHOOSE_FROM_SCRATCH' });
  // 22/10/2026: המסלול כבר לא מתחיל בהסבר, אלא בזווית ההגשה
  assert.equal(s.screen, 'scratch-angle');
  assert.equal(s.branch, 'scratch');
});

/* 22/10/2026 (מאיה: "קודם כל לוודא שיש זווית הגשה חזקה"): אי אפשר להגיע
   לכתיבה בלי לעבור בזווית, והנימוק נשמר כדי להיכנס לפרומפטים הבאים. */
test('זווית הגשה: בלי לבחור זווית אין דרך להגיע לשפיכת התוכן', () => {
  const s = { ...INITIAL_STATE, screen: 'scratch-angle', branch: 'scratch' };
  assert.throws(() => nextStep(s, { type: 'SCRATCH_START_DUMP' }));
});

test('זווית הגשה: בחירה מובילה למסך הבדיקה ושומרת את הזווית', () => {
  const s = nextStep({ ...INITIAL_STATE, screen: 'scratch-angle', branch: 'scratch' },
    { type: 'ANGLE_CHOSEN', angle: 'טעות נפוצה' });
  assert.equal(s.screen, 'scratch-angle-check');
  assert.equal(s.angle, 'טעות נפוצה');
});

test('זווית הגשה: אישור ממשיך למסלול הרגיל ושומר את הנימוק', () => {
  let s = nextStep({ ...INITIAL_STATE, screen: 'scratch-angle', branch: 'scratch' },
    { type: 'ANGLE_CHOSEN', angle: 'מיתוס / אמונה מגבילה' });
  s = nextStep(s, { type: 'ANGLE_CONFIRMED', why: 'הקהל שלי באמת מאמין בזה' });
  assert.equal(s.screen, 'scratch-intro');
  assert.equal(s.angle, 'מיתוס / אמונה מגבילה');
  assert.equal(s.angleWhy, 'הקהל שלי באמת מאמין בזה');
});

test('זווית הגשה: אפשר לאשר בלי נימוק, והשדה נשאר ריק ולא undefined', () => {
  let s = nextStep({ ...INITIAL_STATE, screen: 'scratch-angle', branch: 'scratch' },
    { type: 'ANGLE_CHOSEN', angle: 'ביקורת' });
  s = nextStep(s, { type: 'ANGLE_CONFIRMED' });
  assert.equal(s.screen, 'scratch-intro');
  assert.equal(s.angleWhy, null);
});

test('זווית הגשה: כפתור חזרה מחזיר ממסך הבדיקה לבחירת הזווית', () => {
  let s = nextStep({ ...INITIAL_STATE, screen: 'scratch-angle', branch: 'scratch' },
    { type: 'ANGLE_CHOSEN', angle: 'שאלה נפוצה' });
  s = nextStep(s, { type: 'BACK' });
  assert.equal(s.screen, 'scratch-angle');
});

test('הזווית שורדת עד סוף המסלול ומגיעה לסיכום', () => {
  let s = nextStep({ ...INITIAL_STATE, screen: 'scratch-angle', branch: 'scratch' },
    { type: 'ANGLE_CHOSEN', angle: 'לשרוף גשרים' });
  s = nextStep(s, { type: 'ANGLE_CONFIRMED', why: 'כי הן שוקלות קורס זול' });
  s = nextStep(s, { type: 'SCRATCH_START_DUMP' });
  s = nextStep(s, { type: 'SCRATCH_DUMP_READY', text: 'הכל' });
  s = nextStep(s, { type: 'SCRATCH_HOOK_CHOSEN', hook: 'הוק' });
  s = nextStep(s, { type: 'SCRATCH_REINFORCEMENT_CHOSEN', text: 'חיזוק' });
  s = nextStep(s, { type: 'SCRATCH_SCRIPT_READY', text: 'תסריט' });
  assert.equal(s.screen, 'summary');
  assert.equal(s.angle, 'לשרוף גשרים');
  assert.equal(s.angleWhy, 'כי הן שוקלות קורס זול');
});

test('התחלה מחדש מנקה גם את הזווית', () => {
  const s = nextStep({ ...INITIAL_STATE, screen: 'summary', angle: 'ביקורת', angleWhy: 'כי' },
    { type: 'RESTART' });
  assert.equal(s.angle, null);
  assert.equal(s.angleWhy, null);
});

test('from-scratch: full 4-prompt chain (dump -> hook -> reinforcement -> distilled script) ends at summary', () => {
  // 22/10/2026: המסלול הזה מתחיל אחרי שכבר נבחרה זווית, ולכן היא בסטייט
  const base = { ...INITIAL_STATE, screen: 'scratch-intro', branch: 'scratch', angle: 'טעות נפוצה' };
  let s = nextStep(base, { type: 'SCRATCH_START_DUMP' });
  assert.equal(s.screen, 'scratch-dump');
  s = nextStep(s, { type: 'SCRATCH_DUMP_READY', text: 'כל מה שיש לי להגיד' });
  assert.equal(s.screen, 'scratch-hook');
  assert.equal(s.rawDump, 'כל מה שיש לי להגיד');
  s = nextStep(s, { type: 'SCRATCH_HOOK_CHOSEN', hook: 'ההוק שבחרתי' });
  assert.equal(s.screen, 'scratch-hook-reinforce');
  assert.equal(s.hook, 'ההוק שבחרתי');
  s = nextStep(s, { type: 'SCRATCH_REINFORCEMENT_CHOSEN', text: 'חיזוק ההוק' });
  assert.equal(s.screen, 'scratch-distill');
  assert.equal(s.hookReinforcement, 'חיזוק ההוק');
  s = nextStep(s, { type: 'SCRATCH_SCRIPT_READY', text: 'התסריט הסופי' });
  assert.equal(s.screen, 'summary');
  assert.equal(s.draftScript, 'התסריט הסופי');
});

test('reverse-duplication: already found a reference, so it skips straight to transcribing (18/10)', () => {
  const base = { ...INITIAL_STATE, screen: 'has-idea-choice', branch: 'idea' };
  const s = nextStep(base, { type: 'CHOOSE_REVERSE_DUPLICATION' });
  assert.equal(s.screen, 'transcribe');
  assert.equal(s.branch, 'idea-search');
});

test('regular reference duplication: transcribe -> prompt1 -> her-words -> prompt2 -> read-aloud -> summary', () => {
  const base = { ...INITIAL_STATE, screen: 'transcribe' };
  let s = nextStep(base, { type: 'CONFIRM_DONE' });
  assert.equal(s.screen, 'prompt1');
  s = nextStep(s, { type: 'HOOK_CHOSEN', hook: 'ההוק שבחרה' });
  assert.equal(s.screen, 'her-words');
  assert.equal(s.hook, 'ההוק שבחרה');
  s = nextStep(s, { type: 'HER_WORDS_SUBMITTED', text: 'מה שיש לה להגיד' });
  assert.equal(s.screen, 'prompt2');
  assert.equal(s.herWords, 'מה שיש לה להגיד');
  s = nextStep(s, { type: 'SCRIPT_READY', text: 'התסריט המלא שקיבלה' });
  assert.equal(s.screen, 'read-aloud');
  assert.equal(s.finalScript, 'התסריט המלא שקיבלה');
  s = nextStep(s, { type: 'CONFIRM_DONE' });
  assert.equal(s.screen, 'summary');
});

// 19/10/2026 (מאיה, אחרי שהבהירה פעמיים: "בשכפול הפוך לפני שמוצאים הוק
// צריך קודם שידביקו לך את המגילת אסתר, הבנת? התפספס מה שכתבתי לך") -
// בשכפול הפוך (branch 'idea-search') מגילת אסתר נכתבת *לפני* שמחפשים
// הוק, לא אחרי כמו בשכפול רגיל - כי התוכן שלה נכנס לתוך הפרומפט שמוצא
// את ההוק (ChatGPT "מחליט על הוקים" לפי המגילה + הרפרנס).
test('reverse duplication: transcribe -> her-words (מגילת אסתר first) -> prompt1 -> prompt2', () => {
  const base = { ...INITIAL_STATE, screen: 'transcribe', branch: 'idea-search' };
  let s = nextStep(base, { type: 'CONFIRM_DONE' });
  assert.equal(s.screen, 'her-words');
  s = nextStep(s, { type: 'HER_WORDS_SUBMITTED', text: 'מגילת האסתר שלי' });
  assert.equal(s.screen, 'prompt1');
  assert.equal(s.herWords, 'מגילת האסתר שלי');
  assert.equal(s.hook, null);
  s = nextStep(s, { type: 'HOOK_CHOSEN', hook: 'ההוק שבחרה מתוך ה-20' });
  assert.equal(s.screen, 'prompt2');
  assert.equal(s.hook, 'ההוק שבחרה מתוך ה-20');
  assert.equal(s.herWords, 'מגילת האסתר שלי');
});

test('REROLL keeps the current screen, only bumps the count, and leaves no back-entry', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_REFERENCE' });
  s = nextStep(s, { type: 'CHOOSE_PULL_REFERENCE' });
  const before = nextStep(s, { type: 'REROLL' });
  assert.equal(before.screen, 'pulled-reference');
  assert.equal(before.rerollCount, 1);
  assert.equal(before.history.length, s.history.length);
});

test('BACK undoes the previous real navigation, one step at a time', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_FOOTAGE' });
  s = nextStep(s, { type: 'RELEVANCE_CONFIRMED' });
  assert.equal(s.screen, 'footage-type-choice');

  s = nextStep(s, { type: 'BACK' });
  assert.equal(s.screen, 'relevance-check');
  assert.equal(s.branch, 'footage');

  s = nextStep(s, { type: 'BACK' });
  assert.equal(s.screen, 'opening');
  assert.equal(s.branch, null);
});

test('BACK is a no-op at the very start (empty history)', () => {
  const s = nextStep(INITIAL_STATE, { type: 'BACK' });
  assert.equal(s.screen, 'opening');
  assert.deepEqual(s.history, []);
});

test('BACK after a REROLL returns to the screen before the roll, not an intermediate reroll state', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_REFERENCE' });
  s = nextStep(s, { type: 'CHOOSE_PULL_REFERENCE' });
  s = nextStep(s, { type: 'REROLL' });
  s = nextStep(s, { type: 'REROLL' });
  assert.equal(s.rerollCount, 2);
  s = nextStep(s, { type: 'BACK' });
  assert.equal(s.screen, 'reference-source-choice');
});

test('RESTART resets everything back to INITIAL_STATE', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_FOOTAGE' });
  s = nextStep(s, { type: 'RESTART' });
  assert.deepEqual(s, INITIAL_STATE);
});

test('nextStep throws on an unknown action instead of silently no-op-ing', () => {
  assert.throws(() => nextStep(INITIAL_STATE, { type: 'NOT_A_REAL_ACTION' }), /unknown action/i);
});
