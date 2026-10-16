import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickEncouragement, ENCOURAGEMENTS, domainTheme, formatElapsed, dnaSteps, challengeIndexForToday, mascotMood, mascotFace } from '../js/video-assistant-fx.js';

test('pickEncouragement never repeats the immediately previous phrase', () => {
  let last = pickEncouragement();
  for (let i = 0; i < 200; i++) {
    const next = pickEncouragement();
    assert.notEqual(next, last, `repeated "${next}" back to back`);
    assert.ok(ENCOURAGEMENTS.includes(next));
    last = next;
  }
});

test('domainTheme returns a real glow color for a known domain', () => {
  const t = domainTheme('יופי וקוסמטיקה');
  assert.equal(t.name, 'rose');
  assert.match(t.glow, /^#[0-9a-f]{6}$/i);
});

test('domainTheme falls back to a default for an unknown/missing domain', () => {
  assert.equal(domainTheme('לא קיים').name, 'default');
  assert.equal(domainTheme(null).name, 'default');
  assert.equal(domainTheme(undefined).name, 'default');
});

test('formatElapsed formats seconds, minutes, and both', () => {
  assert.equal(formatElapsed(45000), '45 שניות');
  assert.equal(formatElapsed(120000), '2 דקות');
  assert.equal(formatElapsed(185000), '3 דקות ו-5 שניות');
});

test('formatElapsed returns null for missing/invalid input', () => {
  assert.equal(formatElapsed(0), null);
  assert.equal(formatElapsed(-50), null);
  assert.equal(formatElapsed(undefined), null);
});

test('dnaSteps marks steps before the current phase as done, current as current, rest pending', () => {
  const steps = dnaSteps('scratch', 2, 5);
  assert.equal(steps.length, 7); // scratch has 7 named steps
  const doneCount = steps.filter((s) => s.status === 'done').length;
  const currentCount = steps.filter((s) => s.status === 'current').length;
  assert.equal(currentCount, 1);
  assert.ok(doneCount >= 0);
  // exactly one current, and done steps all come before it
  const currentIdx = steps.findIndex((s) => s.status === 'current');
  steps.forEach((s, i) => {
    if (i < currentIdx) assert.equal(s.status, 'done');
    if (i > currentIdx) assert.equal(s.status, 'pending');
  });
});

test('dnaSteps falls back to the "idea" step list for an unknown branch', () => {
  const steps = dnaSteps('not-a-real-branch', 0, 5);
  assert.equal(steps.length, 4);
  assert.equal(steps[0].name, 'רעיון');
});

test('dnaSteps at phase 0 of 1 total phases does not divide by zero', () => {
  const steps = dnaSteps('footage', 0, 1);
  assert.equal(steps[0].status, 'current');
});

test('challengeIndexForToday returns a stable index within range, same all day', () => {
  const idx1 = challengeIndexForToday(14);
  const idx2 = challengeIndexForToday(14);
  assert.equal(idx1, idx2);
  assert.ok(idx1 >= 0 && idx1 < 14);
});

test('challengeIndexForToday stays in range for a different list length', () => {
  const idx = challengeIndexForToday(3);
  assert.ok(idx >= 0 && idx < 3);
});

test('mascotMood picks celebrate for summary, winking for a reveal screen, happy as default', () => {
  assert.equal(mascotMood('summary'), 'celebrate');
  assert.equal(mascotMood('pulled-idea'), 'winking');
  assert.equal(mascotMood('transcribe'), 'thinking');
  assert.equal(mascotMood('opening'), 'happy');
});

test('mascotFace returns a real face for every known mood and a fallback otherwise', () => {
  assert.equal(mascotFace('celebrate'), '🤩');
  assert.equal(mascotFace('not-a-real-mood'), mascotFace('happy'));
});
