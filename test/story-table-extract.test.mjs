import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildStoryTable, audienceNames, toBullets, TAB } = require('../functions/story-table-extract.js');

// הכותרות כאן הן הטקסט האמיתי מהקובץ האישי (נקרא מהגיליון של לקוחה קיימת
// ב-30/09/2026), כולל התוספות הארוכות שמאיה כותבת אחרי השאלה. אם היא תקצר
// או תאריך אותן, ההתאמה לפי מילות מפתח אמורה להחזיק - וזה מה שנבדק כאן.
const PERSONA_ROWS = [
  ['שאלה', 'התשובה שלך'],
  ['מה החלומות, התשוקות והתוצאות שהקהל שלכם רוצה להשיג?', 'ללמוד מקצוע פרקטי'],
  [
    'איפה בעצמכם אתם השגתם את החלומות, התשוקות והתוצאות האלה? סעיף שאחר כך ישמש אותנו ליצירת סרטונים וסטוריז שיוצרים פער עם הקהל',
    '1. יצרתי לעצמי עצמאות כלכלית ותחושת ביטחון שלא תלויה במקום עבודה אחר. 2. קיבלתי חופש גדול יותר לבחור איך העסק שלי ייראה.',
  ],
  [
    'תרשמו גם תוצאות עקיפות שהשגתם איך זה השפיע גם על תחומים אחרים בחיים',
    '1. פיתחתי ביטחון עצמי גבוה יותר וסומכת על ההחלטות שאני מקבלת. 2. למדתי להציב גבולות גם בעסק וגם בחיים האישיים.',
  ],
  ['אילו בעיות/פחדים/אמונות מגבילות יש ללקוחות שלכם?', 'אולי אני לא מספיק מוכשרת לזה'],
  [
    'איפה חוויתם בעצמכם את אותן בעיות / פחדים/ אמונות מגבילות? סעיף שאחר כך ישמש אותנו ליצירת סרטונים וסטוריז שגורמים לקהל להבין שאנחנו באמת מבינים אותו',
    '1. גם אני בתחילת הדרך פחדתי שלא אצליח מספיק ושלא אהיה טובה כמו אחרות. 2. גם אני הייתי צריכה ללמוד לא לפחד מתמחור.',
  ],
  ['מה הקהל שלכם צריך לשמוע כדי לזוז באמת?', 'את לא צריכה לחכות לביטחון כדי להתחיל'],
  [
    'איזה סיפור אישי שלכם יעורר בקהל השראה ויגרום לו להזהות?',
    'גם אני לא התחלתי מהמקום שאני נמצאת בו היום, בניתי את עצמי דרך עבודה קשה והמון אמונה בדרך.',
  ],
  ['ביקורת מקצועית על התחום שלכם כתבו לפחות 3–5 דברים', '1. קורסים שמוכרים תעודה במקום מקצוע ולא מכשירים לעבוד.'],
  // הבלוק השני - הפרסונה של הקהל המשני, בגיליון היא משוכפלת וריקה
  ['שאלה'],
  ['מה החלומות, התשוקות והתוצאות שהקהל שלכם רוצה להשיג?'],
  ['איפה בעצמכם אתם השגתם את החלומות, התשוקות והתוצאות האלה?'],
];

