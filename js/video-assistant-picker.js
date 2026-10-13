// 13/10/2026: בחירה אקראית ללא חזרה מיידית, לשני המסלולים של "אין לי
// רעיון". קובץ ללא שום import של Firebase בכוונה - כך הוא ניתן ל-import
// ישיר בבדיקה (ראה test/video-assistant-picker.test.mjs), באותה שיטה
// שפונקציות טהורות ב-functions/ נבדקות דרך require().

const EASY_FORMATS = ['סיפור אישי', 'טיפים או רשימה', 'הדגמה או הוראה', 'שאלות ותשובות'];

function pickFrom(list, excludeId) {
  if (!list.length) return null;
  const withoutExcluded = list.filter((item) => item.id !== excludeId);
  const pool = withoutExcluded.length ? withoutExcluded : list;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** רעיון אחד מתוך בנק הרעיונות שלה - רק כאלה עם הוק ממשי, לא מחוקים/גמורים */
export function pickIdea(ideas, excludeId) {
  const eligible = (ideas || []).filter(
    (idea) => idea && idea.hookText && idea.hookText.trim() && !idea.deletedAt && !idea.completedAt
  );
  return pickFrom(eligible, excludeId);
}

/**
 * רפרנס אחד מהתחום שלה - עדיפות לפורמטים קלים לתמלול מילולי.
 *
 * ההחרגה (excludeId) חייבת לפעול לפני שבודקים אם יש בכלל "פורמט קל" -
 * אחרת רפרנס יחיד בפורמט קל שהוחרג (reroll) היה גורם לנפילה חזרה לאותו
 * רפרנס בדיוק במקום למעבר לכל רפרנס אחר בתחום.
 */
export function pickReference(videos, domain, excludeId) {
  const inDomain = (videos || []).filter((v) => v && v.domain === domain);
  const easy = inDomain.filter((v) => Array.isArray(v.formatTags) && v.formatTags.some((f) => EASY_FORMATS.includes(f)));
  const easyWithoutExcluded = easy.filter((v) => v.id !== excludeId);
  if (easyWithoutExcluded.length) return pickFrom(easyWithoutExcluded, null);
  return pickFrom(inDomain, excludeId);
}
