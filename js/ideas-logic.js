export const CATEGORIES = ['בעל ערך', 'אישי', 'מכירתי', 'בידורי'];
export const PERSUASION_STAGES = [
  'שלב שכנוע 1 - מודעות לבעיה / חומרת הבעיה',
  'שלב שכנוע 2 - מודעות לפתרון',
  'שלב שכנוע 3 - למה דווקא אני',
];
export const RATINGS = ['🔥 חייב לצלם', '⭐ שווה לצלם', '💭 רעיון לעתיד'];
export const STRONG_RATING = '🔥 חייב לצלם';
export const AUDIENCE_SCOPES = ['עיקרי', 'משני', 'רחב'];
export const VIRAL_SCOPE = 'רחב';

export const MUST_INCLUDE_TYPES = [
  'ניפוץ אמונות מגבילות',
  'שריפת גשרים לפתרונות אחרים',
  'סיפורי הצלחה ותוצאות',
  "אג'נדות עסקיות (ביקורות ודעות)",
  "אג'נדות אישיות",
  'סרטונים על מי שאת מעבר לעסק',
  'בעיות ותסכולים של הקהל',
  'תוכן על סלבס בהקשר לתחום',
];

// עברו לכאן מ-script-chat.js (שם היו מקומיים) כדי שגם idea-form.js יוכל
// להשתמש באותה רשימה בדיוק לשדה "פורמט הנגשה" על הרעיון עצמו, לא רק
// כשאלת בחירה חד-פעמית בזמן כתיבת תסריט.
export const FORMAT_CHOICES = [
  'דיבור למצלמה',
  'וויס אובר',
  'ראיון/שיחה',
  'תוכן ויזואלי יפה',
  'טקסט דינמי',
  'שאלות מהתיבה בסטורי',
  'סדרת תוכן',
  'משחק תפקידים',
  'פוסט קרוסלה',
  'לוח/טאבלט',
  'סטיץ׳ (תגובה לסרטון ויראלי)',
  'תגובה לתגובה',
  'מסך ירוק',
  'מסך חצוי',
];

export const CATEGORY_DEFINITIONS = {
  'בעל ערך': 'מטרה: לבנות סמכות מקצועית. כולל: הבעיות של הקהל, ביקורת (על הקהל/על אנשי מקצוע בתחום), מיתוסים/אמונות מגבילות, שאלות נפוצות, לשרוף גשרים (לשלול פתרונות אחרים), טיפים חדשניים, טעויות נפוצות, חדשות מהתחום, רגע פריצת דרך, אזור הגאונות שלכם, אג\'נדות עסקיות.',
  'אישי': 'מטרה: ליצור אמון וחיבור רגשי. כולל: הדרך שלך והסיפור האישי, האג\'נדות/הערכים שלך, אתגרים שעברת בחיים, תובנות מהיום-יום, "יום בחיי", מטרה שהצבת לעצמך, טיול/טיסה/חוויות מיוחדות, זוגיות ומשפחה.',
  'מכירתי': 'מטרה: להגדיל מכירות - תמיד עם קריאה ברורה לפעולה. כולל: הצגת המוצר/השירות, סיפורי הצלחה של לקוחות, עדויות/המלצות, הוכחת תוצאה (תמונות/מספרים/לפני-אחרי).',
  'בידורי': 'מטרה: להגדיל חשיפה ולשדר נגישות. מומלץ שיהיה קשור לתחום העיסוק (ישיר או עקיף), אפשר לפעמים גם תוכן לא קשור שמשדר אישיות/ערכים. כולל: סאונד טרנדי מותאם לנישה, סיפורים מצחיקים/הזויים מהשטח, ממים רלוונטיים, סרטונים הומוריסטיים/קלילים, טרנדים. **הבחנה קריטית מ"בעל ערך":** תרחיש/סיפור קונקרטי (גם אם כתוב בצורה חיה או דרמטית, למשל דיאלוג מדומיין עם לקוח/ה) שמטרתו להעביר ביקורת מקצועית או לקח עסקי (כמו "ככה לא מדברים ללקוחה", טעות נפוצה שבעלי עסק עושים) הוא "בעל ערך" (ביקורת/טעויות נפוצות), לא "בידורי" - גם אם התיאור עצמו נשמע כמו אנקדוטה. "בידורי" הוא כשאין בו מסר מקצועי - רק הומור/טרנד/בידור. **הבחנה נוספת:** טיפ/שיטה אמיתית שמוסברת דרך אנלוגיה קלילה או משעשעת (למשל "אפשר לשכפל תוכן, בדיוק כמו שזמרת משכפלת שירים בגרסאות כיסוי") היא עדיין "בעל ערך" (מלמדת טכניקת תוכן שימושית), לא "בידורי" - גם אם האנלוגיה עצמה שאובה מעולם הבידור/המוזיקה. המבחן הוא אם יש טכניקה/תובנה אמיתית שאפשר לקחת ממנה, לא הטון הקליל של הדוגמה.',
};

