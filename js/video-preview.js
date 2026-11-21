export function extractYouTubeId(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.hostname.includes('youtu.be')) return u.pathname.slice(1) || null;
  if (u.hostname.includes('youtube.com')) {
    if (u.pathname === '/watch') return u.searchParams.get('v');
    if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null;
  }
  return null;
}

export function isTikTokUrl(url) {
  try {
    return new URL(url).hostname.includes('tiktok.com');
  } catch {
    return false;
  }
}

export function getInstantThumbnail(url) {
  const ytId = extractYouTubeId(url);
  if (ytId) return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
  return null;
}

// קריאה חיה ל-oEmbed של TikTok לא הייתה שמורה בשום מטמון - רצה מחדש בכל
// רינדור של הכרטיס, כולל כל הקלדה בחיפוש. מטמון פשוט לפי URL מספיק כאן
// (המידע לא משתנה בפועל תוך כדי שימוש רגיל באפליקציה).
const thumbnailCache = new Map();

export async function fetchThumbnail(url) {
  const instant = getInstantThumbnail(url);
  if (instant) return instant;
  if (isTikTokUrl(url)) {
    if (thumbnailCache.has(url)) return thumbnailCache.get(url);
    try {
      const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
      if (!res.ok) return null;
      const data = await res.json();
      const thumb = data.thumbnail_url || null;
      thumbnailCache.set(url, thumb);
      return thumb;
    } catch {
      return null;
    }
  }
  return null;
}

// 05/10/2026 (מאיה: "הפלטפורמה ממש לא נוחה... יש אפשרות שהסרטונים של
// האינסטגרם ייפתחו בפופאפ נוח?").
//
// עד היום כל כרטיס היה <a target="_blank">: לחיצה זורקת אותה מהאפליקציה
// לאינסטגרם, ואז היא צריכה לחזור. כשמדפדפים בעשרות רפרנסים זה הורג את
// הזרימה.
//
// לשתי הפלטפורמות יש כתובת הטמעה רשמית שמותר להציג בתוך מסגרת. זאת לא
// עקיפה: אינסטגרם וטיקטוק מפרסמות את הכתובות האלה בדיוק בשביל זה.
const IG_CODE = /instagram\.com\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/;
/* 06/11/2026: גם tiktok.com/video/מספר, בלי שם משתמש (כך נשמרו דוגמאות הפורמטים). */
const TT_ID = /tiktok\.com\/(?:.*\/)?video\/(\d+)/;

/**
 * כתובת ההטמעה של סרטון, או null כשאין כזאת ואפשר רק לפתוח בחוץ.
 * מיוצא לבדיקות.
 */
/** הנגן הרשמי של טיקטוק: מראה רק את הסרטון, עם כפתורי ניגון. */
export function tiktokPlayerUrl(id) {
  return `https://www.tiktok.com/player/v1/${id}?rel=0&description=0&music_info=0`;
}

export function embedUrlFor(url, video) {
  // 21/11/2026 (מאיה: "מלא סרטונים ברפרנסים לא נפתחים"). 70 מתוך 368 סרטוני
  // אינסטגרם חיים, אבל הנגן המוטמע לא מנגן אותם: בעל החשבון כיבה הטמעה,
  // או שיש בסרטון מוזיקה מוגנת ואינסטגרם מציגה רק תמונה. הבדיקה הלילית
  // (inspiration-link-check) מסמנת אותם embedBlocked, ואז פותחים ישר במקור
  // במקום חלון שבור.
  if (video && video.embedBlocked) return null;
  // 06/10/2026 (מאיה: "סרטון ראשון שמופיע במובייל לא נפתח בכלל"). מדידה על
  // כל 453 הסרטונים: כל 175 סרטוני הטיקטוק שמורים ככתובת מקוצרת
  // vt.tiktok.com שאין בה מזהה, ולכן אף טיקטוק לא נפתח בחלון. 39% מהמאגר.
  //
  // המזהה פוענח פעם אחת דרך ה-oEmbed הרשמי ונשמר על הסרטון, כדי שהפתיחה
  // תהיה מיידית ולא תלויה בקריאת רשת מול הלקוחה.
  const saved = video && video.tiktokVideoId;
  // 21/11/2026 (מאיה שלחה צילום: "Unable to load player"). הנגן הישן של טיקטוק
  // (embed/v2) נשבר אצל טיקטוק עצמה. עוברים לנגן הרשמי החדש, player/v1, שכבר
  // עובד במצב הגלילה.
  if (saved && /^\d+$/.test(String(saved))) return tiktokPlayerUrl(saved);

  const raw = String(url || '');
  const ig = raw.match(IG_CODE);
  if (ig) return `https://www.instagram.com/p/${ig[1]}/embed/`;

  const tt = raw.match(TT_ID);
  if (tt) return tiktokPlayerUrl(tt[1]);

  const yt = extractYouTubeId(raw);
  if (yt) return `https://www.youtube.com/embed/${yt}`;

  // קישור קצר של טיקטוק (vm.tiktok.com) לא מכיל את המזהה, ואי אפשר
  // לפתור אותו בלי בקשת רשת. נפתח בחוץ, כמו קודם
  return null;
}

/** יחס הגובה-רוחב של חלון ההטמעה. אינסטגרם וטיקטוק אנכיים. */
export function embedShape(url, video) {
  if ((video && video.tiktokVideoId) || /tiktok\.com/.test(String(url || ''))) return { w: 340, h: 605 }; /* player/v1 הוא הסרטון בלבד, 9:16 */
  if (IG_CODE.test(String(url || ''))) return { w: 400, h: 700 };
  return { w: 560, h: 315 };
}

/** למה הסרטון לא מנגן כאן (או '' כשהוא כן מנגן). */
export function embedBlockedText(video) {
  const r = video && video.embedBlocked;
  if (!r) return '';
  if (r === 'music') return 'בסרטון הזה יש מוזיקה מוגנת, ולכן אינסטגרם לא מאפשרת לנגן אותו מחוץ לאפליקציה שלה. לוחצים ונפתח ישר באינסטגרם.';
  return 'בעל החשבון חסם הצגה של הסרטון מחוץ לאינסטגרם. לוחצים ונפתח ישר באינסטגרם.';
}
