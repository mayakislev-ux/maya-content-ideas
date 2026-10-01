// 30/09/2026 (מאיה): "לפני שבונים תכנית קודם זה מעביר אותן לדף מסודר כמו
// טבלה... שאת בעצם תיצרי לכל אחת טבלה כבר מהשיטס האישי שלה, יש שם מלא מלא
// נתונים... הן כבר מילאו הכל, למה לעשות עבודה כפולה".
//
// זה הלב של זה: הקובץ האישי הופך לטבלת חימום. אין כאן AI ואין ניחוש - הגיליון
// עצמו כבר אומר לאיזה כלי כל שאלה מיועדת. ליד "איפה בעצמכם השגתם את התוצאות"
// כתוב בגיליון "סעיף שאחר כך ישמש אותנו ליצירת סרטונים וסטוריז שיוצרים פער עם
// הקהל", וליד "איפה חוויתם בעצמכם את אותן בעיות" כתוב "סטוריז שגורמים לקהל
// להבין שאנחנו באמת מבינים אותו כי גם אנחנו היינו שם". לכן המיפוי כאן הוא
// קריאה של הכוונה שכבר כתובה שם, ולא פרשנות שלנו.
//
// חשוב: השורות מזוהות לפי הטקסט של השאלה ולא לפי מספר שורה. מאיה משנה את
// הטיוטה בין מחזורים (שורות נוספות, לשונית שנמחקת), וזיהוי לפי אינדקס קבוע
// נשבר בשקט בפעם הראשונה שהיא מוסיפה שורה.

// 30/09/2026: סל מוצרים ירד מכאן. שלב הסגירה הוא רצף קבוע שמאיה לימדה,
// והוא לא צריך מחיר ולא שם מוצר.
const TAB = {
  persona: 'פרסונה שיווקית',
  audience: 'ניתוח קהל יעד',
};

// כמה עמודות של קבוצות/דמויות יש בלשונית קהל היעד (B..F)
const MAX_AUDIENCES = 5;

