const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const webpush = require('web-push');
const { buildSystemPrompt } = require('./system-prompt');
const { buildScriptSystemPrompt } = require('./script-system-prompt');
const { buildOngoingWarmingPrompt, buildPresaleWarmingPrompt } = require('./warming-system-prompt');
const { buildContentPlanPrompt } = require('./content-plan-system-prompt');
const { fetchSheetsContent, sheetsServiceAccountKey } = require('./sheets-content');
const { CATEGORIES, PERSUASION_STAGES, CATEGORY_DEFINITIONS, PERSUASION_STAGE_DEFINITIONS } = require('./ideas-constants');

admin.initializeApp();
const db = admin.firestore();

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');
const vapidPrivateKey = defineSecret('VAPID_PRIVATE_KEY');
const VAPID_PUBLIC_KEY = 'BJEiFPdCP25KUDW3COmcY0Y0noeC6tILFu4DoTjYW_v4mBwBshy4JyqivKa8pFE2f-36PpALDZ6_1zXnUGwKv94';
const ADMIN_EMAIL = 'mayakislev@gmail.com';

const DAILY_LIMITS = {
  checkIdea: 60,
  classifyIdea: 40,
  generateWarmingPlan: 20,
  generateContentPlan: 20,
  writeScript: 60,
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

// Real, exact token counts and $ cost, straight from Anthropic's own response
// on every call - not an estimate. Written best-effort (a logging failure
// must never break the actual feature the user is waiting on).
// Base Haiku 4.5 rate confirmed against anthropic.com/claude/haiku. Cache
// write/read multipliers (1.25x / 0.1x of base input) are Anthropic's
// standard published ratios for the default 5-minute ephemeral cache.
const HAIKU_PRICE_PER_MTOK = { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 }; // USD per million tokens
const USD_TO_ILS_RATE = 3.0; // approximate, checked 2026-07-16 - not live, update if it drifts a lot

async function recordTokenUsage(fnName, usage) {
  if (!usage) return;
  try {
    const ref = db.collection('tokenUsage').doc(fnName);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const prev = snap.exists
        ? snap.data()
        : { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, calls: 0 };
      tx.set(
        ref,
        {
          inputTokens: (prev.inputTokens || 0) + (usage.input_tokens || 0),
          outputTokens: (prev.outputTokens || 0) + (usage.output_tokens || 0),
          cacheCreationTokens: (prev.cacheCreationTokens || 0) + (usage.cache_creation_input_tokens || 0),
          cacheReadTokens: (prev.cacheReadTokens || 0) + (usage.cache_read_input_tokens || 0),
          calls: (prev.calls || 0) + 1,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });
  } catch (err) {
    console.error('recordTokenUsage failed (non-fatal):', fnName, err.message);
  }
}

// Marks text as cacheable so Anthropic reuses it across calls in the same
// conversation instead of re-billing it at full price every message.
function cachedText(text) {
  return [{ type: 'text', text, cache_control: { type: 'ephemeral' } }];
}

// Prompt caching needs an exact-prefix match to hit. Since every call resends
// the full growing conversation, marking the *last* message as a cache
// breakpoint caches everything up to and including it - the next call (which
// will contain this same history plus one new exchange) hits that cache for
// the unchanged part and only pays full price for what's actually new.
function withCacheControl(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  return messages.map((msg, i) => {
    if (i !== messages.length - 1) return msg;
    const text = typeof msg.content === 'string' ? msg.content : msg.content;
    return { ...msg, content: cachedText(text) };
  });
}

async function callAnthropic(apiKey, body, fnName) {
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

  const data = await response.json();
  if (fnName) await recordTokenUsage(fnName, data.usage);
  return data;
}

exports.getTokenUsage = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth || request.auth.token.email !== ADMIN_EMAIL) {
    throw new HttpsError('permission-denied', 'התכונה הזו זמינה כרגע רק למנהלת');
  }
  const snap = await db.collection('tokenUsage').get();
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheWrite = 0;
  let totalCacheRead = 0;
  const byFunction = {};
  snap.forEach((doc) => {
    const d = doc.data();
    totalInput += d.inputTokens || 0;
    totalOutput += d.outputTokens || 0;
    totalCacheWrite += d.cacheCreationTokens || 0;
    totalCacheRead += d.cacheReadTokens || 0;
    byFunction[doc.id] = {
      inputTokens: d.inputTokens || 0,
      outputTokens: d.outputTokens || 0,
      cacheCreationTokens: d.cacheCreationTokens || 0,
      cacheReadTokens: d.cacheReadTokens || 0,
      calls: d.calls || 0,
    };
  });
  const estimatedCostUsd =
    (totalInput / 1_000_000) * HAIKU_PRICE_PER_MTOK.input +
    (totalOutput / 1_000_000) * HAIKU_PRICE_PER_MTOK.output +
    (totalCacheWrite / 1_000_000) * HAIKU_PRICE_PER_MTOK.cacheWrite +
    (totalCacheRead / 1_000_000) * HAIKU_PRICE_PER_MTOK.cacheRead;
  // What those same cache tokens would have cost at full input price, had
  // caching not been on - the gap between this and estimatedCostUsd is the
  // real, visible saving caching is producing.
  const costWithoutCachingUsd =
    (totalInput / 1_000_000) * HAIKU_PRICE_PER_MTOK.input +
    (totalOutput / 1_000_000) * HAIKU_PRICE_PER_MTOK.output +
    ((totalCacheWrite + totalCacheRead) / 1_000_000) * HAIKU_PRICE_PER_MTOK.input;
  const estimatedCostIls = estimatedCostUsd * USD_TO_ILS_RATE;
  const savedByCachingUsd = Math.max(0, costWithoutCachingUsd - estimatedCostUsd);
  return {
    totalInput,
    totalOutput,
    totalCacheWrite,
    totalCacheRead,
    byFunction,
    estimatedCostUsd,
    estimatedCostIls,
    savedByCachingUsd,
    savedByCachingIls: savedByCachingUsd * USD_TO_ILS_RATE,
  };
});

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

  const data = await callAnthropic(
    anthropicApiKey.value(),
    {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: cachedText(systemPrompt),
      messages: withCacheControl(messages),
    },
    'checkIdea'
  );

  const reply = (data.content && data.content[0] && data.content[0].text) || '';
  return { reply };
});

