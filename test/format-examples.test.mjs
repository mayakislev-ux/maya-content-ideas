// 29/10/2026: לכל פורמט דוגמאות שנפתחות בפופאפ בתוך האפליקציה. כל שם חייב
// להיות שם של פורמט אמיתי, וכל דוגמה חייבת כתובת הטמעה, אחרת הכפתור
// "לראות דוגמה" היה פותח חלון ריק.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORMATS, FORMAT_EXAMPLES } from '../js/video-assistant-content.js';
import { embedUrlFor } from '../js/video-preview.js';

test('every example belongs to a real format and can be embedded', () => {
  const names = new Set(FORMATS.map((f) => f.name));
  const keys = Object.keys(FORMAT_EXAMPLES);
  assert.ok(keys.length >= 12);
  for (const name of keys) {
    assert.ok(names.has(name), `unknown format: ${name}`);
    assert.ok(FORMAT_EXAMPLES[name].length > 0);
    for (const ex of FORMAT_EXAMPLES[name]) assert.ok(embedUrlFor(ex.url, ex), `no embed for ${ex.url}`);
  }
});
