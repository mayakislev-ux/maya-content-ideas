import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 30/09/2026: המסך נבדק בשתי דרכים שלא דורשות דפדפן.
//
// 1. הזרימה עצמה - הספירה, מה פותח את הכפתור, ומה נכנס לתוכנית - נבדקת
//    דרך הפונקציות הטהורות, בדיוק ברצף שהלקוחה עוברת.
// 2. כל מזהה DOM שהקוד פונה אליו נבדק מול index.html. זה מה ששבר פעם מסך
//    שלם בפורטל: קריאה למזהה שלא קיים מפילה את האתחול, וכל הבדיקות
//    המבניות עברו בכל זאת.

const VIEW = readFileSync(new URL('../js/story-table.js', import.meta.url), 'utf8');
const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('כל מזהה שהקוד מחפש קיים ב-HTML', () => {
  // המסך פונה למזהים גם דרך getElementById וגם דרך העוזר el('...')
  const ids = [
    ...[...VIEW.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]),
    ...[...VIEW.matchAll(/(?:^|[^A-Za-z])el\('([^']+)'\)/g)].map((m) => m[1]),
  ];
  assert.ok(ids.length >= 8, 'ציפינו לכמה מזהים, אחרת הבדיקה לא בודקת כלום');
  // 01/10/2026: שורת המנהלת אינה ב-HTML בכוונה. מאיה: "אני לא רוצה אפילו
  // שיראו את האופציה לצפות אחת לשנייה", ולכן היא נבנית בקוד רק עבורה.
  const builtInCode = ['st-owner-bar', 'st-owner-pick'];
  const missing = ids
    .filter((id) => !builtInCode.includes(id))
    .filter((id) => !HTML.includes(`id="${id}"`));
  assert.deepEqual(missing, [], `מזהים שלא קיימים ב-HTML: ${missing.join(', ')}`);
});

test('הטופס הישן מוסתר, והטבלה לפניו', () => {
  const panelAt = HTML.indexOf('id="story-table-panel"');
  const formAt = HTML.indexOf('id="warming-form"');
  assert.ok(panelAt > 0 && formAt > 0);
  assert.ok(panelAt < formAt, 'הטבלה באה לפני הטופס, כמו שמאיה ביקשה');
  assert.match(HTML.slice(formAt - 60, formAt + 80), /class="warming-form" hidden/);
});

// ----------------------------------------------------------------------------
// הזרימה
// ----------------------------------------------------------------------------
import { createRequire } from 'node:module';
import {
  audienceCounts,
  countsLine,
  defaultTable,
  DEFAULT_TOOLS,
  renderStoryTable,
  selectedAudience,
  planChoicesHtml,
  rowText,
  planInputs,
} from '../js/story-table-render.js';

const AUD = {
  id: 'a1',
  name: 'מתחילות מאפס',
  primary: true,
  buys: 'קורס מקצועי למתחילות',
  ongoing: [
    { key: 'gap-direct', tool: 'חוק הפער · ישיר', source: 'פרסונה', bullets: ['עצמאות כלכלית'], fromSheet: true },
    {
      key: 'demand',
      tool: 'הראו שיש ביקוש',
      source: '',
      topic: 'צילום מסך של פניות, של הרשמות, או של הודעות נכנסות',
      bullets: [],
      fromSheet: false,
    },
  ],
  sale: [
    { key: 'problem', stage: 1, tool: 'מודעות לבעיה', source: 'קהל יעד', bullets: ['בוס שמחליט'], fromSheet: true },
    {
      key: 'close',
      stage: 3,
      tool: 'סגירת המכירה',
      source: '',
      topic: 'בוחרות תוצאה אחת, של לקוחה או שלהן, ועליה בונות את הרצף',
      steps: ['סטורי 1 · עצירה', 'סטורי 2 · התוצאה עצמה', 'סטורי 3 · דיבור למצלמה לחיזוק התוצאה', 'סטורי 4 · הנעה לפעולה עם טריגר'],
      bullets: ['כשהן מבינות שהן לא מרוצות'],
      fromSheet: false,
    },
  ],
};

const AUD2 = { ...AUD, id: 'a2', name: 'להעלות רמה', primary: false };
const table = (answers = {}, overrides = {}) => ({ audiences: [AUD, AUD2], answers, overrides });

