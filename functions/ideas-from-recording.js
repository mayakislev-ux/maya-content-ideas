// 06/11/2026 (מאיה): "בתוך האפליקציה בהוספת רעיון שיהיה אופציה להקליט
// נגיד אפילו מה היה היום ... אפילו הקלטה של 10 דק ואז שימצא מתוך ההקלטה
// שלי את כל הרעיונות שיש וכמובן לחלק לקטגוריות".
//
// הלקוח/ה מקליט/ה בדפדפן (עד 10 דקות), הקובץ עולה ל-Storage תחת
// transcribeUploads/{uid}/ (אותה תיקייה ואותו ניקוי אוטומטי אחרי יום כמו
// "✨ תמלול מדויק"), וכאן ג'מיני מקשיב להקלטה ומחזיר רשימת רעיונות לתוכן,
// כל אחד כבר מסווג. שום דבר לא נשמר כאן: הלקוח/ה בוחר/ת במסך מה לשמור.
//
// ג'מיני דרך Vertex AI בפרויקט עצמו, בדיוק כמו transcribe-reference.js.
// כאן בלי onCall ובלי admin, כדי שהבדיקות יריצו את זה עם תלויות מדומות.

const MODEL = 'gemini-3.5-flash';
const VERTEX_LOCATION = 'global';
const UPLOAD_PREFIX = 'transcribeUploads';
/* 10 דקות של אודיו דחוס הן 5-15MB. 60MB משאיר מקום לדפדפן שמקליט באיכות גבוהה. */
const MAX_AUDIO_BYTES = 60 * 1024 * 1024;
const GEMINI_TIMEOUT_MS = 180000;
const MAX_IDEAS = 15;

function validUploadPath(path, uid) {
  if (typeof path !== 'string' || !uid) return false;
  const prefix = `${UPLOAD_PREFIX}/${uid}/`;
  if (!path.startsWith(prefix)) return false;
  return /^[A-Za-z0-9._-]{1,120}$/.test(path.slice(prefix.length)) && !path.includes('..');
}

/* iOS מקליט audio/mp4, כרום audio/webm. גם video/webm מגיע לפעמים מכרום
   כשההקלטה היא אודיו בלבד. */
function acceptedType(type) {
  return /^(audio\/|video\/webm|video\/mp4)/.test(String(type || ''));
}

function buildPrompt({ categories, categoryDefinitions, stages, audienceScopes }) {
  return `זו הקלטה קולית של בעל/ת עסק שמדבר/ת בחופשיות: מה היה היום, מה לקוחות אמרו או שאלו, מה הרגיז, מה הצחיק, מחשבות על התחום.
המטרה: למצוא בתוך ההקלטה את כל הרעיונות לסרטוני תוכן שיווקי שיש בה, לפי המתודולוגיה של מאיה קיסלב (אקדמיית המהלך השיווקי).

כללים:
- רעיון = סרטון אחד עם מסר אחד. אם נאמרו כמה דברים שונים, כל אחד רעיון נפרד. אם אותו דבר חזר כמה פעמים, רעיון אחד.
- "title": הרעיון במשפט אחד או שניים, בעברית פשוטה, בגוף ראשון ובמילים של הדובר/ת ככל האפשר. לא כותרת שיווקית מנופחת ולא תסריט.
- "context": מה בדיוק נאמר בהקלטה שממנו הרעיון יצא (הסיפור, הציטוט, הפרט הקונקרטי), עד שלושה משפטים. הפרטים הקונקרטיים הם מה שהופך רעיון לחזק, אז לא לוותר עליהם.
- רק רעיונות שאפשר באמת לצלם עליהם סרטון לקהל של העסק. דיבור טכני, "רגע אני בודקת", או דברים שלא קשורים לעסק ולא לאישיות של בעל/ת העסק, לא נכנסים.
- אם אין בהקלטה אף רעיון (שקט, רעש, שיחה לא קשורה), להחזיר רשימה ריקה. לא להמציא.
- עד ${MAX_IDEAS} רעיונות, החזקים קודם.

לכל רעיון לסווג:
categoryIndex, בדיוק אחד:
${categories.map((c, i) => `${i + 1}. ${c}: ${categoryDefinitions[c] || ''}`).join('\n')}
הבחנה קריטית: סיפור על מה שקרה ללקוח/ה הוא לעולם לא "אישי", גם בגוף ראשון ("הגיעה אליי"). הוא "מכירתי" אם הוא מראה תוצאה או הוכחה, או "בעל ערך" אם הוא ממחיש תובנה מקצועית.

persuasionStageIndex, בדיוק אחד:
${stages.map((s, i) => `${i + 1}. ${s}`).join('\n')}

audienceScopeIndex, בדיוק אחד: למי הסרטון מדבר
${audienceScopes.map((s, i) => `${i + 1}. ${s}`).join('\n')}
(עיקרי = הלקוחות האידיאליים של העסק, משני = קהל קרוב, רחב = כל אחד, תוכן לחשיפה)

strong: true רק אם הרעיון קונקרטי, עם סיפור או פרט אמיתי, וקרוב למכירה. אחרת false.`;
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    ideas: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          context: { type: 'STRING' },
          categoryIndex: { type: 'INTEGER' },
          persuasionStageIndex: { type: 'INTEGER' },
          audienceScopeIndex: { type: 'INTEGER' },
          strong: { type: 'BOOLEAN' },
        },
        required: ['title', 'categoryIndex', 'persuasionStageIndex', 'audienceScopeIndex'],
      },
    },
  },
  required: ['ideas'],
};

