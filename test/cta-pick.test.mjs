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

// 28/10/2026: השכפול ההפוך עבר מתוך מסך החלטה נפרד לשורה אופציונלית
// במסך ההוק, עם אותו פרומפט שלה בדיוק (ההוק המקורי + המגילה).
const HOOK = SRC.slice(SRC.indexOf('async function renderScratchHook'), SRC.indexOf('async function renderScratchHookReinforce'));
test('מסך ההוק: סרטון שעבד הוא אפשרות, ומשתמש בפרומפט השכפול ההפוך', () => {
  assert.match(HOOK, /va-hook-ref-input/, 'אין מקום להדביק תמלול');
  assert.match(HOOK, /buildReverseDuplicationPrompt\(\{ domain, audience, hook: state\.openingHook, script: state\.rawDump/, 'לא הפרומפט שלה');
  assert.match(HOOK, /<details class="va-more"/, 'האפשרות לא סגורה כברירת מחדל');
});

test('"כן, צריך תסריט" לא עובר יותר במסך "שכפול הפוך?"', () => {
  const FLOW = readFileSync(join(ROOT, 'js', 'video-assistant-flow.js'), 'utf8');
  assert.match(FLOW, /case 'NEEDS_SCRIPT_YES':\s*return \{ \.\.\.state, screen: 'scratch-dump'/);
});
