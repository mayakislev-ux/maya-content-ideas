export const CATEGORIES = ['בעל ערך', 'אישי', 'מכירתי', 'בידורי'];
export const PERSUASION_STAGES = [
  'שלב שכנוע 1 - מודעות לבעיה / חומרת הבעיה',
  'שלב שכנוע 2 - מודעות לפתרון',
  'שלב שכנוע 3 - למה דווקא אני',
];
export const SOURCES = [
  'אינסטגרם',
  'טיקטוק',
  'לקוחות',
  'מהראש',
  'שיחה עם חברים / משפחה',
  'פודקאסט',
  'ספר',
  'אחר',
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
  [PERSUASION_STAGES[0]]: 'לגרום לקהל להבין למה הוא צריך את השירות שלכם - לגרום לו להבין שיש לו בעיה, גם אם עדיין לא מודע אליה. איך: לדבר על טעויות נפוצות, להציף בעיות ותסכולים, לגרום להזדהות, להראות מה מעכב אותו. המטרה: שיחשוב "זה בדיוק מה שקורה לי".',
  [PERSUASION_STAGES[1]]: 'לגרום לקהל להבין למה דווקא השיטה שלכם היא הפתרון. איך: להסביר את השיטה שלכם, לנפץ אמונות מגבילות, להשוות לפתרונות אחרים בשוק, להראות למה הם פחות אפקטיביים, להעביר ביקורות ודעות מקצועיות. המטרה: להבין שהפתרון הנכון הוא לפתור את הבעיה דווקא בדרך שלכם.',
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

export function validateIdea({ title, category, source, persuasionStage, rating, audienceScope }) {
  const errors = [];
  if (!title || !title.trim()) errors.push('שדה "הרעיון" חובה');
  if (!category || !CATEGORIES.includes(category)) errors.push('קטגוריה לא תקינה');
  if (!source) errors.push('שדה "מקור הרעיון" חובה');
  if (!persuasionStage) errors.push('שדה "שלב שכנוע" חובה');
  if (!rating) errors.push('שדה "דירוג" חובה');
  if (!audienceScope) errors.push('שדה "למי הסרטון מדבר" חובה');
  return errors;
}

export function pickRandomIdea(ideas) {
  if (!ideas.length) return null;
  return ideas[Math.floor(Math.random() * ideas.length)];
}
