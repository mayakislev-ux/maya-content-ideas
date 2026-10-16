import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_STATE, nextStep } from '../js/video-assistant-flow.js';

test('initial state is the opening screen with empty history', () => {
  assert.equal(INITIAL_STATE.screen, 'opening');
  assert.deepEqual(INITIAL_STATE.history, []);
});

test('footage path: footage -> relevance check -> use as-is -> summary', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_FOOTAGE' });
  assert.equal(s.screen, 'relevance-check');
  assert.equal(s.branch, 'footage');
  s = nextStep(s, { type: 'RELEVANCE_CONFIRMED' });
  assert.equal(s.screen, 'footage-use-choice');
  s = nextStep(s, { type: 'FOOTAGE_AS_IS' });
  assert.equal(s.screen, 'summary');
});

test('footage path: convert -> format selection -> freeform script -> summary', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_FOOTAGE' });
  s = nextStep(s, { type: 'RELEVANCE_CONFIRMED' });
  s = nextStep(s, { type: 'FOOTAGE_CONVERT' });
  assert.equal(s.screen, 'format-choice');
  assert.equal(s.formatFor, 'footage');
  s = nextStep(s, { type: 'FORMAT_SELECTED', format: 'וויס אובר' });
  assert.equal(s.selectedFormat, 'וויס אובר');
  assert.equal(s.screen, 'footage-script');
  s = nextStep(s, { type: 'FOOTAGE_SCRIPT_SUBMITTED', text: 'התסריט שלי' });
  assert.equal(s.screen, 'summary');
  assert.equal(s.herWords, 'התסריט שלי');
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
  assert.equal(s.screen, 'describe-idea');
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
  assert.equal(s.screen, 'scratch-intro');
  assert.equal(s.branch, 'scratch');
});

test('from-scratch: full 4-prompt chain (dump -> hook -> reinforcement -> distilled script) ends at summary', () => {
  const base = { ...INITIAL_STATE, screen: 'scratch-intro', branch: 'scratch' };
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

test('reverse-duplication: tool only suggests keywords, she searches herself', () => {
  const base = { ...INITIAL_STATE, screen: 'has-idea-choice', branch: 'idea' };
  let s = nextStep(base, { type: 'CHOOSE_REVERSE_DUPLICATION' });
  assert.equal(s.screen, 'describe-idea');
  assert.equal(s.branch, 'idea-search');
  s = nextStep(s, { type: 'SEARCH_GUIDANCE_READY', idea: 'הסיפור שלי על בולמיה', keywords: ['הסיפור שלי', 'סיפור אישי שמחבר'] });
  assert.equal(s.screen, 'search-guidance');
  assert.equal(s.ideaDescription, 'הסיפור שלי על בולמיה');
  assert.deepEqual(s.searchKeywords, ['הסיפור שלי', 'סיפור אישי שמחבר']);
  s = nextStep(s, { type: 'SKIP_TO_TRANSCRIBE' });
  assert.equal(s.screen, 'transcribe');
});

test('shared pipeline: transcribe -> prompt1 -> her-words -> prompt2 -> read-aloud -> summary', () => {
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
  assert.equal(s.screen, 'footage-use-choice');

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
