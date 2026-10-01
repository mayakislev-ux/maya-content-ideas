/**
 * ספירה לאחורה בזמן בניית תוכנית הסטורי.
 *
 * 01/10/2026 (מאיה): "ושבזמן שזה בונה יהיה טיימר ספירה לאחורה כמה זמן זה
 * לוקח, יכול?".
 *
 * ספירה לאחורה דורשת לדעת כמה זמן זה לוקח, ואת זה אי אפשר להמציא. לכן
 * ההערכה נלמדת מהבניות האמיתיות שלה: כל בנייה שהצליחה שומרת את הזמן שלקח,
 * וההערכה הבאה היא החציון של עד חמש האחרונות. חציון ולא ממוצע, כדי שבנייה
 * אחת תקועה לא תנפח את ההערכה לכולן.
 *
 * בפעם הראשונה, כשאין עוד נתונים, ההערכה היא 50 שניות. זה מה שראיתי בלוגים
 * האמיתיים: קריאה אחת ל-AI לוקחת בסביבות 40 שניות, ושתיהן רצות במקביל.
 *
 * וכשהזמן נגמר והבנייה עוד רצה, הטיימר לא מראה מספר שלילי ולא נתקע על אפס,
 * אלא אומר את האמת: לוקח יותר מהרגיל.
 */

const KEY = 'warmingPlanDurations';
const KEEP = 5;
export const DEFAULT_ESTIMATE_SEC = 50;
/* תקרה: מעבר לזה זה כבר לא "הזמן הרגיל" אלא בנייה שנתקעה, והיא לא אמורה
   להרעיל את ההערכה של הפעם הבאה. */
const MAX_SANE_SEC = 150;

/** הזמנים שנשמרו, בשניות. קורא שבור או ריק מחזיר רשימה ריקה. */
export function readDurations(storage) {
  try {
    const raw = storage && storage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n) => Number.isFinite(n) && n > 0 && n <= MAX_SANE_SEC);
  } catch {
    return [];
  }
}

/** שומר זמן של בנייה שהצליחה, ומחזיר את הרשימה אחרי השמירה. */
export function recordDuration(storage, seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_SANE_SEC) {
    return readDurations(storage);
  }
  const next = [...readDurations(storage), Math.round(seconds)].slice(-KEEP);
  try {
    if (storage) storage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* מצב פרטי או אחסון חסום אינו תקלה, פשוט לא נלמד מזה */
  }
  return next;
}

/** ההערכה לבנייה הבאה, בשניות. */
export function estimateSeconds(storage) {
  const all = readDurations(storage);
  if (!all.length) return DEFAULT_ESTIMATE_SEC;
  const sorted = [...all].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  return Math.max(10, median);
}

/** 65 -> '1:05'. תמיד דקות ושניות, כדי שהמספר לא יקפוץ בין פורמטים. */
export function clockText(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * מה מוצג בשורת הטיימר.
 * @returns {{ clock: string, note: string, over: boolean }}
 */
export function timerView(elapsedSec, estimateSec) {
  const est = Number.isFinite(estimateSec) && estimateSec > 0 ? estimateSec : DEFAULT_ESTIMATE_SEC;
  const remaining = est - elapsedSec;
  if (remaining > 0) return { clock: clockText(remaining), note: 'זמן משוער', over: false };
  return { clock: clockText(elapsedSec), note: 'לוקח יותר מהרגיל, עוד רגע', over: true };
}

/* השלבים שבאמת קורים בשרת: קריאת הטבלה, ואז שתי קריאות AI במקביל, אחת
   לשבוע החימום השוטף ואחת לשבוע המכירה. הטקסט הוא תיאור ולא הבטחה. */
const STEPS = [
  [0, 'קוראת את הטבלה שלך'],
  [3, 'בונה את שבוע החימום השוטף'],
  [12, 'בונה את שבוע המכירה'],
  [30, 'מסדרת את הימים'],
];

/** מה קורה עכשיו, לפי כמה זמן עבר. */
export function stepText(elapsedSec) {
  let label = STEPS[0][1];
  for (const [at, text] of STEPS) if (elapsedSec >= at) label = text;
  return label;
}
