// 21/11/2026 (מאיה: "אופציה להעתיק לינק ישירות כאן במסך" ו"ליד כל סרטון
// כפתור של SAVE"). לחיצות אמיתיות על הכפתורים, בדפדפן מדומה.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const JSDOM_PATH = 'C:/dev/portal-sales/node_modules/jsdom/lib/api.js';
const hasJsdom = existsSync(JSDOM_PATH);

test('העתקת קישור: לחיצה מעתיקה את הקישור המקורי ואומרת שהועתק', { skip: !hasJsdom }, async () => {
  const { JSDOM } = require(JSDOM_PATH);
  const dom = new JSDOM('<body></body>', { url: 'https://example.com/' });
  globalThis.document = dom.window.document;
  let copied = null;
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async (t) => { copied = t; } } }, configurable: true });
  const { copyLinkButton } = await import('../js/ref-saves.js');
  const btn = copyLinkButton({ id: 'v1', url: 'https://www.tiktok.com/@a/video/1' }, 'x');
  document.body.appendChild(btn);
  btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(copied, 'https://www.tiktok.com/@a/video/1');
  assert.equal(btn.textContent, 'הקישור הועתק ✓');
});

test('שמירה: הכפתור מתחיל לא שמור, ובלי חיבור לא משקר שנשמר', { skip: !hasJsdom }, async () => {
  const { JSDOM } = require(JSDOM_PATH);
  const dom = new JSDOM('<body></body>', { url: 'https://example.com/' });
  globalThis.document = dom.window.document;
  const { saveButton, isSaved } = await import('../js/ref-saves.js');
  const btn = saveButton({ id: 'v2', url: 'u' }, 'x');
  document.body.appendChild(btn);
  assert.equal(btn.textContent, '♡ שמירה');
  btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(isSaved('v2'), false);
  assert.equal(btn.textContent, 'השמירה נכשלה, נסו שוב');
});

test('הכפתורים מחוברים: כרטיס, חלון, גלילה, ומסנן "השמורים שלי"', () => {
  const src = (f) => readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8');
  assert.match(src('inspiration-view.js'), /saveButton\(video, 'inspiration-card-save'\)/);
  assert.match(src('inspiration-view.js'), /copyLinkButton\(video, 'inspiration-card-link-btn'\)/);
  assert.match(src('inspiration-popup.js'), /copyLinkButton\(video, 'ip-act'/);
  assert.match(src('inspiration-popup.js'), /saveButton\(video, 'ip-act ip-save'\)/);
  assert.match(src('inspiration-feed.js'), /saveButton\(video, 'feed-out feed-save'\)/);
  assert.match(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /id="inspiration-saved-btn"/);
  assert.match(readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), /match \/refSaves\/\{uid\}[\s\S]{0,120}request\.auth\.uid == uid/);
});
