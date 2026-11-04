// 04/11/2026 (מאיה): "התמלול של הרפרנס הרבה פעמים לא נכון: מדביקות כתוביות
// אוטומטיות או מתמללות רע, להוריד ולתמלל לוקח זמן, וסרטונים ויזואליים
// (מעט דיבור, טקסט על המסך, תהליך) מטעים את התסריט".
//
// "✨ תמלול מדויק": ג'מיני צופה בסרטון עצמו ומחזיר מה שנאמר (מילה במילה,
// ובתרגום לעברית כשצריך), מה שכתוב על המסך, ומה רואים, סצנה אחר סצנה.
//
// מאיפה הסרטון:
//   - לינק לטיקטוק או לאינסטגרם: השרת מוריד בעצמו, בלי מפתח של אף שירות.
//     טיקטוק דרך העמוד הציבורי של הסרטון, ואינסטגרם דרך עמוד ההטמעה
//     הציבורי (embed). אינסטגרם חוסם לפעמים שרתים, ואז אומרים את זה
//     ומציעים להעלות מהגלריה.
//   - העלאה מהגלריה: הקובץ עולה ל-Storage תחת transcribeUploads/{uid}/,
//     השרת קורא אותו משם ומוחק בסוף.
//
// ג'מיני דרך Vertex AI בפרויקט עצמו (הרשאת השירות של הפונקציה), כי אין
// מפתח Gemini בסודות של הפרויקט.
//
// כאן בלי onCall ובלי admin, כדי שהבדיקות יריצו את זה ישירות עם תלויות
// מדומות. החיווט נמצא ב-index.js.

const MODEL = 'gemini-3.5-flash';
const VERTEX_LOCATION = 'global';
const THINKING_LEVEL = process.env.TRANSCRIBE_THINKING || 'MEDIUM';
const UPLOAD_PREFIX = 'transcribeUploads';
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 25000;
const DOWNLOAD_TIMEOUT_MS = 60000;
/* הפונקציה רצה עד 300 שניות: עמוד 25 + הורדה 60 + שמירה + ג'מיני 180.
   הארוך שנמדד (04/11) היה 61 שניות לג'מיני. */
const GEMINI_TIMEOUT_MS = 180000;

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function LinkFetchError(message) {
  const err = new Error(message);
  err.name = 'LinkFetchError';
  return err;
}

/* ---------------- לינקים ---------------- */

/**
 * לינק שאפשר להוריד ממנו: טיקטוק או אינסטגרם בלבד, ב-https.
 * מחזיר { platform, url, code? } או null.
 */
function parseReferenceLink(raw) {
  let u;
  try {
    u = new URL(String(raw || '').trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, '');
  if (host === 'tiktok.com' || host === 'vt.tiktok.com' || host === 'vm.tiktok.com') {
    const ok = host !== 'tiktok.com'
      ? /^\/[A-Za-z0-9]+\/?$/.test(u.pathname)
      : /^\/(@[^/]+\/(video|photo)\/\d+|t\/[A-Za-z0-9]+)\/?$/.test(u.pathname);
    if (!ok) return null;
    const id = (u.pathname.match(/\/(?:video|photo)\/(\d+)/) || [])[1] || null;
    return { platform: 'tiktok', url: `https://${u.hostname.toLowerCase()}${u.pathname}`, id };
  }
  if (host === 'instagram.com') {
    const m = u.pathname.match(/^\/(?:[A-Za-z0-9._]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,40})\/?$/);
    if (!m) return null;
    return { platform: 'instagram', url: `https://www.instagram.com/p/${m[1]}/`, code: m[1] };
  }
  return null;
}

/* ---------------- מטמון תמלולים ----------------
   04/11/2026 (מאיה): "אם מישהי אחרת כבר תמללה את אותו סרטון, למה לשלם שוב".
   כל תמלול שהצליח נשמר בשרת לפי מזהה הסרטון עצמו, לא לפי הלינק: המספר של
   הסרטון בטיקטוק (גם מלינק מקוצר), או הקוד של הפוסט באינסטגרם (/reel/, /p/
   ו-/tv/ הם אותו קוד). האוסף transcriptCache סגור ללקוחות בכללים, רק
   הפונקציה קוראת וכותבת. CACHE_VERSION עולה כשהפרומפט משתנה, ואז הישנים
   פשוט לא נקראים. */
