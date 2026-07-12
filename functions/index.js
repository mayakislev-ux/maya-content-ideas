const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { buildSystemPrompt } = require('./system-prompt');
const { CATEGORIES, PERSUASION_STAGES, CATEGORY_DEFINITIONS, PERSUASION_STAGE_DEFINITIONS } = require('./ideas-constants');

admin.initializeApp();
const db = admin.firestore();

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

const DAILY_LIMITS = {
  checkIdea: 60,
  classifyIdea: 40,
};

async function enforceRateLimit(uid, fnName) {
  const today = new Date().toISOString().slice(0, 10);
  const ref = db.collection('rateLimits').doc(`${uid}_${today}_${fnName}`);
  const limit = DAILY_LIMITS[fnName];

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = snap.exists ? snap.data().count : 0;
    if (count >= limit) {
      throw new HttpsError('resource-exhausted', 'הגעת למכסת השימוש היומית ב-AI, נסי שוב מחר');
    }
    tx.set(ref, { count: count + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  });
}

async function callAnthropic(apiKey, body) {
  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error('Network error calling Anthropic API:', err);
    throw new HttpsError('unavailable', 'לא ניתן להתחבר כרגע לשירות ה-AI, נסי שוב בעוד רגע');
  }

  if (!response.ok) {
    const errText = await response.text();
    console.error('Anthropic API error:', response.status, errText);
    throw new HttpsError('internal', 'שגיאה בפנייה ל-AI, נסי שוב');
  }

  return response.json();
}

exports.checkIdea = onCall({ secrets: [anthropicApiKey], region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'יש להתחבר כדי להשתמש בתכונה הזו');
  }
  await enforceRateLimit(request.auth.uid, 'checkIdea');

  const messages = request.data && request.data.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new HttpsError('invalid-argument', 'חסרות הודעות בשיחה');
  }

  const profile = (request.data && request.data.profile) || null;
  const systemPrompt = buildSystemPrompt(profile);

  const data = await callAnthropic(anthropicApiKey.value(), {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  const reply = (data.content && data.content[0] && data.content[0].text) || '';
  return { reply };
});

exports.classifyIdea = onCall({ secrets: [anthropicApiKey], region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'יש להתחבר כדי להשתמש בתכונה הזו');
  }
  await enforceRateLimit(request.auth.uid, 'classifyIdea');

  const title = (request.data && request.data.title) || '';
  const hookText = (request.data && request.data.hookText) || '';
  if (!title.trim()) {
    throw new HttpsError('invalid-argument', 'צריך לפחות כותרת כדי לסווג את הרעיון');
  }

  const prompt = `הרעיון לתוכן: "${title}"
פירוט נוסף: "${hookText}"

סווג/י את הרעיון הזה לפי שתי המערכות הבאות (המבוססות על המתודולוגיה המדויקת של מאיה קיסלב - אקדמיית המהלך השיווקי):

מערכת 1 - סוג תוכן ("category"), בחר/י בדיוק אחת:
${CATEGORIES.map((c) => `- ${c}: ${CATEGORY_DEFINITIONS[c]}`).join('\n')}

מערכת 2 - שלב שכנוע ("persuasionStage"), בחר/י בדיוק אחת. שימי לב: לכל תוכן יש בדרך כלל שלב שכנוע דומיננטי אחד, גם אם הוא נוגע קצת גם באחרים - תבחר/י את זה שהכי מתאר את המטרה המרכזית של הרעיון הספציפי הזה:
${PERSUASION_STAGES.map((s) => `- ${s}: ${PERSUASION_STAGE_DEFINITIONS[s]}`).join('\n')}

השב/י אך ורק ב-JSON תקין בפורמט הבא, בלי שום טקסט נוסף לפני או אחרי:
{"category": "...", "persuasionStage": "..."}`;

  const data = await callAnthropic(anthropicApiKey.value(), {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = (data.content && data.content[0] && data.content[0].text) || '{}';
  let parsed;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : text);
  } catch (err) {
    console.error('Failed to parse classifyIdea response:', text);
    throw new HttpsError('internal', 'לא הצלחתי לסווג את הרעיון, נסי שוב');
  }

  const category = CATEGORIES.includes(parsed.category) ? parsed.category : CATEGORIES[0];
  const persuasionStage = PERSUASION_STAGES.includes(parsed.persuasionStage) ? parsed.persuasionStage : PERSUASION_STAGES[0];
  return { category, persuasionStage };
});
