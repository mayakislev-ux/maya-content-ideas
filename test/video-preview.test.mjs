import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractYouTubeId, isTikTokUrl, getInstantThumbnail } from '../js/video-preview.js';

test('extractYouTubeId handles youtu.be short links', () => {
  assert.equal(extractYouTubeId('https://youtu.be/abc123XYZ'), 'abc123XYZ');
});

test('extractYouTubeId handles youtube.com/watch links', () => {
  assert.equal(extractYouTubeId('https://www.youtube.com/watch?v=abc123XYZ&t=5s'), 'abc123XYZ');
});

test('extractYouTubeId handles youtube.com/shorts links', () => {
  assert.equal(extractYouTubeId('https://www.youtube.com/shorts/abc123XYZ'), 'abc123XYZ');
});

test('extractYouTubeId returns null for non-YouTube links', () => {
  assert.equal(extractYouTubeId('https://www.instagram.com/p/abc123/'), null);
});

test('extractYouTubeId returns null for invalid URLs', () => {
  assert.equal(extractYouTubeId('not a url'), null);
});

test('isTikTokUrl recognizes tiktok.com links only', () => {
  assert.equal(isTikTokUrl('https://www.tiktok.com/@user/video/123'), true);
  assert.equal(isTikTokUrl('https://www.instagram.com/reel/abc/'), false);
  assert.equal(isTikTokUrl('not a url'), false);
});

test('getInstantThumbnail builds a YouTube thumbnail URL', () => {
  assert.equal(
    getInstantThumbnail('https://youtu.be/abc123XYZ'),
    'https://img.youtube.com/vi/abc123XYZ/hqdefault.jpg'
  );
});

test('getInstantThumbnail returns null for platforms without an instant thumbnail', () => {
  assert.equal(getInstantThumbnail('https://www.tiktok.com/@user/video/123'), null);
  assert.equal(getInstantThumbnail('https://www.instagram.com/reel/abc/'), null);
});
