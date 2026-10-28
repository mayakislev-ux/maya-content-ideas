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
  // 26/10/2026: צ'אט שמדייק את הרעיון, ואז נקודת יציאה וסוג תוכן
  s = nextStep(s, { type: 'IDEA_SHARPENED', idea: 'טעות נפוצה בהסרת שיער' });
  s = nextStep(s, { type: 'BASICS_CONFIRMED', startingPoint: 'כללי', contentType: 'בעל ערך' });
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
  // 26/10/2026: צ'אט שמדייק את הרעיון, ואז נקודת יציאה וסוג תוכן
  s = nextStep(s, { type: 'IDEA_SHARPENED', idea: 'טעות נפוצה בהסרת שיער' });
  s = nextStep(s, { type: 'BASICS_CONFIRMED', startingPoint: 'כללי', contentType: 'בעל ערך' });
  s = nextStep(s, { type: 'FOOTAGE_IS_VISUAL' });
  assert.equal(s.screen, 'footage-visual-scan');
  s = nextStep(s, { type: 'FOOTAGE_VISUAL_FOUND_MOMENT' });
  assert.equal(s.screen, 'footage-visual-extract');
  s = nextStep(s, { type: 'FOOTAGE_VISUAL_EXTRACT_DONE' });
  assert.equal(s.screen, 'summary');
});

/* 23/10/2026: מסר או סיפור הם התחלה של בנייה, לא סוף. משם ממשיכים
   לרעיון, לפורמט ולשאלת התסריט, כמו בבנייה מאפס. */
test('footage, visual clip, no moment found -> reframe into message/story -> building', () => {
  const base = { ...INITIAL_STATE, screen: 'footage-visual-scan', branch: 'footage' };
  let s = nextStep(base, { type: 'FOOTAGE_VISUAL_NO_MOMENT' });
  assert.equal(s.screen, 'footage-visual-reframe');

  let msg = nextStep(s, { type: 'FOOTAGE_VISUAL_FOUND_MESSAGE' });
  assert.equal(msg.screen, 'footage-visual-message');
  assert.equal(nextStep(msg, { type: 'FOOTAGE_VISUAL_READY' }).screen, 'type-idea');

  let story = nextStep(s, { type: 'FOOTAGE_VISUAL_FOUND_STORY' });
  assert.equal(story.screen, 'footage-visual-story');
  assert.equal(nextStep(story, { type: 'FOOTAGE_VISUAL_READY' }).screen, 'type-idea');
});

