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
   זה"): כפתור שהעתיק לג'מיני מציע את שניהם, ושום טקסט לידו לא אומר רק אחד.
   05/11/2026 (מאיה): זה נשאר רק בשכפול. במסלול מ-0 הקריאייטיב בג'מיני,
   וההוק, החיזוק, ה-SOS והתסריט רק ב-ChatGPT. */
test("שכפול: מציאת הוק הולכת לג'מיני או ל-ChatGPT, והכתיבה ל-ChatGPT", () => {
  const screen = between('async function renderPrompt1', 'async function renderPrompt2');
  /* 10/11/2026 (מאיה): "פשוט מעתיקים ל-CHAT GPT", בלי הערת ג'מיני ובלי לראות את הפרומפט */
  assert.ok(!/geminiHookNote\(\)/.test(screen));
  assert.ok(!/promptPeek\(/.test(screen));
  assert.match(screen, /להעתיק את הפרומפט ל-ChatGPT/);
  assert.ok(!/להדביק בג'מיני,|נשלח לג'מיני -|ג'מיני יביא|ג'מיני יתאים/.test(screen));
  assert.match(between('async function renderPrompt2', 'function renderReadAloud'), /להעתיק פרומפט ל-ChatGPT/);
  assert.match(between('async function renderScratchDistill', '// ===== מסך הסיכום הסופי'), /להעתיק פרומפט ל-ChatGPT/);
});

test("מ-0: ההוק והחיזוק רק ב-ChatGPT, בלי זכר לג'מיני", () => {
  for (const [a, b] of [['async function renderScratchHook', 'async function renderScratchHookReinforce'], ['async function renderScratchHookReinforce', 'const CTA_TYPES']]) {
    const screen = between(a, b);
    assert.match(screen, /chatgptHookNote\(\)/, a);
    assert.match(screen, /copyBtn\(prompt, 'להעתיק פרומפט ל-ChatGPT'\)/, a);
    assert.ok(!screen.includes('geminiHookNote'), a);
    assert.ok(!screen.includes("ג'מיני"), a);
  }
  assert.ok(!between('async function openExtractionHelperModal', 'function renderScratchDump').includes("ג'מיני"), 'ה-SOS');
});

test("מ-0: האריזה הקריאייטיבית נשארת בג'מיני", () => {
  const screen = between('async function renderCreativePackaging', 'function chips');
  assert.match(screen, /copyBtn\(prompt, "להעתיק פרומפט לג'מיני"\)/);
  assert.ok(!screen.includes('ChatGPT'));
});


/* 02/11/2026 (מאיה: "בגלל שזה שכפול תוכן לא צריך את ה-SOS... וגם לא צריך
   שיהיה כתוב מגילת אסתר... זה מכריח אותי לרשום מגילה עם תווים"). */
test('שכפול רגיל: מה מוסיפים לשכפול, בלי SOS, בלי מגילה ובלי מינימום מילים', () => {
  assert.match(between('function renderHerWords', 'function renderDuplicationAddOn'), /state\.branch === 'reference'[\s\S]{0,80}renderDuplicationAddOn/);
  const screen = between('function renderDuplicationAddOn', 'export const MEGILLAH_MIN_WORDS');
  assert.match(screen, /מה יש לך להוסיף לשכפול\?/);
  assert.match(screen, /למנגנון של התסריט המקורי/);
  for (const banned of ['מגילת אסתר', 'va-sos-big', 'wireMegillahGate', 'MEGILLAH_MIN_WORDS', 'megillahMeterHtml']) {
    assert.ok(!screen.includes(banned), banned);
  }
  assert.match(screen, /HER_WORDS_SUBMITTED/);
  assert.ok(!screen.includes('צריך לכתוב משהו קודם'), 'השדה לא חובה');
});

test('שכפול רגיל: תוספת ריקה יורדת מהפרומפט, ומלאה נכנסת כמו קודם', async () => {
  const { buildScriptPrompt } = await import('../js/video-assistant-prompts.js');
  const base = { hook: 'ההוק', originalScript: 'המקור', domain: 'תחום', audience: 'קהל' };
  const empty = buildScriptPrompt({ ...base, herWords: '' });
  assert.ok(!empty.includes('זה מה שיש לי להגיד'));
  assert.ok(!empty.includes('יחד עם כל מה'));
  assert.match(empty, /תלביש אותו בתסריט המקורי אבל הכי חשוב\?/);
  const full = buildScriptPrompt({ ...base, herWords: 'סיפור שלי' });
  assert.match(full, /זה מה שיש לי להגיד: סיפור שלי/);
  assert.match(full, /יחד עם כל מה\nשיש לי להגיד אבל הכי חשוב\?/);
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
  /* 12/11/2026: המשפך גם נשמר (keepCta), כדי שלא יימחק בחזרה אחורה */
  assert.match(distill, /funnelTimer = setTimeout\(\(\) => \{ keepCta\(\); refreshPrompt\(\); \}, 400\)/);
});