exports.writeScript = onCall({ secrets: [anthropicApiKey], region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'יש להתחבר כדי להשתמש בתכונה הזו');
  }
  if (request.auth.token.email !== ADMIN_EMAIL) {
    throw new HttpsError('permission-denied', 'התכונה הזו זמינה כרגע רק למנהלת');
  }
  await enforceRateLimit(request.auth.uid, 'writeScript');

  const messages = request.data && request.data.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new HttpsError('invalid-argument', 'חסרות הודעות בשיחה');
  }

  const profile = (request.data && request.data.profile) || null;
  const ideaContext = (request.data && request.data.ideaContext) || null;
  const systemPrompt = buildScriptSystemPrompt(profile, ideaContext);

  const data = await callAnthropic(
    anthropicApiKey.value(),
    {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: cachedText(systemPrompt),
      messages: withCacheControl(messages),
    },
    'writeScript'
  );

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

  const data = await callAnthropic(
    anthropicApiKey.value(),
    { model: 'claude-haiku-4-5-20251001', max_tokens: 200, messages: [{ role: 'user', content: prompt }] },
    'classifyIdea'
  );

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

exports.generateWarmingPlan = onCall({ secrets: [anthropicApiKey, sheetsServiceAccountKey], region: 'us-central1', timeoutSeconds: 180 }, async (request) => {
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
      'לא הצלחתי לקרוא את קובץ ה-Sheets - ודאו שההרשאות שלו מוגדרות ל"כל מי שיש לו את הקישור - צופה" (Anyone with the link - Viewer) ונסו שוב'
    );
  }
  if (sheetResult && !sheetResult.error) {
    extraContext = `${extraContext}\n\nתוכן שנשלף מתוך קובץ ה-Sheets המצורף:\n${sheetResult.content}`;
  }

  const promptArgs = { product, audience, extraContext, existingIdeasTitles: existingIdeasTitles.slice(0, 40) };

  async function callAndParse(prompt) {
    const data = await callAnthropic(
      anthropicApiKey.value(),
      { model: 'claude-haiku-4-5-20251001', max_tokens: 4096, messages: [{ role: 'user', content: prompt }] },
      'generateWarmingPlan'
    );
    const text = (data.content && data.content[0] && data.content[0].text) || '{}';
    try {
      const match = text.match(/\{[\s\S]*\}/);
      return JSON.parse(match ? match[0] : text);
    } catch (err) {
      console.error('Failed to parse generateWarmingPlan response:', text);
      throw new HttpsError('internal', 'לא הצלחתי לבנות את התוכנית, נסו שוב');
    }
  }

  const [ongoing, presale] = await Promise.all([
    callAndParse(buildOngoingWarmingPrompt(promptArgs)),
    callAndParse(buildPresaleWarmingPrompt(promptArgs)),
  ]);

  if (!Array.isArray(ongoing.week1) || !Array.isArray(ongoing.week2) || !Array.isArray(presale.week3)) {
    console.error('generateWarmingPlan response missing expected weeks:', JSON.stringify({ ongoing, presale }));
    throw new HttpsError('internal', 'התקבלה תשובה לא תקינה, נסו שוב');
  }

  return { plan: { week1: ongoing.week1, week2: ongoing.week2, week3: presale.week3 } };
});

