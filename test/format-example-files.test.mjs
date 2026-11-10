/* 10/11/2026 (מאיה: "כן, תשמרי עותק"): דוגמאות אינסטגרם מתנגנות מעותק אצלנו */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { FORMAT_EXAMPLES } from '../js/video-assistant-content.js';

test('כל עותק שמוזכר קיים, ויש עותקים לדוגמאות האינסטגרם', () => {
  const files = Object.values(FORMAT_EXAMPLES).flat().filter((ex) => ex.file);
  assert.ok(files.length >= 9);
  for (const ex of files) assert.ok(existsSync(new URL(`../${ex.file}`, import.meta.url)), ex.file);
});

test('החלון מנגן את העותק ב-video, וה-service worker לא נוגע בסרטונים', () => {
  const va = readFileSync(new URL('../js/video-assistant.js', import.meta.url), 'utf8');
  assert.match(va, /if \(ex\.file\)[\s\S]{0,400}<video src="\$\{escapeHtml\(ex\.file\)\}" controls playsinline/);
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /hdrs\.has\('range'\)/);
});
