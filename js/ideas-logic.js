export const CATEGORIES = ['בעל ערך', 'אישי', 'מכירתי', 'בידורי'];
export const STATUSES = ['רעיון', 'בתכנון', 'פורסם'];
export const PERSUASION_STAGES = [
  'שלב שכנוע 1 - מודעות לבעיה / חומרת הבעיה',
  'שלב שכנוע 2 - מודעות לפתרון',
  'שלב שכנוע 3 - למה דווקא אני',
];

const CATEGORY_COLOR_KEYS = {
  'בעל ערך': 'baal-erech',
  'אישי': 'ishi',
  'מכירתי': 'mechirti',
  'בידורי': 'biduri',
};

export function categoryColorVar(category) {
  return `var(--cat-${CATEGORY_COLOR_KEYS[category] || 'default'})`;
}

export function nextStatus(status) {
  const i = STATUSES.indexOf(status);
  if (i === -1 || i === STATUSES.length - 1) return status;
  return STATUSES[i + 1];
}

export function prevStatus(status) {
  const i = STATUSES.indexOf(status);
  if (i <= 0) return status;
  return STATUSES[i - 1];
}

export function filterIdeas(ideas, { text = '', category = '', status = '', viral = '' } = {}) {
  const needle = text.trim().toLowerCase();
  return ideas.filter((idea) => {
    if (category && idea.category !== category) return false;
    if (status && idea.status !== status) return false;
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
