import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fitPose } from '../js/va-maya.js';

const VA = readFileSync(new URL('../js/video-assistant.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
const { buildFormatRecommendPrompt } = require('../functions/format-recommend.js');

test('11/11: בטלפון אין הצצה ונדנדה מעל הכרטיס', () => {
  assert.equal(fitPose('peek', true), 'hug');
  assert.equal(fitPose('swing', true), 'hug');
  assert.equal(fitPose('peek', false), 'peek');
  assert.equal(fitPose('coffee', true), 'coffee');
});

test('11/11: הדג הענק ירד', () => {
  assert.ok(!VA.includes('bigFishHook('));
});

test('11/11: טקסט דינמי רק לסיפור או לתחום ויזואלי, והתחום נשלח', () => {
  const p = buildFormatRecommendPrompt({ packaging: 'x', domain: 'שיווק' });
  assert.ok(p.includes('התחום שלה: שיווק'));
  assert.ok(p.includes('לא ממליצים על טקסט דינמי'));
  assert.ok(VA.includes('domain: String((domainInfo && domainInfo.domain) || myBusiness'));
});

test('11/11: רפרנס שהוגרל, הלינק נכנס והתמלול רץ לבד', () => {
  assert.ok(VA.includes('autoTranscribePicked();'));
  assert.ok(VA.includes('state.autoTranscribePending !== id'), 'רץ גם בלי הגרלה');
  assert.ok(VA.includes("state.drafts = clearScreenDrafts(state.drafts || {}, 'transcribe')"), 'בהגרלה חוזרת נשאר התמלול הקודם');
  assert.ok(VA.includes('runAccurate({ link: video.url })'));
});

test('11/11: מובייל: לחיצה כפולה לא מגדילה, מקלדת מסתירה סרגלים, כרטיס למעלה', () => {
  assert.match(CSS, /#video-assistant-view, \.va-stage-show \{ touch-action: manipulation; \}/);
  assert.match(CSS, /html\.va-typing \.bottom-nav \{ display: none !important; \}/);
  assert.match(CSS, /> \.cosmic-card \{ margin: 0 auto auto; \}/);
  assert.ok(VA.includes("document.documentElement.classList.add('va-typing')"));
  assert.ok(VA.includes('setTimeout(() => syncTypingNow(), 0);'), 'הסרגלים נשארו מוסתרים אחרי ממשיכים');
  assert.doesNotMatch(CSS, /html\.va-typing \.app-header/);
  assert.ok(VA.includes('showToast(pickEncouragement(), { duration: 1500 })'));
});
