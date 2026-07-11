import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIES,
  STATUSES,
  nextStatus,
  prevStatus,
  filterIdeas,
  validateIdea,
} from '../js/ideas-logic.js';

test('CATEGORIES has the 4 expected values in order', () => {
  assert.deepEqual(CATEGORIES, ['ערכי', 'אישי', 'מכירתי', 'בידורי']);
});

test('STATUSES has the 4 expected stages in order', () => {
  assert.deepEqual(STATUSES, ['רעיון', 'מתוכנן', 'צולם/הוקלט', 'פורסם']);
});

test('nextStatus moves forward one stage', () => {
  assert.equal(nextStatus('רעיון'), 'מתוכנן');
  assert.equal(nextStatus('מתוכנן'), 'צולם/הוקלט');
  assert.equal(nextStatus('צולם/הוקלט'), 'פורסם');
});

test('nextStatus is a no-op at the last stage', () => {
  assert.equal(nextStatus('פורסם'), 'פורסם');
});

test('prevStatus moves backward one stage', () => {
  assert.equal(prevStatus('פורסם'), 'צולם/הוקלט');
  assert.equal(prevStatus('מתוכנן'), 'רעיון');
});

test('prevStatus is a no-op at the first stage', () => {
  assert.equal(prevStatus('רעיון'), 'רעיון');
});

test('filterIdeas matches free text in title or hookText', () => {
  const ideas = [
    { title: 'טעות נפוצה', hookText: 'בעלי עסקים נתלים במספרים', category: 'ערכי', status: 'פורסם' },
    { title: 'יום הולדת', hookText: 'רגע כנות', category: 'אישי', status: 'רעיון' },
  ];
  const result = filterIdeas(ideas, { text: 'מספרים' });
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'טעות נפוצה');
});

test('filterIdeas filters by category', () => {
  const ideas = [
    { title: 'א', hookText: '', category: 'ערכי', status: 'רעיון' },
    { title: 'ב', hookText: '', category: 'אישי', status: 'רעיון' },
  ];
  const result = filterIdeas(ideas, { category: 'אישי' });
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'ב');
});

test('filterIdeas filters by status', () => {
  const ideas = [
    { title: 'א', hookText: '', category: 'ערכי', status: 'רעיון' },
    { title: 'ב', hookText: '', category: 'ערכי', status: 'פורסם' },
  ];
  const result = filterIdeas(ideas, { status: 'פורסם' });
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'ב');
});

test('filterIdeas combines text + category + status', () => {
  const ideas = [
    { title: 'רעיון טוב', hookText: '', category: 'ערכי', status: 'רעיון' },
    { title: 'רעיון אחר', hookText: '', category: 'ערכי', status: 'פורסם' },
    { title: 'רעיון טוב', hookText: '', category: 'אישי', status: 'רעיון' },
  ];
  const result = filterIdeas(ideas, { text: 'רעיון טוב', category: 'ערכי', status: 'רעיון' });
  assert.equal(result.length, 1);
  assert.equal(result[0].category, 'ערכי');
});

test('validateIdea requires title, category, hookText', () => {
  const errors = validateIdea({ title: '', category: '', hookText: '' });
  assert.equal(errors.length, 3);
});

test('validateIdea passes with required fields filled', () => {
  const errors = validateIdea({ title: 'כותרת', category: 'ערכי', hookText: 'טקסט' });
  assert.equal(errors.length, 0);
});

test('validateIdea rejects an unknown category', () => {
  const errors = validateIdea({ title: 'כותרת', category: 'לא קיים', hookText: 'טקסט' });
  assert.equal(errors.length, 1);
});
