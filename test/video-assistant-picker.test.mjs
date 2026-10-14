import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickIdea, pickReference } from '../js/video-assistant-picker.js';

const IDEAS = [
  { id: 'a', title: 'רעיון א', hookText: 'הוק א', rating: 3 },
  { id: 'b', title: 'רעיון ב', hookText: 'הוק ב', rating: 5 },
  { id: 'c', title: 'רעיון ג', hookText: '', rating: 5 }, // כותרת בלי hookText - עדיין לגיטימי
  { id: 'd', title: 'רעיון ד', hookText: 'הוק ד', rating: 1, deletedAt: { seconds: 1 } },
  { id: 'e', title: 'רעיון ה', hookText: 'הוק ה', rating: 4, completedAt: { seconds: 1 } },
  { id: 'f', title: '', hookText: '', rating: 0 }, // בלי כותרת וגם בלי hookText - לא לגיטימי
];

test('pickIdea excludes deleted/completed ideas and ideas with no title, but allows no hookText', () => {
  for (let i = 0; i < 20; i++) {
    const picked = pickIdea(IDEAS, null);
    assert.ok(['a', 'b', 'c'].includes(picked.id), `unexpected pick: ${picked.id}`);
  }
});

test('pickIdea never repeats the excluded id when another option exists', () => {
  for (let i = 0; i < 30; i++) {
    assert.ok(['b', 'c'].includes(pickIdea(IDEAS, 'a').id));
  }
});

test('pickIdea returns null when nothing is eligible', () => {
  assert.equal(pickIdea([], null), null);
  assert.equal(pickIdea([IDEAS[3], IDEAS[4], IDEAS[5]], null), null);
});

// פיקסצ'ר ייעודי לבדיקות תחום/פורמט - בלי subCategory, כדי לא לערבב
// עם בדיקות הדיוק של subCategory שלמטה.
const DOMAIN_VIDEOS = [
  { id: 'v1', domain: 'יופי וקוסמטיקה', formatTags: ['סיפור אישי'] },
  { id: 'v2', domain: 'יופי וקוסמטיקה', formatTags: ['לפני ואחרי'] },
  { id: 'v3', domain: 'כושר ותזונה', formatTags: ['סיפור אישי'] },
];

test('pickReference only returns videos from the requested domain', () => {
  for (let i = 0; i < 20; i++) {
    assert.equal(pickReference(DOMAIN_VIDEOS, 'יופי וקוסמטיקה', null, null).domain, 'יופי וקוסמטיקה');
  }
});

test('pickReference prefers easy-to-transcribe formats when both exist in-domain', () => {
  for (let i = 0; i < 20; i++) {
    assert.equal(pickReference(DOMAIN_VIDEOS, 'יופי וקוסמטיקה', null, null).id, 'v1');
  }
});

test('pickReference falls back to any in-domain video if no preferred-format video is left', () => {
  assert.equal(pickReference(DOMAIN_VIDEOS, 'יופי וקוסמטיקה', null, 'v1').id, 'v2');
});

test('pickReference never repeats the excluded id when another option exists', () => {
  for (let i = 0; i < 20; i++) {
    assert.equal(pickReference(DOMAIN_VIDEOS, 'כושר ותזונה', null, 'v3').id, 'v3'); // only one video in this domain
  }
});

// פיקסצ'ר ייעודי לבדיקות subCategory - כולם אותו פורמט, כדי לבודד את
// ההתנהגות של הצמצום לתת-קטגוריה בלי ערבוב עם עדיפות הפורמט.
const SUBCATEGORY_VIDEOS = [
  { id: 's1', domain: 'יופי וקוסמטיקה', subCategory: 'ציפורניים', formatTags: ['סיפור אישי'] },
  { id: 's2', domain: 'יופי וקוסמטיקה', subCategory: 'ציפורניים', formatTags: ['סיפור אישי'] },
  { id: 's3', domain: 'יופי וקוסמטיקה', subCategory: 'שיער', formatTags: ['סיפור אישי'] },
];

test('pickReference narrows to the exact subCategory when one is given', () => {
  for (let i = 0; i < 20; i++) {
    assert.ok(['s1', 's2'].includes(pickReference(SUBCATEGORY_VIDEOS, 'יופי וקוסמטיקה', 'ציפורניים', null).id));
  }
});

test('pickReference falls back to the whole domain when the given subCategory has no videos', () => {
  for (let i = 0; i < 20; i++) {
    assert.ok(['s1', 's2', 's3'].includes(pickReference(SUBCATEGORY_VIDEOS, 'יופי וקוסמטיקה', 'גבות', null).id));
  }
});
