import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_STATE, nextStep } from '../js/video-assistant-flow.js';

test('initial state is the opening screen', () => {
  assert.equal(INITIAL_STATE.screen, 'opening');
});

test('no-idea -> pull-idea -> straight to her-words (no transcription needed)', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_NO_IDEA' });
  assert.equal(s.screen, 'no-idea-choice');
  s = nextStep(s, { type: 'CHOOSE_PULL_IDEA' });
  assert.equal(s.screen, 'pulled-idea');
  s = nextStep(s, { type: 'ACCEPT_PICK' });
  assert.equal(s.screen, 'her-words');
  assert.equal(s.branch, 'idea');
});

test('no-idea -> reference -> transcribe -> prompt1 -> her-words -> prompt2 -> read-aloud -> done', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_NO_IDEA' });
  s = nextStep(s, { type: 'CHOOSE_REFERENCE' });
  assert.equal(s.screen, 'pulled-reference');
  s = nextStep(s, { type: 'ACCEPT_PICK' });
  assert.equal(s.screen, 'transcribe');
  s = nextStep(s, { type: 'CONFIRM_DONE' });
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

test('REROLL replaces the reroll count and keeps the same screen', () => {
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_NO_IDEA' });
  s = nextStep(s, { type: 'CHOOSE_REFERENCE' });
  const before = nextStep(s, { type: 'REROLL' });
  assert.equal(before.screen, 'pulled-reference');
  assert.equal(before.rerollCount, 1);
});

test('has-idea -> reverse-duplication: tool only suggests keywords, she searches herself', () => {
  // 14/10/2026 (מאיה, שני תיקונים): לא matchInspirationQuery אוטומטי - רק
  // הצעת מילות חיפוש (suggestSearchKeywords), והיא עצמה מוצאת ומאשרת.
  let s = nextStep(INITIAL_STATE, { type: 'CHOOSE_HAS_IDEA' });
  assert.equal(s.screen, 'has-idea-choice');
  s = nextStep(s, { type: 'CHOOSE_REVERSE_DUPLICATION' });
  assert.equal(s.screen, 'describe-idea');
  assert.equal(s.branch, 'idea-search');
  s = nextStep(s, { type: 'SEARCH_GUIDANCE_READY', idea: 'הסיפור שלי על בולמיה', keywords: ['הסיפור שלי', 'סיפור אישי שמחבר'] });
  assert.equal(s.screen, 'search-guidance');
  assert.equal(s.ideaDescription, 'הסיפור שלי על בולמיה');
  assert.deepEqual(s.searchKeywords, ['הסיפור שלי', 'סיפור אישי שמחבר']);
  s = nextStep(s, { type: 'SKIP_TO_TRANSCRIBE' });
  assert.equal(s.screen, 'transcribe'); // כמו רפרנס רגיל - דורש תמלול לפני ששכפול ממשיך
});

test('has-idea -> from-scratch is its own branch, independent of reverse-duplication', () => {
  const fresh = nextStep(INITIAL_STATE, { type: 'CHOOSE_HAS_IDEA' });
  const s = nextStep(fresh, { type: 'CHOOSE_FROM_SCRATCH' });
  assert.equal(s.screen, 'from-scratch');
  assert.equal(s.branch, 'scratch');
});

test('nextStep throws on an unknown action instead of silently no-op-ing', () => {
  assert.throws(() => nextStep(INITIAL_STATE, { type: 'NOT_A_REAL_ACTION' }), /unknown action/i);
});