test('footage branch records which path was actually taken, for a concrete summary (18/10)', () => {
  // 18/10/2026 (מאיה: "הסיכום כללי מדי, לא מובן איך אני בונה את הסרטון
  // שלי") - בלי footageKind/footageOutcome מסך הסיכום לא יכול לדעת מה
  // באמת קרה במסלול הזה.
  let speech = nextStep(INITIAL_STATE, { type: 'CHOOSE_FOOTAGE' });
  speech = nextStep(speech, { type: 'RELEVANCE_CONFIRMED' });
  // 23/10/2026: הזווית נבחרת אחרי הרעיון ולפני הפורמט
  speech = nextStep(speech, { type: 'IDEA_SHARPENED', idea: 'טעות נפוצה' });
  speech = nextStep(speech, { type: 'BASICS_CONFIRMED', startingPoint: 'כללי', contentType: 'בעל ערך' });
  speech = nextStep(speech, { type: 'FOOTAGE_IS_SPEECH' });
  assert.equal(speech.footageKind, 'speech');

  let visual = nextStep(INITIAL_STATE, { type: 'CHOOSE_FOOTAGE' });
  visual = nextStep(visual, { type: 'RELEVANCE_CONFIRMED' });
  // 23/10/2026: הזווית נבחרת אחרי הרעיון ולפני הפורמט
  visual = nextStep(visual, { type: 'IDEA_SHARPENED', idea: 'טעות נפוצה' });
  visual = nextStep(visual, { type: 'BASICS_CONFIRMED', startingPoint: 'כללי', contentType: 'בעל ערך' });
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

/* 28/10/2026 (מאיה: "עומס מנטלי... צריך יותר סדר"). מ"יש לי רעיון"
   נכנסים ישר למסך הרעיון (ההגרלה ובדיקת הרלוונטיות בתוכו), ו"כן, צריך
   תסריט" נכנס ישר למגילה, בלי "שכפול הפוך?" ובלי מסך ההסבר. */
test('idea path: opening -> idea+message -> creative packaging -> basics -> format -> needs script yes -> megillah', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_IDEA' });
  assert.equal(s.screen, 'idea-sharpen');
  assert.equal(s.branch, 'idea');
  s = nextStep(s, { type: 'IDEA_SHARPENED', idea: 'טעות נפוצה בהסרת שיער' });
  assert.equal(s.screen, 'creative-packaging');
  s = nextStep(s, { type: 'PACKAGING_CHOSEN', packaging: 'סרטון של "לפני ואחרי" בשניות' });
  assert.equal(s.screen, 'content-basics');
  assert.equal(s.ideaDescription, 'טעות נפוצה בהסרת שיער. האריזה הקריאייטיבית: סרטון של "לפני ואחרי" בשניות');
  s = nextStep(s, { type: 'BASICS_CONFIRMED', startingPoint: 'כללי', contentType: 'בעל ערך' });
  assert.equal(s.screen, 'format-choice');
  assert.equal(s.formatFor, 'idea');
  s = nextStep(s, { type: 'FORMAT_SELECTED', format: 'דיבור למצלמה' });
  assert.equal(s.screen, 'needs-script-check');
  s = nextStep(s, { type: 'NEEDS_SCRIPT_YES' });
  assert.equal(s.screen, 'scratch-dump');
  assert.equal(s.branch, 'scratch');
});

test('idea path -> needs script NO ends at the summary without forcing a script', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_IDEA' });
  s = nextStep(s, { type: 'IDEA_SHARPENED', idea: 'טעות נפוצה בהסרת שיער' });
  s = nextStep(s, { type: 'BASICS_CONFIRMED', startingPoint: 'כללי', contentType: 'בעל ערך' });
  s = nextStep(s, { type: 'FORMAT_SELECTED', format: 'דיבור למצלמה' });
  s = nextStep(s, { type: 'NEEDS_SCRIPT_NO' });
  assert.equal(s.screen, 'summary');
});

test('a pulled idea from the bank comes back to the idea screen', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_IDEA' });
  s = nextStep(s, { type: 'CHOOSE_PULL_IDEA' });
  assert.equal(s.screen, 'pulled-idea');
  s = nextStep(s, { type: 'ACCEPT_PICK' });
  assert.equal(s.screen, 'idea-sharpen');
  s = nextStep(s, { type: 'BACK' });
  assert.equal(s.screen, 'pulled-idea');
});

test('a pulled reference still goes through the relevance check', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_REFERENCE' });
  s = nextStep(s, { type: 'CHOOSE_PULL_REFERENCE' });
  s = nextStep(s, { type: 'ACCEPT_PICK' });
  assert.equal(s.screen, 'relevance-check');
});

/* 26/10/2026 (מאיה): "בחלק של כתיבת תסריט מ-0 יש שם תקלה חמורה, שאת
   שואלת אותם מה הזווית הנגשה, אבל זה טעות. אמור להיות רק צ'אט שמדייק
   את הרעיון". מסך בחירת הזווית ירד, ובמקומו חידוד הרעיון עצמו. */
test('חידוד רעיון: בלי רעיון אין דרך להגיע לשפיכת התוכן', () => {
  const s = { ...INITIAL_STATE, screen: 'idea-sharpen', branch: 'scratch' };
  assert.throws(() => nextStep(s, { type: 'SCRATCH_START_DUMP' }));
});

