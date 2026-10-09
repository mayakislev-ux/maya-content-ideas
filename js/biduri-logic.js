/* 09/10/2026: ההחלטות של מסך התאמת "בידורי", בנפרד מה-DOM, כדי שאפשר
   יהיה להריץ עליהן את הזרימה האמיתית בבדיקות בלי דפדפן.

   שלוש ההחלטות שחשובות:
   1. מתי הכפתור "להחיל" בכלל מוצע. דוח בלי אף שורה שהצליחה לא אמור
      להציע ביצוע, אחרת לחיצה לא תעשה כלום ותיראה כמו תקלה.
   2. מה כתוב בסיכום, כי זה מה שמאיה קוראת לפני שהיא מחליטה.
   3. מה כתוב כשמשהו נכשל. "משהו נתקע" בלי מה-לעשות הוא בדיוק הדבר
      שהיא קראה בעבר כאפליקציה שבורה. */

export function shouldOfferApply(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  return rows.some((row) => row && row.id && row.to);
}

export function breakdownText(byTarget) {
  const entries = Object.entries(byTarget || {}).filter(([, n]) => n > 0);
  return entries.map(([category, n]) => `${n} ל"${category}"`).join(' · ');
}

/* הדוח. חייב לומר במפורש שלא נגעו בכלום, וחייב לומר אם הוא חתוך:
   השרת מטפל במנה אחת בכל הרצה, ודוח חתוך שלא אומר את זה נקרא כאילו
   כיסה הכול, ואחרי ההחלה היו נשארים רעיונות "בידורי" בלי שאף אחד ידע. */
export function reportSummary(data) {
  const found = (data && data.found) || 0;
  if (!found) return 'אין יותר רעיונות מתויגים "בידורי". אין מה להתאים.';
  const handled = (data && data.handled) || 0;
  const failed = (data && data.failed) || 0;
  const breakdown = breakdownText(data && data.byTarget);
  const capped = handled && handled < found ? ` מוצגים ${handled} מהם, השאר בהרצה הבאה.` : '';
  const tail = failed ? `. ${failed} לא הצלחנו לסווג, הם יישארו "בידורי".` : '.';
  return `נמצאו ${found} רעיונות מתויגים "בידורי".${capped} ההצעה: ${breakdown || 'אין'}${tail} שום דבר עוד לא שונה.`;
}

/* אחרי ההחלה. אם נשארו רעיונות, המשפט חייב לומר *איך* להמשיך ולא רק
   שאפשר: כפתור "להחיל" נעלם אחרי ההחלה, ולכן ההמשך הוא דוח חדש. */
export function appliedSummary(data) {
  const changed = (data && data.changed) || 0;
  const skipped = (data && data.skipped) || 0;
  const remaining = (data && data.remaining) || 0;
  const breakdown = breakdownText(data && data.byTarget);
  const skippedText = skipped ? ` ${skipped} דולגו, ראי את הרשימה.` : '';
  const more = remaining ? ` נשארו עוד ${remaining} - אפשר ללחוץ "להציג דוח" שוב ולהמשיך.` : '';
  return `הועברו ${changed} רעיונות${breakdown ? ': ' + breakdown : ''}.${skippedText}${more}`;
}

/* המסך עולה ל-GitHub Pages ברגע שדוחפים, אבל הפונקציות עולות בפקודה
   נפרדת שמאיה מריצה. בפער הזה לחיצה נכשלת ב-functions/not-found, ובלי
   המשפט הזה היא נראית בדיוק כמו כפתור שבור.
   ("לחיצה שלא שולחת חייבת להסביר את עצמה על המקום") */
export function biduriErrorText(err) {
  const code = (err && err.code) || '';
  if (code === 'functions/not-found' || code === 'not-found') {
    return 'הפונקציה עוד לא הועלתה לשרת. להריץ את "העלאת-בידורי.bat" שעל שולחן העבודה, ואז לנסות שוב.';
  }
  if (code === 'functions/permission-denied' || code === 'permission-denied') {
    return 'המסך הזה פתוח למאיה בלבד. כדאי לבדוק עם איזה חשבון נכנסת.';
  }
  if (code === 'functions/deadline-exceeded' || code === 'functions/cancelled') {
    return 'ההרצה ארכה יותר מהזמן שהוקצב לה. מה שכבר הועבר נשמר, ואפשר ללחוץ "להציג דוח" שוב כדי להמשיך מאיפה שנעצר.';
  }
  if (code === 'functions/invalid-argument' || code === 'invalid-argument') {
    return (err && err.message) || 'צריך קודם להציג דוח, כדי שיהיה מה להחיל.';
  }
  if (err && err.message) return err.message;
  return 'משהו נתקע. אפשר לנסות שוב.';
}
