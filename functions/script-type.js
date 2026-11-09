/* 09/11/2026 (מאיה: "בכתיבת תסריטים שיש את כל המאגר את יכולה ליד כל תסריט
   לסמן להן אם זה ערך אישי מכירתי ... ולעשות בדיעבד לכל התסריטים הקיימים של
   כולן שבנו עם הרובוט").

   כל פריט ב"התסריטים שלי" (videoAssistantScripts/{uid}/items/{id}) מקבל שדה
   contentKind: { type: 'בעל ערך' | 'אישי' | 'מכירתי', by, at }.
     by = 'flow'  הסוג שהיא בחרה בעוזר עצמו (state.contentType)
     by = 'ai'    סווג כאן, באותו מסווג של הרעיונות (classify-idea.js)
     by = 'user'  היא שינתה ידנית ברשימה. לעולם לא נדרס.

   השדה יושב מחוץ ל-state, והאפליקציה שומרת פריט עם mergeFields, כך שהוא
   לא נמחק כשהעוזר שומר את הסטייט מחדש.

   scriptTypeOnWrite: כל פריט שנשמר ואין לו סוג, ויש בו כבר תסריט (או סוג
   שנבחר בעוזר), מקבל סוג.
   backfillScriptTypes: השלמה חד-פעמית לכל הפריטים הקיימים, במנות. כשאין
   יותר מה לסווג היא רושמת done ב-ops/backfillScriptTypes ומפסיקה. למחוק
   אותה אחרי שהיא סיימה. */
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { CLASSIFY_MODEL, buildClassifyPrompt, parseClassification } = require('./classify-idea');

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');
const TYPES = ['בעל ערך', 'אישי', 'מכירתי'];
const BATCH = 60;

const str = (v) => (typeof v === 'string' ? v.trim() : '');

/** התסריט עצמו, כמו finalScriptText במסך הסיכום */
function scriptText(state) {
  const s = state || {};
  if (s.branch === 'footage') return str(s.herWords);
  if (s.branch === 'scratch') return str(s.draftScript) || str(s.finalScript);
  return str(s.finalScript) || str(s.draftScript);
}

/** על מה הסרטון: הרעיון, המסר או האריזה */
function ideaText(state, title) {
  const s = state || {};
  return str(s.ideaTopic) || str(s.ideaPunchline) || str(s.ideaBeforePackaging) || str(s.ideaDescription)
    || str(s.packaging) || str(s.contentSummary) || str(title);
}

/**
 * מה לעשות עם פריט:
 *   null                    יש לו כבר סוג, או שעוד אין ממה לסווג
 *   { type, by: 'flow' }    הסוג שנבחר בעוזר
 *   { classify: true }      לסווג
 */
function decideKind(item) {
  if (!item) return null;
  const k = item.contentKind;
  if (k && TYPES.includes(k.type)) return null;
  const s = item.state || {};
  const flow = s.contentType === 'ערכי' ? 'בעל ערך' : s.contentType;
  if (TYPES.includes(flow)) return { type: flow, by: 'flow' };
  if (scriptText(s).length >= 40) return { classify: true };
  return null;
}

async function classifyItem(apiKey, item) {
  const s = item.state || {};
  const title = ideaText(s, item.title) || scriptText(s).slice(0, 120);
  const body = scriptText(s).slice(0, 1800);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: CLASSIFY_MODEL,
      max_tokens: 200,
      temperature: 0,
      messages: [{ role: 'user', content: buildClassifyPrompt(title, `התסריט המלא של הסרטון:\n${body}`) }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const parsed = parseClassification(text);
  return parsed && TYPES.includes(parsed.category) ? parsed.category : null;
}

/** מחליט ומסווג. מחזיר את contentKind לכתיבה, או null. */
async function kindFor(apiKey, item, now = Date.now()) {
  const d = decideKind(item);
  if (!d) return null;
  if (d.type) return { type: d.type, by: d.by, at: now };
  const type = await classifyItem(apiKey, item);
  return type ? { type, by: 'ai', at: now } : null;
}

exports.scriptTypeOnWrite = onDocumentWritten(
  { document: 'videoAssistantScripts/{uid}/items/{itemId}', secrets: [anthropicApiKey], region: 'us-central1' },
  async (event) => {
    const after = event.data && event.data.after;
    if (!after || !after.exists) return;
    const item = after.data();
    if (!decideKind(item)) return;
    try {
      const kind = await kindFor(anthropicApiKey.value(), item);
      if (!kind) return;
      /* בינתיים אולי היא בחרה סוג ידנית: לא דורסים */
      await admin.firestore().runTransaction(async (tx) => {
        const fresh = await tx.get(after.ref);
        if (!fresh.exists || !decideKind(fresh.data())) return;
        tx.update(after.ref, { contentKind: kind });
      });
      console.log('scriptTypeOnWrite', event.params.uid, event.params.itemId, kind.type, kind.by);
    } catch (err) {
      console.error('scriptTypeOnWrite failed', event.params.itemId, err.message);
    }
  }
);

/* backfillScriptTypes רצה ב-09/11/2026 ונמחקה אחרי שסיימה: 129 תסריטים של 30
   משתמשות סווגו (אישי 69, בעל ערך 34, מכירתי 26). הקוד בהיסטוריה של git (445df16). */

exports._internal = { decideKind, scriptText, ideaText, TYPES };
