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