// 30/09/2026, תיקון של מאיה: "את לא צריכה לכתוב להם מה להגיד אלא רק נושאים".
test('אין אף שדה שמבקש מהן לכתוב תוכן, ואין דוגמאות מה להגיד', () => {
  const html = renderStoryTable(table(), 'a1');
  assert.equal((html.match(/data-kind="answer"/g) || []).length, 0);
  assert.doesNotMatch(html, /placeholder=/, 'אין שדה עם הצעה מה לכתוב');
  assert.doesNotMatch(html, /למשל/, 'אין דוגמאות מה להגיד');
});

test('כפתור הבנייה פתוח, בלי מנעול ובלי ספירת חובות', () => {
  const html = renderStoryTable(table(), 'a1');
  assert.doesNotMatch(html, /id="st-build-btn"[^>]*disabled/);
  assert.match(html, />בניית תוכנית</);
  assert.doesNotMatch(html, /אחרי שתשלימי/);
});

test('הכפתור פתוח גם כשאין תוכן מהקובץ בכלל', () => {
  const bare = { ...AUD, ongoing: [AUD.ongoing[1]], sale: [AUD.sale[1]] };
  const html = renderStoryTable({ audiences: [bare], answers: {}, overrides: {} }, 'a1');
  assert.doesNotMatch(html, /disabled/);
});

test('רצף ארבעת הסטוריז מוצג כרצף ממוספר, בשמות שלה', () => {
  const html = renderStoryTable(table(), 'a1');
  assert.match(html, /<ol class="st-steps">/);
  assert.match(html, /סטורי 1 · עצירה/);
  assert.match(html, /סטורי 4 · הנעה לפעולה עם טריגר/);
  assert.match(html, /של לקוחה או שלהן/);
});

test('הראו שיש ביקוש מוצג ככותרת ונושא', () => {
  const html = renderStoryTable(table(), 'a1');
  assert.match(html, /הראו שיש ביקוש/);
  assert.match(html, /<p class="st-topic">צילום מסך של פניות/);
});

test('הספירה מתארת מה בא מהקובץ', () => {
  const c = audienceCounts(AUD, table());
  assert.deepEqual(c, { total: 4, withText: 3, topics: 1 });
  assert.equal(countsLine({ withText: 3 }), '3 כלים מלאים במילים שלך מהקובץ');
  assert.equal(countsLine({ withText: 1 }), 'כלי אחד מלא במילים שלך מהקובץ');
  assert.equal(countsLine({ withText: 0 }), 'הכלים והנושאים שלך, מוכנים לעבודה');
});

test('כל שורה אפשר לערוך ולהוסיף לה', () => {
  const html = renderStoryTable(table(), 'a1');
  assert.equal((html.match(/class="st-edit"/g) || []).length, 4);
  assert.equal((html.match(/data-kind="override"/g) || []).length, 4);
});

// 30/09/2026, ביקורת 10 סוכנים: תיבת העריכה נטענה עם כל תוכן השורה שטוח,
// ולכן די היה לפתוח אותה ולגעת במקום אחר כדי שכל הקיבוץ יתמוטט לתמיד.
test('מה שהיא מוסיפה נוסף, ולא מוחק את מה שנשלף מהגיליון', () => {
  const t = table({}, { a1: { 'gap-direct': 'התוספת שלי' } });
  const html = renderStoryTable(t, 'a1');
  assert.match(html, /<li>עצמאות כלכלית<\/li>/, 'מה שנשלף מהקובץ נשאר');
  assert.match(html, /מה שהוספת/, 'והתוספת מוצגת בקבוצה משלה');
  assert.match(html, /<li>התוספת שלי<\/li>/);
});

test('מה שנכנס לתוכנית נבנה מהטבלה, ונכנס למגבלת השרת', () => {
  const inputs = planInputs(AUD, table());
  assert.equal(inputs.product, 'קורס מקצועי למתחילות');
  assert.equal(inputs.audience, 'מתחילות מאפס');
  assert.match(inputs.extraContext, /=== חימום שוטף ===/);
  assert.match(inputs.extraContext, /=== חימום לקראת מכירה ===/);
  assert.match(inputs.extraContext, /חוק הפער · ישיר/);
  assert.match(inputs.extraContext, /הראו שיש ביקוש: צילום מסך של פניות/);
  assert.match(inputs.extraContext, /סטורי 1 · עצירה \/ סטורי 2/, "הרצף נכנס כמו שלימדה");
});

