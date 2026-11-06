// 29/10/2026: לכל פורמט דוגמאות שנפתחות בפופאפ בתוך האפליקציה. כל שם חייב
// להיות שם של פורמט אמיתי, וכל דוגמה חייבת כתובת הטמעה, אחרת הכפתור
// "לראות דוגמה" היה פותח חלון ריק.
// 06/11/2026 (מאיה: "חלק מהדוגמאות לא עובדות"): דוגמה שאינסטגרם חוסמת
// להטמעה מסומנת embed: false ומוצגת ככרטיס עם קישור. קישורי טיקטוק חייבים
// @שם משתמש, אחרת "לצפייה בפלטפורמה המקורית" מגיע לדף 404 של טיקטוק.
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
    /* הדוגמה הראשונה היא מה שנפתח בלחיצה, ולכן היא תמיד מוטמעת */
    assert.notEqual(FORMAT_EXAMPLES[name][0].embed, false, `first example of ${name} is link-only`);
    for (const ex of FORMAT_EXAMPLES[name]) {
      if (ex.embed === false) continue;
      assert.ok(embedUrlFor(ex.url, ex), `no embed for ${ex.url}`);
    }
  }
});

test('06/11: TikTok links carry the @user, and the deleted post is gone', () => {
  const all = Object.values(FORMAT_EXAMPLES).flat();
  for (const ex of all) {
    if (!/tiktok\.com/.test(ex.url)) continue;
    assert.match(ex.url, /^https:\/\/www\.tiktok\.com\/@[\w.]+\/video\/\d+$/, ex.url);
    assert.ok(ex.url.endsWith(`/${ex.tiktokVideoId}`), `id mismatch: ${ex.url}`);
  }
  assert.ok(!all.some((ex) => ex.url.includes('DMBFvuFIM5T')), 'deleted Instagram post still listed');
});

test('06/11: a TikTok link without @user still embeds', () => {
  assert.equal(embedUrlFor('https://www.tiktok.com/video/7500635865677401362'), 'https://www.tiktok.com/embed/v2/7500635865677401362');
});
