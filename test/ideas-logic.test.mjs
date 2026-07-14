import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIES,
  PERSUASION_STAGES,
  RATINGS,
  STRONG_RATING,
  AUDIENCE_SCOPES,
  VIRAL_SCOPE,
  CATEGORY_DEFINITIONS,
  PERSUASION_STAGE_DEFINITIONS,
  categoryColorVar,
  filterIdeas,
  validateIdea,
  pickRandomIdea,
  sortIdeas,
  findSimilarIdea,
} from '../js/ideas-logic.js';

test('CATEGORIES has the 4 expected values in order', () => {
  assert.deepEqual(CATEGORIES, ['בעל ערך', 'אישי', 'מכירתי', 'בידורי']);
});

test('PERSUASION_STAGES has the 3 expected stages', () => {
  assert.equal(PERSUASION_STAGES.length, 3);
  assert.match(PERSUASION_STAGES[0], /מודעות לבעיה/);
});

test('RATINGS has the 3 expected labels with emoji', () => {
  assert.deepEqual(RATINGS, ['🔥 חייב לצלם', '⭐ שווה לצלם', '💭 רעיון לעתיד']);
  assert.equal(STRONG_RATING, '🔥 חייב לצלם');
});

test('AUDIENCE_SCOPES has the 3 expected values, VIRAL_SCOPE is "רחב"', () => {
  assert.deepEqual(AUDIENCE_SCOPES, ['עיקרי', 'משני', 'רחב']);
  assert.equal(VIRAL_SCOPE, 'רחב');
});

test('CATEGORY_DEFINITIONS has an entry for every category', () => {
  for (const cat of CATEGORIES) {
    assert.ok(CATEGORY_DEFINITIONS[cat] && CATEGORY_DEFINITIONS[cat].length > 0);
  }
});

test('PERSUASION_STAGE_DEFINITIONS has an entry for every stage', () => {
  for (const stage of PERSUASION_STAGES) {
    assert.ok(PERSUASION_STAGE_DEFINITIONS[stage] && PERSUASION_STAGE_DEFINITIONS[stage].length > 0);
  }
});

test('categoryColorVar maps each category to a distinct CSS var', () => {
  assert.equal(categoryColorVar('בעל ערך'), 'var(--cat-baal-erech)');
  assert.equal(categoryColorVar('אישי'), 'var(--cat-ishi)');
  assert.equal(categoryColorVar('מכירתי'), 'var(--cat-mechirti)');
  assert.equal(categoryColorVar('בידורי'), 'var(--cat-biduri)');
});

test('filterIdeas matches free text in title or hookText', () => {
  const ideas = [
    { title: 'טעות נפוצה', hookText: 'בעלי עסקים נתלים במספרים', category: 'בעל ערך' },
    { title: 'יום הולדת', hookText: 'רגע כנות', category: 'אישי' },
  ];
  const result = filterIdeas(ideas, { text: 'מספרים' });
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'טעות נפוצה');
});

test('filterIdeas filters by category and audience scope together', () => {
  const ideas = [
    { title: 'א', hookText: '', category: 'בעל ערך', audienceScope: 'רחב' },
    { title: 'ב', hookText: '', category: 'אישי', audienceScope: 'עיקרי' },
    { title: 'ג', hookText: '', category: 'בעל ערך', audienceScope: 'רחב' },
  ];
  assert.equal(filterIdeas(ideas, { category: 'בעל ערך' }).length, 2);
  assert.equal(filterIdeas(ideas, { audienceScope: 'רחב' }).length, 2);
  assert.equal(filterIdeas(ideas, { category: 'בעל ערך', audienceScope: 'עיקרי' }).length, 0);
});

test('filterIdeas filters by persuasion stage', () => {
  const ideas = [
    { title: 'א', hookText: '', category: 'בעל ערך', persuasionStage: PERSUASION_STAGES[0] },
    { title: 'ב', hookText: '', category: 'בעל ערך', persuasionStage: PERSUASION_STAGES[1] },
  ];
  const result = filterIdeas(ideas, { persuasionStage: PERSUASION_STAGES[1] });
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'ב');
});