const CACHE_VERSION = 1;

/** המפתח הקנוני של הסרטון, או null כשצריך קודם לפתוח לינק מקוצר. */
function cacheKeyFor(link) {
  if (!link) return null;
  if (link.platform === 'tiktok' && link.id) return `tiktok_${link.id}`;
  if (link.platform === 'instagram' && link.code) return `instagram_${link.code}`;
  return null;
}

const TIKTOK_ID_IN_PATH = /\/(?:video|photo|v)\/(\d{6,25})(?:\.html)?(?:[/?#]|$)/;

function isTiktokHost(host) {
  return host === 'tiktok.com' || host.endsWith('.tiktok.com');
}

/* לינק מקוצר (vt.tiktok.com/XYZ) מפנה לעמוד הסרטון, ושם המספר. הולכים
   אחרי ההפניות ביד, רק בתוך טיקטוק, בלי להוריד את העמוד עצמו. */
async function resolveTiktokId(url, fetchImpl = fetch) {
  let current = url;
  for (let hop = 0; hop < 4; hop += 1) {
    let u;
    try { u = new URL(current); } catch { return null; }
    if (u.protocol !== 'https:' || !isTiktokHost(u.hostname.toLowerCase())) return null;
    const m = u.pathname.match(TIKTOK_ID_IN_PATH);
    if (m) return m[1];
    const res = await fetchWithTimeout(fetchImpl, current, { headers: { 'user-agent': DESKTOP_UA }, redirect: 'manual' }, 6000);
    const loc = res.headers && res.headers.get('location');
    /* רק הכותרת מעניינת. הגוף נסגר כדי שהחיבור לא יישאר פתוח */
    if (res.body && typeof res.body.cancel === 'function') res.body.cancel().catch(() => {});
    if (!loc || res.status < 300 || res.status >= 400) return null;
    current = new URL(loc, current).toString();
  }
  return null;
}

/** תוצאה ששווה לשמור או להחזיר מהמטמון: יש בה משהו. */
function usableResult(r) {
  return Boolean(r && typeof r === 'object'
    && (String(r.spoken || '').trim() || (Array.isArray(r.onScreenText) && r.onScreenText.length)
      || (Array.isArray(r.scenes) && r.scenes.length)));
}

/** הנתיב שהלקוחה העלתה: רק בתיקייה שלה, ורק שם קובץ פשוט. */
function validUploadPath(path, uid) {
  if (typeof path !== 'string' || !uid) return false;
  const prefix = `${UPLOAD_PREFIX}/${uid}/`;
  if (!path.startsWith(prefix)) return false;
  return /^[A-Za-z0-9._-]{1,120}$/.test(path.slice(prefix.length)) && !path.includes('..');
}

async function fetchWithTimeout(fetchImpl, url, opts = {}, ms = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetchImpl(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* הכתובת של קובץ הווידאו מגיעה מתוך HTML של הפלטפורמה. מורידים רק
   משרתי הקבצים שלהן, ב-https, ולא מכל כתובת שמופיעה שם. */
const VIDEO_HOST_SUFFIXES = [
  'tiktok.com', 'tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokv.com', 'tiktokv.us', 'byteoversea.com', 'ibytedtos.com',
  'cdninstagram.com', 'fbcdn.net',
];

function allowedVideoUrl(raw) {
  let u;
  try {
    u = new URL(String(raw || ''));
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  return VIDEO_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
}

/* קורא את הגוף בחתיכות ועוצר ברגע שעובר את התקרה, כדי שקובץ ענק בלי
   content-length לא ימלא את הזיכרון של הפונקציה. */
async function readCapped(res, max) {
  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > max) {
        reader.cancel().catch(() => {});
        throw new LinkFetchError('video too large');
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** מוריד וידאו, עם תקרת גודל וזמן (כולל קריאת הגוף). זורק LinkFetchError על כל כישלון. */
async function downloadVideo(fetchImpl, url, headers = {}) {
  if (!allowedVideoUrl(url)) throw new LinkFetchError(`video host not allowed: ${String(url).slice(0, 80)}`);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { headers: { 'user-agent': DESKTOP_UA, ...headers }, signal: ctrl.signal });
    if (res.url && !allowedVideoUrl(res.url)) throw new LinkFetchError('video redirected to a host that is not allowed');
    if (!res.ok) throw new LinkFetchError(`video ${res.status}`);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_VIDEO_BYTES) throw new LinkFetchError('video too large');
    const type = String(res.headers.get('content-type') || '').split(';')[0].trim();
    if (type && !type.startsWith('video/') && type !== 'application/octet-stream') {
      throw new LinkFetchError(`not a video: ${type}`);
    }
    const buf = await readCapped(res, MAX_VIDEO_BYTES);
    if (buf.length < 10 * 1024) throw new LinkFetchError('video too small');
    return { buffer: buf, contentType: type.startsWith('video/') ? type : 'video/mp4' };
  } catch (err) {
    if (err && err.name === 'LinkFetchError') throw err;
    throw new LinkFetchError(`video download failed: ${err && err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

function cookiesOf(res) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  return list.map((c) => c.split(';')[0]).join('; ');
}

/* טיקטוק: העמוד הציבורי של הסרטון מחזיק את כתובת הקובץ, והעוגיות
   שהעמוד נותן הן מה שמאפשר להוריד אותו. נבדק 04/11 על 3 סרטונים מהמאגר. */
async function fetchTiktokVideo(url, fetchImpl = fetch) {
  const page = await fetchWithTimeout(fetchImpl, url, { headers: { 'user-agent': DESKTOP_UA }, redirect: 'follow' });
  if (!page.ok) throw new LinkFetchError(`tiktok page ${page.status}`);
  /* הלינק המקוצר (vt.tiktok.com) מפנה לעמוד הסרטון. אם הוא הפנה לאתר
     אחר, לא ממשיכים, וגם לא שולחים לשם את העוגיות. */
  if (page.url) {
    let finalHost = '';
    try { finalHost = new URL(page.url).hostname.toLowerCase(); } catch { finalHost = ''; }
    if (finalHost !== 'tiktok.com' && !finalHost.endsWith('.tiktok.com')) throw new LinkFetchError(`tiktok redirected to ${finalHost}`);
  }
  const html = await page.text();
  const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new LinkFetchError('tiktok page without data');
  let item = null;
  try {
    const data = JSON.parse(m[1]);
    const detail = data && data.__DEFAULT_SCOPE__ && data.__DEFAULT_SCOPE__['webapp.video-detail'];
    item = detail && detail.itemInfo && detail.itemInfo.itemStruct;
  } catch {
    throw new LinkFetchError('tiktok data not json');
  }
  const video = item && item.video;
  const play = video && (video.playAddr || video.downloadAddr);
  if (!play) throw new LinkFetchError('tiktok video address missing');
  const video2 = await downloadVideo(fetchImpl, play, { cookie: cookiesOf(page), referer: 'https://www.tiktok.com/' });
  /* המספר של הסרטון, למטמון, גם כשהלינק המקוצר לא נפתח מראש */
  const videoId = /^\d{6,25}$/.test(String(item.id || '')) ? String(item.id) : null;
  return { ...video2, videoId };
}

/* אינסטגרם: עמוד ההטמעה הציבורי מחזיק video_url בתוך JSON שמקודד
   פעמיים כמחרוזת. בלי התחברות ובלי מפתח. */
function instagramVideoUrlFromEmbed(html) {
  const m = String(html || '').match(/\\"video_url\\":\\"(.*?)\\"/);
  if (!m) return null;
  try {
    const once = JSON.parse(`"${m[1]}"`);
    const twice = JSON.parse(`"${once}"`);
    return /^https:\/\//.test(twice) ? twice : null;
  } catch {
    return null;
  }
}

async function fetchInstagramVideo(code, fetchImpl = fetch) {
  const page = await fetchWithTimeout(fetchImpl, `https://www.instagram.com/p/${code}/embed/captioned/`, {
    headers: { 'user-agent': MOBILE_UA, 'accept-language': 'en-US,en;q=0.9' },
  });
  if (!page.ok) throw new LinkFetchError(`instagram embed ${page.status}`);
  const videoUrl = instagramVideoUrlFromEmbed(await page.text());
  if (!videoUrl) throw new LinkFetchError('instagram embed without video');
  return downloadVideo(fetchImpl, videoUrl);
}

async function fetchLinkVideo(link, fetchImpl = fetch) {
  if (link.platform === 'tiktok') return fetchTiktokVideo(link.url, fetchImpl);
  if (link.platform === 'instagram') return fetchInstagramVideo(link.code, fetchImpl);
  throw new LinkFetchError('unsupported platform');
}

/* ---------------- ג'מיני ---------------- */

const TRANSCRIBE_PROMPT = `You are transcribing a short social-media video (Instagram Reel or TikTok) for a Hebrew-speaking marketer who wants to replicate its structure. Watch AND listen to the entire video before answering.

Return JSON only, matching the schema:
- language: ISO 639-1 code of the main spoken language ("he", "en", "ru"...). Use "none" when nobody speaks (only music or silence).
- kind: "speech" when the message is carried mainly by talking. "visual" when it is carried mainly by what is shown and by on-screen text (a process, a before/after, a demonstration, text over footage), with little or no talking. "mixed" when both carry it. "music" when there is no speech at all, only music or a song.
- spoken: a verbatim transcript of everything that is said, in the original language, exactly as spoken. Do not correct, summarize, shorten or translate. One sentence per line. Song lyrics from background music are NOT speech: leave them out. Empty string when nobody speaks.
- spokenHe: when language is not Hebrew, a natural, fluent Hebrew translation of "spoken", line by line, written in Hebrew letters only (no Cyrillic or other scripts, except brand names). Empty string when the speech is Hebrew or there is no speech.
- onScreenText: every distinct text that the creator put on the screen (titles, headlines, written lists, labels, prices, written questions), in order of appearance, each one once, exactly as written. Leave out subtitles or captions that only repeat the spoken words, and leave out platform interface (usernames, likes, music labels, the post caption). When a text is not in Hebrew, add its Hebrew translation in parentheses after it. Empty list when there is none.
- scenes: short descriptions in Hebrew of what is shown, scene by scene in order (who is in the frame, what they do, what changes, close-ups, before/after). Up to 10 items. For a single talking-head shot, one or two items are enough. Describe only what is actually visible.`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    language: { type: 'STRING' },
    kind: { type: 'STRING', enum: ['speech', 'visual', 'mixed', 'music'] },
    spoken: { type: 'STRING' },
    spokenHe: { type: 'STRING' },
    onScreenText: { type: 'ARRAY', items: { type: 'STRING' } },
    scenes: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['language', 'kind', 'spoken', 'spokenHe', 'onScreenText', 'scenes'],
};

const KINDS = ['speech', 'visual', 'mixed', 'music'];

function cleanText(value, max = 8000) {
  return String(value == null ? '' : value)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, max);
}

function cleanList(value, maxItems, maxLen = 400) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    const t = cleanText(item, maxLen).replace(/\n/g, ' ');
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= maxItems) break;
  }
  return out;
}

