import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIES,
  STATUSES,
  PERSUASION_STAGES,
  categoryColorVar,
  nextStatus,
  prevStatus,
  filterIdeas,
  validateIdea,
} from '../js/ideas-logic.js';

test('CATEGORIES has the 4 expected values in order', () => {
  assert.deepEqual(CATEGORIES, ['בעל ערך', 'אישי', 'מכירתי', 'בידורי']);
});

test('STATUSES has the 3 expected stages in order', () => {
  assert.deepEqual(STATUSES, ['רעיון', 'בתכנון', 'פורסם']);
});

test('PERSUASION_STAGES has the 3 expected stages', () => {
  assert.equal(PERSUASION_STAGES.length, 3);
  assert.match(PERSUASION_STAGES[0], /מודעות לבעיה/);
});

test('categoryColorVar maps each category to a distinct CSS var', () => {
  assert.equal(categoryColorVar('בעל ערך'), 'var(--cat-baal-erech)');
  assert.equal(categoryColorVar('אישי'), 'var(--cat-ishi)');
  assert.equal(categoryColorVar('מכירתי'), 'var(--cat-mechirti)');
  assert.equal(categoryColorVar('בידורי'), 'var(--cat-biduri)');
});

test('nextStatus moves forward one stage', () => {
  assert.equal(nextStatus('רעיון'), 'בתכנון');
  assert.equal(nextStatus('בתכנון'), 'פורסם');
});

test('nextStatus is a no-op at the last stage', () => {
  assert.equal(nextStatus('פורסם'), 'פורסם');
});

test('prevStatus moves backward one stage', () => {
  assert.equal(prevStatus('פורסם'), 'בתכנון');
  assert.equal(prevStatus('בתכנון'), 'רעיון');
});

test('prevStatus is a no-op at the first stage', () => {
  assert.equal(prevStatus('רעיון'), 'רעיון');
});

test('filterIdeas matches free text in title or hookText', () => {
  const ideas = [
    { title: 'טעות נפוצה', hookText: 'בעלי עסקים נתלים במספרים', category: 'בעל ערך', status: 'פורסם' },
    { title: 'יום הולדת', hookText: 'רגע כנות', category: 'אישי', status: 'רעיון' },
  ];
  const result = filterIdeas(ideas, { text: 'מספרים' });
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'טעות נפוצה');
});

test('filterIdeas works when hookText is missing (now optional)', () => {
  const ideas = [{ title: 'רעיון בלי הוק', category: 'בעל ערך', status: 'רעיון' }];
  const result = filterIdeas(ideas, { text: 'רעיון' });
  assert.equal(result.length, 1);
});

test('filterIdeas filters by category', () => {
  const ideas = [
    { title: 'א', hookText: '', category: 'בעל ערך', status: 'רעיון' },
    { title: 'ב', hookText: '', category: 'אישי', status: 'רעיון' },
  ];
  const result = filterIdeas(ideas, { category: 'אישי' });
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'ב');
});

test('filterIdeas filters by status', () => {
  const ideas = [
    { title: 'א', hookText: '', category: 'בעל ערך', status: 'רעיון' },
    { title: 'ב', hookText: '', category: 'בעל ערך', status: 'פורסם' },
  ];
  const result = filterIdeas(ideas, { status: 'פורסם' });
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'ב');
});

test('filterIdeas filters by viral potential', () => {
  const ideas = [
    { title: 'א', hookText: '', category: 'בעל ערך', status: 'רעיון', viralPotential: true },
    { title: 'ב', hookText: '', category: 'בעל ערך', status: 'רעיון', viralPotential: false },
  ];
  assert.equal(filterIdeas(ideas, { viral: 'כן' }).length, 1);
  assert.equal(filterIdeas(ideas, { viral: 'כן' })[0].title, 'א');
  assert.equal(filterIdeas(ideas, { viral: 'לא' }).length, 1);
  assert.equal(filterIdeas(ideas, { viral: 'לא' })[0].title, 'ב');
});

test('filterIdeas combines text + category + status + viral', () => {
  const ideas = [
    { title: 'רעיון טוב', hookText: '', category: 'בעל ערך', status: 'רעיון', viralPotential: true },
    { title: 'רעיון אחר', hookText: '', category: 'בעל ערך', status: 'פורסם', viralPotential: true },
    { title: 'רעיון טוב', hookText: '', category: 'אישי', status: 'רעיון', viralPotential: true },
  ];
  const result = filterIdeas(ideas, { text: 'רעיון טוב', category: 'בעל ערך', status: 'רעיון', viral: 'כן' });
  assert.equal(result.length, 1);
  assert.equal(result[0].category, 'בעל ערך');
});

test('validateIdea requires only title and category (hookText is optional now)', () => {
  const errors = validateIdea({ title: '', category: '' });
  assert.equal(errors.length, 2);
});

test('validateIdea passes with just title and category filled', () => {
  const errors = validateIdea({ title: 'כותרת', category: 'בעל ערך' });
  assert.equal(errors.length, 0);
});

test('validateIdea rejects an unknown category', () => {
  const errors = validateIdea({ title: 'כותרת', category: 'לא קיים' });
  assert.equal(errors.length, 1);
});
