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
/* יותר מזה חסומים בהטמעה בריצה אחת = אינסטגרם חוסמת את הענן, לא את הסרטונים. 21/11 נמדד 19%. */
const MAX_EMBED_BLOCKED_SHARE = 0.4;

/** עמוד הסרטון בטיקטוק כשמבקשים תצוגה מקדימה. לסרטון חי יש התמונה שלו, ולסרטון
    שנמחק או נחסם יש תמונה כללית של טיקטוק (obj/eden-). oEmbed לא עוזר כאן: נכון
    ל-01/11/2026 הוא מחזיר אותה תשובה גם על מזהה שלא קיים. */
function tiktokVerdict(status, html) {
  if (status === 404 || status === 410) return 'dead';
  if (status !== 200) return 'unknown';
  const m = String(html || '').match(/property=["']og:image["']\s+content=["']([^"']*)/) || String(html || '').match(/content=["']([^"']*)["']\s+property=["']og:image["']/);
  if (!m) return 'unknown';
  return /\/obj\/eden-/.test(m[1]) ? 'dead' : 'alive';
}

/** עמוד הפוסט כשמבקשים תצוגה מקדימה: רק לפוסט קיים יש בו תמונה. */
function pageVerdict(status, html) {
  if (status === 404 || status === 410) return 'dead';
  if (status !== 200) return 'unknown';
  return /property=["']og:image["']/.test(html || '') ? 'alive' : 'dead';
}

/** 21/11/2026 (מאיה: "מלא סרטונים ברפרנסים לא נפתחים"). פוסט חי עדיין לא
    אומר שהנגן המוטמע מנגן אותו. נמדד על 368 סרטוני אינסטגרם: 41 עם מוזיקה
    מוגנת (הנגן מראה רק תמונה ו"Watch on Instagram", בלי video_url) ו-29 שבעל
    החשבון כיבה בהם הטמעה ("may be broken", בלי תמונה ובלי סרטון).
    מחזיר '' כשהנגן מנגן, 'music' / 'disabled' כשלא, ו-null כשלא יודעים. */
function instagramEmbedVerdict(status, html) {
  if (status !== 200) return null;
  const h = String(html || '');
  if (h.length < 2000) return null;
  if (/video_url/.test(h)) return '';
  const hasMedia = /EmbeddedMediaImage/.test(h);
  if (hasMedia && /GraphVideo|is_video\W+true/.test(h)) return 'music';
  if (hasMedia) return ''; /* פוסט תמונה: התמונה עצמה מוצגת כמו שצריך */
  if (/may be broken|EmbedBroken|EmbedIsBroken/.test(h)) return 'disabled';
  return null;
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

module.exports = { FAILS_TO_REMOVE, MAX_REMOVALS_PER_RUN, MAX_EMBED_BLOCKED_SHARE, tiktokVerdict, pageVerdict, instagramEmbedVerdict, runIsTrustworthy, nextFailCount };
