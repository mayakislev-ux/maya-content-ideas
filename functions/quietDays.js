// 23/09/2026 (מאיה: "לא בשישי שבת ולא בימי זיכרון / כיפור וכו"):
// ימים שבהם לא שולחים ללקוחות שום תזכורת.
//
// התאריכים לא כתובים ידנית. הם מחושבים מהלוח העברי עצמו דרך
// Intl.DateTimeFormat עם 'en-u-ca-hebrew', כך שהם נכונים לכל שנה קדימה
// בלי לתחזק רשימה. חודש 'Adar I' (שנה מעוברת) לא נחשב לאדר של פורים.

const ISRAEL_TZ = 'Asia/Jerusalem';

const HEBREW = new Intl.DateTimeFormat('en-u-ca-hebrew', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

/** החגים והמועדים שבהם שקט, לפי חודש ויום עברי. */
const QUIET_HEBREW = new Set([
  'Tishri/1', 'Tishri/2', // ראש השנה
  'Tishri/10', // יום כיפור
  'Tishri/15', 'Tishri/16', 'Tishri/17', 'Tishri/18', 'Tishri/19', 'Tishri/20', 'Tishri/21', 'Tishri/22', // סוכות ושמחת תורה
  'Nisan/14', 'Nisan/15', 'Nisan/16', 'Nisan/17', 'Nisan/18', 'Nisan/19', 'Nisan/20', 'Nisan/21', // ערב פסח וחול המועד
  'Nisan/27', // יום השואה
  'Iyar/4', 'Iyar/5', // יום הזיכרון ויום העצמאות
  'Sivan/5', 'Sivan/6', // ערב שבועות ושבועות
  'Av/9', // תשעה באב
]);

function hebrewKey(dateKey) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  const parts = {};
  for (const part of HEBREW.formatToParts(new Date(Date.UTC(y, m - 1, d)))) parts[part.type] = part.value;
  return `${parts.month}/${parts.day}`;
}

function weekday(dateKey) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** YYYY-MM-DD לפי שעון ישראל. */
function israelDateKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ISRAEL_TZ }).format(now);
}

/** השעה בישראל, 0 עד 23. */
function israelHour(now = new Date()) {
  return Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: ISRAEL_TZ, hour: '2-digit', hour12: false }).format(now)
  );
}

/** האם זה יום שבו לא שולחים: שישי, שבת, או חג. */
function isQuietDay(dateKey) {
  const day = weekday(dateKey);
  if (day === 'Fri' || day === 'Sat') return true;
  return QUIET_HEBREW.has(hebrewKey(dateKey));
}

/**
 * האם מותר לשלוח תזכורת ללקוחות ברגע הזה.
 * מאיה: "בין 9:00 ל-19:00 בלבד", ולא בימים שקטים.
 */
function canRemindNow(now = new Date(), { from = 9, to = 19 } = {}) {
  if (isQuietDay(israelDateKey(now))) return false;
  const hour = israelHour(now);
  return hour >= from && hour < to;
}

module.exports = { isQuietDay, canRemindNow, israelDateKey, israelHour, hebrewKey };
