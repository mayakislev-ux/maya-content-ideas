// 04/11/2026 (מאיה): "✨ תמלול מדויק" במסך התמלול של השכפול. ג'מיני צופה
// בסרטון עצמו ומחזיר מה שנאמר, מה שכתוב על המסך ומה רואים (הפונקציה
// transcribeReference, functions/transcribe-reference.js).
//
// כאן רק ההחלטות: איזה לינק אפשר לשלוח, איך התשובה הופכת לטקסט אחד קריא
// בתיבה, ומה אומרים עליו. בלי DOM ובלי Firebase, כדי שהבדיקות יריצו את זה
// ישירות.
import { SPEECH_MIN_CHARS } from './reference-duplication.js';

export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
export const UPLOAD_PREFIX = 'transcribeUploads';

/** אותו כלל כמו בשרת (parseReferenceLink): טיקטוק או אינסטגרם בלבד. */
export function linkPlatform(raw) {
  let u;
  try {
    u = new URL(String(raw || '').trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, '');
  if (host === 'vt.tiktok.com' || host === 'vm.tiktok.com') {
    return /^\/[A-Za-z0-9]+\/?$/.test(u.pathname) ? 'tiktok' : null;
  }
  if (host === 'tiktok.com') {
    return /^\/(@[^/]+\/(video|photo)\/\d+|t\/[A-Za-z0-9]+)\/?$/.test(u.pathname) ? 'tiktok' : null;
  }
  if (host === 'instagram.com') {
    return /^\/(?:[A-Za-z0-9._]+\/)?(?:p|reel|reels|tv)\/[A-Za-z0-9_-]{5,40}\/?$/.test(u.pathname) ? 'instagram' : null;
  }
  return null;
}

/** בדיקת הקובץ לפני העלאה. מחזיר הודעה, או '' כשהכל תקין. */
export function uploadProblem(file) {
  if (!file) return 'לא נבחר קובץ';
  const type = String(file.type || '');
  if (type && !type.startsWith('video/')) return 'הקובץ הזה לא סרטון. לבחור סרטון מהגלריה';
  if (Number(file.size) > MAX_UPLOAD_BYTES) return 'הסרטון גדול מדי (עד 200MB). אפשר לקצר אותו או לשלוח לינק';
  if (!Number(file.size)) return 'הקובץ ריק. לבחור סרטון אחר';
  return '';
}

/** הנתיב ב-Storage: רק בתיקייה של המשתמשת, ושם קובץ פשוט (כמו שהשרת דורש). */
export function uploadPathFor(uid, file, now = Date.now(), rand = Math.random()) {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(String((file && file.name) || ''));
  const ext = m ? m[1].toLowerCase() : 'mp4';
  return `${UPLOAD_PREFIX}/${uid}/${now.toString(36)}-${rand.toString(36).slice(2, 10)}.${ext}`;
}

/** iOS מחזיר לפעמים סוג ריק או quicktime. השרת והכללים דורשים video/*. */
export function uploadContentType(file) {
  const type = String((file && file.type) || '');
  return type.startsWith('video/') ? type : 'video/mp4';
}

const LANGUAGE_HE = {
  en: 'אנגלית', ru: 'רוסית', es: 'ספרדית', fr: 'צרפתית', ar: 'ערבית', uk: 'אוקראינית',
  de: 'גרמנית', it: 'איטלקית', pt: 'פורטוגזית', ja: 'יפנית', ko: 'קוריאנית', zh: 'סינית', hi: 'הינדית',
};

export function languageLabel(code) {
  return LANGUAGE_HE[code] || 'שפה זרה';
}

const norm = (s) => String(s || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/* כשג'מיני מכניס לטקסט שעל המסך את הכתוביות של הדיבור (נמדד 04/11: 40
   שורות של אותו משפט מפורק), זה לא טקסט על המסך. מזהים את זה כשרוב
   השורות הן חלק ממה שנאמר, ואז זורקים רק אותן. כותרת בודדת שגם נאמרה
   ("EAT LESS") נשארת. */
export function onScreenWithoutCaptions(onScreen, spokenTexts) {
  const list = Array.isArray(onScreen) ? onScreen.filter((t) => String(t || '').trim()) : [];
  const spoken = norm((spokenTexts || []).join(' '));
  if (!spoken || list.length < 4) return list;
  const inSpeech = (t) => {
    const n = norm(t);
    return n.length > 0 && spoken.includes(n);
  };
  const echoed = list.filter(inSpeech).length;
  if (echoed / list.length < 0.6) return list;
  return list.filter((t) => !inSpeech(t));
}

function spokenOf(r) {
  const foreign = r.language && r.language !== 'he' && r.language !== 'none';
  return String((foreign && r.spokenHe) ? r.spokenHe : (r.spoken || '')).trim();
}

/** האם הסיפור של הסרטון קורה בעיקר בתמונה. */
export function isVisualResult(r) {
  if (!r) return false;
  if (r.kind === 'visual' || r.kind === 'music') return true;
  return spokenOf(r).length < SPEECH_MIN_CHARS;
}

/**
 * הטקסט שנכנס לתיבה: מה שנאמר (בעברית), אחריו "טקסט על המסך:", ואחריו
 * "מה רואים בסרטון:" כשהתמונה חלק מהסיפור. הכל נשאר לעריכה.
 */
export function composeTranscript(r) {
  if (!r) return '';
  const spoken = spokenOf(r);
  const parts = [];
  if (spoken) parts.push(spoken);
  const onScreen = onScreenWithoutCaptions(r.onScreenText, [r.spoken, r.spokenHe]);
  if (onScreen.length) parts.push(`טקסט על המסך:\n${onScreen.map((t) => `• ${t}`).join('\n')}`);
  const scenes = Array.isArray(r.scenes) ? r.scenes.filter((t) => String(t || '').trim()) : [];
  const showScenes = r.kind !== 'speech' || isVisualResult(r);
  if (showScenes && scenes.length) parts.push(`מה רואים בסרטון:\n${scenes.map((t, i) => `${i + 1}. ${t}`).join('\n')}`);
  return parts.join('\n\n').trim();
}

/** מה נשמר ב-state.bankNotice אחרי תמלול מדויק. */
export function accurateNotice(r, text) {
  const foreign = Boolean(r && r.language && r.language !== 'he' && r.language !== 'none' && r.spokenHe);
  return {
    reason: 'accurate',
    source: 'gemini',
    visual: isVisualResult(r),
    foreign,
    language: (r && r.language) || '',
    onScreen: onScreenWithoutCaptions(r && r.onScreenText, [r && r.spoken, r && r.spokenHe]).length > 0,
    text,
  };
}

/** ההודעה שליד התיבה אחרי תמלול מדויק. */
export function accurateNoticeText(info) {
  const check = 'כדאי לעבור על זה מול הסרטון ולתקן מה שצריך, הכל כאן ניתן לעריכה.';
  if (info.visual) {
    return {
      title: 'הסרטון הזה בעיקר ויזואלי',
      body: `ג'מיני צפה בסרטון כולו. בתיבה יש מה שכתוב על המסך ומה רואים בכל סצנה. בשכפול, ההוק הוא מה שרואים וכתוב בפתיחה, לא רק מה שנאמר. ${check}`,
    };
  }
  const translated = info.foreign ? ` ותרגם מ${languageLabel(info.language)} לעברית` : '';
  const screen = info.onScreen ? ', וגם מה שכתוב על המסך' : '';
  return {
    title: '✨ התמלול המדויק מוכן',
    body: `ג'מיני צפה בסרטון כולו, תמלל מה שנאמר${translated}${screen}. ${check}`,
  };
}

/**
 * מה עושים עם שגיאה מהשרת. linkFailed: הלינק לא עבד, ומציעים להעלות.
 * הודעות בעברית מהשרת מוצגות כמו שהן.
 */
export function transcribeErrorInfo(err) {
  const details = (err && err.details) || {};
  const reason = details.reason || '';
  const msg = String((err && err.message) || '');
  const hebrew = /[֐-׿]/.test(msg);
  const code = String((err && err.code) || '').replace(/^functions\//, '');
  if (reason === 'link-fetch' || reason === 'unsupported-link') {
    return { linkFailed: true, message: hebrew ? msg : 'לא הצלחנו להוריד את הסרטון מהלינק. אפשר להעלות אותו מהגלריה וזה יעבוד' };
  }
  if (code === 'resource-exhausted') {
    return { linkFailed: false, quota: true, message: 'המכסה היומית של התמלולים נגמרה, אפשר שוב מחר' };
  }
  if (code === 'deadline-exceeded') {
    return { linkFailed: false, message: 'התמלול לקח יותר מדי זמן. לנסות שוב, או להעלות גרסה קצרה יותר של הסרטון' };
  }
  return { linkFailed: false, message: hebrew ? msg : '' };
}
