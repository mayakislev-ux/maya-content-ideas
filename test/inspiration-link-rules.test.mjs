import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { tiktokVerdict, pageVerdict, runIsTrustworthy, nextFailCount } = require('../functions/inspiration-link-rules.js');

test('tiktok: a real answer is alive, an empty one or 400 is dead, overload is unknown', () => {
  assert.equal(tiktokVerdict(200, { title: 'x', author_name: 'a', thumbnail_url: 'u' }), 'alive');
  assert.equal(tiktokVerdict(200, { title: '', author_name: '@' }), 'dead');
  assert.equal(tiktokVerdict(400, null), 'dead');
  assert.equal(tiktokVerdict(429, null), 'unknown');
  assert.equal(tiktokVerdict(503, null), 'unknown');
});

test('post page: an image means alive, a server problem says nothing', () => {
  assert.equal(pageVerdict(200, '<meta property="og:image" content="x">'), 'alive');
  assert.equal(pageVerdict(200, '<title>Instagram</title>'), 'dead');
  assert.equal(pageVerdict(404, ''), 'dead');
  assert.equal(pageVerdict(429, ''), 'unknown');
  assert.equal(pageVerdict(500, ''), 'unknown');
});

test('a run where many videos look dead is not trusted', () => {
  assert.equal(runIsTrustworthy(5, 500), true);
  assert.equal(runIsTrustworthy(300, 372), false);
  assert.equal(runIsTrustworthy(2, 5), true);
  assert.equal(runIsTrustworthy(5, 5), false);
});

test('fail count: only consecutive dead days add up', () => {
  assert.equal(nextFailCount(undefined, 'dead'), 1);
  assert.equal(nextFailCount(2, 'dead'), 3);
  assert.equal(nextFailCount(2, 'alive'), 0);
  assert.equal(nextFailCount(2, 'unknown'), 2);
});
