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
    else {
      sessionStorage.removeItem(KEY);
      // יציאה מתצוגת הלקוחה היא גם יציאה מהלקוחה שנבחרה
      sessionStorage.removeItem('clientViewAs');
    }
  } catch {
    /* בלי אחסון אין תצוגת לקוחה, וזה בסדר: היא פשוט נשארת בתצוגה שלה */
  }
}

/* מאיה, כשהיא לא בתצוגת לקוחה. כל בדיקה של "רק למנהלת" במסך עוברת כאן. */
export function actsAsOwner(email) {
  return email === OWNER_EMAIL && !isClientView();
}

/* 29/10/2026 (מאיה: "בתצוגה כלקוחה אני רוצה לבחור את הלקוחה ושיציג לי את
   הנתונים שלה", ובהמשך: "גם לערוך אצלה"). כשנבחרה לקוחה, כל קריאה וכתיבה
   של נתונים הולכת ל-uid שלה ולא של מאיה. זה נשען על כללי Firestore שנותנים
   למאיה (isAdmin) קריאה וכתיבה, ועל asUid בשרת, שמכובד רק כשהמייל שלה.

   נשמר יחד עם תצוגת הלקוחה ב-sessionStorage, מאותה סיבה: פתיחה חדשה של
   האפליקציה חוזרת לחשבון שלה ולא משאירה אותה "בתוך" לקוחה בלי לשים לב. */
const AS_KEY = 'clientViewAs';

/** { uid, email, name, plan } של הלקוחה שנבחרה, או null */
export function viewedClient() {
  if (!isClientView()) return null;
  try {
    const v = JSON.parse(sessionStorage.getItem(AS_KEY) || 'null');
    return v && typeof v.uid === 'string' && v.uid ? v : null;
  } catch {
    return null;
  }
}

export function setViewedClient(client) {
  try {
    if (client && client.uid) sessionStorage.setItem(AS_KEY, JSON.stringify(client));
    else sessionStorage.removeItem(AS_KEY);
  } catch {
    /* בלי אחסון נשארים בחשבון שלה */
  }
}

/** ה-uid שהנתונים נקראים ונכתבים אליו: של הלקוחה שנבחרה, או של המחוברת */
export function subjectUid(currentUid) {
  const v = viewedClient();
  return v ? v.uid : currentUid;
}

/** לקריאות לשרת: מוסיף asUid רק כשמאיה צופה בלקוחה */
export function withAsUid(payload = {}) {
  const v = viewedClient();
  return v ? { ...payload, asUid: v.uid } : payload;
}
