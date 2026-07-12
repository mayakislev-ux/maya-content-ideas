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
  'בעל ערך': 'תוכן ערכי/אינפורמטיבי - מלמד, מסביר, נותן טיפ או תובנה. הקהל יוצא עם ידע חדש.',
  'אישי': 'תוכן שמראה מי אתם - הסיפור שלכם, החיים שלכם, הערכים שלכם. לא בהכרח קשור ישירות לעסק.',
  'מכירתי': 'עדויות, סיפורי הצלחה של לקוחות, תוצאות, או הסבר על התהליך/הקורס/השירות עצמו.',
  'בידורי': 'תוכן קליל, מצחיק, טרנד - המטרה בעיקר לבדר ולהיחשף, לא בהכרח ללמד או למכור.',
};

export const PERSUASION_STAGE_DEFINITIONS = {
  [PERSUASION_STAGES[0]]: 'הקהל עוד לא מודע שיש לו בעיה, או לא מבין כמה היא חמורה. התוכן מעורר מודעות לבעיה עצמה.',
  [PERSUASION_STAGES[1]]: 'הקהל כבר מודע לבעיה, אבל לא יודע שיש לה פתרון. התוכן מציג שיש דרך לפתור את זה.',
  [PERSUASION_STAGES[2]]: 'הקהל מודע לבעיה ולפתרון האפשרי, והשאלה שנשארת היא למה לבחור דווקא בכם. התוכן בונה אמון וייחוד.',
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
