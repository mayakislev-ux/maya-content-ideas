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

function clean(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

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
    out.push(clean(row[col]));
  }
  return out;
}

/** התשובה של הבלוק ה-index, או של הבלוק הראשון כשאין בלוק משלו */
function answerAt(rows, keywords, index) {
  const all = answersFor(rows, keywords);
  if (!all.length) return '';
  return clean(all[index]) || clean(all[0]);
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
  return clean(row[col]);
}

const PERSONA_Q = {
  gapDirect: ['איפה בעצמכם', 'השגתם'],
  gapIndirect: ['תוצאות עקיפות'],
  reflection: ['איפה חוויתם בעצמכם'],
  mirrorStory: ['סיפור אישי'],
  needToHear: ['צריך לשמוע'],
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

/** הופך תא של הגיליון לשורות תצוגה. בגיליון הן מסומנות ב-1. 2. או ב-* ו-• */
function toBullets(text, max = 6) {
  const raw = clean(text);
  if (!raw) return [];
  const parts = raw
    .split(/(?:^|\s)(?:\d+\.\s|[•*·–]\s|„)/)
    .map((p) => clean(p).replace(/^[”"']+|[”"']+$/g, ''))
    .filter((p) => p.length > 12);
  const list = parts.length > 1 ? parts : [raw];
  return list.slice(0, max);
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

function filledRow({ key, kind, tool, source, bullets, stage }) {
  const row = { key, kind, tool, source, bullets, fromSheet: true };
  if (stage) row.stage = stage;
  return row;
}

/** כלי שאין לו מקור בגיליון: כותרת ונושא, בלי שדה מילוי ובלי תסריט */
function topicRow(spec) {
  return { ...spec, source: '', bullets: [], fromSheet: false };
}

/**
 * הטבלה של קהל אחד.
 * index הוא מקומו בסדר הקהלים, וגם הבלוק שלו בלשונית הפרסונה (שמשוכפלת
 * פעם אחת לכל קהל). כשלקהל אין בלוק פרסונה משלו, נופלים לבלוק הראשון - זה
 * המצב אצל כמעט כולן, כי הן מילאו את הפרסונה פעם אחת ואת קהלי היעד כמה
 * פעמים, ועדיף להציג את מה שיש מאשר שורה ריקה.
 */
function tableForAudience({ personaRows, audienceRows, col, index }) {
  const p = (q) => answerAt(personaRows, PERSONA_Q[q], index);
  const a = (q) => audienceCell(audienceRows, AUDIENCE_Q[q], col);

  const ongoing = [
    filledRow({
      key: 'gap-direct',
      kind: 'ongoing',
      tool: 'חוק הפער · ישיר',
      source: 'פרסונה שיווקית · התוצאות שלך',
      bullets: toBullets(p('gapDirect')),
    }),
    filledRow({
      key: 'gap-indirect',
      kind: 'ongoing',
      tool: 'חוק הפער · עקיף',
      source: 'פרסונה שיווקית · תוצאות עקיפות',
      bullets: toBullets(p('gapIndirect')),
    }),
    filledRow({
      key: 'reflection',
      kind: 'ongoing',
      tool: 'חוק ההשתקפות',
      source: 'פרסונה + כאבי הקהל',
      bullets: [...toBullets(p('reflection'), 3), ...toBullets(a('pains'), 3)],
    }),
    filledRow({
      key: 'mirror',
      kind: 'ongoing',
      tool: 'חוק הראי',
      source: 'פרסונה · הסיפור האישי',
      bullets: toBullets(p('mirrorStory'), 3),
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
      source: 'קהל יעד · כאבים, התנהגות, ומה קורה אם לא',
      bullets: [...toBullets(a('pains'), 3), ...toBullets(a('ifNot'), 2), ...toBullets(a('behaviour'), 1)],
    }),
    filledRow({
      key: 'solution',
      kind: 'sale',
      stage: 2,
      tool: 'מודעות לפתרון',
      source: 'קהל יעד · אמונות ודרכים אחרות',
      bullets: [
        ...toBullets(a('beliefs'), 3),
        ...toBullets(a('alternatives'), 2),
        ...toBullets(p('critique'), 1),
      ],
    }),
    closeRow({ whenBuys: a('whenBuys') }),
    topicRow(TOPIC_ROWS.fomo),
  ];

  // שורה שנשלפה מהגיליון ויצאה ריקה אומרת את זה במילים, אבל לא הופכת לשדה
  // מילוי: מאיה, 30/09/2026, "את לא צריכה לכתוב להם מה להגיד אלא רק נושאים".
  const repair = (row) => {
    if (!row.fromSheet || row.bullets.length) return row;
    return { ...row, fromSheet: false, bullets: [], topic: `בקובץ שלך זה עדיין ריק (${row.source})` };
  };

  return { ongoing: ongoing.map(repair), sale: sale.map(repair) };
}

/**
 * שלב הסגירה.
 *
 * 30/09/2026, מאיה: "בחלק של הסגירה אין צורך שתפרטי, כי לימדתי אותן רצף של
 * 4 סטוריז למכירה. הן בוחרות תוצאה כלשהי של לקוח, שלהן אפילו".
 *
 * לכן כאן אין שליפה מסל מוצרים ואין בקשה למחיר. יש את הרצף שהיא לימדה,
 * כארבעה שלבים בשמות שלה, ושורה אחת שאומרת שהתוצאה יכולה להיות של לקוחה או
 * שלהן. הטריגר מהגיליון נשאר, כי הוא שלהן וכן עוזר לבחור מתי.
 */
function closeRow({ whenBuys }) {
  return {
    key: 'close',
    kind: 'sale',
    stage: 3,
    tool: 'סגירת המכירה',
    source: '',
    fromSheet: false,
    topic: 'בוחרות תוצאה אחת, של לקוחה או שלהן, ועליה בונות את הרצף',
    steps: [
      'סטורי 1 · עצירה',
      'סטורי 2 · התוצאה עצמה',
      'סטורי 3 · דיבור למצלמה לחיזוק התוצאה',
      'סטורי 4 · הנעה לפעולה עם טריגר',
    ],
    bullets: toBullets(whenBuys, 2),
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
