/* 07/11/2026: בחמישה קבצים (מתיקיית 3 המפגשים של מאיה) הלשונית נקראת
   "פרסונה שיוקית", בלי ו. pickPersonaTab כבר סלחני, אבל העוזר לסרטון
   (guessClientDomain) וטבלת הסטוריז (syncStoryTable) חיפשו את השם המדויק.
   עכשיו שלושתם בוחרים אותו דבר: השם המדויק קודם, אחרת לשונית שיש בה
   "פרסונה" ואינה דוגמא. ובפריסה של הקבצים האלה אין שתי שורות האג'נדות:
   המפענחים פשוט מדלגים על שאלה שאין. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sections = require('../functions/sheet-sections.js');
const { resolveTabTitles } = require('../functions/sheets-content.js');
const { buildStoryTable, TAB } = require('../functions/story-table-extract.js');

const TYPO = 'פרסונה שיוקית';
const EXACT = 'פרסונה שיווקית';

test('pickPersonaTab: השם המדויק קודם, ואחרת "פרסונה שיוקית", ולא הדוגמא', () => {
  assert.equal(sections.pickPersonaTab(['ניתוח קהל יעד', TYPO, `${EXACT} *דוגמא*`]), TYPO);
  assert.equal(sections.pickPersonaTab([TYPO, EXACT]), EXACT);
  assert.equal(sections.pickPersonaTab([`${TYPO} *דוגמא*`]), null);
});

test('resolveTabTitles: השם המבוקש נשמר, והלשונית בפועל היא זו עם שגיאת הכתיב', () => {
  const pickers = { [EXACT]: sections.pickPersonaTab };
  assert.deepEqual(resolveTabTitles([EXACT, 'ניתוח קהל יעד', undefined], ['ניתוח קהל יעד', TYPO], pickers),
    [{ wanted: EXACT, actual: TYPO }, { wanted: 'ניתוח קהל יעד', actual: 'ניתוח קהל יעד' }]);
  assert.deepEqual(resolveTabTitles([EXACT], [TYPO, EXACT], pickers), [{ wanted: EXACT, actual: EXACT }]);
  /* בלי בוחר: רק שם מדויק, כמו קודם */
  assert.deepEqual(resolveTabTitles([EXACT], [TYPO]), []);
  assert.deepEqual(resolveTabTitles([EXACT], [`${EXACT} *דוגמא*`], pickers), []);
});

test('העוזר לסרטון וטבלת הסטוריז קוראים את הלשונית דרך pickPersonaTab', () => {
  const index = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  const guess = index.slice(index.indexOf('exports.guessClientDomain'));
  assert.match(guess.slice(0, 4000), /fetchSheetTabs\(sheetId, \[PERSONA_TAB\], \{ \[PERSONA_TAB\]: pickPersonaTab \}\)/);
  assert.match(guess.slice(0, 4000), /tabs\[PERSONA_TAB\]/, 'התוצאה נשמרת תחת השם המבוקש');
  const story = require('../functions/story-table.js');
  assert.equal(story.TAB_PICKERS[TAB.persona], sections.pickPersonaTab);
  const src = readFileSync(new URL('../functions/story-table.js', import.meta.url), 'utf8');
  assert.match(src, /fetchSheetTabs\(sheetId, WANTED_TABS, TAB_PICKERS\)/);
});

/* הפריסה של הקבצים האלה: בלי שתי שורות האג'נדות */
const PERSONA_NO_AGENDA = [
  ['שאלה', 'התשובה שלך'],
  ['מה החלומות, התשוקות והתוצאות שהקהל שלכם רוצה להשיג?', 'ללמוד מקצוע פרקטי'],
  ['איפה בעצמכם אתם השגתם את החלומות, התשוקות והתוצאות האלה?', '1. עצמאות כלכלית. 2. חופש לבחור.'],
  ['אילו בעיות/פחדים/אמונות מגבילות יש ללקוחות שלכם?', 'אולי אני לא מספיק מוכשרת לזה'],
  ['מה הערכים שלך?', '1️⃣ כנות\n2️⃣ נתינה'],
  ['ביקורת מקצועית על התחום שלכם', '1. קורסים שמוכרים תעודה במקום מקצוע.'],
];
const AUDIENCE = [
  ['שאלות לניתוח קהל היעד', 'קבוצה 1: מתחילות מאפס'],
  ['מה הם קונים? ( סוג המוצר/השירות )', 'קורס מקצועי'],
  ['איזה כאבים/בעיות יש להם?', 'פחד להתחיל'],
];

test('"אין לי רעיון?" מהפרסונה: בלי שורות אג׳נדה, שאר הנושאים כרגיל', () => {
  const { groups } = sections.parsePersonaTab(PERSONA_NO_AGENDA);
  assert.equal(groups.length, 1);
  const labels = groups[0].sections.map((s) => s.label);
  assert.ok(labels.includes('ערכים'));
  assert.ok(labels.includes('ביקורת מקצועית'));
  assert.ok(!labels.some((l) => l.includes('אג׳נד')));
});

test('טבלת הסטוריז נבנית מ"פרסונה שיוקית" בלי שורות אג׳נדה', () => {
  /* fetchSheetTabs מחזיר את התוכן תחת השם המבוקש (TAB.persona) */
  const table = buildStoryTable({ [TAB.persona]: PERSONA_NO_AGENDA, [TAB.audience]: AUDIENCE });
  assert.equal(table.ready, true, JSON.stringify(table.missingTabs));
  assert.equal(table.audiences.length, 1);
  assert.ok(table.audiences[0].totalCount > 0);
});
