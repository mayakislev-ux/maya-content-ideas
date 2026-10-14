import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DOMAINS, buildDomainGuessPrompt, parseDomainGuess, subCategoriesOf } = require('../functions/video-assistant-domain-prompt.js');

test('DOMAINS has exactly the 6 canonical inspiration-bank domains', () => {
  assert.deepEqual(DOMAINS, [
    'יופי וקוסמטיקה',
    'בריאות נפשית, טיפול ורוח',
    'עסקים ויזמות',
    'עיצוב, נדל"ן ואדריכלות',
    'כושר ותזונה',
    'תוכן אישי וחיבור',
  ]);
});

test('buildDomainGuessPrompt includes the persona text and all 6 domains numbered', () => {
  const prompt = buildDomainGuessPrompt({ personaText: 'בחרתי בתחום הציפורניים ובניתי ממנו עסק' });
  assert.match(prompt, /בחרתי בתחום הציפורניים/);
  DOMAINS.forEach((d, i) => assert.ok(prompt.includes(`${i + 1}. ${d}`), `missing numbered domain: ${i + 1}. ${d}`));
});

test('buildDomainGuessPrompt lists real subcategories for a domain that has them', () => {
  const prompt = buildDomainGuessPrompt({ personaText: 'טקסט' });
  assert.match(prompt, /ציפורניים/); // subcategory of יופי וקוסמטיקה
  assert.match(prompt, /פילאטיס/); // subcategory of כושר ותזונה
});

test('buildDomainGuessPrompt includes the business field when given', () => {
  const prompt = buildDomainGuessPrompt({ personaText: 'טקסט', business: 'יועצת שיווק לעסקים' });
  assert.match(prompt, /תיאור העסק שהיא עצמה כתבה.*יועצת שיווק לעסקים/s);
});

test('parseDomainGuess accepts a valid index and subcategory, returns both', () => {
  const result = parseDomainGuess('{"domainIndex": 1, "subCategory": "ציפורניים"}');
  assert.deepEqual(result, { domain: 'יופי וקוסמטיקה', subCategory: 'ציפורניים' });
});

test('parseDomainGuess drops a subCategory that does not belong to the guessed domain', () => {
  const result = parseDomainGuess('{"domainIndex": 1, "subCategory": "פילאטיס"}'); // פילאטיס belongs to כושר ותזונה, not יופי וקוסמטיקה
  assert.deepEqual(result, { domain: 'יופי וקוסמטיקה', subCategory: null });
});

test('parseDomainGuess allows a null subCategory for a domain with none', () => {
  const result = parseDomainGuess('{"domainIndex": 6, "subCategory": null}');
  assert.deepEqual(result, { domain: 'תוכן אישי וחיבור', subCategory: null });
});

test('parseDomainGuess returns null on an out-of-range index instead of throwing', () => {
  assert.equal(parseDomainGuess('{"domainIndex": 99}'), null);
});

test('parseDomainGuess returns null on unparsable text instead of throwing', () => {
  assert.equal(parseDomainGuess('not json at all'), null);
});

test('subCategoriesOf returns an empty list for a domain with none', () => {
  assert.deepEqual(subCategoriesOf('תוכן אישי וחיבור'), []);
});

test('subCategoriesOf returns the real list for a domain that has them', () => {
  assert.ok(subCategoriesOf('יופי וקוסמטיקה').includes('ציפורניים'));
});
