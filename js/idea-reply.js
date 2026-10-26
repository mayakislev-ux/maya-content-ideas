/* פענוח התשובה של צ'אט "בדיקת רעיון".
 *
 * 26/10/2026 (מאיה): "הצ'אט שם זה בול אותו צ'אט כמו בסרגל למעלה, פשוט
 * מושתל נכון, בול?"
 *
 * המנוע תמיד היה זהה - streamCheckIdea מיוצא מ-idea-chat.js בדיוק בשביל
 * זה. מה שלא היה זהה הוא מה שקורה עם התשובה: השרת מנחה את המודל לסיים
 * בשורה טכנית [[IDEA_SUMMARY]]רעיון||זווית||סיפור, הלשונית מורידה אותה
 * מהבועה, והמושתל הציג אותה למשתמשת כטקסט.
 *
 * הקובץ הזה הוא המקום היחיד שבו זה קורה, ושני הצדדים מייבאים ממנו. זה
 * לא רק מסדר - זה מה שהופך את "אותו צ'אט בול" לנכון מבנית ולא להצהרה:
 * אין שתי גרסאות שאפשר לסחוף אחת מהשנייה.
 *
 * בלי שום ייבוא בכוונה, כדי שאפשר יהיה להריץ את זה ישירות בבדיקות -
 * idea-chat.js מייבא מ-CDN ולכן לא ניתן לייבוא ב-node.
 */

export const SUMMARY_MARKER = '[[IDEA_SUMMARY]]';
export const RECOGNIZED_MARKER = '[[RECOGNIZED_EXCELLENT]]';

/**
 * מפריד את התשובה הגלויה מהשורה הטכנית שבסופה.
 * מחזיר { visibleReply, summary, idea, angle, story }.
 */
export function extractIdeaSummary(reply) {
  const markerIndex = String(reply || '').indexOf(SUMMARY_MARKER);
  if (markerIndex === -1) return { visibleReply: reply, summary: null };

  const visibleReply = reply.slice(0, markerIndex).trim();
  // כל מה שאחרי המרקר ועד סוף ההודעה, ולא רק השורה הראשונה - המרקר הוא
  // תמיד הדבר האחרון בתשובה, וחיתוך ב-"\n" הראשון היה משבש בשקט שדה
  // שמכיל ירידת שורה (למשל תמצית הסיפור).
  const rawTail = reply.slice(markerIndex + SUMMARY_MARKER.length).trim();
  const [idea, angle, story] = rawTail.split('||').map((part) => (part || '').trim());

  if (!idea) return { visibleReply, summary: null };

  let composedTitle = idea;
  if (angle) composedTitle += ` | זווית: ${angle}`;
  if (story) composedTitle += ` | סיפור: ${story}`;

  return { visibleReply, summary: composedTitle, idea, angle, story };
}

/** מסיר את סימון "רעיון חזק" מתחילת התשובה. { text, recognized } */
export function stripRecognized(reply) {
  const text = String(reply || '');
  return text.startsWith(RECOGNIZED_MARKER)
    ? { text: text.slice(RECOGNIZED_MARKER.length).trimStart(), recognized: true }
    : { text, recognized: false };
}
