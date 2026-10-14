import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_STATE, nextStep } from '../js/video-assistant-flow.js';

test('initial state is the opening screen', () => {
  assert.equal(INITIAL_STATE.screen, 'opening');
});

test('footage path: footage -> relevance check -> use as-is -> done', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_FOOTAGE' });
  assert.equal(s.screen, 'relevance-check');
  assert.equal(s.branch, 'footage');
  s = nextStep(s, { type: 'RELEVANCE_CONFIRMED' });
  assert.equal(s.screen, 'footage-use-choice');
  s = nextStep(s, { type: 'FOOTAGE_AS_IS' });
  assert.equal(s.screen, 'footage-done');
});

test('footage path: convert -> format choice -> freeform script -> done', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_FOOTAGE' });
  s = nextStep(s, { type: 'RELEVANCE_CONFIRMED' });
  s = nextStep(s, { type: 'FOOTAGE_CONVERT' });
  assert.equal(s.screen, 'format-choice');
  assert.equal(s.formatFor, 'footage');
  s = nextStep(s, { type: 'FORMAT_ACKNOWLEDGED' });
  assert.equal(s.screen, 'footage-script');
  s = nextStep(s, { type: 'FOOTAGE_SCRIPT_SUBMITTED', text: 'התסריט שלי' });
  assert.equal(s.screen, 'footage-done');
  assert.equal(s.herWords, 'התסריט שלי');
});

test('reference path (שכפול רגיל): skips format-choice and needs-script, goes straight to transcribe', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_REFERENCE' });
  assert.equal(s.screen, 'pulled-reference');
  assert.equal(s.branch, 'reference');
  s = nextStep(s, { type: 'ACCEPT_PICK' });
  assert.equal(s.screen, 'relevance-check');
  s = nextStep(s, { type: 'RELEVANCE_CONFIRMED' });
  assert.equal(s.screen, 'transcribe'); // duplication already implies a script is being built
});

test('idea path (typed) -> relevance -> format -> needs script yes -> choose method -> reverse duplication', () => {
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
  s = nextStep(s, { type: 'FORMAT_ACKNOWLEDGED' });
  assert.equal(s.screen, 'needs-script-check');
  s = nextStep(s, { type: 'NEEDS_SCRIPT_YES' });
  assert.equal(s.screen, 'has-idea-choice');
  s = nextStep(s, { type: 'CHOOSE_REVERSE_DUPLICATION' });
  assert.equal(s.screen, 'describe-idea');
  assert.equal(s.branch, 'idea-search');
});

test('idea path -> needs script NO ends the wizard without forcing a script', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_IDEA' });
  s = nextStep(s, { type: 'CHOOSE_TYPE_IDEA' });
  s = nextStep(s, { type: 'IDEA_TYPED', text: 'רעיון' });
  s = nextStep(s, { type: 'RELEVANCE_CONFIRMED' });
  s = nextStep(s, { type: 'FORMAT_ACKNOWLEDGED' });
  s = nextStep(s, { type: 'NEEDS_SCRIPT_NO' });
  assert.equal(s.screen, 'no-script-done');
});

test('idea path from the saved ideas bank also goes through relevance + format + needs-script', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_IDEA' });
  s = nextStep(s, { type: 'CHOOSE_PULL_IDEA' });
  assert.equal(s.screen, 'pulled-idea');
  s = nextStep(s, { type: 'ACCEPT_PICK' });
  assert.equal(s.screen, 'relevance-check');
  s = nextStep(s, { type: 'RELEVANCE_CONFIRMED' });
  assert.equal(s.screen, 'format-choice');
  s = nextStep(s, { type: 'FORMAT_ACKNOWLEDGED' });
  assert.equal(s.screen, 'needs-script-check');
});

test('has-idea-choice -> from-scratch is its own branch', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_IDEA' });
  s = nextStep(s, { type: 'CHOOSE_TYPE_IDEA' });
  s = nextStep(s, { type: 'IDEA_TYPED', text: 'רעיון' });
  s = nextStep(s, { type: 'RELEVANCE_CONFIRMED' });
  s = nextStep(s, { type: 'FORMAT_ACKNOWLEDGED' });
  s = nextStep(s, { type: 'NEEDS_SCRIPT_YES' });
  s = nextStep(s, { type: 'CHOOSE_FROM_SCRATCH' });
  assert.equal(s.screen, 'from-scratch');
  assert.equal(s.branch, 'scratch');
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

test('shared pipeline: transcribe -> prompt1 -> her-words -> prompt2 -> read-aloud -> done', () => {
  const base = { ...INITIAL_STATE, screen: 'transcribe' };
  let s = nextStep(base, { type: 'CONFIRM_DONE' });
  assert.equal(s.screen, 'prompt1');
  s = nextStep(s, { type: 'HOOK_CHOSEN', hook: 'ההוק שבחרה' });
  assert.equal(s.screen, 'her-words');
  assert.equal(s.hook, 'ההוק שבחרה');
  s = nextStep(s, { type: 'HER_WORDS_SUBMITTED', text: 'מה שיש לה להגיד' });
  assert.equal(s.screen, 'prompt2');
  assert.equal(s.herWords, 'מה שיש לה להגיד');
  s = nextStep(s, { type: 'SCRIPT_READY' });
  assert.equal(s.screen, 'read-aloud');
  s = nextStep(s, { type: 'CONFIRM_DONE' });
  assert.equal(s.screen, 'done');
});

test('REROLL keeps the current screen and only bumps the count', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_REFERENCE' });
  const before = nextStep(s, { type: 'REROLL' });
  assert.equal(before.screen, 'pulled-reference');
  assert.equal(before.rerollCount, 1);
});

test('nextStep throws on an unknown action instead of silently no-op-ing', () => {
  assert.throws(() => nextStep(INITIAL_STATE, { type: 'NOT_A_REAL_ACTION' }), /unknown action/i);
});
