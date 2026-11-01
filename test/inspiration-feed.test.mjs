// 31/10/2026 (מאיה): מצב גלילה רציף במאגר, וסימון שיר בלי דיבור.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { feedEmbedUrl, openLabel } from '../js/inspiration-feed.js';
import { readabilityOf, readableTextOf, audioKindOf } from '../js/inspiration-readability.js';

const VIEW = readFileSync(new URL('../js/inspiration-view.js', import.meta.url), 'utf8');
const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('טיקטוק מנגן בנגן הרשמי, עם מזהה שמור או מתוך הכתובת', () => {
  assert.match(feedEmbedUrl({ tiktokVideoId: '123', url: 'https://vt.tiktok.com/x/' }), /^https:\/\/www\.tiktok\.com\/player\/v1\/123\?/);
  assert.match(feedEmbedUrl({ url: 'https://www.tiktok.com/@a/video/456' }), /player\/v1\/456\?/);
});

test('אינסטגרם מקבל הטמעה, וקישור בלי מזהה מחזיר null כדי להציג פתיחה בחוץ', () => {
  assert.equal(feedEmbedUrl({ url: 'https://www.instagram.com/p/AbC_1/' }), 'https://www.instagram.com/p/AbC_1/embed/');
  assert.equal(feedEmbedUrl({ url: 'https://vt.tiktok.com/x/' }), null);
});

test('הקישור מעל הסרטון אומר לאן הוא מוביל', () => {
  assert.equal(openLabel({ platform: 'tiktok' }), 'פתיחה בטיקטוק ↗');
  assert.equal(openLabel({ platform: 'instagram' }), 'פתיחה באינסטגרם ↗');
  assert.equal(openLabel({}), 'פתיחה באפליקציה ↗');
});

test('שיר: תגית נכונה, ואין טקסט להציג גם אם יש תמלול של מילים', () => {
  const lyrics = 'מילים של שיר '.repeat(30);
  const v = { audioKind: 'song', sourceLanguage: 'en', transcript: lyrics, translationHe: lyrics };
  assert.equal(readabilityOf(v).id, 'song');
  assert.equal(readabilityOf(v).chip, '🎵 שיר בלי דיבור');
  assert.equal(readableTextOf(v), '');
  assert.equal(audioKindOf(v), 'song');
});

test('בלי דיבור: ויזואלי, בלי טקסט', () => {
  const v = { audioKind: 'silent', sourceLanguage: 'he', transcriptHe: 'משהו '.repeat(40) };
  assert.equal(readabilityOf(v).id, 'visual');
  assert.equal(readableTextOf(v), '');
});

test('דיבור: הטקסט מוצג לפי השפה, גם כשעוד לא נבדק', () => {
  assert.equal(readableTextOf({ sourceLanguage: 'ru', translationHe: 'תרגום', transcriptHe: 'x' }), 'תרגום');
  assert.equal(readableTextOf({ sourceLanguage: 'he', transcriptHe: 'תמלול', translationHe: 'x' }), 'תמלול');
  assert.equal(readableTextOf({ audioKind: 'speech', sourceLanguage: 'en', translationHe: 'תרגום' }), 'תרגום');
});

test('הכפתור מחובר לרשימה שעל המסך, ומוסתר כשאין סרטונים', () => {
  assert.match(HTML, /id="inspiration-feed-btn"[^>]*hidden/);
  assert.match(VIEW, /openFeed\(shownVideos, 0, \{ loadSubtitles \}\)/);
  assert.match(VIEW, /feedBtn\.hidden = !videos\.length/);
  assert.match(VIEW, /readableTextOf\(video\)/);
});
