export const CATEGORIES = ['ערכי', 'אישי', 'מכירתי', 'בידורי'];
export const STATUSES = ['רעיון', 'מתוכנן', 'צולם/הוקלט', 'פורסם'];

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

export function filterIdeas(ideas, { text = '', category = '', status = '' } = {}) {
  const needle = text.trim().toLowerCase();
  return ideas.filter((idea) => {
    if (category && idea.category !== category) return false;
    if (status && idea.status !== status) return false;
    if (needle) {
      const haystack = `${idea.title} ${idea.hookText}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

export function validateIdea({ title, category, hookText }) {
  const errors = [];
  if (!title || !title.trim()) errors.push('כותרת חובה');
  if (!category || !CATEGORIES.includes(category)) errors.push('קטגוריה לא תקינה');
  if (!hookText || !hookText.trim()) errors.push('טקסט hook חובה');
  return errors;
}
