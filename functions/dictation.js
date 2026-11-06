// 06/11/2026 (מאיה): "בחלק של כתיבת הרעיון עצמו יש מיקרופון הוא כאילו לא
// עובד".
//
// המיקרופון של תיבות הכתיבה (voice-input.js) נשען על זיהוי הדיבור של
// הדפדפן (webkitSpeechRecognition). באייפון, ובמיוחד כשהאפליקציה מותקנת
// במסך הבית, הוא לא באמת עובד: נכשל בשקט, נעצר לפני שמתחילים לדבר, או
// מחזיר שגיאת שירות. במקום זה הדפדפן מקליט (MediaRecorder, כמו "🎙️ לספר
// בקול ולמצוא רעיונות"), מעלה ל-transcribeUploads/{uid}/, וכאן ג'מיני
// מתמלל מילה במילה ומחזיר טקסט בלבד. הקובץ נמחק תמיד.
//
// כאן בלי onCall ובלי admin, כדי שהבדיקות יריצו את זה עם תלויות מדומות.
// החיווט ב-index.js.

const MODEL = 'gemini-3.5-flash';
const VERTEX_LOCATION = 'global';
const UPLOAD_PREFIX = 'transcribeUploads';
/* הכתבה של עד 3 דקות. אודיו דחוס של 3 דקות הוא 1-4MB. */
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const GEMINI_TIMEOUT_MS = 90000;
const MAX_TEXT = 6000;

function validUploadPath(path, uid) {
  if (typeof path !== 'string' || !uid) return false;
  const prefix = `${UPLOAD_PREFIX}/${uid}/`;
  if (!path.startsWith(prefix)) return false;
  return /^[A-Za-z0-9._-]{1,120}$/.test(path.slice(prefix.length)) && !path.includes('..');
}

function acceptedType(type) {
  return /^(audio\/|video\/webm|video\/mp4)/.test(String(type || ''));
}

const PROMPT = `זו הכתבה קולית קצרה: מישהו/י מדבר/ת במקום להקליד בתיבת טקסט באפליקציה לכתיבת תוכן שיווקי.
לתמלל מילה במילה את מה שנאמר, בשפה שבה נאמר (בדרך כלל עברית).
- בלי הקדמה, בלי הסבר, בלי מרכאות, בלי סיכום. רק הטקסט שנאמר.
- לנקות רק גמגומים ומילות מילוי ("אממ", "אה"), ולהוסיף פיסוק טבעי.
- לא להוסיף שום דבר שלא נאמר, ולא לשפר ניסוח.
- אם אין בהקלטה דיבור (שקט או רעש), להחזיר טקסט ריק.`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: { text: { type: 'STRING' } },
  required: ['text'],
};

function parseText(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  try {
    const j = JSON.parse(s);
    return j && typeof j.text === 'string' ? j.text : '';
  } catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const j = JSON.parse(m[0]);
        if (j && typeof j.text === 'string') return j.text;
      } catch { /* לא JSON */ }
    }
    return null;
  }
}

function cleanText(text) {
  return String(text || '').replace(/\u0000/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, MAX_TEXT);
}

const PRICE_PER_MTOK = { input: 1.5, output: 9 };
function costUsd(usage) {
  if (!usage) return 0;
  const input = usage.promptTokenCount || 0;
  const output = (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0);
  return (input * PRICE_PER_MTOK.input + output * PRICE_PER_MTOK.output) / 1e6;
}

async function callGemini({ projectId, accessToken, fileUri, mimeType, fetchImpl }) {
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
        contents: [{ role: 'user', parts: [{ fileData: { fileUri, mimeType } }, { text: PROMPT }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingLevel: 'LOW' },
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
  const raw = cand && cand.content && Array.isArray(cand.content.parts)
    ? cand.content.parts.map((p) => p.text || '').join('')
    : '';
  return { text: parseText(raw), usage: json.usageMetadata || null, finishReason: (cand && cand.finishReason) || null };
}

/**
 * deps:
 *   HttpsError, enforceAllowlist(email), checkRate(uid) -> slot { commit, release },
 *   bucket: { name, file(path) -> { getMetadata, delete } },
 *   getAccessToken(), projectId, fetchImpl, logUsage?(uid, info)
 *
 * מחזירה { text }. המקום במכסה נשמר מראש ומוחזר אם התמלול לא הגיע לסוף.
 */
function createDictationHandler(deps) {
  const { HttpsError } = deps;
  return async function transcribeDictation(request) {
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
      if (size > MAX_AUDIO_BYTES) throw new HttpsError('invalid-argument', 'ההקלטה ארוכה מדי (עד 3 דקות)');
      if (!acceptedType(type)) throw new HttpsError('invalid-argument', 'הקובץ הזה לא הקלטה');

      const accessToken = await deps.getAccessToken();
      let out;
      try {
        out = await callGemini({
          projectId: deps.projectId,
          accessToken,
          fileUri: `gs://${deps.bucket.name}/${path}`,
          mimeType: type,
          fetchImpl: deps.fetchImpl,
        });
      } catch (err) {
        console.error('transcribeDictation: gemini failed', err && err.message);
        throw new HttpsError('internal', 'לא הצלחנו לתמלל את ההקלטה הפעם. לנסות שוב בעוד רגע');
      }
      if (out.text === null) {
        console.error('transcribeDictation: unparsable', out.finishReason);
        throw new HttpsError('internal', 'לא הצלחנו לתמלל את ההקלטה הפעם. לנסות שוב בעוד רגע');
      }
      const text = cleanText(out.text);
      slot.commit();
      done = true;
      if (deps.logUsage) {
        Promise.resolve(deps.logUsage(uid, { usage: out.usage, costUsd: costUsd(out.usage), chars: text.length, bytes: size }))
          .catch((err) => console.warn('transcribeDictation: logUsage failed', err && err.message));
      }
      return { text };
    } finally {
      if (slot && !done) await slot.release();
      await file.delete().catch(() => {});
    }
  };
}

module.exports = {
  createDictationHandler,
  validUploadPath,
  acceptedType,
  parseText,
  PROMPT,
  MAX_AUDIO_BYTES,
};
