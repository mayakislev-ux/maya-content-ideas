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
 * הייבוא היחיד כאן הוא ideas-logic.js, שהוא קבועים ופונקציות טהורות
 * ונטען כבר היום ישירות בבדיקות node. idea-chat.js, לעומת זאת, מייבא
 * מ-CDN ולכן עדיין לא ניתן לייבוא כאן.
 */
import { canonicalAngle } from './ideas-logic.js';

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
  /* 04/11/2026: שדה רביעי, המסר האחד. הוא נכנס לתיבת המסר בעוזר כשחוזרים
     אליו. שורה ישנה עם שלושה שדות עדיין נקראת כמו שהייתה. */
  /* 10/11/2026: שדה חמישי, נקודת היציאה (סיפור אישי / סיפור לקוח / כללי) */
  const [idea, rawAngle, story, rawMessage, rawStart] = rawTail.split('||').map((part) => (part || '').trim());
  /* 11/11/2026: בלי נקודה, גרשיים או כוכביות מסביב ("כללי." נחשב) */
  const cleanStart = String(rawStart || '').replace(/^[\s"'“”״*]+|[\s"'“”״*.,!]+$/g, '');
  const startingPoint = ['סיפור אישי', 'סיפור לקוח', 'כללי'].includes(cleanStart) ? cleanStart : '';
  const message = rawMessage || labeledIdea(visibleReply).message || '';

  if (!idea) return { visibleReply, summary: null };

  /* 27/10/2026: שם הזווית נשמר על הרעיון בלי שאף אחד יבדוק שהוא בכלל
     קיים בבנק ה-31. בנתונים אמיתיים יש "אתגר קושי שעברתי" בלי הלוכסן,
     "הצגת השירות" בלי "/המוצר", ואפילו "שיחה" שלא קיימת. כשיש התאמה
     לבנק נשמר השם המדויק, וכשאין - נשמר מה שנכתב, בלי להמציא. */
  const angle = rawAngle ? (canonicalAngle(rawAngle) || rawAngle) : rawAngle;

  let composedTitle = idea;
  if (angle) composedTitle += ` | זווית: ${angle}`;
  if (story) composedTitle += ` | סיפור: ${story}`;

  return { visibleReply, summary: composedTitle, idea, angle, story, message, startingPoint };
}

/* 04/11/2026 (מאיה): התוצאה הסופית כתובה בסעיפים ("הרעיון:", "המסר האחד:",
   "הזווית:", "לקהל:"). כשהשורה הטכנית חסרה, הרעיון והמסר נקראים מכאן,
   כדי שהחזרה לעוזר לא תיתקע על תשובה שהמודל שכח בה את השורה. */
const LABELS = {
  idea: /^(?:הרעיון|רעיון)$/,
  message: /^(?:המסר האחד|המסר|הפואנטה|מסר)$/,
  angle: /^(?:הזווית|הזוויות|זווית ההנגשה|זווית הנגשה|הזווית\/ות)$/,
  audience: /^(?:לקהל|הקהל|למי)$/,
};

export function labeledIdea(text) {
  const out = { idea: '', message: '', angle: '', audience: '' };
  for (const raw of String(text || '').split('\n')) {
    const line = raw.replace(/\*\*/g, '').replace(/^[\s\-•*🎯💡✨📌👥]+/u, '').trim();
    const m = /^([^:：]{2,20})\s*[:：]\s*(.+)$/.exec(line);
    if (!m) continue;
    const label = m[1].trim();
    for (const [key, re] of Object.entries(LABELS)) {
      if (!out[key] && re.test(label)) out[key] = m[2].trim();
    }
  }
  return out;
}

/** מסיר את סימון "רעיון חזק" מתחילת התשובה. { text, recognized } */
export function stripRecognized(reply) {
  const text = String(reply || '');
  return text.startsWith(RECOGNIZED_MARKER)
    ? { text: text.slice(RECOGNIZED_MARKER.length).trimStart(), recognized: true }
    : { text, recognized: false };
}

/* הטקסט של הרעיון בלבד, בלי השורות הטכניות שנכתבות על הכותרת.
   בנתונים אמיתיים כותרת נראית כך:
     "למחוק את זה vs לפרסם את זה\nפורמט:דיבור למצלמה\nזווית הנגשה:השוואה"
   ועד היום כל הבלוק הזה נשלח לצ'אט כאילו הוא הרעיון, כולל שם הזווית
   שכבר נבחרה - בדיוק מה שהצ'אט אמור למצוא עכשיו מחדש. */
export function ideaTextOnly(title) {
  const raw = String(title || '');
  const text = raw
    /* קו אנכי צמוד לשורה טכנית הוא מפריד ("רעיון|זווית: השוואה"), אבל קו
       אנכי בתוך הטקסט עצמו הוא טקסט - במאגר יש "תקועה בהכנסות|בפניות
       כבר שנה". לכן רק קו שאחריו מילת מפתח הופך למפריד. */
    .replace(/\s*\|\s*(?=(?:\*\s*)?(?:זווית|פורמט|סיפור)(?:\s*הנגשה)?\s*:)/g, '\n')
    .split(/\n/)
    .filter((part) => !/^\s*(?:\*\s*)?(?:זווית(?:\s*הנגשה)?|פורמט(?:\s*הנגשה)?|סיפור)\s*:/.test(part))
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
  /* כותרת שכולה שורה טכנית ("זווית הנגשה:השוואה" ותו לא) הייתה מתרוקנת,
     והצ'אט היה נפתח בלי הרעיון בכלל בזמן ש-editingIdeaId כבר מצביע על
     הרעיון הזה - כלומר ההודעה הבאה של המשתמשת הייתה דורסת לו את הכותרת.
     במקרה כזה עדיף לשלוח את הכותרת כמו שהיא. */
  return text || raw.trim();
}

/* 06/11/2026 (מאיה): "במסך של בדיקת רעיון הוא בוחר זווית אבל אחר כך כשאני
   מעבירה את הרעיון לביצוע הוא שוכח מהזווית ולא משלב אותה עם הרעיון עצמו".

   שני מקומות איבדו אותה:
   1. "↩ לחזור לעוזר עם הרעיון המדויק" העביר לעוזר רק { idea, message }.
      הזווית שהצ'אט בחר נשארה מאחור, ואף פרומפט אחריו לא ידע עליה.
   2. רעיון שנשמר מהצ'אט ונמשך אחר כך מהבנק לעוזר הגיע כטקסט גולמי
      ("רעיון | זווית: השוואה | סיפור: ...") לתוך תיבת "על מה הסרטון?",
      בלי שדה זווית ובלי שום דבר שמשתמש בה.
   מכאן: הזווית נשמרת בעוזר בשדה משלה (ideaAngle), ונכנסת למשפט הרעיון
   שכל הפרומפטים קוראים (ideaDescription) בצורה אחת קבועה. */
export const ANGLE_LABEL = 'זווית ההנגשה';

const ANGLE_TAIL = /(?:^|\.\s*|\s+)זווית ההנגשה:[\s\S]*$/;

/** הטקסט בלי סיומת הזווית שנוספה ב-withAngle. */
export function stripAngle(text) {
  return String(text || '').replace(ANGLE_TAIL, '').trim();
}

/** הרעיון עם הזווית בסופו ("... . זווית ההנגשה: X"), בלי כפילות. */
export function withAngle(text, angle) {
  const base = stripAngle(text);
  const a = String(angle || '').trim();
  if (!a) return base;
  if (!base) return `${ANGLE_LABEL}: ${a}`;
  return `${base.replace(/[.\s]+$/, '')}. ${ANGLE_LABEL}: ${a}`;
}

/** כותרת של רעיון בבנק -> { text, angle, story }. */
export function parseIdeaTitle(title) {
  const raw = String(title || '');
  const angleMatch = raw.match(/זווית(?:\s*הנגשה)?\s*:\s*([^|\n]+)/);
  const storyMatch = raw.match(/סיפור\s*:\s*([^|\n]+)/);
  const rawAngle = angleMatch ? angleMatch[1].trim() : '';
  return {
    text: ideaTextOnly(raw),
    angle: rawAngle ? (canonicalAngle(rawAngle) || rawAngle) : '',
    story: storyMatch ? storyMatch[1].trim() : '',
  };
}
