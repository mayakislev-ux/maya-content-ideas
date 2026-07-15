const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { buildSystemPrompt } = require('./system-prompt');
const { buildWarmingPrompt } = require('./warming-system-prompt');
const { fetchSheetsContent, sheetsServiceAccountKey } = require('./sheets-content');
const { CATEGORIES, PERSUASION_STAGES, CATEGORY_DEFINITIONS, PERSUASION_STAGE_DEFINITIONS } = require('./ideas-constants');

admin.initializeApp();
const db = admin.firestore();

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');
const ADMIN_EMAIL = 'mayakislev@gmail.com';

const DAILY_LIMITS = {
  checkIdea: 60,
  classifyIdea: 40,
  generateWarmingPlan: 20,
};

async function enforceRateLimit(uid, fnName) {
  const today = new Date().toISOString().slice(0, 10);
  const ref = db.collection('rateLimits').doc(`${uid}_${today}_${fnName}`);
  const limit = DAILY_LIMITS[fnName];

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = snap.exists ? snap.data().count : 0;
    if (count >= limit) {
      throw new HttpsError('resource-exhausted', 'הגעת למכסת השימוש היומית ב-AI, נסו שוב מחר');
    }
    tx.set(ref, { count: count + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  });
}

function countClarifyingRepliesSinceLastAngles(messages) {
  let count = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;
    const content = msg.content || '';
    const reachedStageBOrLater =
      content.includes('[[RECOGNIZED_EXCELLENT]]') ||
      content.includes('מפת-דרכים-ליצירת-תוכן') ||
      (content.includes('1.') && content.includes('2.') && content.includes('3.'));
    if (reachedStageBOrLater) break;
    count++;
  }
  return count;
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
    throw new HttpsError('unavailable', 'לא ניתן להתחבר כרגע לשירות ה-AI, נסו שוב בעוד רגע');
  }

  if (!response.ok) {
    const errText = await response.text();
    console.error('Anthropic API error:', response.status, errText);
    throw new HttpsError('internal', 'שגיאה בפנייה ל-AI, נסו שוב');
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
  let systemPrompt = buildSystemPrompt(profile);

  if (countClarifyingRepliesSinceLastAngles(messages) >= 2) {
    systemPrompt += '\n\n⚠️ הנחיה דחופה: כבר נשלחו 2 הודעות הבהרה או יותר על הרעיון הנוכחי בשיחה הזו. אסור לשאול שום שאלת הבהרה נוספת - חובה לעבור עכשיו, בהודעה הזו, ישירות לשלב ב\' (5 זוויות הנגשה) על סמך מה שכבר ידוע, גם אם זה לא מושלם. אם הרעיון כבר ברור מספיק, אפשר גם [[RECOGNIZED_EXCELLENT]] אם זה מתאים.';
  }

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

מערכת 2 - שלב שכנוע ("persuasionStage"), בחר/י בדיוק אחת. לשים לב: לכל תוכן יש בדרך כלל שלב שכנוע דומיננטי אחד, גם אם הוא נוגע קצת גם באחרים - תבחר/י את זה שהכי מתאר את המטרה המרכזית של הרעיון הספציפי הזה:
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
    throw new HttpsError('internal', 'לא הצלחתי לסווג את הרעיון, נסו שוב');
  }

  const category = CATEGORIES.includes(parsed.category) ? parsed.category : CATEGORIES[0];
  const persuasionStage = PERSUASION_STAGES.includes(parsed.persuasionStage) ? parsed.persuasionStage : PERSUASION_STAGES[0];
  return { category, persuasionStage };
});

exports.generateWarmingPlan = onCall({ secrets: [anthropicApiKey, sheetsServiceAccountKey], region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'יש להתחבר כדי להשתמש בתכונה הזו');
  }
  if (request.auth.token.email !== ADMIN_EMAIL) {
    throw new HttpsError('permission-denied', 'התכונה הזו זמינה כרגע רק למנהלת');
  }
  await enforceRateLimit(request.auth.uid, 'generateWarmingPlan');

  const product = ((request.data && request.data.product) || '').trim();
  const audience = ((request.data && request.data.audience) || '').trim();
  const existingIdeasTitles = (request.data && request.data.existingIdeasTitles) || [];
  let extraContext = (request.data && request.data.extraContext) || '';

  if (!product || !audience) {
    throw new HttpsError('invalid-argument', 'צריך לפחות מוצר וקהל יעד כדי לבנות תוכנית חימום');
  }

  const sheetResult = await fetchSheetsContent(extraContext);
  if (sheetResult && sheetResult.error) {
    throw new HttpsError(
      'failed-precondition',
      'לא הצלחתי לקרוא את קובץ ה-Sheets - ודאי שההרשאות שלו מוגדרות ל"כל מי שיש לו את הקישור - צופה" (Anyone with the link - Viewer) ונסי שוב'
    );
  }
  if (sheetResult && !sheetResult.error) {
    extraContext = `${extraContext}\n\nתוכן שנשלף מתוך קובץ ה-Sheets המצורף:\n${sheetResult.content}`;
  }

  const prompt = buildWarmingPrompt({
    product,
    audience,
    extraContext,
    existingIdeasTitles: existingIdeasTitles.slice(0, 40),
  });

  const data = await callAnthropic(anthropicApiKey.value(), {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 6144,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = (data.content && data.content[0] && data.content[0].text) || '{}';
  let parsed;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : text);
  } catch (err) {
    console.error('Failed to parse generateWarmingPlan response:', text);
    throw new HttpsError('internal', 'לא הצלחתי לבנות את התוכנית, נסו שוב');
  }

  if (!Array.isArray(parsed.week1) || !Array.isArray(parsed.week2) || !Array.isArray(parsed.week3)) {
    console.error('generateWarmingPlan response missing expected weeks:', text);
    throw new HttpsError('internal', 'התקבלה תשובה לא תקינה, נסו שוב');
  }

  return { plan: parsed };
});
