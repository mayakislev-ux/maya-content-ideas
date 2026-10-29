/* 29/10/2026 (מאיה: "את יכולה לעשות לי אופציה שאוכל לצפות ולבצע בתור
   לקוחה, כמו שיש בפורטל?"). תצוגת לקוחה לחשבון של מאיה: כל מה שמסומן
   "מנהלת" נעלם, והאפליקציה נראית ועובדת כמו אצל לקוחה עם מנוי מלא.

   זה לא חשבון של לקוחה. כל פעולה נשמרת בחשבון של מאיה עצמה, ולכן אפשר
   באמת לבצע הכל ושום דבר לא נכתב בשם אף אחת. ההרשאות בשרת לא משתנות,
   זה רק מה שמוצג.

   נשמר ב-sessionStorage ולא ב-localStorage: רענון נשאר בתצוגה, אבל
   פתיחה חדשה של האפליקציה חוזרת לתצוגה שלה, כדי שלא תיתקע בה בלי לזכור. */
export const OWNER_EMAIL = 'mayakislev@gmail.com';
const KEY = 'clientView';

export function isClientView() {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setClientView(on) {
  try {
    if (on) sessionStorage.setItem(KEY, '1');
    else sessionStorage.removeItem(KEY);
  } catch {
    /* בלי אחסון אין תצוגת לקוחה, וזה בסדר: היא פשוט נשארת בתצוגה שלה */
  }
}

/* מאיה, כשהיא לא בתצוגת לקוחה. כל בדיקה של "רק למנהלת" במסך עוברת כאן. */
export function actsAsOwner(email) {
  return email === OWNER_EMAIL && !isClientView();
}
