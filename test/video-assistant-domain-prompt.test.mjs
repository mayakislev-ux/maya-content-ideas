import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DOMAINS, buildDomainGuessPrompt, parseDomainGuess } = require('../functions/video-assistant-domain-prompt.js');

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

test('parseDomainGuess accepts a valid index and returns the domain name', () => {
  const result = parseDomainGuess('{"domainIndex": 1}');
  assert.equal(result, 'יופי וקוסמטיקה');
});

test('parseDomainGuess returns null on an out-of-range index instead of throwing', () => {
  assert.equal(parseDomainGuess('{"domainIndex": 99}'), null);
});

test('parseDomainGuess returns null on unparsable text instead of throwing', () => {
  assert.equal(parseDomainGuess('not json at all'), null);
});
