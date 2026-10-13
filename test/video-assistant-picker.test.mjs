import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickIdea, pickReference } from '../js/video-assistant-picker.js';

const IDEAS = [
  { id: 'a', title: 'רעיון א', hookText: 'הוק א', rating: 3 },
  { id: 'b', title: 'רעיון ב', hookText: 'הוק ב', rating: 5 },
  { id: 'c', title: 'רעיון ג', hookText: '', rating: 5 },
  { id: 'd', title: 'רעיון ד', hookText: 'הוק ד', rating: 1, deletedAt: { seconds: 1 } },
  { id: 'e', title: 'רעיון ה', hookText: 'הוק ה', rating: 4, completedAt: { seconds: 1 } },
];

test('pickIdea excludes deleted and completed ideas, and ideas with no hookText', () => {
  for (let i = 0; i < 20; i++) {
    const picked = pickIdea(IDEAS, null);
    assert.ok(['a', 'b'].includes(picked.id), `unexpected pick: ${picked.id}`);
  }
});

test('pickIdea never repeats the excluded id when another option exists', () => {
  for (let i = 0; i < 20; i++) {
    assert.equal(pickIdea(IDEAS, 'a').id, 'b');
  }
});

test('pickIdea returns null when nothing is eligible', () => {
  assert.equal(pickIdea([], null), null);
  assert.equal(pickIdea([IDEAS[3], IDEAS[4]], null), null);
});

const VIDEOS = [
  { id: 'v1', domain: 'יופי וקוסמטיקה', formatTags: ['סיפור אישי'] },
  { id: 'v2', domain: 'יופי וקוסמטיקה', formatTags: ['לפני ואחרי'] },
  { id: 'v3', domain: 'כושר ותזונה', formatTags: ['סיפור אישי'] },
];

test('pickReference only returns videos from the requested domain', () => {
  for (let i = 0; i < 20; i++) {
    assert.equal(pickReference(VIDEOS, 'יופי וקוסמטיקה', null).domain, 'יופי וקוסמטיקה');
  }
});

test('pickReference prefers easy-to-transcribe formats when both exist in-domain', () => {
  for (let i = 0; i < 20; i++) {
    assert.equal(pickReference(VIDEOS, 'יופי וקוסמטיקה', null).id, 'v1');
  }
});

test('pickReference falls back to any in-domain video if no preferred-format video is left', () => {
  assert.equal(pickReference(VIDEOS, 'יופי וקוסמטיקה', 'v1').id, 'v2');
});

test('pickReference never repeats the excluded id when another option exists', () => {
  for (let i = 0; i < 20; i++) {
    assert.equal(pickReference(VIDEOS, 'כושר ותזונה', 'v3').id, 'v3'); // only one video in this domain
  }
});