test('חידוד רעיון: הרעיון המחודד מחליף את הישן וממשיך לשני השלבים', () => {
  const s = nextStep({ ...INITIAL_STATE, screen: 'idea-sharpen', ideaDescription: 'גבות' },
    { type: 'IDEA_SHARPENED', idea: 'למה גבות דקות מזקינות את הפנים' });
  assert.equal(s.screen, 'creative-packaging');
  assert.equal(s.ideaDescription, 'למה גבות דקות מזקינות את הפנים');
});

/* צ'אט שלא משנה כלום הוא קישוט, אבל גם אסור שהוא ימחק רעיון קיים. */
test('חידוד רעיון: רעיון ריק לא מוחק את מה שכבר היה', () => {
  const s = nextStep({ ...INITIAL_STATE, screen: 'idea-sharpen', ideaDescription: 'גבות' },
    { type: 'IDEA_SHARPENED', idea: '   ' });
  assert.equal(s.ideaDescription, 'גבות');
});

/* שלבים 2 ו-3 במסמך "סיכום כתיבת תסריטים". עד 26/10 הם היו שתי תיבות
   ריקות בפופאפ אופציונלי, ולכן פרומפט חילוץ התוכן יצא בלעדיהם. */
test('נקודת יציאה וסוג תוכן נשמרים, ורק אז בוחרים פורמט', () => {
  let s = nextStep({ ...INITIAL_STATE, screen: 'idea-sharpen', ideaDescription: 'גבות' },
    { type: 'IDEA_SHARPENED', idea: 'גבות דקות' });
  s = nextStep(s, { type: 'BASICS_CONFIRMED', startingPoint: 'סיפור לקוח', contentType: 'מכירתי' });
  assert.equal(s.screen, 'format-choice');
  assert.equal(s.formatFor, 'idea');
  assert.equal(s.startingPoint, 'סיפור לקוח');
  assert.equal(s.contentType, 'מכירתי');
});

test('כפתור חזרה מחזיר משני השלבים אל הצאט', () => {
  let s = nextStep({ ...INITIAL_STATE, screen: 'idea-sharpen', ideaDescription: 'גבות' },
    { type: 'IDEA_SHARPENED', idea: 'גבות דקות' });
  s = nextStep(s, { type: 'BACK' });
  assert.equal(s.screen, 'idea-sharpen');
});

test('שני השלבים שורדים עד הסיכום', () => {
  let s = nextStep({ ...INITIAL_STATE, screen: 'idea-sharpen', branch: 'scratch', ideaDescription: 'גבות' },
    { type: 'IDEA_SHARPENED', idea: 'גבות דקות מזקינות' });
  s = nextStep(s, { type: 'BASICS_CONFIRMED', startingPoint: 'סיפור אישי', contentType: 'אישי' });
  s = nextStep(s, { type: 'SCRATCH_START_DUMP' });
  s = nextStep(s, { type: 'SCRATCH_DUMP_READY', text: 'הכל' });
  s = nextStep(s, { type: 'SCRATCH_HOOK_CHOSEN', hook: 'הוק' });
  s = nextStep(s, { type: 'SCRATCH_REINFORCEMENT_CHOSEN', text: 'חיזוק' });
  s = nextStep(s, { type: 'SCRATCH_SCRIPT_READY', text: 'תסריט' });
  assert.equal(s.screen, 'summary');
  assert.equal(s.ideaDescription, 'גבות דקות מזקינות');
  assert.equal(s.startingPoint, 'סיפור אישי');
  assert.equal(s.contentType, 'אישי');
});

test('התחלה מחדש מנקה גם את נקודת היציאה וסוג התוכן', () => {
  const s = nextStep({ ...INITIAL_STATE, screen: 'summary', startingPoint: 'כללי', contentType: 'בידורי' },
    { type: 'RESTART' });
  assert.equal(s.startingPoint, null);
  assert.equal(s.contentType, null);
});