const AUDIENCE_ROWS = [
  ['נישה כללית = תחום העיסוק הכללי', 'בונת ציפורניים'],
  [],
  ['תת נישה = ההתמחות, הזווית', 'מדריכת קורסים בתחום הציפורניים'],
  [],
  [],
  ['חלוקת קהל יעד לקבוצות'],
  ['שאלות לניתוח קהל היעד', 'קבוצה 1: מתחילות מאפס', 'קבוצה 2: נייליסטיות שצריכות לעלות רמה'],
  ['מה הם קונים? ( סוג המוצר/השירות )', 'קורס מקצועי למתחילות', 'קורס העלאת רמה'],
  ['מי קונה? ( מי מקבל את ההחלטה / משלם בפועל )', 'בת 18–22 שסיימה תיכון', 'בת 18–25 שכבר עשתה קורס בסיסי'],
  ['למה הם קונים ?', 'כי הן רוצות מקצוע חדש', 'כי הן רוצות לתקן טעות מקצועית'],
  [
    'מתי הם קונים? עיתוי / נקודת טריגר',
    '1. כשהן מבינות שהן לא מרוצות מהמסגרת הנוכחית ורוצות עצמאות. 2. אחרי שהן רואות מישהי מצליחה בתחום.',
    '1. כשמגיעה אליהן לקוחה עם ציפורן בעייתית והן לא יודעות איך לתקן אותה.',
  ],
  [],
  ['שאלות לדיוק הדמות', 'דמות 1', 'דמות 2'],
  ['מצב סוציו דמוגרפי'],
  ['גיל (טווח של עד 15 שנה)', '17-35', '17-35'],
  ['דפוסי התנהגות'],
  [
    'דפוסי התנהגות (איך הקהל מתנהג ביום־יום שלו בהקשר של הבעיה והפתרון)',
    'גוללת שעות ברשתות ומשווה את עצמה לאחרות ונמנעת מלפנות לאנשים חדשים',
    'עובדת לבד ולא מראה את העבודות שלה',
  ],
  [
    ' איזה כאבים/בעיות יש לקהל? (הטריגרים ל"למה לקנות".)',
    '1. יש לה בוס שמחליט עבורה מתי היא מתחילה ומתי היא מסיימת את היום. 2. היא צריכה לבקש אישור בכל פעם שהיא רוצה יום חופש.',
    '1. יודעת את הבסיס אבל התוצאה עדיין לא נראית לה מקצועית מספיק.',
  ],
  ['איזה שאלות נפוצות הלקוחות האלה שואלים בדרך כלל?', 'כמה באמת מרוויחים בתחום', 'למה המבנה שלי לא יוצא מדויק'],
  [
    'איזה אמונות מגבילות/פחדים/ספקות עשויים למנוע מהלקוחות לרכוש את המוצר/השירות שלך?',
    '* “אין לי ניסיון, אז מי בכלל תרצה לשלם לי על העבודה שלי?” * “אני חייבת להיות מושלמת לפני שאני מתחילה.”',
    '* ״אני כבר למדתי, אבל עדיין יש דברים שאני לא מצליחה לבצע כמו שאני רוצה.״',
  ],
  [
    'איזה עוד דרכים יש לקהל שלך לפתור את הבעיה שלו חוץ מלקנות את המוצר/שירות שלך?',
    'לקחת שיעור פרטי חד־פעמי במקום קורס מלא. • ללמוד דרך קורס דיגיטלי מוקלט. • לנסות ללמוד לבד ממדריך.',
    '• לקחת שיעור פרטי ממוקד על הבעיה. • ללמוד טכניקות מסרטונים ברשת.',
  ],
  [
    'איזה תוצאה יקבל לקוח שיגיע אלייך?',
    '• היא תרכוש מקצוע פרקטי שאפשר להפוך להכנסה. • היא תדע לעבוד נכון ובצורה מקצועית.',
    '• היא תבין בדיוק איפה היא טועה בעבודה שלה.',
  ],
  [
    'מה קורה אם לא פותרים את הבעיה?',
    '• היא תמשיך להיות תלויה במשכורת שלא מספיקה לה. • היא תמשיך לבקש רשות על חופשות ויציאה מוקדמת.',
    '• היא ממשיכה לחזור על אותן טעויות בלי להבין מה מקורן.',
  ],
];


const tabs = () => ({
  [TAB.persona]: PERSONA_ROWS,
  [TAB.audience]: AUDIENCE_ROWS,
});

test('מזהה את הקהלים מהגיליון, והראשון הוא העיקרי', () => {
  const names = audienceNames(AUDIENCE_ROWS);
  assert.deepEqual(names.map((n) => n.name), ['מתחילות מאפס', 'נייליסטיות שצריכות לעלות רמה']);

  const t = buildStoryTable(tabs());
  assert.equal(t.ready, true);
  assert.equal(t.audiences.length, 2);
  assert.equal(t.audiences[0].primary, true);
  assert.equal(t.audiences[1].primary, false);
  assert.equal(t.audiences[0].name, 'מתחילות מאפס');
});

test('חוק הפער הישיר והעקיף נשלפים מהפרסונה, ולא מתבלבלים ביניהם', () => {
  const rows = buildStoryTable(tabs()).audiences[0].ongoing;
  const direct = rows.find((r) => r.key === 'gap-direct');
  const indirect = rows.find((r) => r.key === 'gap-indirect');

  assert.equal(direct.fromSheet, true);
  assert.ok(direct.bullets.join(' ').includes('עצמאות כלכלית'));
  assert.ok(!direct.bullets.join(' ').includes('להציב גבולות'));

  assert.equal(indirect.fromSheet, true);
  assert.ok(indirect.bullets.join(' ').includes('להציב גבולות'));
  assert.ok(!indirect.bullets.join(' ').includes('עצמאות כלכלית'));
});