test('filterIdeas filters by rating', () => {
  const ideas = [
    { title: 'א', hookText: '', category: 'בעל ערך', rating: '🔥 חייב לצלם' },
    { title: 'ב', hookText: '', category: 'בעל ערך', rating: '💭 רעיון לעתיד' },
  ];
  const result = filterIdeas(ideas, { rating: '🔥 חייב לצלם' });
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'א');
});

test('validateIdea requires every field', () => {
  const errors = validateIdea({ title: '', category: '', persuasionStage: '', rating: '', audienceScope: '' });
  assert.equal(errors.length, 5);
});

test('validateIdea passes when every field is filled', () => {
  const errors = validateIdea({
    title: 'כותרת',
    category: 'בעל ערך',
    persuasionStage: PERSUASION_STAGES[0],
    rating: '🔥 חייב לצלם',
    audienceScope: 'עיקרי',
  });
  assert.equal(errors.length, 0);
});

test('validateIdea rejects an unknown category', () => {
  const errors = validateIdea({
    title: 'כותרת',
    category: 'לא קיים',
    persuasionStage: PERSUASION_STAGES[0],
    rating: '🔥 חייב לצלם',
    audienceScope: 'עיקרי',
  });
  assert.equal(errors.length, 1);
});

test('pickRandomIdea returns null for an empty list', () => {
  assert.equal(pickRandomIdea([]), null);
});

test('pickRandomIdea always returns an element from the list', () => {
  const ideas = [{ title: 'א' }, { title: 'ב' }, { title: 'ג' }];
  for (let i = 0; i < 20; i++) {
    const picked = pickRandomIdea(ideas);
    assert.ok(ideas.includes(picked));
  }
});

test('sortIdeas defaults to newest first', () => {
  const ideas = [
    { title: 'ישן', createdAt: { toMillis: () => 100 } },
    { title: 'חדש', createdAt: { toMillis: () => 200 } },
  ];
  const sorted = sortIdeas(ideas, 'newest');
  assert.equal(sorted[0].title, 'חדש');
});

test('sortIdeas can sort oldest first', () => {
  const ideas = [
    { title: 'ישן', createdAt: { toMillis: () => 100 } },
    { title: 'חדש', createdAt: { toMillis: () => 200 } },
  ];
  const sorted = sortIdeas(ideas, 'oldest');
  assert.equal(sorted[0].title, 'ישן');
});

test('sortIdeas can sort by rating strength', () => {
  const ideas = [
    { title: 'עתידי', rating: '💭 רעיון לעתיד' },
    { title: 'חזק', rating: '🔥 חייב לצלם' },
  ];
  const sorted = sortIdeas(ideas, 'rating');
  assert.equal(sorted[0].title, 'חזק');
});

test('findSimilarIdea finds an exact title match', () => {
  const ideas = [{ id: '1', title: 'טעות נפוצה בקוסמטיקה' }, { id: '2', title: 'יום הולדת' }];
  const match = findSimilarIdea(ideas, 'טעות נפוצה בקוסמטיקה');
  assert.equal(match.id, '1');
});

test('findSimilarIdea finds a close word-overlap match', () => {
  const ideas = [{ id: '1', title: 'טעות נפוצה בקוסמטיקה אצל לקוחות' }];
  const match = findSimilarIdea(ideas, 'טעות נפוצה בקוסמטיקה');
  assert.equal(match.id, '1');
});

test('findSimilarIdea returns null when nothing matches well', () => {
  const ideas = [{ id: '1', title: 'יום הולדת מרגש' }];
  const match = findSimilarIdea(ideas, 'איך לבחור קרם פנים לעור רגיש');
  assert.equal(match, null);
});
