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
  const missing = ids.filter((id) => !HTML.includes(`id="${id}"`));
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

test('עריכה שלה גוברת על מה שנשלף מהגיליון', () => {
  const t = table({}, { a1: { 'gap-direct': 'הניסוח שלי' } });
  assert.equal(rowText(AUD.ongoing[0], 'a1', t), 'הניסוח שלי');
  assert.match(renderStoryTable(t, 'a1'), /הניסוח שלי/);
  assert.doesNotMatch(renderStoryTable(t, 'a1'), /<li>עצמאות כלכלית<\/li>/);
});

test('מה שנכנס לתוכנית נבנה מהטבלה, כולל הנושאים והרצף', () => {
  const inputs = planInputs(AUD, table());
  assert.equal(inputs.product, 'קורס מקצועי למתחילות');
  assert.equal(inputs.audience, 'מתחילות מאפס');
  assert.match(inputs.extraContext, /=== חימום שוטף ===/);
  assert.match(inputs.extraContext, /=== חימום לקראת מכירה ===/);
  assert.match(inputs.extraContext, /חוק הפער · ישיר: עצמאות כלכלית/);
  assert.match(inputs.extraContext, /הראו שיש ביקוש: צילום מסך של פניות/);
  assert.match(inputs.extraContext, /סטורי 1 · עצירה \/ סטורי 2/, 'הרצף נכנס כמו שלימדה');
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