test('חוק ההשתקפות מחבר את מה שהיא עברה עם מה שהקהל עובר', () => {
  const row = buildStoryTable(tabs()).audiences[0].ongoing.find((r) => r.key === 'reflection');
  const text = row.bullets.join(' ');
  assert.ok(text.includes('גם אני בתחילת הדרך'), 'הצד שלה');
  assert.ok(text.includes('בוס שמחליט'), 'הצד של הקהל');
});

test('כל קהל מקבל את העמודה שלו, ולא את של הקהל הראשון', () => {
  const t = buildStoryTable(tabs());
  const primary = t.audiences[0].sale.find((r) => r.key === 'problem');
  const second = t.audiences[1].sale.find((r) => r.key === 'problem');
  assert.ok(primary.bullets.join(' ').includes('בוס שמחליט'));
  assert.ok(second.bullets.join(' ').includes('אותן טעויות'));
  assert.ok(!second.bullets.join(' ').includes('בוס שמחליט'));
});

test('כשאין לקהל בלוק פרסונה משלו הוא נופל לבלוק הראשון ולא נשאר ריק', () => {
  const second = buildStoryTable(tabs()).audiences[1].ongoing.find((r) => r.key === 'gap-direct');
  assert.equal(second.fromSheet, true);
  assert.ok(second.bullets.join(' ').includes('עצמאות כלכלית'));
});

// 30/09/2026, תיקון של מאיה: "את לא צריכה לכתוב להם מה להגיד אלא רק נושאים",
// "בחלק של להראות שיש ביקוש את לא צריכה להמציא, פשוט תכתבי להם ככותרת",
// "בחלק של הסגירה אין צורך שתפרטי, כי לימדתי אותן רצף של 4 סטוריז".
test('אין אף שדה שמבקש מהן לכתוב תוכן', () => {
  const t = buildStoryTable(tabs()).audiences[0];
  const rows = [...t.ongoing, ...t.sale];
  for (const row of rows) {
    assert.equal(row.needsInput, undefined, `${row.key} לא אמור לבקש מילוי`);
    assert.equal(row.hint, undefined, `${row.key} לא אמור להציע דוגמה מה לכתוב`);
    assert.equal(row.label, undefined, `${row.key} לא אמור להיות שדה`);
  }
});

test('הראו שיש ביקוש הוא כותרת ונושא, מהמתודולוגיה שלה', () => {
  const row = buildStoryTable(tabs()).audiences[0].ongoing.find((r) => r.key === 'demand');
  assert.equal(row.fromSheet, false);
  assert.equal(row.tool, 'הראו שיש ביקוש');
  assert.match(row.topic, /צילום מסך/);
  assert.equal(row.bullets.length, 0);
});

test('הסגירה היא רצף ארבעת הסטוריז שלימדה, בשמות שלה', () => {
  const row = buildStoryTable(tabs()).audiences[0].sale.find((r) => r.key === 'close');
  assert.deepEqual(row.steps, [
    'סטורי 1 · עצירה',
    'סטורי 2 · התוצאה עצמה',
    'סטורי 3 · דיבור למצלמה לחיזוק התוצאה',
    'סטורי 4 · הנעה לפעולה עם טריגר',
  ]);
  // "הן בוחרות תוצאה כלשהי של לקוח, שלהן אפילו"
  assert.match(row.topic, /של לקוחה או שלהן/);
});

test('הסגירה לא נוגעת בסל מוצרים ולא מבקשת מחיר', () => {
  const t = buildStoryTable(tabs()).audiences[0].sale.find((r) => r.key === 'close');
  const asText = JSON.stringify(t);
  assert.ok(!asText.includes('מחיר'), 'אין מחיר');
  assert.ok(!asText.includes('שם המוצר'), 'אין שם מוצר');
  assert.ok(!asText.includes('סל מוצרים'), 'אין הפניה לסל מוצרים');
  // ולשונית סל מוצרים בכלל לא נקראת יותר
  assert.equal(TAB.products, undefined);
});

test('הטריגר מהגיליון נשאר בסגירה, כי הוא שלהן', () => {
  const row = buildStoryTable(tabs()).audiences[0].sale.find((r) => r.key === 'close');
  assert.ok(row.bullets.join(' ').includes('לא מרוצות מהמסגרת'));
});