export const PERSUASION_STAGE_DEFINITIONS = {
  [PERSUASION_STAGES[0]]: 'המטרה: לגרום לקהל להבין שיש לו בעיה בכלל - גם אם הוא עדיין לא מודע לזה או ממעיט בחומרה שלה. זה על **הבעיה עצמה**, לא על פתרונות. איך: לדבר על טעויות נפוצות שקשורות לבעיה (לא לפתרון!), להציף בעיות ותסכולים שהקהל חווה ולא תמיד שם לב אליהם, לגרום להזדהות עם הכאב, להראות מה מעכב אותו. המטרה: שיחשוב "זה בדיוק מה שקורה לי / זו בעיה אמיתית שיש לי".',
  [PERSUASION_STAGES[1]]: 'המטרה: הקהל כבר מודע שיש לו בעיה - עכשיו צריך לשכנע אותו לגבי **הפתרון/השיטה** דווקא, לא לגבי הבעיה. איך: להסביר את השיטה שלכם, לנפץ אמונות מגבילות על פתרונות/שיטות (למשל "דיאטות לא עובדות", "טיפולים זולים לא מספיקים"), להשוות לפתרונות אחרים בשוק ולהראות למה הם פחות אפקטיביים, לבקר גישות/שיטות נפוצות בתחום. המטרה: שיחשוב "אני מבין/ה עכשיו למה השיטה הזו היא הנכונה, ולמה אחרות לא מספיקות". **הבדל קריטי משלב 1:** אם הביקורת/הטעות שברעיון היא על הבעיה עצמה (הקהל לא שם לב שיש לו בעיה) - זה שלב 1. אם הביקורת היא על פתרון/שיטה/גישה שהקהל כבר מכיר או מנסה (הקהל יודע שיש לו בעיה אבל טועה לגבי הפתרון הנכון) - זה שלב 2, גם אם זה מנוסח כ"טעות נפוצה" או "מיתוס". דוגמה: "טיפול פנים ב-300 ש"ח זה דגל אדום" הוא שלב 2 (ביקורת על פתרון/שיטה זולה שלא עובדת), לא שלב 1. דוגמה נוספת - תוכן שמגיב לשאלה/טענה של עוקב/ת שמפקפק/ת בגישת שיווק מסוימת (למשל "למה צריך לספר סיפור אישי/עצוב בשיווק, ולא מספיק מוצר טוב עם פרסום ממומן?") ומסביר למה הגישה המפוקפקת שגויה - זה **שלב 2**, לא שלב 1, למרות שני דברים שעלולים להטעות: (1) המסגור כתגובה לשאלה/אתגר של עוקב/ת ולא כהצהרה ישירה, (2) הנושא הוא שיטת/גישת השיווק עצמה (לא מוצר או טיפול קונקרטי) - זה עדיין ניפוץ אמונה מגבילה לגבי "השיטה הנכונה", בדיוק כמו הדוגמה של הטיפול הזול. **חשוב - זה לא דורש ביקורת/מיתוס בכלל:** תוכן שפשוט מלמד טכניקה/שיטת תוכן קונקרטית, בניסוח חיובי וקליל לגמרי בלי להתווכח עם שום דבר (למשל "אפשר לשכפל תוכן - בדיוק כמו שזמרת משכפלת שירים בגרסאות כיסוי, כך אפשר לשכפל פורמט תוכן שכבר עבד") הוא עדיין **שלב 2**, לא שלב 1. שלב 1 הוא אך ורק כשהתוכן מצביע על **בעיה** שהקהל לא שם לב אליה; ברגע שהתוכן מסביר **איך לעשות** משהו (שיטה/טכניקה/תהליך) - זה תמיד שלב 2, גם בלי שום "טעות נפוצה" או ביקורת על גישה אחרת.',
  [PERSUASION_STAGES[2]]: 'לגרום לקהל לבחור דווקא בכם - הוא כבר מבין שיש לו בעיה ושאתם יודעים לפתור אותה, עכשיו צריך שיסמוך עליכם. איך: לשתף סיפורי הצלחה, להציג תוצאות לקוחות, לשתף לפני/אחרי, לספר סיפור אישי, לחשוף מאחורי הקלעים, להציג את האישיות שלכם. המטרה: שירגיש "אני רוצה לעבוד דווקא איתם". **הבדל קריטי משלב 2:** שלב 3 הוא ספציפית על בעלת העסק עצמה (או לקוחה שלה) - הסיפור/התוצאות/מאחורי-הקלעים **שלה**. אם הרעיון מצטט דמות חיצונית/מפורסמת (לא בעלת העסק ולא לקוחה שלה) רק כדוגמה להמחשת עיקרון או שיטה כללית - למשל "גם X המפורסמת, שיש לה כסף לשלם לאנשי מקצוע, עדיין מתעקשת לעשות Y בעצמה - אז גם את/ה צריכ/ה" - זה **שלב 2** (ניפוץ אמונה מגבילה לגבי השיטה הנכונה, באמצעות דוגמה חיצונית), לא שלב 3, גם אם יש בו סיפור על אדם ספציפי.',
};

