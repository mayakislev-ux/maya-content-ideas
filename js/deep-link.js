/* לאיזה מסך קישור נכנס מבחוץ נוחת.
 *
 * 27/10/2026 (מור אדרי שאלה ב-SOS של הפורטל "איפה נמצא העוזר ליצירת
 * סירטון?"): התשובה שם היא עכשיו כפתור אחד שנוחת ישר על העוזר, במקום
 * הוראות ניווט. אותו דבר למאגר ההשראה ולמרכז הלמידה.
 *
 * רשימה סגורה ולא "כל מסך לפי הפרמטר", כי קישור לא אמור לפתוח מסך שאין
 * ללקוחה. מנוית רפרנסים מטופלת לפני זה ונוחתת תמיד על המאגר.
 *
 * ללא שום import, כדי שאפשר יהיה לבדוק את זה ב-node בלי דפדפן.
 */
export const DEEP_LINK_VIEWS = ['video-assistant', 'inspiration', 'guide'];

export function deepLinkView(search) {
  const value = new URLSearchParams(String(search || '')).get('view');
  return DEEP_LINK_VIEWS.includes(value) ? value : null;
}
