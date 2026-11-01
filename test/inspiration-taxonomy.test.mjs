import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pickReference } from '../js/video-assistant-picker.js';

const require = createRequire(import.meta.url);
const { SUBCATEGORIES_BY_DOMAIN } = require('../functions/inspiration-constants.js');

test('the assistant domain picker lists exactly the server subcategories', () => {
  const src = readFileSync(new URL('../js/video-assistant.js', import.meta.url), 'utf8');
  const block = src.match(/const SUBCATEGORIES_BY_DOMAIN = (\{[\s\S]*?\n\});/)[1];
  const client = new Function(`return ${block}`)();
  for (const [domain, subs] of Object.entries(SUBCATEGORIES_BY_DOMAIN)) {
    assert.deepEqual([...client[domain]].sort(), Object.keys(subs).sort(), domain);
  }
});

test('a saved old subcategory still finds its split categories', () => {
  const videos = [
    { id: 'lash', domain: 'יופי וקוסמטיקה', subCategory: 'הלחמת ריסים' },
    { id: 'nail', domain: 'יופי וקוסמטיקה', subCategory: 'ציפורניים' },
  ];
  assert.equal(pickReference(videos, 'יופי וקוסמטיקה', 'ריסים', null).id, 'lash');
});

test('the assistant does not hand over a song when a spoken video exists', () => {
  const videos = [
    { id: 'song', domain: 'כושר ותזונה', subCategory: 'פילאטיס', audioKind: 'song' },
    { id: 'quiet', domain: 'כושר ותזונה', subCategory: 'פילאטיס', audioKind: 'silent' },
    { id: 'talk', domain: 'כושר ותזונה', subCategory: 'פילאטיס', audioKind: 'speech' },
  ];
  for (let i = 0; i < 20; i += 1) assert.equal(pickReference(videos, 'כושר ותזונה', 'פילאטיס', null).id, 'talk');
});

test('a category of only songs still returns something', () => {
  const videos = [{ id: 'song', domain: 'כושר ותזונה', subCategory: 'פילאטיס', audioKind: 'song' }];
  assert.equal(pickReference(videos, 'כושר ותזונה', 'פילאטיס', null).id, 'song');
});
