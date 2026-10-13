import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDuplicationPrompt, buildScriptPrompt } from '../js/video-assistant-prompts.js';

test('buildDuplicationPrompt fills audience, domain and hook, keeps her exact wording', () => {
  const prompt = buildDuplicationPrompt({ audience: 'נשים 25-40', domain: 'יופי וקוסמטיקה', hook: 'ככה התחלתי בלי ניסיון' });
  assert.match(prompt, /הקהל יעד העיקרי שלי הוא: נשים 25-40/);
  assert.match(prompt, /התחום שלי הוא: יופי וקוסמטיקה/);
  assert.match(prompt, /אני רוצה שתקח את ההוק הזה: ככה התחלתי בלי ניסיון/);
  assert.match(prompt, /עוד 30 רעיונות חזקים/);
  assert.match(prompt, /בול לשכפל מגנון\s*\n?1:1 ואותו אורך/);
});

test('buildDuplicationPrompt falls back to a bracket placeholder when audience is missing', () => {
  const prompt = buildDuplicationPrompt({ audience: '', domain: 'כושר ותזונה', hook: 'הוק' });
  assert.match(prompt, /הקהל יעד העיקרי שלי הוא: \[הקהל שלי\]/);
});

test('buildScriptPrompt fills the chosen hook and her own words', () => {
  const prompt = buildScriptPrompt({ hook: 'ככה התחלתי בלי ניסיון', herWords: 'סיפרתי על הלקוחה הראשונה שלי' });
  assert.match(prompt, /זה ההוק שבחרתי: ככה התחלתי בלי ניסיון/);
  assert.match(prompt, /זה מה שיש לי להגיד: סיפרתי על הלקוחה הראשונה שלי/);
  assert.match(prompt, /אל תעשה יותר ארוך/);
});