function clean(value, max) {
  return String(value == null ? '' : value).replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * מה שג'מיני החזיר -> רשימת רעיונות תקינה בלבד. אינדקס לא תקין בקטגוריה
 * מפיל את הרעיון (בלי קטגוריה אי אפשר לשמור), בשלב ובקהל הוא פשוט נשאר ריק.
 */
function normalizeIdeas(raw, { categories, stages, audienceScopes, strongRating, normalRating }) {
  const list = raw && Array.isArray(raw.ideas) ? raw.ideas : [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const title = clean(item.title, 400);
    const category = categories[Number(item.categoryIndex) - 1];
    if (!title || !category) continue;
    const key = title.replace(/[^\p{L}\p{N}]+/gu, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title,
      context: clean(item.context, 900),
      category,
      persuasionStage: stages[Number(item.persuasionStageIndex) - 1] || '',
      audienceScope: audienceScopes[Number(item.audienceScopeIndex) - 1] || '',
      rating: item.strong === true ? strongRating : normalRating,
    });
    if (out.length >= MAX_IDEAS) break;
  }
  return out;
}

function parseJson(text) {
  const s = String(text || '').trim();
  try {
    return JSON.parse(s);
  } catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
  }
}

const PRICE_PER_MTOK = { input: 1.5, output: 9 };
function costUsd(usage) {
  if (!usage) return 0;
  const input = usage.promptTokenCount || 0;
  const output = (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0);
  return (input * PRICE_PER_MTOK.input + output * PRICE_PER_MTOK.output) / 1e6;
}

async function callGemini({ projectId, accessToken, fileUri, mimeType, prompt, fetchImpl }) {
  const url = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/${VERTEX_LOCATION}/publishers/google/models/${MODEL}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  let res;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ fileData: { fileUri, mimeType } }, { text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          maxOutputTokens: 16384,
          thinkingConfig: { thinkingLevel: 'MEDIUM' },
        },
      }),
    });
  } finally {
    clearTimeout(timer);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json && json.error && json.error.message) || `status ${res.status}`;
    throw new Error(`gemini ${res.status}: ${msg}`);
  }
  const cand = json.candidates && json.candidates[0];
  const text = cand && cand.content && Array.isArray(cand.content.parts)
    ? cand.content.parts.map((p) => p.text || '').join('')
    : '';
  return { parsed: parseJson(text), usage: json.usageMetadata || null, finishReason: (cand && cand.finishReason) || null };
}

/**
 * deps:
 *   HttpsError, enforceAllowlist(email), checkRate(uid) -> slot,
 *   bucket: { name, file(path) -> { getMetadata, delete } },
 *   getAccessToken(), projectId, fetchImpl, logUsage?(uid, info),
 *   taxonomy: { categories, categoryDefinitions, stages, audienceScopes, strongRating, normalRating }
 *
 * המקום במכסה נשמר מראש ומוחזר אם החילוץ לא הגיע לסוף. הקובץ נמחק תמיד.
 */
function createIdeasFromRecordingHandler(deps) {
  const { HttpsError } = deps;
  return async function ideasFromRecording(request) {
    if (!request.auth) throw new HttpsError('unauthenticated', 'יש להתחבר כדי להשתמש בתכונה הזו');
    const uid = request.auth.uid;
    await deps.enforceAllowlist(request.auth.token && request.auth.token.email);
    const path = request.data && request.data.path;
    if (!validUploadPath(path, uid)) throw new HttpsError('invalid-argument', 'ההקלטה לא נמצאה. להקליט שוב');

    const file = deps.bucket.file(path);
    let slot = null;
    let done = false;
    try {
      slot = await deps.checkRate(uid);
      let meta;
      try {
        [meta] = await file.getMetadata();
      } catch {
        throw new HttpsError('not-found', 'ההקלטה לא נמצאה. להקליט שוב');
      }
      const size = Number(meta && meta.size) || 0;
      const type = String((meta && meta.contentType) || '');
      if (!size) throw new HttpsError('invalid-argument', 'ההקלטה ריקה. להקליט שוב');
      if (size > MAX_AUDIO_BYTES) throw new HttpsError('invalid-argument', 'ההקלטה ארוכה מדי (עד 10 דקות)');
      if (!acceptedType(type)) throw new HttpsError('invalid-argument', 'הקובץ הזה לא הקלטה');

      const accessToken = await deps.getAccessToken();
      let out;
      try {
        out = await callGemini({
          projectId: deps.projectId,
          accessToken,
          fileUri: `gs://${deps.bucket.name}/${path}`,
          mimeType: type,
          prompt: buildPrompt(deps.taxonomy),
          fetchImpl: deps.fetchImpl,
        });
      } catch (err) {
        console.error('ideasFromRecording: gemini failed', err && err.message);
        throw new HttpsError('internal', 'לא הצלחנו להקשיב להקלטה הפעם. לנסות שוב בעוד רגע');
      }
      if (!out.parsed) {
        console.error('ideasFromRecording: unparsable', out.finishReason);
        throw new HttpsError('internal', 'לא הצלחנו להקשיב להקלטה הפעם. לנסות שוב בעוד רגע');
      }
      const ideas = normalizeIdeas(out.parsed, deps.taxonomy);
      slot.commit();
      done = true;
      if (deps.logUsage) {
        Promise.resolve(deps.logUsage(uid, { usage: out.usage, costUsd: costUsd(out.usage), count: ideas.length, bytes: size }))
          .catch((err) => console.warn('ideasFromRecording: logUsage failed', err && err.message));
      }
      return { ideas };
    } finally {
      if (slot && !done) await slot.release();
      await file.delete().catch(() => {});
    }
  };
}

module.exports = {
  createIdeasFromRecordingHandler,
  normalizeIdeas,
  buildPrompt,
  validUploadPath,
  acceptedType,
  MAX_AUDIO_BYTES,
  MAX_IDEAS,
};