// 30/09/2026, ביקורת 10 סוכנים: השרת חוסם extraContext מעל 5,000 תווים,
// והטבלה שלחה לשם עשרות אלפי תווים. כלומר בניית תוכנית נכשלה ב-400 אצל כל
// לקוחה שהקובץ שלה מלא, ועבדה רק אצל מי שהקובץ שלה ריק.
test('מה שנשלח לשרת תמיד נכנס למגבלת ה-5000 תווים', () => {
  const many = (n, p) => Array.from({ length: n }, (_, i) => `${p} ${i + 1} משפט עברי באורך סביר לבדיקה`);
  const row = (key, tool, groups) => ({ key, tool, fromSheet: true, groups, bullets: groups.flatMap((g) => g.items) });
  const huge = {
    id: 'a1',
    name: 'מתחילות מאפס',
    primary: true,
    buys: 'קורס',
    ongoing: [
      row('gap-direct', 'חוק הפער · ישיר', [{ label: 'התוצאות שלך', items: many(38, 'תוצאה') }]),
      row('reflection', 'חוק ההשתקפות', [
        { label: 'הבעיות', items: many(116, 'בעיה') },
        { label: 'הכאבים', items: many(109, 'כאב') },
        { label: 'השאלות', items: many(60, 'שאלה') },
        { label: 'האמונות', items: many(77, 'אמונה') },
      ]),
    ],
    sale: [row('problem', 'מודעות לבעיה', [{ label: 'הכאבים', items: many(109, 'כאב') }])],
  };
  const inputs = planInputs(huge, { answers: {}, overrides: {} });
  assert.ok(inputs.extraContext.length <= 5000, `extraContext יצא ${inputs.extraContext.length} תווים`);
  assert.ok(inputs.product.length <= 500);
  assert.ok(inputs.audience.length <= 500);
  assert.match(inputs.extraContext, /ועוד \d+/, 'אומר כמה הושמט ולא מעלים בשקט');
  assert.match(inputs.extraContext, /חוק ההשתקפות/, 'כל הכלים עדיין שם');
});

test('תא רב-שורתי לא נדחף כמו שהוא לשדה חד-שורתי', () => {
  const a = { ...AUD, buys: ['קורס מקצועי', 'למתחילות מאפס'].join(String.fromCharCode(10)) };
  const inputs = planInputs(a, table());
  assert.ok(!inputs.product.includes(String.fromCharCode(10)));
  assert.equal(inputs.product, 'קורס מקצועי, למתחילות מאפס');
});

test('כל הקהלים בחירים, כי אין מה להשלים', () => {
  const html = planChoicesHtml(table(), 'a1');
  assert.doesNotMatch(html, /disabled/);
  assert.doesNotMatch(html, /שורות חסרות/);
  assert.match(html, /כלים מהקובץ שלך/);
});

test('טקסט מהגיליון מוברח ולא נכנס כ-HTML', () => {
  const nasty = {
    ...AUD,
    ongoing: [{ key: 'x', tool: 'כלי', source: '<script>alert(1)</script>', bullets: ['<img onerror=x>'], fromSheet: true }],
    sale: [],
  };
  const html = renderStoryTable({ audiences: [nasty], answers: {}, overrides: {} }, 'x1');
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img onerror/);
  assert.match(html, /&lt;script&gt;/);
});

test('בחירת קהל שאינו קיים נופלת לקהל הראשון ולא קורסת', () => {
  assert.equal(selectedAudience(table(), 'לא-קיים').id, 'a1');
  assert.equal(selectedAudience(null, 'a1'), null);
  assert.equal(renderStoryTable(null, 'a1'), '');
  assert.equal(renderStoryTable({ audiences: [] }, 'a1'), '');
});


// 30/09/2026 (מאיה): "לא רוצה את המסך הזה בכלל, רוצה ישר את הטבלה של הסטורי
// ולמעלה כפתור כמו שאמרתי לך".
test('הטבלה עולה גם בלי שום תוכן מהקובץ', () => {
  const t = defaultTable();
  const a = t.audiences[0];
  assert.equal(a.ongoing.length + a.sale.length, 10, 'כל עשרת הכלים');
  assert.ok(a.ongoing.every((r) => r.topic), 'לכל כלי יש נושא');
  assert.ok(a.sale.every((r) => r.topic));
  const html = renderStoryTable(t, 'default');
  assert.match(html, />בניית תוכנית</);
  assert.doesNotMatch(html, /disabled/, 'הכפתור עובד גם בלי הקובץ');
  assert.match(html, /סטורי 1 · עצירה/, 'רצף הסגירה מוצג גם כאן');
  assert.match(html, /חוק הפער · ישיר/);
  assert.match(html, /אחרי המכירה · פומו/);
});

