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

test('SOS: הפופאפ לא מחכה לזיהוי סוג התוכן, והזיהוי מתחיל כבר בכניסה למסך', () => {
  const modal = between('async function openExtractionHelperModal', 'function renderScratchDump');
  assert.ok(!/await[^\n]*extractionContentType/.test(modal), 'הפופאפ חוזר לחכות לסיווג');
  assert.match(between('function renderScratchDump', 'async function renderScratchHook'), /prepareExtractionHelper\(\)/);
});

test('SOS: זיהוי סוג התוכן פתוח גם למנוי הרפרנסים, שיש לו את העוזר', () => {
  const fns = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  const start = fns.indexOf('exports.classifyIdea');
  assert.match(fns.slice(start, start + 600), /enforceAllowlist\(request\.auth\.token\.email, \{ allowRefs: true \}\)/);
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
  /* 141 תווים נחתכים, והקיצור עם "..." ארוך יותר מהמקור. גם כאן צריך "עוד". */
  const edge = 'א'.repeat(141);
  const edgeParts = buildParts({ ...INITIAL_STATE, branch: 'scratch', screen: 'scratch-hook', ideaDescription: 'רעיון', rawDump: edge });
  assert.equal(edgeParts.find((p) => p.key === 'dump').full, edge);
});

test('"עוד": הכפתור מופיע ומחליף בין קצר למלא', () => {
  assert.match(between('function buildHtml', 'function wireBuildMore'), /p\.full && p\.status !== 'wait'/);
  const wire = between('function wireBuildMore', 'function geminiHookNote');
  assert.match(wire, /full\.hidden = !open/);
  assert.match(wire, /short\.hidden = open/);
  assert.match(SRC, /wireBuildMore\(card\)/);
});

/* 02/11/2026 (מאיה: "תעשי סלאש ChatGPT, כי פעמים זה עושה יותר טוב ולפעמים
   זה"): כפתור שהעתיק לג'מיני מציע את שניהם, ושום טקסט לידו לא אומר רק אחד. */
test("מציאת הוק הולכת לג'מיני או ל-ChatGPT, בשני המסלולים, והכתיבה ל-ChatGPT", () => {
  for (const [a, b] of [['async function renderPrompt1', 'async function renderPrompt2'], ['async function renderScratchHook', 'async function renderScratchHookReinforce']]) {
    const screen = between(a, b);
    assert.match(screen, /geminiHookNote\(\)/, a);
    assert.match(screen, /להעתיק פרומפט לג'מיני \/ ChatGPT/, a);
    assert.ok(!/להדביק בג'מיני,|נשלח לג'מיני -|ג'מיני יביא|ג'מיני יתאים/.test(screen), a);
  }
  assert.match(between('async function renderPrompt2', 'function renderReadAloud'), /להעתיק פרומפט ל-ChatGPT/);
  assert.match(between('async function renderScratchDistill', '// ===== מסך הסיכום הסופי'), /להעתיק פרומפט ל-ChatGPT/);
});

test("חיזוק ההוק גם הוא בג'מיני או ב-ChatGPT", () => {
  const screen = between('async function renderScratchHookReinforce', 'const CTA_TYPES');
  assert.match(screen, /geminiHookNote\(\)/);
  assert.match(screen, /להעתיק פרומפט לג'מיני \/ ChatGPT/);
  assert.ok(!screen.includes("להדביק בג'מיני,"));
});

test('משפך: נכנס לפרומפט רק כשנכתב', () => {
  const base = { idea: 'א', hook: 'ב', hookReinforcement: 'ג', rawScript: 'ד', ctaType: 'משפך' };
  assert.match(buildScriptDistillationPrompt({ ...base, funnel: 'מדריך חינמי' }), /הסוג הרצוי עבור התסריט הזה: משפך\nהמשפך שאליו ההנעה לפעולה צריכה להוביל: מדריך חינמי/);
  assert.ok(!buildScriptDistillationPrompt(base).includes('המשפך שאליו'));
});

test('משפך: בלי לכתוב מה המשפך אין פרומפט להעתקה', () => {
  const distill = between('async function renderScratchDistill', '// ===== מסך הסיכום הסופי');
  assert.match(distill, /cta === 'משפך' && funnel\.length < 2/);
  assert.match(distill, /funnelWrap\.hidden = cta !== 'משפך'/);
  assert.match(distill, /funnelTimer = setTimeout\(refreshPrompt, 400\)/);
});
