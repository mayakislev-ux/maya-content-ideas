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

export const CATEGORY_DEFINITIONS = {
  'בעל ערך': 'מטרה: לבנות סמכות מקצועית. כולל: הבעיות של הקהל, ביקורת (על הקהל/על אנשי מקצוע בתחום), מיתוסים/אמונות מגבילות, שאלות נפוצות, לשרוף גשרים (לשלול פתרונות אחרים), טיפים חדשניים, טעויות נפוצות, חדשות מהתחום, רגע פריצת דרך, אזור הגאונות שלכם, אג\'נדות עסקיות.',
  'אישי': 'מטרה: ליצור אמון וחיבור רגשי. כולל: הדרך שלך והסיפור האישי, האג\'נדות/הערכים שלך, אתגרים שעברת בחיים, תובנות מהיום-יום, "יום בחיי", מטרה שהצבת לעצמך, טיול/טיסה/חוויות מיוחדות, זוגיות ומשפחה.',
  'מכירתי': 'מטרה: להגדיל מכירות - תמיד עם קריאה ברורה לפעולה. כולל: הצגת המוצר/השירות, סיפורי הצלחה של לקוחות, עדויות/המלצות, הוכחת תוצאה (תמונות/מספרים/לפני-אחרי).',
  'בידורי': 'מטרה: להגדיל חשיפה ולשדר נגישות. מומלץ שיהיה קשור לתחום העיסוק (ישיר או עקיף), אפשר לפעמים גם תוכן לא קשור שמשדר אישיות/ערכים. כולל: סאונד טרנדי מותאם לנישה, סיפורים מצחיקים/הזויים מהשטח, ממים רלוונטיים, סרטונים הומוריסטיים/קלילים, טרנדים.',
};

export const PERSUASION_STAGE_DEFINITIONS = {
  [PERSUASION_STAGES[0]]: 'המטרה: לגרום לקהל להבין שיש לו בעיה בכלל - גם אם הוא עדיין לא מודע לזה או ממעיט בחומרה שלה. זה על **הבעיה עצמה**, לא על פתרונות. איך: לדבר על טעויות נפוצות שקשורות לבעיה (לא לפתרון!), להציף בעיות ותסכולים שהקהל חווה ולא תמיד שם לב אליהם, לגרום להזדהות עם הכאב, להראות מה מעכב אותו. המטרה: שיחשוב "זה בדיוק מה שקורה לי / זו בעיה אמיתית שיש לי".',
  [PERSUASION_STAGES[1]]: 'המטרה: הקהל כבר מודע שיש לו בעיה - עכשיו צריך לשכנע אותו לגבי **הפתרון/השיטה** דווקא, לא לגבי הבעיה. איך: להסביר את השיטה שלכם, לנפץ אמונות מגבילות על פתרונות/שיטות (למשל "דיאטות לא עובדות", "טיפולים זולים לא מספיקים"), להשוות לפתרונות אחרים בשוק ולהראות למה הם פחות אפקטיביים, לבקר גישות/שיטות נפוצות בתחום. המטרה: שיחשוב "אני מבין/ה עכשיו למה השיטה הזו היא הנכונה, ולמה אחרות לא מספיקות". **הבדל קריטי משלב 1:** אם הביקורת/הטעות שברעיון היא על הבעיה עצמה (הקהל לא שם לב שיש לו בעיה) - זה שלב 1. אם הביקורת היא על פתרון/שיטה/גישה שהקהל כבר מכיר או מנסה (הקהל יודע שיש לו בעיה אבל טועה לגבי הפתרון הנכון) - זה שלב 2, גם אם זה מנוסח כ"טעות נפוצה" או "מיתוס". דוגמה: "טיפול פנים ב-300 ש"ח זה דגל אדום" הוא שלב 2 (ביקורת על פתרון/שיטה זולה שלא עובדת), לא שלב 1.',
  [PERSUASION_STAGES[2]]: 'לגרום לקהל לבחור דווקא בכם - הוא כבר מבין שיש לו בעיה ושאתם יודעים לפתור אותה, עכשיו צריך שיסמוך עליכם. איך: לשתף סיפורי הצלחה, להציג תוצאות לקוחות, לשתף לפני/אחרי, לספר סיפור אישי, לחשוף מאחורי הקלעים, להציג את האישיות שלכם. המטרה: שירגיש "אני רוצה לעבוד דווקא איתם".',
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
  if (order === 'oldest') {
    sorted.sort((a, b) => time(a) - time(b));
  } else if (order === 'rating') {
    sorted.sort((a, b) => RATINGS.indexOf(a.rating) - RATINGS.indexOf(b.rating));
  } else {
    sorted.sort((a, b) => time(b) - time(a));
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