// 30/09/2026 (מאיה: "צריך כל פער / תוצאה / כאב בעיה בשורה בנפרד, שיהיה
// מסודר", "פיספסת המון דברים שכתובים בטבלה"):
//
// התשובות בגיליון בנויות משורות אמיתיות - בסעיף הכאבים שלה 83 שורות,
// באג'נדות 129 - והקוד כאן מחק את כל מעברי השורה ב-\s+ ואז חתך לשישה
// פריטים. משם הגיעו גם הגושים וגם התוכן שנעלם.
//
// flat נשאר לכותרות, ששם רווח כפול באמת לא מעניין. text שומר על השורות.
function flat(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function text(value) {
  return String(value == null ? '' : value)
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim();
}
const clean = flat;

/** האם תא השאלה מכיל את כל מילות המפתח */
function labelMatches(cell, keywords) {
  const text = clean(cell);
  if (!text) return false;
  return keywords.every((k) => text.includes(k));
}

/**
 * כל השורות שהשאלה שלהן תואמת, עם התשובה מהעמודה המבוקשת.
 * מחזיר מערך כי לשונית הפרסונה משוכפלת פעם אחת לכל קהל - הבלוק הראשון הוא
 * הקהל העיקרי, ואחריו הקהלים המשניים, באותו סדר של לשונית קהל היעד.
 */
function answersFor(rows, keywords, col = 1) {
  const out = [];
  for (const row of rows || []) {
    if (!Array.isArray(row)) continue;
    if (!labelMatches(row[0], keywords)) continue;
    out.push(text(row[col]));
  }
  return out;
}

/** התשובה של הבלוק ה-index, או של הבלוק הראשון כשאין בלוק משלו */
function answerAt(rows, keywords, index) {
  const all = answersFor(rows, keywords);
  if (!all.length) return '';
  return text(all[index]) || text(all[0]);
}

/** מספר השורה (0-based) שהשאלה שלה תואמת, או -1 */
function rowIndexOf(rows, keywords) {
  return (rows || []).findIndex((row) => Array.isArray(row) && labelMatches(row[0], keywords));
}

/**
 * שמות הקהלים מלשונית קהל היעד.
 * בגיליון הם נכתבים "קבוצה 1: מתחילות מאפס", ובממשק מוצג רק החלק שאחרי
 * הנקודתיים - "קבוצה 3" הוא לא שם שאומר משהו למי שקוראת אותו.
 */
// "קבוצה 5:" בלי שם אחריו. בגיליון של חן זכרוב העמודה הזאת קיימת אבל ריקה
// לגמרי, ובלי הסינון הזה נפתח קהל חמישי בלי שם ובלי תוכן, שנראה כמו תקלה.
const EMPTY_GROUP_LABEL = /^(?:קבוצה|דמות)\s*\d*\s*:?\s*$/;

function audienceNames(audienceRows) {
  const headerRow = rowIndexOf(audienceRows, ['שאלות לניתוח קהל היעד']);
  if (headerRow === -1) return [];
  const row = audienceRows[headerRow] || [];
  const names = [];
  for (let col = 1; col <= MAX_AUDIENCES; col++) {
    const raw = clean(row[col]);
    if (!raw) continue;
    if (EMPTY_GROUP_LABEL.test(raw)) continue;
    const afterColon = raw.split(':').slice(1).join(':').trim();
    names.push({ col, raw, name: afterColon || raw });
  }
  return names;
}

/** תא מלשונית קהל היעד, לפי טקסט השורה ולפי העמודה של הקהל */
function audienceCell(audienceRows, keywords, col) {
  const idx = rowIndexOf(audienceRows, keywords);
  if (idx === -1) return '';
  const row = audienceRows[idx] || [];
  return text(row[col]);
}

// השאלות בגיליון. הנוסח משתנה בין התבניות (בקובץ של מאיה "איפה בעצמכם
// השגתם את התוצאות האלו?", אצל לקוחה "איפה בעצמכם אתם השגתם את החלומות,
// התשוקות והתוצאות האלה?"), ולכן ההתאמה היא לפי מילות מפתח משותפות.
const PERSONA_Q = {
  audienceResults: ['התוצאות', 'עוזרים'],
  gapDirect: ['איפה בעצמכם', 'השגתם'],
  gapIndirect: ['תוצאות עקיפות'],
  livesTheDream: ['חיים ביום יום'],
  audienceProblems: ['בעיות', 'ללקוחות שלכם'],
  reflection: ['איפה חוויתם בעצמכם'],
  audienceDreams: ['החלומות', 'של הקהל'],
  needToHear: ['צריך לשמוע'],
  mirrorStory: ['סיפור אישי'],
  whyMe: ['ולא סתם עוד מישהו'],
  different: ['שונים ממה שאנשים אחרים'],
  critique: ['ביקורת מקצועית'],
};
const AUDIENCE_Q = {
  buys: ['מה הם קונים'],
  whoBuys: ['מי קונה'],
  whyBuys: ['למה הם קונים'],
  whenBuys: ['מתי הם קונים'],
  behaviour: ['דפוסי התנהגות', 'ביום'],
  pains: ['כאבים'],
  questions: ['שאלות נפוצות'],
  beliefs: ['אמונות מגבילות'],
  alternatives: ['דרכים יש לקהל'],
  result: ['תוצאה יקבל'],
  ifNot: ['אם לא פותרים'],
};

/**
 * הופך תא של הגיליון לשורות תצוגה, אחת לכל פריט.
 *
 * 30/09/2026 (מאיה): "צריך כל פער / תוצאה / כאב בעיה בשורה בנפרד לרשום
 * שיהיה מסודר" ו"פיספסת המון דברים שכתובים בטבלה".
 *
 * קודם מפצלים לפי מעברי שורה, שזה המבנה האמיתי שבו היא כותבת. אחר כך,
 * רק בשורה שנשארה ארוכה ומכילה סימון פנימי, מפצלים גם לפיו. הסימונים
 * שבאמת מופיעים אצלה כוללים ספרות באימוג'י (1️⃣), נקודה-מספר, כוכבית,
 * בולט, ומקף ארוך. אין יותר תקרה: מה שכתוב בגיליון נכנס במלואו.
 */
// לוכסן בודד בתוך מחרוזת JS נבלע ("\s" הופך ל-"s"), ולכן הסימונים
// נכתבים כאן עם לוכסן כפול. בלי זה הפיצול פשוט לא תופס כלום, בשקט.
const MARKERS =
  '(?:^|\\s)(?:[1-9]\\uFE0F?\\u20E3|\\d+[.)]\\s|[\\u2022\\u25AA\\u25CF*\\u00B7]\\s|[\\u2013\\u2014]\\s|\\u201E)';
const MARKER_SPLIT = new RegExp(MARKERS, 'gu');
const LEADING =
  new RegExp('^(?:[1-9]\\uFE0F?\\u20E3|\\d+[.)]|[\\u2022\\u25AA\\u25CF*\\u00B7\\u2013\\u2014-])\\s*', 'u');
const QUOTES = new RegExp('^[\\u201C\\u201D"\']+|[\\u201C\\u201D"\']+$', 'g');
function stripBullet(line) {
  return line.replace(LEADING, '').replace(QUOTES, '').trim();
}

// שורה שממשיכה את קודמתה, ולא פותחת פריט חדש. בגיליון שלה משפט אחד
// נפרס על כמה שורות ("אם פספסתי שבוע" / "הרסתי את האלגוריתם"), ופיצול
// עיוור לפי שורות היה קורע אותם לשברים חסרי משמעות.
const ENDS_ITEM = new RegExp('[.!?:;\\u2022]$');
const STARTS_ITEM = new RegExp('^(?:[1-9]\\uFE0F?\\u20E3|\\d+[.)]|[\\u2022\\u25AA\\u25CF*\\u00B7\\u2013\\u2014-]\\s)', 'u');

/**
 * הופך תא של הגיליון לפריטים, אחד לכל דבר שהיא כתבה.
 *
 * 30/09/2026 (מאיה): "צריך כל פער / תוצאה / כאב בעיה בשורה בנפרד לרשום
 * שיהיה מסודר" ו"פיספסת המון דברים שכתובים בטבלה".
 *
 * שורה פותחת פריט חדש כשיש לה סימון, או כשהשורה שלפניה הסתיימה במשפט.
 * אחרת היא המשך של אותו פריט. אין תקרה: הכל נכנס.
 */
function toBullets(value) {
  const raw = text(value);
  if (!raw) return [];

  const items = [];
  let prev = null;
  for (const line of raw.split(String.fromCharCode(10))) {
    const trimmed = line.trim();
    if (!trimmed) {
      prev = null;
      continue;
    }
    // כמה סימונים באותה שורה = כמה פריטים שנדחסו לשורה אחת
    const inner = trimmed.split(MARKER_SPLIT).map(stripBullet).filter((x) => x.length > 1);
    if (inner.length > 1) {
      items.push(...inner);
      prev = null;
      continue;
    }
    const one = stripBullet(trimmed);
    if (one.length < 2) continue;
    const isNew = STARTS_ITEM.test(trimmed) || prev === null || ENDS_ITEM.test(prev);
    if (isNew) {
      items.push(one);
      prev = one;
    } else {
      items[items.length - 1] += ' ' + one;
      prev = items[items.length - 1];
    }
  }
  // כותרת משנה שנשארה לבד לא מוסיפה כלום
  return items.filter((x) => x.length > 2);
}
// 30/09/2026, תיקון של מאיה: "את לא צריכה לכתוב להם מה להגיד אלא רק נושאים",
// "בחלק של להראות שיש ביקוש את לא צריכה להמציא, פשוט תכתבי להם ככותרת, שלא
// יבלבל", "בחלק של הסגירה אין צורך שתפרטי כי לימדתי אותן רצף של 4 סטוריז".
//
// לכן הכלים שאין להם מקור בגיליון אינם שדות למילוי אלא כותרת ונושא. הנוסח
// לקוח מהמתודולוגיה שלה עצמה (warming-system-prompt.js) ולא מומצא כאן.
const TOPIC_ROWS = {
  demand: {
    key: 'demand',
    kind: 'ongoing',
    tool: 'הראו שיש ביקוש',
    topic: 'צילום מסך של פניות, של הרשמות, או של הודעות נכנסות',
  },
  welcome: {
    key: 'welcome',
    kind: 'ongoing',
    tool: 'קבלת פנים לעוקבים חדשים',
    topic: 'מי את ומה הערך שאת נותנת, ואם יש אבן דרך אז לקשור אליה',
  },
  fomo: {
    key: 'fomo',
    kind: 'sale',
    stage: 4,
    tool: 'אחרי המכירה · פומו',
    topic: 'לקוחות בפעולה, הצלחות של מי שכבר בתוך התהליך, ותחושת פספוס',
  },
};

// 30/09/2026 (מאיה): "בחוק הראי תוסיפי כאן עוד כפתור שיצטרכו להשלים לבד,
// סיפורי לקוחות שהיו במקום שלהם והצליחו", "במודעות לפתרון תוסיפי כפתור
// ידני של סיפורי הצלחה שאפשר להוסיף", ובטעויות "פשוט תשאירי ריק".
//
// משבצת כזאת היא כותרת עם כפתור הוספה משלה. היא לא נשלפת מהגיליון, והיא
// לא שדה שמבקש מהן לכתוב תוכן מראש - הכותרת היא הנושא, בדיוק כמו שאר
// הנושאים בטבלה.
const SLOTS = {
  mirror: [{ key: 'mirror-stories', label: 'סיפורי לקוחות שהיו במקום שלהם והצליחו' }],
  solution: [{ key: 'solution-wins', label: 'סיפורי הצלחה להראות' }],
  problem: [{ key: 'problem-mistakes', label: 'הטעויות שהם עושים בלי לדעת' }],
};

function filledRow({ key, kind, tool, source, groups, stage }) {
  const row = { key, kind, tool, source, groups: groups || [], slots: SLOTS[key] || [], fromSheet: true };
  if (stage) row.stage = stage;
  return row;
}

/** כלי שאין לו מקור בגיליון: כותרת ונושא, בלי שדה מילוי ובלי תסריט */
function topicRow(spec) {
  return { ...spec, source: '', groups: [], bullets: [], slots: SLOTS[spec.key] || [], fromSheet: false };
}

/**
 * הטבלה של קהל אחד.
 * index הוא מקומו בסדר הקהלים, וגם הבלוק שלו בלשונית הפרסונה (שמשוכפלת
 * פעם אחת לכל קהל). כשלקהל אין בלוק פרסונה משלו, נופלים לבלוק הראשון - זה
 * המצב אצל כמעט כולן, כי הן מילאו את הפרסונה פעם אחת ואת קהלי היעד כמה
 * פעמים, ועדיף להציג את מה שיש מאשר שורה ריקה.
 */
// ההגדרה של כל כלי, במילים של מאיה מתוך "סיכום - חימום קהל בסטורי".
// היא מוצגת מתחת לשם הכלי, אחרי ש-30/09/2026 היא כתבה "לדעתי יש לך
// בלבול בפער ישיר, זה לא תוצאות שהוא רוצה, זה תוצאות שהוא רוצה שאני
// השגתי בעצמי". ההגדרה על המסך מונעת בדיוק את הבלבול הזה.
const TOOL_DEF = {
  'gap-direct': 'תוצאה שהקהל רוצה בעצמו, ושלך כבר יש. הדברים הברורים שהם חולמים עליהם ושאת השגת בעצמך',
  'gap-indirect': 'סגנון החיים והתחושה שהשירות שלך מאפשר. הדברים שהם לא אומרים בקול',
  reflection: 'שיראו את עצמם בתוכן שלך. הכאבים שלהם, המחשבות שלהם, ושגם את היית שם',
  mirror: 'שיראו שזה אפשרי גם בשבילם. הדרך ונקודת ההתחלה, לא רק התוצאה',
  demand: 'צילומי מסך של פניות שהגיעו. גם מעט, גם מהשבועיים האחרונים',
  welcome: 'מי את, איזה ערך את נותנת, ולמה כדאי להם להישאר',
  problem: 'להציף בעיה נפוצה, לחשוף טעות שהם עושים בלי לדעת, שיגידו בראש זה בדיוק אני',
  solution: 'לשרוף גשרים מול פתרונות אחרים, לנפץ אמונה מגבילה, ולהראות הצלחות',
  close: 'רצף של ארבעה סטוריז, סביב תוצאה אחת של לקוחה או שלך',
  fomo: 'להמשיך להדליק אש אחרי הסגירה. לקוחות בפעולה, ומה קורה עכשיו בתהליך',
};

/**
 * הטבלה של קהל אחד.
 *
 * 30/09/2026 (מאיה): "בכל הסעיפים פיספסת המון דברים שכתובים בטבלה... צריך
 * סדר ולוודא שלא פיספסת דברים". לכן אין כאן יותר אף תקרה על מספר הפריטים:
 * כל מה שכתוב בגיליון נכנס, כל פריט בשורה משלו.
 *
 * החלוקה עצמה היא לפי "סיכום - חימום קהל בסטורי" שלה, כולל השאלות המנחות
 * של כל חוק - הכאבים והאמונות המגבילות שייכים לחוק ההשתקפות, והביקורת על
 * התחום שייכת לשלב הפתרון ("לשרוף גשרים").
 */
/**
 * הטבלה של קהל אחד.
 *
 * 30/09/2026 (מאיה): "בכל הסעיפים פיספסת המון דברים שכתובים בטבלה... צריך
 * סדר ולוודא שלא פיספסת דברים".
 *
 * שני הדברים יחד: אין יותר תקרה על מספר הפריטים, וכל מקור מוצג בקבוצה
 * משלו עם הכותרת שלו. בלי הקבוצות, חוק ההשתקפות היה ערימה אחת של 372
 * פריטים משש שאלות שונות, וזה בדיוק ההפך מסדר.
 *
 * החלוקה לפי "סיכום - חימום קהל בסטורי" שלה, כולל השאלות המנחות של כל
 * חוק: הכאבים והאמונות שייכים לחוק ההשתקפות, והביקורת על התחום שייכת
 * לשלב הפתרון ("לשרוף גשרים").
 */
function tableForAudience({ personaRows, audienceRows, col, index }) {
  const p = (q) => answerAt(personaRows, PERSONA_Q[q], index);
  const a = (q) => audienceCell(audienceRows, AUDIENCE_Q[q], col);

  // [כותרת הקבוצה, התוכן] -> קבוצות עם תוכן בלבד
  const group = (pairs) =>
    pairs
      .map(([label, value]) => ({ label, items: toBullets(value) }))
      .filter((g) => g.items.length);

  const ongoing = [
    filledRow({
      key: 'gap-direct',
      kind: 'ongoing',
      tool: 'חוק הפער · ישיר',
      source: 'פרסונה שיווקית',
      groups: group([['התוצאות שאת עצמך השגת', p('gapDirect')]]),
    }),
    filledRow({
      key: 'gap-indirect',
      kind: 'ongoing',
      tool: 'חוק הפער · עקיף',
      source: 'פרסונה שיווקית',
      groups: group([
        ['תוצאות עקיפות שהשגת', p('gapIndirect')],
        ['איך את חיה את החלומות שלהם ביום יום', p('livesTheDream')],
      ]),
    }),
    filledRow({
      key: 'reflection',
      kind: 'ongoing',
      tool: 'חוק ההשתקפות',
      source: 'פרסונה + ניתוח קהל יעד',
      groups: group([
        ['הבעיות, הפחדים והאמונות שלהם', p('audienceProblems')],
        ['איפה את בעצמך חווית את אותו דבר', p('reflection')],
        ['הכאבים שלהם', a('pains')],
        ['השאלות שהם שואלים', a('questions')],
        ['האמונות שמונעות מהם לקנות', a('beliefs')],
      ]),
    }),
    filledRow({
      key: 'mirror',
      kind: 'ongoing',
      tool: 'חוק הראי',
      source: 'פרסונה שיווקית',
      groups: group([
        ['הסיפור האישי שלך', p('mirrorStory')],
        ['מה הם צריכים לשמוע כדי לזוז', p('needToHear')],
      ]),
    }),
    topicRow(TOPIC_ROWS.demand),
    topicRow(TOPIC_ROWS.welcome),
  ];

  const sale = [
    filledRow({
      key: 'problem',
      kind: 'sale',
      stage: 1,
      tool: 'מודעות לבעיה',
      source: 'ניתוח קהל יעד',
      groups: group([
        ['הכאבים שלהם', a('pains')],
        ['מה קורה אם הם לא פותרים את זה', a('ifNot')],
        ['השאלות שהם שואלים', a('questions')],
      ]),
    }),
    filledRow({
      key: 'solution',
      kind: 'sale',
      stage: 2,
      tool: 'מודעות לפתרון',
      source: 'ניתוח קהל יעד + פרסונה',
      groups: group([
        ['אמונות מגבילות לנפץ', a('beliefs')],
        ['פתרונות אחרים שהם שוקלים, גשרים לשרוף', a('alternatives')],
        ['הביקורת שלך על התחום', p('critique')],
        ['למה דווקא את, ולא עוד מישהו', p('whyMe')],
        ['במה הדרך שלך שונה', p('different')],
        ['התוצאה שהם מקבלים ממך', a('result')],
      ]),
    }),
    closeRow({ whenBuys: a('whenBuys') }),
    topicRow(TOPIC_ROWS.fomo),
  ];

  // שורה שנשלפה מהגיליון ויצאה ריקה אומרת את זה במילים, אבל לא הופכת
  // לשדה מילוי: מאיה, "את לא צריכה לכתוב להם מה להגיד אלא רק נושאים".
  const repair = (row) => {
    const groups = row.groups || [];
    const bullets = groups.flatMap((g) => g.items);
    const out = { ...row, groups, bullets, slots: row.slots || [], definition: TOOL_DEF[row.key] || null };
    if (!out.fromSheet || bullets.length) return out;
    return {
      ...out,
      fromSheet: false,
      groups: [],
      bullets: [],
      topic: `בקובץ שלך זה עדיין ריק (${row.source})`,
    };
  };

  return { ongoing: ongoing.map(repair), sale: sale.map(repair) };
}
function closeRow({ whenBuys }) {
  return {
    key: 'close',
    kind: 'sale',
    stage: 3,
    tool: 'סגירת המכירה',
    slots: [],
    source: '',
    fromSheet: false,
    topic: 'בוחרות תוצאה אחת, של לקוחה או שלהן, ועליה בונות את הרצף',
    steps: [
      'סטורי 1 · עצירה',
      'סטורי 2 · התוצאה עצמה',
      'סטורי 3 · דיבור למצלמה לחיזוק התוצאה',
      'סטורי 4 · הנעה לפעולה עם טריגר',
    ],
    groups: toBullets(whenBuys).length ? [{ label: 'מתי הם קונים, הטריגר', items: toBullets(whenBuys) }] : [],
    bullets: toBullets(whenBuys),
  };
}

/**
 * הטבלה המלאה, לכל הקהלים.
 * הקהל הראשון הוא העיקרי (מאיה: "קודם בפרונט קהל עיקרי ואז לשונית של קהלים
 * משניים"). ללא לשונית קהל יעד אין קהלים, ואז מחזירים ready: false עם סיבה
 * שאפשר להציג ללקוחה, במקום טבלה ריקה בלי הסבר.
 */
function buildStoryTable(tabs) {
  const personaRows = tabs[TAB.persona] || [];
  const audienceRows = tabs[TAB.audience] || [];

  const missingTabs = [TAB.persona, TAB.audience].filter((t) => !(tabs[t] && tabs[t].length));
  if (missingTabs.length) {
    return { ready: false, reason: `missing-tabs`, missingTabs, audiences: [] };
  }

  const names = audienceNames(audienceRows);
  if (!names.length) {
    return { ready: false, reason: 'no-audiences', missingTabs: [], audiences: [] };
  }

  const audiences = names.map((entry, index) => {
    const { ongoing, sale } = tableForAudience({
      personaRows,
      audienceRows,
      col: entry.col,
      index,
    });
    const rows = [...ongoing, ...sale];
    return {
      id: `a${entry.col}`,
      name: entry.name,
      primary: index === 0,
      buys: audienceCell(audienceRows, AUDIENCE_Q.buys, entry.col),
      ongoing,
      sale,
      fromSheetCount: rows.filter((r) => r.fromSheet).length,
      topicCount: rows.filter((r) => !r.fromSheet).length,
      totalCount: rows.length,
    };
  });

  return { ready: true, reason: '', missingTabs: [], audiences };
}

module.exports = {
  buildStoryTable,
  audienceNames,
  toBullets,
  answerAt,
  audienceCell,
  TAB,
  PERSONA_Q,
  AUDIENCE_Q,
  TOPIC_ROWS,
};