const CATEGORY_COLOR_KEYS = {
  'בעל ערך': 'baal-erech',
  'אישי': 'ishi',
  'מכירתי': 'mechirti',
  'בידורי': 'biduri',
};

export function categoryColorVar(category) {
  return `var(--cat-${CATEGORY_COLOR_KEYS[category] || 'default'})`;
}

const CATEGORY_ICONS = {
  'בעל ערך': '💡',
  'אישי': '❤️',
  'מכירתי': '💰',
  'בידורי': '🎭',
};

export function categoryIcon(category) {
  return CATEGORY_ICONS[category] || '';
}

export function filterIdeas(ideas, { text = '', category = '', audienceScope = '', persuasionStage = '', rating = '' } = {}) {
  const needle = text.trim().toLowerCase();
  return ideas.filter((idea) => {
    if (category && idea.category !== category) return false;
    if (persuasionStage && idea.persuasionStage !== persuasionStage) return false;
    if (rating && idea.rating !== rating) return false;
    if (audienceScope && idea.audienceScope !== audienceScope) return false;
    if (needle) {
      const haystack = `${idea.title} ${idea.hookText || ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

export function validateIdea({ title, category, persuasionStage, rating, audienceScope }) {
  const errors = [];
  if (!title || !title.trim()) errors.push('שדה "הרעיון" חובה');
  if (!category || !CATEGORIES.includes(category)) errors.push('קטגוריה לא תקינה');
  if (!persuasionStage) errors.push('שדה "שלב שכנוע" חובה');
  if (!rating) errors.push('שדה "דירוג" חובה');
  if (!audienceScope) errors.push('שדה "למי הסרטון מדבר" חובה');
  return errors;
}

export function pickRandomIdea(ideas) {
  if (!ideas.length) return null;
  return ideas[Math.floor(Math.random() * ideas.length)];
}

export function sortIdeas(ideas, order) {
  const time = (idea) => (idea.createdAt && typeof idea.createdAt.toMillis === 'function' ? idea.createdAt.toMillis() : 0);
  const sorted = [...ideas];
  // טיוטה (בלי קטגוריה) חייבת לצוף למעלה קודם, בכל סדר מיון - אחרת היא
  // "מתגלגלת" ונקברת מתחת לרעיונות חדשים/מדורגים יותר, וקשה למצוא אותה
  // כדי להשלים. זה תמיד המפתח הראשי במיון; סדר המיון הנבחר עדיין קובע
  // את הסדר בתוך כל אחת משתי הקבוצות (טיוטות מול השאר).
  const draftRank = (idea) => (idea.category ? 1 : 0);
  if (order === 'oldest') {
    sorted.sort((a, b) => draftRank(a) - draftRank(b) || time(a) - time(b));
  } else if (order === 'rating') {
    // רעיון בלי דירוג (RATINGS.indexOf מחזיר -1) חייב להיחשב הכי פחות
    // דחוף, לא הכי דחוף - אחרת "🔥 הכי חזק קודם" מציג טיוטות לא-מדורגות
    // לפני רעיונות שבאמת מדורגים 🔥.
    const rank = (idea) => {
      const i = RATINGS.indexOf(idea.rating);
      return i === -1 ? RATINGS.length : i;
    };
    sorted.sort((a, b) => draftRank(a) - draftRank(b) || rank(a) - rank(b));
  } else {
    sorted.sort((a, b) => draftRank(a) - draftRank(b) || time(b) - time(a));
  }
  return sorted;
}

function normalizeForMatch(text) {
  return (text || '').trim().replace(/\s+/g, ' ');
}

function wordOverlapRatio(a, b) {
  const wordsA = new Set(normalizeForMatch(a).split(' ').filter(Boolean));
  const wordsB = new Set(normalizeForMatch(b).split(' ').filter(Boolean));
  if (!wordsA.size || !wordsB.size) return 0;
  let shared = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) shared++;
  }
  return shared / Math.max(wordsA.size, wordsB.size);
}

export function findSimilarIdea(ideas, text) {
  const normalizedText = normalizeForMatch(text);
  if (!normalizedText) return null;
  let best = null;
  let bestScore = 0;
  for (const idea of ideas) {
    const normalizedTitle = normalizeForMatch(idea.title);
    if (!normalizedTitle) continue;
    const score =
      normalizedTitle === normalizedText || normalizedText.includes(normalizedTitle) || normalizedTitle.includes(normalizedText)
        ? 1
        : wordOverlapRatio(normalizedTitle, normalizedText);
    if (score > bestScore) {
      bestScore = score;
      best = idea;
    }
  }
  return bestScore >= 0.5 ? best : null;
}