test('אין אף מסלול בקוד שמחזיר את הטופס הישן', () => {
  assert.ok(!VIEW.includes('fallbackToForm'), 'הנפילה לטופס הוסרה');
  const shows = [...VIEW.matchAll(/warming-form'\)\.hidden\s*=\s*(\w+)/g)].map((m) => m[1]);
  assert.ok(shows.length > 0, 'ציפינו שהקוד יגע בטופס');
  assert.deepEqual([...new Set(shows)], ['true'], 'הטופס רק מוסתר, אף פעם לא מוצג');
});

// שתי הרשימות חיות בשני קבצים (אחד לשרת, אחד ללקוח) ואסור שיתפצלו
test('שמות הכלים בלקוח זהים לאלה שבשרת', () => {
  const require = createRequire(import.meta.url);
  const { buildStoryTable, TAB } = require('../functions/story-table-extract.js');
  const built = buildStoryTable({
    [TAB.persona]: [['שאלה', 'תשובה']],
    [TAB.audience]: [['שאלות לניתוח קהל היעד', 'קבוצה 1: כלשהו']],
  });
  const a = built.audiences[0];
  const serverTools = [...a.ongoing, ...a.sale].map((r) => r.tool);
  assert.deepEqual(DEFAULT_TOOLS, serverTools);
});


// 30/09/2026 (מאיה: "למה לא התעדכן אצלי?"): wireStoryTableView רצה באתחול
// האפליקציה, והמשתמש נכנס רק מאוחר יותר ב-onAuthChange. הקריאה לנתונים
// התבצעה כש-auth.currentUser היה null, נכשלה בשקט, והמסך נפל לטבלת הנושאים
// בכל פתיחה בלי קשר למה ששמור. זה מה שהסתיר ממנה טבלה מלאה.
test('הטעינה מחכה למשתמש ולא רצה באתחול', () => {
  assert.match(VIEW, /onAuthChange/, 'הטעינה תלויה בכניסת המשתמש');

  const wireBody = VIEW.slice(
    VIEW.indexOf('export async function wireStoryTableView'),
    VIEW.indexOf('async function loadInitial')
  );
  assert.ok(wireBody.length > 100, 'מצאנו את גוף הפונקציה');
  assert.ok(!/loadStoryTable\(\)/.test(wireBody), 'אין קריאה לנתונים לפני שיש משתמש');
  assert.ok(!/runSync\(\)/.test(wireBody.replace(/onAuthChange[\s\S]*$/, '')), 'אין סנכרון לפני שיש משתמש');
  assert.match(wireBody, /loadInitial\(\)/, 'הטעינה נקראת רק מתוך onAuthChange');
});

test('טעינה חוזרת לא רצה פעמיים לאותו משתמש', () => {
  assert.match(VIEW, /loadedFor === user\.uid/, 'שומר על טעינה אחת לכל משתמש');
  assert.match(VIEW, /loadedFor = null/, 'מתאפס ביציאה, כדי שמשתמשת אחרת תיטען');
});

// 30/09/2026: שמירה קראה ל-addedGroupHtml בלי לייבא אותו, וכל שמירה הייתה
// נופלת ב-ReferenceError. הטסט הזה משווה את מה שהקוד משתמש בו מול מה שיוצא
// מהמודול הטהור.
test('כל מה שהמסך משתמש בו מהמודול הטהור באמת מיובא', async () => {
  const mod = await import('../js/story-table-render.js');
  const exported = Object.keys(mod);
  const block = VIEW.split("from './story-table-render.js'")[0];
  const open = block.lastIndexOf('import {');
  const imported = block.slice(open + 8, block.lastIndexOf('}'))
    .split(',').map((x) => x.trim()).filter(Boolean);
  assert.ok(imported.length > 2, "מצאנו את רשימת הייבוא");
  const used = exported.filter((name) => VIEW.includes(name + "("));
  const missing = used.filter((name) => !imported.includes(name));
  assert.deepEqual(missing, [], "נעשה שימוש בלי ייבוא: " + missing.join(", "));
});

// 01/10/2026 (מאיה): "אני לא רוצה אפילו שיראו את האופציה לצפות אחת לשנייה".
test('שורת המנהלת לא קיימת בדף שהלקוחות מקבלות', () => {
  assert.ok(!HTML.includes('st-owner-bar'), 'לא במקור הדף');
  assert.ok(!HTML.includes('st-owner-pick'), 'וגם לא הבחירה');
  assert.match(VIEW, /OWNER_EMAIL/, 'והקוד בונה אותה רק למאיה');
  const fn = VIEW.slice(VIEW.indexOf('async function wireOwnerBar'), VIEW.indexOf('export async function wireStoryTableView'));
  const guard = fn.indexOf('OWNER_EMAIL');
  const creates = fn.indexOf('createElement');
  assert.ok(guard > -1 && creates > guard, "הבדיקה על המייל קודמת לבניית השורה");
});

// 01/10/2026 (מאיה): "אם מישהי מעדכנת בטבלת הפרסונה או קהל יעד, את תעדכני
// גם שם? זה מסונכרן?"
//
// הסנכרון חד כיווני: האפליקציה קוראת מהגיליון ולעולם לא כותבת אליו
// (ההרשאה היא spreadsheets.readonly). ועד התיקון הזה היא גם לא קראה מחדש:
// הסנכרון רץ רק כשלא הייתה טבלה בכלל, או בלחיצה על הכפתור, ולכן מי
// שעדכנה את הגיליון לא ראתה את זה אף פעם.
test('הקובץ נקרא מחדש בכל פתיחה, ברקע', () => {
  const load = VIEW.slice(VIEW.indexOf('async function loadInitial'));
  assert.ok(load.includes('runSync(true)'), 'רענון שקט גם כשיש טבלה שמורה');
  const showAt = load.indexOf('showTable(saved)');
  const syncAt = load.indexOf('runSync(true)');
  assert.ok(showAt > -1 && syncAt > showAt, 'קודם מציגים את השמורה, ורק אז מסנכרנים');
});

test('רענון שנכשל לא מוחק טבלה שכבר על המסך', () => {
  const sync = VIEW.slice(VIEW.indexOf('async function runSync'), VIEW.indexOf('export async function wireStoryTableView'));
  const falls = sync.split('showTable(defaultTable())').length - 1;
  assert.ok(falls > 0, 'יש נפילה לטבלת נושאים');
  const guarded = sync.split('if (!state.table) showTable(defaultTable())').length - 1;
  assert.equal(guarded, falls, 'וכל אחת מהן מוגנת בבדיקה שאין כבר טבלה');
});

test('האפליקציה לא יכולה לכתוב לגיליון', async () => {
  const { readFileSync } = await import('node:fs');
  const sheets = readFileSync(new URL('../functions/sheets-content.js', import.meta.url), 'utf8');
  assert.ok(sheets.includes('spreadsheets.readonly'), 'הרשאת קריאה בלבד');
  assert.ok(!sheets.includes('spreadsheets.values.update'), 'אין עדכון');
  assert.ok(!sheets.includes('values.append'), 'אין הוספה');
  assert.ok(!sheets.includes("auth/spreadsheets'"), "ואין הרשאת כתיבה מלאה");
});

// 01/10/2026 (מאיה): "במובייל כשלחצתי על כפתור הכנת תוכנית, רק בתחתית המסך
// זה הראה לי שזה בונה תוכנית. אשמח שזה יקפיץ פופאפ שאי אפשר לצאת ממנו עד
// שהתוכנית לא נבנית, גם במחשב".
test('בניית תוכנית חוסמת את המסך, ואין ממנה יציאה', async () => {
  const { readFileSync } = await import('node:fs');
  const CSS = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  assert.ok(HTML.includes('class="warming-loading wl-modal"'), 'החיווי הוא פופאפ');
  assert.ok(HTML.includes('role="alertdialog"'), 'ומוכרז כחלון');
  const at = CSS.indexOf('.wl-modal {');
  const block = CSS.slice(at, CSS.indexOf("}", at));
  assert.ok(block.includes('position: fixed'), 'חוסם את כל המסך');
  assert.ok(block.includes('inset: 0'));
  // אין בו כפתור סגירה, ושום קוד לא סוגר אותו חוץ מסיום הבנייה
  // עד סוף הכרטיס של הפופאפ, ולא עד הכפתור הבא בדף
  const modal = HTML.slice(HTML.indexOf('id="warming-loading"'), HTML.indexOf('wl-modal__note'));
  assert.ok(!modal.includes('<button'), 'אין בו כפתור יציאה');
});

test('יש טיפול אמיתי בנייד לטבלה', async () => {
  const { readFileSync } = await import('node:fs');
  const CSS = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  const at = CSS.indexOf('@media (max-width: 560px)');
  assert.ok(at > -1, 'יש שבירה ייעודית לנייד');
  const block = CSS.slice(at, CSS.indexOf('@media', at + 10));
  for (const sel of ['.st-row', '.st-bullets', '.st-slot__head', '.st-pills', '.st-build']) {
    assert.ok(block.includes(sel), sel + ' מטופל בנייד');
  }
});

// 01/10/2026 (מאיה): "לחצתי על בניית תוכנית אבל אין כפתור התחל, ולמה זה
// לא באמצע המסך, זה לא נוח מבחינת UI UX".
test('לבחירת הקהל יש כפתור שמתחיל את הבנייה', () => {
  assert.ok(HTML.includes('id="st-plan-go"'), 'יש כפתור');
  assert.ok(VIEW.includes("#st-plan-go"), 'והקוד מאזין לו');
  // לחיצה על קהל רק בוחרת, ולא בונה
  const click = VIEW.slice(VIEW.indexOf('.st-choice'), VIEW.indexOf('sheetForm') > -1 ? VIEW.indexOf('sheetForm') : VIEW.length);
  const selectAt = VIEW.indexOf('state.planAudienceId = choice.dataset.audience');
  const buildAt = VIEW.indexOf('buildPlan(state.planAudienceId');
  assert.ok(selectAt > -1, 'הבחירה נשמרת');
  assert.ok(buildAt > selectAt, 'והבנייה קורית רק אחריה, בכפתור');
});

test('החלון ממורכז ולא צמוד לתחתית', async () => {
  const { readFileSync } = await import('node:fs');
  const CSS = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  const at = CSS.indexOf('.st-plan-sheet {');
  const block = CSS.slice(at, CSS.indexOf('}', at));
  assert.ok(block.includes('align-items: center'), 'ממורכז אנכית');
  assert.ok(block.includes('justify-content: center'), 'וגם אופקית');
  assert.ok(!block.includes('align-items: flex-end'), 'כבר לא צמוד לתחתית');
  const cardAt = CSS.indexOf('.st-plan-sheet__card {');
  const card = CSS.slice(cardAt, CSS.indexOf('}', cardAt));
  assert.ok(card.includes('max-width'), 'ולא נמתח לכל הרוחב');
});

// 01/10/2026 (מאיה): "בניית תוכנית לוקחת יותר מדי זמן, ואז שבונה לא ברור
// לי איפה זה". התוכנית נבנתה מתחת לטבלה הארוכה והמסך נשאר איפה שהיה.
test('אחרי שהתוכנית מוכנה לוקחים אותה אליה, ויש חזרה ברורה', () => {
  assert.ok(HTML.includes('id="st-back-to-table"'), 'יש חזרה לטבלה');
  assert.ok(VIEW.includes('warming-plan-ready'), 'המסך מקשיב לסיום');
  assert.ok(VIEW.includes('scrollIntoView'), 'ולוקח אותה לשם');
  const at = VIEW.indexOf("warming-plan-ready");
  const block = VIEW.slice(at, at + 400);
  assert.ok(block.includes('back.hidden = false'), 'והחזרה נחשפת');
});

test('כישלון בבנייה מחזיר את הטבלה ואומר מה קרה', () => {
  assert.ok(VIEW.includes('warming-plan-failed'), 'המסך מקשיב לכישלון');
  const at = VIEW.indexOf("warming-plan-failed");
  const block = VIEW.slice(at, at + 420);
  assert.ok(block.includes('panel.hidden = false'), 'הטבלה חוזרת');
  assert.ok(block.includes('showStatus('), 'והסיבה מוצגת במקום שרואים');
});

test('הפופאפ מראה שלבים ולא מונה שניות', async () => {
  const { readFileSync } = await import('node:fs');
  const W = readFileSync(new URL('../js/warming.js', import.meta.url), 'utf8');
  assert.ok(W.includes('const STEPS'), 'יש שלבים');
  assert.ok(W.includes('בונה שבועיים של חימום שוטף'));
  const fn = W.slice(W.indexOf('function startCountdown'), W.indexOf('function stopCountdown'));
  assert.ok(!fn.includes('שניות`'), 'כבר לא מונה שניות עולה');
});
