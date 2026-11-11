/* 11/11/2026: ניתוח הדמות. ראש בטלפון, בלי שינויים בתוך מסך, רגעי שיא בפינה,
   בועות שלא מתארות פעולה שהיא לא עושה, ותמונות שנשמרות במכשיר. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { mayaSrc, MAYA_V, poseFor, seasonPose, fitPose } from '../js/va-maya.js';

const M = readFileSync(new URL('../js/va-maya.js', import.meta.url), 'utf8');
const VA = readFileSync(new URL('../js/video-assistant.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
const SW = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

test('תמונות עם גרסה, ונשמרות במכשיר', () => {
  assert.equal(mayaSrc('hug'), `assets/maya/maya-hug.webp?v=${MAYA_V}`);
  assert.ok(SW.includes(String.raw`\/assets\/maya\/[^?]+\?v=`), 'sw לא שומר את תמונות הדמות');
  assert.ok(existsSync(new URL('../assets/maya/maya-head.webp', import.meta.url)));
});

test('בטלפון ראש עגול שנשאר צמוד', () => {
  assert.ok(M.includes("fig.className = head ? 'va-maya va-maya--head'"));
  assert.match(CSS, /\.va-maya\.va-maya--head \{\s*position: sticky;/);
});

test('בלי שינויים בתוך מסך', () => {
  assert.ok(!VA.includes("flashMaya('is-"), 'נדנוד בהעתקה');
  assert.ok(!M.includes("setProperty('--va-nod'"), 'קצב הנהון משתנה בכל מילה');
  assert.ok(M.includes('lastPose !== pose'), 'דהייה גם כשהתנוחה לא השתנתה');
  assert.ok(!/react\('pencil'/.test(M), 'המחק חזר');
  assert.ok(!M.includes("react(null, 'מה עובר לך בראש"), 'הנדנוד אחרי 20 שניות חזר');
});

test('בועות שלא מתארות פעולה שהיא לא עושה', () => {
  for (const s of ['אני לא מסתכלת', 'הולכת להביא עוד קפה', 'אני עם המחק']) assert.ok(!M.includes(s), s);
});

test('תנוחות בכוונה, בלי הצצה מעל הכרטיס בעוזר', () => {
  for (const s of ['idea-sharpen', 'transcribe', 'opening', 'relevance-check', 'cta-choice']) {
    assert.ok(!['peek', 'swing'].includes(poseFor(s)), s);
  }
  assert.equal(fitPose('peek', true), 'hug');
});

test('חורף מדצמבר', () => {
  assert.equal(seasonPose('2026-11-20'), null);
  assert.equal(seasonPose('2026-12-02'), 'winter');
});

test('רגעי שיא בפינה, לא על כל המסך', () => {
  assert.match(CSS, /\.va-stage-show \{ inset: auto auto 24px 16px;/);
});
