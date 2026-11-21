import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { tiktokVerdict, pageVerdict, instagramEmbedVerdict, runIsTrustworthy, nextFailCount } = require('../functions/inspiration-link-rules.js');

test('tiktok: its own image is alive, the generic image is dead, overload says nothing', () => {
  const page = (img) => `<meta property="og:image" content="${img}"/>`;
  assert.equal(tiktokVerdict(200, page('https://p16-sign.tiktokcdn.com/abc.jpg')), 'alive');
  assert.equal(tiktokVerdict(200, page('https://sf16-sg.tiktokcdn.com/obj/eden-sg/kvy/c.png')), 'dead');
  assert.equal(tiktokVerdict(200, '<title>x</title>'), 'unknown');
  assert.equal(tiktokVerdict(404, ''), 'dead');
  assert.equal(tiktokVerdict(429, ''), 'unknown');
  assert.equal(tiktokVerdict(503, ''), 'unknown');
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

// 21/11/2026: עמודי נגן אמיתיים של אינסטגרם, שנשמרו באותו יום
import { readFileSync } from 'node:fs';
const fx = (n) => readFileSync(new URL(`./fixtures/ig-embed/${n}.html`, import.meta.url), 'utf8');
test('instagram embed: plays, protected music, embedding off, fake id, overload', () => {
  assert.equal(instagramEmbedVerdict(200, fx('plays')), '');
  assert.equal(instagramEmbedVerdict(200, fx('music')), 'music');
  assert.equal(instagramEmbedVerdict(200, fx('disabled')), 'disabled');
  assert.equal(instagramEmbedVerdict(200, fx('fake')), 'disabled');
  assert.equal(instagramEmbedVerdict(429, ''), null);
  assert.equal(instagramEmbedVerdict(200, '<html></html>'), null);
});

test('player watch: a broken platform alerts, a single bad video does not', async () => {
  const { playerLooksBroken } = require('../functions/inspiration-link-rules.js');
  assert.equal(playerLooksBroken(0, 6), true);
  assert.equal(playerLooksBroken(4, 4), true);
  assert.equal(playerLooksBroken(30, 3), false);
  assert.equal(playerLooksBroken(0, 2), false);
  assert.equal(playerLooksBroken(20, 5), false);
});