/* נמדד 04/11 על סרטון ברוסית: בתרגום לעברית נשארו "с" ו-"со" (עם)
   בין מילים בעברית, גם כשהפרומפט ביקש עברית בלבד. */
function fixStrayCyrillic(text) {
  return String(text || '').replace(/(^|[\s])(?:с|со)(?=[\s])/g, '$1עם');
}

/**
 * התשובה של ג'מיני, מנורמלת. זורק כשאין בה שום דבר שימושי.
 * סובל גדרות קוד וטקסט מסביב, למרות שביקשנו JSON בלבד.
 */
function parseGeminiResult(text) {
  const raw = String(text || '');
  let obj = null;
  try {
    obj = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try { obj = JSON.parse(m[0]); } catch { obj = null; }
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('gemini: not json');
  const language = String(obj.language || '').trim().toLowerCase().slice(0, 10) || 'none';
  const spoken = cleanText(obj.spoken);
  const isHebrew = language === 'he' || language === 'iw';
  const out = {
    language: isHebrew ? 'he' : language,
    kind: KINDS.includes(obj.kind) ? obj.kind : (spoken ? 'speech' : 'visual'),
    spoken,
    spokenHe: isHebrew ? '' : fixStrayCyrillic(cleanText(obj.spokenHe)),
    onScreenText: cleanList(obj.onScreenText, 40),
    scenes: cleanList(obj.scenes, 12),
  };
  if (!out.spoken && !out.onScreenText.length && !out.scenes.length) throw new Error('gemini: empty result');
  return out;
}

function vertexUrl(projectId) {
  return `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/${VERTEX_LOCATION}/publishers/google/models/${MODEL}:generateContent`;
}

function geminiRequestBody({ fileUri, mimeType }) {
  return {
    contents: [{
      role: 'user',
      parts: [
        { fileData: { fileUri, mimeType: mimeType || 'video/mp4' } },
        { text: TRANSCRIBE_PROMPT },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      /* תמלול מילה במילה + תרגום + טקסט ותיאור, ועוד חשיבה: 8K נחתך
         בסרטונים ארוכים בשפה זרה, ו-JSON חתוך הוא כישלון שמשלמים עליו. */
      maxOutputTokens: 32768,
      thinkingConfig: { thinkingLevel: THINKING_LEVEL },
    },
  };
}

/** קריאה אחת לג'מיני. מחזיר { result, usage }. */
async function callGemini({ projectId, accessToken, fileUri, mimeType, fetchImpl = fetch }) {
  const res = await fetchWithTimeout(fetchImpl, vertexUrl(projectId), {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(geminiRequestBody({ fileUri, mimeType })),
  }, GEMINI_TIMEOUT_MS);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json && json.error && json.error.message) || `status ${res.status}`;
    throw new Error(`gemini ${res.status}: ${msg}`);
  }
  const cand = json.candidates && json.candidates[0];
  if (cand && cand.finishReason && cand.finishReason !== 'STOP') {
    console.warn('transcribeReference: gemini finishReason', cand.finishReason, json.usageMetadata);
  }
  const text = cand && cand.content && Array.isArray(cand.content.parts)
    ? cand.content.parts.map((p) => p.text || '').join('')
    : '';
  return { result: parseGeminiResult(text), usage: json.usageMetadata || null, finishReason: (cand && cand.finishReason) || null };
}

/* מחירון Vertex ל-gemini-3.5-flash, דולר למיליון טוקנים. לרישום עלות
   בלבד, לא לחיוב. */
const PRICE_PER_MTOK = { input: 1.5, output: 9 };
function costUsd(usage) {
  if (!usage) return 0;
  const input = usage.promptTokenCount || 0;
  const output = (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0);
  return (input * PRICE_PER_MTOK.input + output * PRICE_PER_MTOK.output) / 1e6;
}

/* ---------------- הפונקציה עצמה ---------------- */

function randomName() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * deps:
 *   HttpsError, enforceAllowlist(email), checkRate(uid), incrementRate(uid),
 *   bucket: { name, file(path) -> { save, delete, getMetadata } },
 *   getAccessToken(), projectId, fetchImpl, logUsage(uid, info),
 *   cache?: { get(key) -> doc|null, set(key, doc) }   (transcriptCache)
 *   bankUrl?(bankId) -> string|null   הלינק של סרטון במאגר
 *   isAdmin?(email)   רק מאיה יכולה לבקש refresh:true (לעקוף את המטמון)
 *   logCacheHit?(uid, info), now?()
 */
/* תקלה במטמון לא מפילה תמלול: קריאה שנכשלה היא החטאה, כתיבה שנכשלה נרשמת בלוג. */
async function readCache(cache, key) {
  try {
    return (await cache.get(key)) || null;
  } catch (err) {
    console.warn('transcribeReference: cache read failed', key, err && err.message);
    return null;
  }
}

async function writeCache(cache, key, doc) {
  try {
    await cache.set(key, doc);
  } catch (err) {
    console.warn('transcribeReference: cache write failed', key, err && err.message);
  }
}

function createTranscribeHandler(deps) {
  const { HttpsError } = deps;
  return async function transcribeReference(request) {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'יש להתחבר כדי להשתמש בתכונה הזו');
    }
    const uid = request.auth.uid;
    await deps.enforceAllowlist(request.auth.token && request.auth.token.email);

    const data = request.data || {};
    const uploadPath = typeof data.uploadPath === 'string' ? data.uploadPath : '';
    const linkRaw = typeof data.link === 'string' ? data.link.trim() : '';
    if (!uploadPath && !linkRaw) {
      throw new HttpsError('invalid-argument', 'חסר לינק לסרטון או קובץ שהועלה');
    }
    let link = null;
    if (uploadPath) {
      if (!validUploadPath(uploadPath, uid)) {
        throw new HttpsError('permission-denied', 'הקובץ הזה לא שייך לחשבון שלך');
      }
    } else {
      if (linkRaw.length > 600) throw new HttpsError('invalid-argument', 'הלינק ארוך מדי');
      link = parseReferenceLink(linkRaw);
      if (!link) {
        throw new HttpsError('invalid-argument', 'אפשר לתמלל מלינק רק של טיקטוק או אינסטגרם. לסרטון אחר, להעלות אותו מהגלריה', { reason: 'unsupported-link' });
      }
    }

    /* מטמון: לפני המכסה, כי תמלול שכבר קיים לא עולה כלום. רק ללינקים:
       סרטון מהגלריה של שתי משתמשות כמעט אף פעם לא אותו קובץ בדיוק. */
    const cache = link ? deps.cache : null;
    const email = request.auth.token && request.auth.token.email;
    const refresh = data.refresh === true && Boolean(deps.isAdmin && deps.isAdmin(email));
    let cacheKey = null;
    let aliasKey = null;
    let fromAlias = false;
    if (cache) {
      cacheKey = cacheKeyFor(link);
      const bankId = typeof data.bankId === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(data.bankId) ? data.bankId : '';
      if (bankId && deps.bankUrl) {
        /* המזהה במאגר נחשב רק כשהלינק שלו הוא באמת הלינק שנשלח, אחרת
           אפשר היה לקשור תמלול של סרטון אחד לסרטון אחר במאגר. */
        const bankUrl = await Promise.resolve(deps.bankUrl(bankId)).catch(() => null);
        const bankLink = bankUrl ? parseReferenceLink(bankUrl) : null;
        if (bankLink && bankLink.url === link.url) aliasKey = `bank_${bankId}`;
      }
      if (!cacheKey && aliasKey) {
        const alias = await readCache(cache, aliasKey);
        if (alias && /^(tiktok|instagram)_[A-Za-z0-9_-]+$/.test(String(alias.aliasOf || ''))) {
          cacheKey = alias.aliasOf;
          fromAlias = true;
        }
      }
      if (!cacheKey && link.platform === 'tiktok') {
        const id = await resolveTiktokId(link.url, deps.fetchImpl).catch((err) => {
          console.warn('transcribeReference: short link not resolved', link.url, err && err.message);
          return null;
        });
        if (id) cacheKey = `tiktok_${id}`;
      }
      if (cacheKey && !refresh) {
        const hit = await readCache(cache, cacheKey);
        if (hit && hit.version === CACHE_VERSION && usableResult(hit.result)) {
          if (aliasKey && !fromAlias && !cacheKeyFor(link)) await writeCache(cache, aliasKey, { aliasOf: cacheKey, version: CACHE_VERSION });
          if (deps.logCacheHit) {
            await Promise.resolve(deps.logCacheHit(uid, { key: cacheKey, source: link.platform }))
              .catch((err) => console.warn('transcribeReference: logCacheHit failed', err && err.message));
          }
          return { ...hit.result, source: link.platform, model: hit.model || MODEL, cached: true };
        }
      }
    }

    let path = uploadPath;
    let mimeType = 'video/mp4';
    let cleanup = Boolean(uploadPath);
    let videoId = null;
    try {
      /* בתוך ה-try: גם העלאה שנחסמה במכסה נמחקת */
      await deps.checkRate(uid);
      if (uploadPath) {
        const file = deps.bucket.file(uploadPath);
        let meta;
        try {
          [meta] = await file.getMetadata();
        } catch {
          throw new HttpsError('not-found', 'הקובץ שהועלה לא נמצא. להעלות אותו שוב');
        }
        const size = Number(meta && meta.size) || 0;
        const type = String((meta && meta.contentType) || '');
        if (size > MAX_VIDEO_BYTES) throw new HttpsError('invalid-argument', 'הסרטון גדול מדי (עד 200MB)');
        if (type && !type.startsWith('video/')) throw new HttpsError('invalid-argument', 'הקובץ הזה לא סרטון');
        if (type) mimeType = type;
      } else {
        let video;
        try {
          video = await deps.fetchLinkVideo(link, deps.fetchImpl);
        } catch (err) {
          console.warn('transcribeReference: link fetch failed', link.platform, link.url, err && err.message);
          const where = link.platform === 'instagram' ? 'מאינסטגרם' : 'מטיקטוק';
          throw new HttpsError('failed-precondition',
            `לא הצלחנו להוריד את הסרטון ${where}. זה קורה לפעמים כשהפלטפורמה חוסמת. אפשר להעלות אותו מהגלריה וזה יעבוד`,
            { reason: 'link-fetch', platform: link.platform });
        }
        videoId = video.videoId || null;
        path = `${UPLOAD_PREFIX}/${uid}/link-${randomName()}.mp4`;
        mimeType = video.contentType || 'video/mp4';
        cleanup = true;
        await deps.bucket.file(path).save(video.buffer, { contentType: mimeType, resumable: false });
      }

      const accessToken = await deps.getAccessToken();
      let out;
      try {
        out = await callGemini({
          projectId: deps.projectId,
          accessToken,
          fileUri: `gs://${deps.bucket.name}/${path}`,
          mimeType,
          fetchImpl: deps.fetchImpl,
        });
      } catch (err) {
        console.error('transcribeReference: gemini failed', err && err.message);
        throw new HttpsError('internal', 'התמלול לא הצליח הפעם. לנסות שוב בעוד רגע');
      }
      await deps.incrementRate(uid);
      /* נשמר רק מה שהצליח עד הסוף (finishReason STOP): תשובה שנחתכה או
         שלא ברור איך הסתיימה לא נשמרת, גם אם יצא ממנה JSON. */
      const key = cacheKey || (link && link.platform === 'tiktok' && videoId ? `tiktok_${videoId}` : null);
      if (cache && key && usableResult(out.result) && out.finishReason === 'STOP') {
        await writeCache(cache, key, {
          version: CACHE_VERSION,
          result: out.result,
          model: MODEL,
          platform: link.platform,
          createdAt: deps.now ? deps.now() : Date.now(),
          createdBy: uid,
          refreshed: refresh,
        });
        if (aliasKey && !cacheKeyFor(link)) await writeCache(cache, aliasKey, { aliasOf: key, version: CACHE_VERSION });
      }
      if (deps.logUsage) {
        await Promise.resolve(deps.logUsage(uid, {
          source: uploadPath ? 'upload' : link.platform,
          usage: out.usage,
          costUsd: costUsd(out.usage),
          kind: out.result.kind,
          language: out.result.language,
        })).catch((err) => console.warn('transcribeReference: logUsage failed', err && err.message));
      }
      return { ...out.result, source: uploadPath ? 'upload' : link.platform, model: MODEL };
    } finally {
      if (cleanup) {
        await deps.bucket.file(path).delete().catch((err) => {
          console.warn('transcribeReference: delete failed', path, err && err.message);
        });
      }
    }
  };
}

module.exports = {
  MODEL,
  VERTEX_LOCATION,
  UPLOAD_PREFIX,
  MAX_VIDEO_BYTES,
  TRANSCRIBE_PROMPT,
  RESPONSE_SCHEMA,
  LinkFetchError,
  CACHE_VERSION,
  cacheKeyFor,
  resolveTiktokId,
  usableResult,
  parseReferenceLink,
  validUploadPath,
  instagramVideoUrlFromEmbed,
  fetchTiktokVideo,
  fetchInstagramVideo,
  fetchLinkVideo,
  parseGeminiResult,
  fixStrayCyrillic,
  allowedVideoUrl,
  geminiRequestBody,
  callGemini,
  costUsd,
  createTranscribeHandler,
};
