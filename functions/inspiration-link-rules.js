/* הכללים של בדיקת הקישורים, בלי תלות בשום ספרייה, כדי שאפשר יהיה לבדוק אותם.
 *
 * alive = הפוסט קיים. dead = הפלטפורמה אמרה שאין. unknown = לא יודעים (עומס,
 * חסימה, ניתוק), וזה אף פעם לא נספר נגד הסרטון.
 */

/* אחרי כמה ימים רצופים של "מת" מסירים. סרטון שנפל ליום אחד חוזר לעיתים קרובות. */
const FAILS_TO_REMOVE = 3;
/* יותר מזה בריצה אחת זו תקלה אצל הפלטפורמה או חסימה שלנו, לא מאות סרטונים שמתו בלילה */
const MAX_DEAD_SHARE = 0.1;
const MIN_FOR_SHARE = 20;
const MAX_REMOVALS_PER_RUN = 20;

/** תשובת oEmbed של טיקטוק. סרטון שהוסר או נחסם מחזיר JSON ריק או 400/404. */
function tiktokVerdict(status, body) {
  if (status === 200) return body && (body.thumbnail_url || body.title || (body.author_name && body.author_name !== '@')) ? 'alive' : 'dead';
  if (status === 400 || status === 404) return 'dead';
  return 'unknown';
}

/** עמוד הפוסט כשמבקשים תצוגה מקדימה: רק לפוסט קיים יש בו תמונה. */
function pageVerdict(status, html) {
  if (status === 404 || status === 410) return 'dead';
  if (status !== 200) return 'unknown';
  return /property=["']og:image["']/.test(html || '') ? 'alive' : 'dead';
}

/** האם לסמוך על הריצה הזו בפלטפורמה הזו. */
function runIsTrustworthy(dead, checked) {
  if (checked < MIN_FOR_SHARE) return dead <= 3;
  return dead / checked <= MAX_DEAD_SHARE;
}

/** מונה הכשלים החדש של סרטון. */
function nextFailCount(previous, verdict) {
  if (verdict === 'alive') return 0;
  if (verdict === 'dead') return (previous || 0) + 1;
  return previous || 0;
}

module.exports = { FAILS_TO_REMOVE, MAX_REMOVALS_PER_RUN, tiktokVerdict, pageVerdict, runIsTrustworthy, nextFailCount };
