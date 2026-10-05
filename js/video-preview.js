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
const TT_ID = /tiktok\.com\/.*\/video\/(\d+)/;

/**
 * כתובת ההטמעה של סרטון, או null כשאין כזאת ואפשר רק לפתוח בחוץ.
 * מיוצא לבדיקות.
 */
export function embedUrlFor(url) {
  const raw = String(url || '');
  const ig = raw.match(IG_CODE);
  if (ig) return `https://www.instagram.com/p/${ig[1]}/embed/`;

  const tt = raw.match(TT_ID);
  if (tt) return `https://www.tiktok.com/embed/v2/${tt[1]}`;

  const yt = extractYouTubeId(raw);
  if (yt) return `https://www.youtube.com/embed/${yt}`;

  // קישור קצר של טיקטוק (vm.tiktok.com) לא מכיל את המזהה, ואי אפשר
  // לפתור אותו בלי בקשת רשת. נפתח בחוץ, כמו קודם
  return null;
}

/** יחס הגובה-רוחב של חלון ההטמעה. אינסטגרם וטיקטוק אנכיים. */
export function embedShape(url) {
  if (TT_ID.test(String(url || ''))) return { w: 325, h: 760 };
  if (IG_CODE.test(String(url || ''))) return { w: 400, h: 700 };
  return { w: 560, h: 315 };
}
