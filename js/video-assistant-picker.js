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

/**
 * רעיון אחד מתוך בנק הרעיונות שלה - לא מחוקים/גמורים.
 *
 * 14/10/2026 (מאיה, אחרי בדיקה אמיתית עם 89 רעיונות אמיתיים): הדרישה
 * ל-hookText הייתה שגויה - 0 מתוך 64 הרעיונות הפעילים שלה היו עם hookText
 * מלא (כולם "הוספה מהירה" לפי כותרת בלבד), ולכן "שלוף רעיון" החזיר תמיד
 * "אין רעיונות" על בנק אמיתי ומלא. כותרת בלבד היא רעיון לגיטימי לחלוטין.
 */
export function pickIdea(ideas, excludeId) {
  const eligible = (ideas || []).filter(
    (idea) => idea && idea.title && idea.title.trim() && !idea.deletedAt && !idea.completedAt
  );
  return pickFrom(eligible, excludeId);
}

/**
 * רפרנס אחד מהתחום (ותת-הקטגוריה המדויקת, אם יש) שלה - עדיפות לפורמטים
 * קלים לתמלול מילולי.
 *
 * 14/10/2026 (מאיה: "הוא צריך לדעת תחום מדויק שלי"): subCategory מצמצם
 * את הבחירה לתת-הקטגוריה המדויקת כשיש כזו ויש בה רפרנסים, ונופל חזרה
 * לכל התחום רק אם אין אף רפרנס בתת-הקטגוריה הספציפית.
 *
 * ההחרגה (excludeId) חייבת לפעול לפני שבודקים אם יש בכלל "פורמט קל" -
 * אחרת רפרנס יחיד בפורמט קל שהוחרג (reroll) היה גורם לנפילה חזרה לאותו
 * רפרנס בדיוק במקום למעבר לכל רפרנס אחר בתחום.
 */
/* 31/10/2026: הקטגוריות פוצלו, ולקוחות ותיקים עדיין שמורים על השם הישן */
const LEGACY_SUBCATEGORIES = {
  גבות: ['עיצוב גבות', 'הרמת גבות', 'מיקרובליידינג', 'קורס עיצוב גבות'],
  ריסים: ['הלחמת ריסים', 'הרמת ריסים', 'קורס הלחמת ריסים'],
  'שיווק ויצירת תוכן': ['שיווק, רשתות ובניית מותג'],
};

export function pickReference(videos, domain, subCategory, excludeId) {
  const inDomain = (videos || []).filter((v) => v && v.domain === domain);
  const wanted = LEGACY_SUBCATEGORIES[subCategory] || [subCategory];
  const inSubCategory = subCategory ? inDomain.filter((v) => wanted.includes(v.subCategory)) : [];
  const pool = inSubCategory.length ? inSubCategory : inDomain;
  /* 01/11/2026: שכפול נשען על המילים, וסרטון של שיר או בלי דיבור לא נותן מה לשכפל */
  const spoken = pool.filter((v) => v.audioKind !== 'song' && v.audioKind !== 'silent');
  const base = spoken.length ? spoken : pool;
  const easy = base.filter((v) => Array.isArray(v.formatTags) && v.formatTags.some((f) => EASY_FORMATS.includes(f)));
  const easyWithoutExcluded = easy.filter((v) => v.id !== excludeId);
  if (easyWithoutExcluded.length) return pickFrom(easyWithoutExcluded, null);
  return pickFrom(base, excludeId);
}
