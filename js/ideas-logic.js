export const CATEGORIES = ['בעל ערך', 'אישי', 'מכירתי', 'בידורי'];
export const STATUSES = ['רעיון', 'בתכנון', 'פורסם'];
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

const CATEGORY_COLOR_KEYS = {
  'בעל ערך': 'baal-erech',
  'אישי': 'ishi',
  'מכירתי': 'mechirti',
  'בידורי': 'biduri',
};

export function categoryColorVar(category) {
  return `var(--cat-${CATEGORY_COLOR_KEYS[category] || 'default'})`;
}

export function filterIdeas(ideas, { text = '', category = '', status = '', viral = '', source = '', persuasionStage = '', rating = '' } = {}) {
  const needle = text.trim().toLowerCase();
  return ideas.filter((idea) => {
    if (category && idea.category !== category) return false;
    if (status && idea.status !== status) return false;
    if (source && idea.source !== source) return false;
    if (persuasionStage && idea.persuasionStage !== persuasionStage) return false;
    if (rating && idea.rating !== rating) return false;
    if (viral === 'כן' && !idea.viralPotential) return false;
    if (viral === 'לא' && idea.viralPotential) return false;
    if (needle) {
      const haystack = `${idea.title} ${idea.hookText || ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

export function validateIdea({ title, category }) {
  const errors = [];
  if (!title || !title.trim()) errors.push('שדה "הרעיון" חובה');
  if (!category || !CATEGORIES.includes(category)) errors.push('קטגוריה לא תקינה');
  return errors;
}

export function pickRandomIdea(ideas) {
  if (!ideas.length) return null;
  return ideas[Math.floor(Math.random() * ideas.length)];
}
