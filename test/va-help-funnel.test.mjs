// 31/10/2026 (מאיה): ארבעה תיקונים ב"עזרה בבניית סרטון": ה-SOS בלי טופס,
// כפתור "עוד" בתסריט שנבנה, ג'מיני להוקים, ושאלת המשפך.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildExtractionPrompt, buildScriptDistillationPrompt, CONTENT_TYPES } from '../js/video-assistant-content.js';
import { INITIAL_STATE } from '../js/video-assistant-flow.js';
import { buildParts } from '../js/video-assistant-build.js';

const SRC = readFileSync(new URL('../js/video-assistant.js', import.meta.url), 'utf8');
const between = (a, b) => SRC.slice(SRC.indexOf(a), SRC.indexOf(b, SRC.indexOf(a)));

test('SOS: אין טופס, רק פרומפט מוכן וכפתור העתקה ל-ChatGPT', () => {
  const modal = between('async function openExtractionHelperModal', 'function renderScratchDump');
  assert.ok(!modal.includes('<input'), 'חזר שדה למילוי');
  assert.ok(!modal.includes('va-ext-generate-btn'), 'חזר כפתור בנייה');
  assert.match(modal, /copyBtn\(prompt, 'להעתיק ל-ChatGPT'\)/);
  assert.match(modal, /wireCopyButtons\(resultEl\)/);
});

test('SOS: רק שלושה סוגי תוכן, בלי בידורי', () => {
  assert.deepEqual(CONTENT_TYPES, ['בעל ערך', 'מכירתי', 'אישי']);
  assert.ok(!buildExtractionPrompt({ idea: 'x' }).includes('בידורי'));
});

test('SOS: הסוג שזוהה נכתב בפרומפט, ומה שלא ידוע ChatGPT מזהה לבד', () => {
  const known = buildExtractionPrompt({ idea: 'רעיון', contentType: 'מכירתי', startingPoint: 'סיפור לקוח', audience: 'מעצבות' });
  assert.match(known, /\[מכירתי\]/);
  assert.match(known, /\[סיפור לקוח\]/);
  const unknown = buildExtractionPrompt({ idea: 'רעיון' });
  assert.equal(unknown.match(/\[תזהה לבד לפי הרעיון\]/g).length, 3);
  assert.ok(!unknown.includes('כאן כותבים'), 'נשאר מקום ריק שהלקוח צריך למלא');
});

test('"עוד": הטקסט המלא זמין כשהוא קוצר, ולא כשאין מה לקצר', () => {
  const long = 'מילה '.repeat(100).trim();
  const parts = buildParts({ ...INITIAL_STATE, branch: 'scratch', screen: 'scratch-hook', ideaDescription: 'רעיון', rawDump: long });
  const dump = parts.find((p) => p.key === 'dump');
  assert.ok(dump.value.length < long.length, 'הקיצור נעלם');
  assert.equal(dump.full, long);
  assert.equal(parts.find((p) => p.key === 'idea').full, '');
});

test('"עוד": הכפתור מופיע ומחליף בין קצר למלא', () => {
  assert.match(between('function buildHtml', 'function wireBuildMore'), /p\.full && p\.status !== 'wait'/);
  const wire = between('function wireBuildMore', 'function geminiHookNote');
  assert.match(wire, /full\.hidden = !open/);
  assert.match(wire, /short\.hidden = open/);
  assert.match(SRC, /wireBuildMore\(card\)/);
});

test("מציאת הוק הולכת לג'מיני, בשני המסלולים, והכתיבה ל-ChatGPT", () => {
  for (const [a, b] of [['async function renderPrompt1', 'async function renderPrompt2'], ['async function renderScratchHook', 'async function renderScratchHookReinforce']]) {
    const screen = between(a, b);
    assert.match(screen, /geminiHookNote\(\)/, a);
    assert.match(screen, /להעתיק פרומפט לג'מיני/, a);
    assert.ok(!screen.includes('נשלח ל-ChatGPT') && !screen.includes('ChatGPT יביא') && !screen.includes('ChatGPT יתאים'), a);
  }
  assert.match(between('async function renderPrompt2', 'function renderReadAloud'), /להעתיק פרומפט ל-ChatGPT/);
  assert.match(between('async function renderScratchDistill', '// ===== מסך הסיכום הסופי'), /להעתיק פרומפט ל-ChatGPT/);
});

test('משפך: נכנס לפרומפט רק כשנכתב', () => {
  const base = { idea: 'א', hook: 'ב', hookReinforcement: 'ג', rawScript: 'ד', ctaType: 'משפך' };
  assert.match(buildScriptDistillationPrompt({ ...base, funnel: 'מדריך חינמי' }), /הסוג הרצוי עבור התסריט הזה: משפך\nהמשפך שאליו ההנעה לפעולה צריכה להוביל: מדריך חינמי/);
  assert.ok(!buildScriptDistillationPrompt(base).includes('המשפך שאליו'));
});

test('משפך: בלי לכתוב מה המשפך אין פרומפט להעתקה', () => {
  const distill = between('async function renderScratchDistill', '// ===== מסך הסיכום הסופי');
  assert.match(distill, /cta === 'משפך' && !funnel/);
  assert.match(distill, /funnelWrap\.hidden = cta !== 'משפך'/);
  assert.match(distill, /funnelInput\.addEventListener\('input', refreshPrompt\)/);
});