test('ארבעת שלבי המכירה שם, כולל הפומו שמאיה לא מנתה', () => {
  const sale = buildStoryTable(tabs()).audiences[0].sale;
  assert.deepEqual(sale.map((r) => r.stage), [1, 2, 3, 4]);
  assert.equal(sale[3].tool, 'אחרי המכירה · פומו');
  assert.equal(sale[3].fromSheet, false);
  assert.ok(sale[3].topic);
});

test('חמשת כלי החימום השוטף שם, עם הפער מפוצל לישיר ועקיף', () => {
  const ongoing = buildStoryTable(tabs()).audiences[0].ongoing;
  assert.deepEqual(ongoing.map((r) => r.tool), [
    'חוק הפער · ישיר',
    'חוק הפער · עקיף',
    'חוק ההשתקפות',
    'חוק הראי',
    'הראו שיש ביקוש',
    'קבלת פנים לעוקבים חדשים',
  ]);
});

test('הספירה אומרת מה בא מהקובץ, ולא מה היא חייבת', () => {
  const a = buildStoryTable(tabs()).audiences[0];
  assert.equal(a.totalCount, 10);
  assert.equal(a.fromSheetCount, 6, 'ארבעת הכלים מהפרסונה ושני שלבי המכירה');
  assert.equal(a.topicCount, 4, 'ביקוש, קבלת פנים, סגירה, פומו');
});

test('שורה שנשלפה ויצאה ריקה אומרת את זה, בלי להפוך לשדה מילוי', () => {
  const emptyPersona = PERSONA_ROWS.map((row) =>
    row[0] && row[0].includes('תוצאות עקיפות') ? [row[0], ''] : row
  );
  const t = buildStoryTable({ [TAB.persona]: emptyPersona, [TAB.audience]: AUDIENCE_ROWS });
  const row = t.audiences[0].ongoing.find((r) => r.key === 'gap-indirect');
  assert.equal(row.fromSheet, false);
  assert.match(row.topic, /עדיין ריק/);
  assert.equal(row.needsInput, undefined);
});

test('קובץ בלי הלשוניות הנדרשות מחזיר סיבה שאפשר להציג, לא טבלה ריקה', () => {
  const noPersona = buildStoryTable({ [TAB.audience]: AUDIENCE_ROWS });
  assert.equal(noPersona.ready, false);
  assert.equal(noPersona.reason, 'missing-tabs');
  assert.deepEqual(noPersona.missingTabs, [TAB.persona]);

  const noGroups = buildStoryTable({ [TAB.persona]: PERSONA_ROWS, [TAB.audience]: [['משהו אחר']] });
  assert.equal(noGroups.ready, false);
  assert.equal(noGroups.reason, 'no-audiences');
});

test('פיצול לשורות עובד על הסימונים שבאמת מופיעים בגיליון', () => {
  assert.equal(toBullets('1. הראשון שצריך להיות ארוך מספיק. 2. השני שגם הוא ארוך מספיק.').length, 2);
  assert.equal(toBullets('- הראשון שצריך להיות ארוך מספיק - השני שגם הוא ארוך מספיק'.replace(/-/g, '•')).length, 2);
  assert.deepEqual(toBullets(''), []);
  assert.deepEqual(toBullets('   '), []);
  assert.equal(toBullets('פסקה אחת ארוכה בלי שום סימון בכלל שצריכה להישאר שלמה').length, 1);
});

test('שינוי נוסח השאלה בגיליון לא שובר את ההתאמה', () => {
  const reworded = PERSONA_ROWS.map((row) =>
    row[0] && row[0].includes('תוצאות עקיפות')
      ? ['ותרשמו גם תוצאות עקיפות שהשגתם, מה זה עשה לתחומים אחרים בחיים שלכם?', row[1]]
      : row
  );
  const t = buildStoryTable({ [TAB.persona]: reworded, [TAB.audience]: AUDIENCE_ROWS });
  const indirect = t.audiences[0].ongoing.find((r) => r.key === 'gap-indirect');
  assert.equal(indirect.fromSheet, true);
  assert.ok(indirect.bullets.join(' ').includes('להציב גבולות'));
});

test('עמודת "קבוצה 5:" בלי שם לא הופכת לקהל', () => {
  const rows = AUDIENCE_ROWS.map((row) =>
    row[0] === 'שאלות לניתוח קהל היעד'
      ? [...row, 'קבוצה 3: עצמאיות ביופי', 'קבוצה 4:', 'קבוצה 5']
      : row
  );
  assert.deepEqual(audienceNames(rows).map((n) => n.name), [
    'מתחילות מאפס',
    'נייליסטיות שצריכות לעלות רמה',
    'עצמאיות ביופי',
  ]);
});
