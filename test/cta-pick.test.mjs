// 28/10/2026 (מאיה): "בחלק של זיקוק התסריט הסופי מאוד קל לפספס איזו
// הנעה לפעולה רוצים". הייתה רשימה נפתחת שכבר בחרה "משפך" לבד, והפרומפט
// הוצג מיד, כך שאפשר היה להעתיק אותו בלי לראות שיש בחירה בכלל.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = readFileSync(join(ROOT, 'js', 'video-assistant.js'), 'utf8');
const CSS = readFileSync(join(ROOT, 'css', 'style.css'), 'utf8');
const DISTILL = SRC.slice(SRC.indexOf('async function renderScratchDistill'), SRC.indexOf('// ===== מסך הסיכום הסופי'));

test('הנעה לפעולה: כפתורים, לא רשימה נפתחת שבחרה לבד', () => {
  assert.ok(!DISTILL.includes('<select'), 'חזרה הרשימה הנפתחת');
  assert.match(DISTILL, /data-cta=/, 'אין כפתורי בחירה');
  assert.match(DISTILL, /let cta = '';/, 'משהו בחור מראש');
});

test('הפרומפט מופיע רק אחרי שבוחרים', () => {
  assert.match(DISTILL, /if \(!cta\) \{/, 'הפרומפט מוצג גם בלי בחירה');
});

test('הבחירה בולטת על המסך', () => {
  assert.match(DISTILL, /va-cta-pick/);
  assert.match(CSS, /\.va-cta-pick\s*\{/);
});

// 06/11/2026 (מאיה): "שתעיפי לגמרי את שיטת השכפול ההפוך, סתם מבלבל".
// גם השורה האופציונלית במסך ההוק ירדה.
const HOOK = SRC.slice(SRC.indexOf('async function renderScratchHook'), SRC.indexOf('async function renderScratchHookReinforce'));
test('מסך ההוק: אין יותר "סרטון שעבד" ואין פרומפט שכפול הפוך', () => {
  assert.doesNotMatch(HOOK, /va-hook-ref-input|openingHook|סרטון שעבד/);
  assert.doesNotMatch(SRC, /buildReverseDuplicationPrompt/);
  assert.match(HOOK, /buildHookFindingPrompt\(\{/);
});

test('"כן, צריך תסריט" לא עובר יותר במסך "שכפול הפוך?"', () => {
  const FLOW = readFileSync(join(ROOT, 'js', 'video-assistant-flow.js'), 'utf8');
  /* 10/11/2026: המגילה נכתבת עכשיו לפני הקריאייטיב, ולכן "כן" ממשיך להוק
     כשהיא כבר קיימת, ולמגילה רק כשאין. בכל מקרה לא ל"שכפול הפוך?". */
  assert.match(FLOW, /case 'NEEDS_SCRIPT_YES':[^]*?return \{ \.\.\.state, screen: state\.rawDump \? 'scratch-hook' : 'scratch-dump', branch: 'scratch' \}/);
});
