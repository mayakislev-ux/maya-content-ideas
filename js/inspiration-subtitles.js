// 01/11/2026 (מאיה: "אני רוצה כתוביות נוחות כשנכנסים למצב גלילה... שרצות על המסך").
// הקטעים נשמרים באוסף נפרד ולא על הסרטון עצמו, כי כל המאגר נטען בפעם אחת בכניסה
// למסך, ואין סיבה שכל לקוחה תוריד כתוביות של 600 סרטונים שלא תראה.

/** הטקסט שצריך להיות על המסך בשנייה t, או מחרוזת ריקה בין משפטים. */
export function subtitleAt(segments, t) {
  if (!segments || !segments.length || !(t >= 0)) return '';
  let lo = 0;
  let hi = segments.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const seg = segments[mid];
    if (t < seg.s) hi = mid - 1;
    else if (t >= seg.e) lo = mid + 1;
    else return seg.t;
  }
  return '';
}

/** השנייה שבה נגמרת הכתובית האחרונה. אחריה השעון שלנו באינסטגרם עוצר. */
export function lastSubtitleEnd(segments) {
  return segments && segments.length ? segments[segments.length - 1].e : 0;
}