test('from-scratch: full 4-prompt chain (dump -> hook -> reinforcement -> distilled script) ends at summary', () => {
  // 26/10/2026: המסלול מתחיל אחרי שהרעיון כבר חודד, ולכן הוא בסטייט
  const base = { ...INITIAL_STATE, screen: 'scratch-intro', branch: 'scratch', ideaDescription: 'טעות נפוצה' };
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

/* 23/10/2026 (מאיה: "אחרי שבחרתי רעיון לפני פורמט חייב לוודא האם יש זווית
   הנגשה חזקה... ורק אחרי שיש זווית הנגשה בוחרים פורמט הנגשה"). */
test('חידוד הרעיון יושב בין הרעיון לפורמט, ולא אחרי', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_IDEA' });
  s = nextStep(s, { type: 'CHOOSE_TYPE_IDEA' });
  s = nextStep(s, { type: 'IDEA_TYPED', text: 'רעיון' });
  s = nextStep(s, { type: 'RELEVANCE_CONFIRMED' });
  assert.equal(s.screen, 'idea-sharpen', 'אחרי הרעיון לא מגיעים לחידוד');
  s = nextStep(s, { type: 'IDEA_SHARPENED', idea: 'ביקורת על קורסים זולים' });
  assert.equal(s.screen, 'creative-packaging', 'אחרי המסר לא מגיעים לאריזה הקריאייטיבית');
  s = nextStep(s, { type: 'PACKAGING_CHOSEN', packaging: 'מכתב לעצמי של לפני 5 שנים' });
  assert.equal(s.screen, 'content-basics', 'אין מסך נקודת יציאה וסוג תוכן');
  s = nextStep(s, { type: 'BASICS_CONFIRMED', startingPoint: 'כללי', contentType: 'בעל ערך' });
  assert.equal(s.screen, 'format-choice', 'הפורמט לא בא אחרי חידוד הרעיון');
});

test('קטע מצולם נשאר בבחירת סוג הקטע אחרי הרלוונטיות, לא בחידוד', () => {
  const s = nextStep({ ...INITIAL_STATE, screen: 'relevance-check', branch: 'footage' },
    { type: 'RELEVANCE_CONFIRMED' });
  assert.equal(s.screen, 'footage-type-choice');
});

test('הזווית נשמרת עד הסוף גם כשעוברים דרך הפורמט', () => {
  let s = nextStep({ ...INITIAL_STATE, screen: 'idea-sharpen', ideaDescription: 'תעודה' }, { type: 'IDEA_SHARPENED', idea: 'מיתוס שתעודה מספיקה' });
  s = nextStep(s, { type: 'FORMAT_SELECTED', format: 'דיבור למצלמה' });
  s = nextStep(s, { type: 'NEEDS_SCRIPT_YES' });
  s = nextStep(s, { type: 'CHOOSE_FROM_SCRATCH' });
  s = nextStep(s, { type: 'SCRATCH_START_DUMP' });
  assert.equal(s.screen, 'scratch-dump');
  assert.equal(s.ideaDescription, 'מיתוס שתעודה מספיקה');
});

/* 28/10/2026 (מאיה): "גם בתכלס הוא צריך להופיע גם בקטע שצולם שממירים
   לפורמט אחר וכותבים" - צ'אט חידוד הרעיון נכנס גם למסלול הזה, בין
   הרעיון לפורמט. בדיקת הרלוונטיות עדיין לא חוזרת לכאן. */
test('קטע מצולם: אחרי המסר שואלים רעיון, מחדדים אותו, ואז פורמט ותסריט', () => {
  let s = { ...INITIAL_STATE, screen: 'footage-visual-message', branch: 'footage' };
  s = nextStep(s, { type: 'FOOTAGE_VISUAL_READY' });
  assert.equal(s.screen, 'type-idea');
  s = nextStep(s, { type: 'IDEA_TYPED', text: 'המסר שאני רוצה להעביר' });
  assert.equal(s.screen, 'idea-sharpen', 'קטע שצולם לא מגיע לצ\'אט חידוד הרעיון');
  assert.equal(s.ideaDescription, 'המסר שאני רוצה להעביר');
  // אין בדיקת רלוונטיות: הקטע כבר צולם
  s = nextStep(s, { type: 'IDEA_SHARPENED', idea: 'למה אני עובדת עם מכשיר אחד' });
  assert.equal(s.screen, 'creative-packaging');
  s = nextStep(s, { type: 'PACKAGING_CHOSEN', packaging: 'השוואה מהירה' });
  assert.equal(s.screen, 'format-choice', 'בקטע שצולם אחרי האריזה בא הפורמט, לא נקודת יציאה');
  assert.equal(s.formatFor, 'idea');
  assert.equal(s.ideaDescription, 'למה אני עובדת עם מכשיר אחד. האריזה הקריאייטיבית: השוואה מהירה', 'המסר והאריזה לא ממשיכים הלאה');
  s = nextStep(s, { type: 'FORMAT_SELECTED', format: 'מסך חצוי' });
  assert.equal(s.screen, 'needs-script-check');
  assert.equal(nextStep(s, { type: 'NEEDS_SCRIPT_NO' }).screen, 'summary');
});

/* חזרה אחורה מהחידוד צריכה להחזיר אותה לתיבת הרעיון של הקטע, ולא
   לקפוץ מעל שלב. מסך שנוסף לזרימה בלי שהוא נכנס להיסטוריה הוא מלכודת. */
test('קטע מצולם: חזרה מחידוד הרעיון מחזירה למסך הרעיון', () => {
  let s = { ...INITIAL_STATE, screen: 'type-idea', branch: 'footage' };
  s = nextStep(s, { type: 'IDEA_TYPED', text: 'המסר' });
  s = nextStep(s, { type: 'BACK' });
  assert.equal(s.screen, 'type-idea');
});

test('רעיון רגיל עדיין עובר בבדיקת רלוונטיות ובזווית', () => {
  const s = nextStep({ ...INITIAL_STATE, screen: 'type-idea' }, { type: 'IDEA_TYPED', text: 'רעיון' });
  assert.equal(s.screen, 'relevance-check');
});

test('28/10: הנושא והפואנטה נשמרים בנפרד, והפואנטה היא הרעיון שממשיך', () => {
  const s = nextStep({ ...INITIAL_STATE, screen: 'idea-sharpen', branch: 'scratch', ideaDescription: 'החלקה' },
    { type: 'IDEA_SHARPENED', idea: 'החלקה שורפת מבפנים', topic: 'החלקה', punchline: 'החלקה שורפת מבפנים' });
  assert.equal(s.ideaDescription, 'החלקה שורפת מבפנים');
  assert.equal(s.ideaTopic, 'החלקה');
  assert.equal(s.ideaPunchline, 'החלקה שורפת מבפנים');
});

/* חזרה מהאריזה למסך הרעיון ושינוי הרעיון לא משאירים את הרעיון הישן
   מתחת לאריזה החדשה. */
test('אריזה אחרי שינוי רעיון נבנית על הרעיון החדש', () => {
  let s = nextStep({ ...INITIAL_STATE, screen: 'idea-sharpen', branch: 'idea' }, { type: 'IDEA_SHARPENED', idea: 'ישן' });
  s = nextStep(s, { type: 'PACKAGING_CHOSEN', packaging: 'א' });
  s = nextStep({ ...s, screen: 'idea-sharpen' }, { type: 'IDEA_SHARPENED', idea: 'חדש' });
  s = nextStep(s, { type: 'PACKAGING_CHOSEN', packaging: 'ב' });
  assert.equal(s.ideaDescription, 'חדש. האריזה הקריאייטיבית: ב');
});