exports.generateContentPlan = onCall({ secrets: [anthropicApiKey], region: 'us-central1', timeoutSeconds: 120 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'יש להתחבר כדי להשתמש בתכונה הזו');
  }
  await enforceRateLimit(request.auth.uid, 'generateContentPlan');

  const ideas = (request.data && request.data.ideas) || [];
  const weeksCount = Number(request.data && request.data.weeksCount) || 4;
  const postsPerWeek = Number(request.data && request.data.postsPerWeek) || 3;
  const liveContentNote = (request.data && request.data.liveContentNote) || '';

  if (!Array.isArray(ideas) || ideas.length === 0) {
    throw new HttpsError('invalid-argument', 'צריך לפחות רעיון אחד עם קטגוריה כדי לבנות תכנית תוכן');
  }
  if (weeksCount < 1 || weeksCount > 8 || postsPerWeek < 1 || postsPerWeek > 14) {
    throw new HttpsError('invalid-argument', 'מספר שבועות/פריטים לא סביר');
  }

  const prompt = buildContentPlanPrompt({ weeksCount, postsPerWeek, liveContentNote, ideas: ideas.slice(0, 60) });

  const data = await callAnthropic(
    anthropicApiKey.value(),
    { model: 'claude-haiku-4-5-20251001', max_tokens: 4096, messages: [{ role: 'user', content: prompt }] },
    'generateContentPlan'
  );

  const text = (data.content && data.content[0] && data.content[0].text) || '{}';
  let parsed;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : text);
  } catch (err) {
    console.error('Failed to parse generateContentPlan response:', text);
    throw new HttpsError('internal', 'לא הצלחתי לבנות את התכנית, נסו שוב');
  }

  if (!Array.isArray(parsed.weeks)) {
    console.error('generateContentPlan response missing weeks:', JSON.stringify(parsed));
    throw new HttpsError('internal', 'התקבלה תשובה לא תקינה, נסו שוב');
  }

  return { plan: { weeks: parsed.weeks } };
});

exports.sendNotification = onCall({ secrets: [vapidPrivateKey], region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'יש להתחבר כדי להשתמש בתכונה הזו');
  }
  if (request.auth.token.email !== ADMIN_EMAIL) {
    throw new HttpsError('permission-denied', 'התכונה הזו זמינה כרגע רק למנהלת');
  }

  const title = ((request.data && request.data.title) || '').trim();
  const body = ((request.data && request.data.body) || '').trim();
  const target = (request.data && request.data.target) || 'all';
  const targetEmail = ((request.data && request.data.targetEmail) || '').trim().toLowerCase();

  if (!title || !body) {
    throw new HttpsError('invalid-argument', 'צריך כותרת ותוכן כדי לשלוח התראה');
  }
  if (target === 'one' && !targetEmail) {
    throw new HttpsError('invalid-argument', 'צריך לציין מייל כדי לשלוח למשתמשת ספציפית');
  }

  webpush.setVapidDetails('mailto:mayakislev@gmail.com', VAPID_PUBLIC_KEY, vapidPrivateKey.value().trim());

  let query = db.collection('pushSubscriptions');
  if (target === 'one') {
    query = query.where('email', '==', targetEmail);
  }
  const snap = await query.get();

  if (snap.empty) {
    throw new HttpsError('not-found', target === 'one' ? 'לא נמצאה הרשמה להתראות עבור המייל הזה' : 'אף אחת עוד לא הפעילה התראות');
  }

  const payload = JSON.stringify({ title, body });
  let sent = 0;
  let failed = 0;

  await Promise.all(
    snap.docs.map(async (docSnap) => {
      try {
        await webpush.sendNotification(docSnap.data().subscription, payload);
        sent++;
      } catch (err) {
        failed++;
        console.error('sendNotification failed for', docSnap.id, err.message);
        if (err.statusCode === 404 || err.statusCode === 410) {
          await docSnap.ref.delete();
        }
      }
    })
  );

  return { sent, failed };
});
