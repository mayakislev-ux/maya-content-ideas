const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const webpush = require('web-push');
const { buildSystemPrompt } = require('./system-prompt');
const { buildScriptSystemPrompt } = require('./script-system-prompt');
const { buildOngoingWarmingPrompt, buildPresaleWarmingPrompt } = require('./warming-system-prompt');
const { buildContentPlanPrompt } = require('./content-plan-system-prompt');
const { fetchExtraContentLinks, sheetsServiceAccountKey } = require('./sheets-content');
const { CATEGORIES, PERSUASION_STAGES, CATEGORY_DEFINITIONS, PERSUASION_STAGE_DEFINITIONS } = require('./ideas-constants');

admin.initializeApp();
const db = admin.firestore();

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');
const vapidPrivateKey = defineSecret('VAPID_PRIVATE_KEY');
const VAPID_PUBLIC_KEY = 'BJEiFPdCP25KUDW3COmcY0Y0noeC6tILFu4DoTjYW_v4mBwBshy4JyqivKa8pFE2f-36PpALDZ6_1zXnUGwKv94';
const ADMIN_EMAIL = 'mayakislev@gmail.com';

// המקור היחיד שממנו האפליקציה מוגשת בפועל (GitHub Pages) - צריך רשימה
// מפורשת (לא cors:true הפתוח לכל מקור) כי checkIdea הוא onRequest גולמי
// שמאמת בעצמו עם Bearer token, לא onCall עם אימות מובנה. localhost נשאר
// לבדיקות מקומיות מול ה-emulator.
const ALLOWED_STREAM_ORIGINS = [
  'https://mayakislev-ux.github.io',
  'http://localhost:5000',
  'http://localhost:8080',
];

const DAILY_LIMITS = {
  checkIdea: 60,
  classifyIdea: 40,
  generateWarmingPlan: 20,
  generateContentPlan: 20,
  writeScript: 60,
};

// checkIdea/classifyIdea/generateWarmingPlan/generateContentPlan עד עכשיו רק
// בדקו שיש התחברות תקינה, לא שהמייל בפועל ברשימת ה-allowlist - הבדיקה
// הייתה קיימת רק בצד הלקוח (עוקפים בקלות עם קריאה ישירה לפונקציה) וב-
// firestore.rules (לא רלוונטי - הפונקציות האלה משתמשות ב-Admin SDK, שעוקף
// לגמרי את חוקי Firestore). זו הבדיקה האמיתית, בצד השרת, שמראה אותה לוגיקה
// בדיוק כמו isAllowed() ב-firestore.rules.
async function enforceAllowlist(email) {
  if (!email) {
    throw new HttpsError('permission-denied', 'יש להתחבר כדי להשתמש בתכונה הזו');
  }
  if (email === ADMIN_EMAIL) return;
  const snap = await db.collection('allowlist').doc(email).get();
  if (!snap.exists) {
    throw new HttpsError('permission-denied', 'המייל הזה לא רשום במערכת, אנא פנו למאיה');
  }
}

// שני עוזרי אימות אורך - אותה בעיה כמו שכבר תוקנה היום ל-pieceCount
// (בדיקת טווח לפני שליחה ל-AI, לא לסמוך רק על מגבלת הקצב היומית).
function assertMaxLength(value, max, fieldLabel) {
  if (typeof value === 'string' && value.length > max) {
    throw new HttpsError('invalid-argument', `השדה "${fieldLabel}" ארוך מדי (מקסימום ${max} תווים)`);
  }
}

function assertMessagesWithinLimit(messages, maxTotalChars) {
  const total = (messages || []).reduce((sum, m) => sum + String((m && m.content) || '').length, 0);
  if (total > maxTotalChars) {
    throw new HttpsError('invalid-argument', 'השיחה ארוכה מדי, התחילו שיחה חדשה');
  }
}

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

// Anthropic's stream can split one logical SSE event ("data: {...}\n\n")
// across multiple TCP chunks - can't just JSON.parse each chunk on its own.
// Buffers raw text across calls and only emits fully-received blocks;
// whatever's left after the last "\n\n" is incomplete and stays in the
// returned remainder for the next chunk to complete.
function parseSSEChunk(buffer, chunkText) {
  const combined = buffer + chunkText;
  const blocks = combined.split('\n\n');
  const remainder = blocks.pop();
  const events = [];
  for (const block of blocks) {
    const dataLine = block.split('\n').find((line) => line.startsWith('data:'));
    if (!dataLine) continue;
    try {
      events.push(JSON.parse(dataLine.slice(5).trim()));
    } catch (err) {
      console.error('Failed to parse Anthropic SSE data line:', dataLine, err);
    }
  }
  return { events, remainder };
}

// Claude sometimes prepends a "thinking" content block before the actual
// text response (confirmed happening for some inputs on claude-sonnet-5;
// possible in principle on any model) - content[0] is not reliably the text
// block. Reading content[0].text directly would silently return undefined
// whenever a thinking block comes first, which looks identical to "the AI
// gave a broken/empty answer" from the outside. Used everywhere a reply is
// read, regardless of which model that call happens to use.
function getResponseText(data) {
  const block = data.content && data.content.find((b) => b.type === 'text');
  return (block && block.text) || '';
}

// The system prompt already instructs Hebrew-only, but an LLM following a
// prompt is a strong nudge, not a guarantee - this is a real enforcement
// mechanism on top of it: if stray English slipped through anyway, ask the
// model (once) to rewrite the exact same message in pure Hebrew instead of
// just hoping the instruction was followed. URLs and the app's own
// technical [[MARKER]] tokens are expected to contain Latin characters and
// must not trigger this.
const URL_REGEX = /https?:\/\/[^\s]+/g;
const TECH_MARKER_REGEX = /\[\[[A-Z_]+\]\]/g;

function containsStrayEnglish(text) {
  const stripped = text.replace(URL_REGEX, ' ').replace(TECH_MARKER_REGEX, ' ');
  return /[a-zA-Z]{2,}/.test(stripped);
}

async function rewriteInHebrewIfNeeded(text, apiKey, fnName) {
  if (!text || !containsStrayEnglish(text)) return text;
  console.warn(`${fnName}: reply contained stray English, attempting one corrective rewrite`);
  try {
    const data = await callAnthropic(
      apiKey,
      {
        model: 'claude-sonnet-5',
        // Matches the largest caller (checkIdea/writeScript both now up to
        // 4096) - this rewrites the ENTIRE original reply, so it needs at
        // least as much headroom as whatever produced that reply, or the
        // "fix" pass introduces its own truncated half-answer.
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: `ההודעה הבאה נכתבה בטעות עם כמה אותיות לועזיות (אנגלית) בתוכה, חוץ מקישורי URL שמותר שיישארו כמו שהם:\n\n"""${text}"""\n\nכתבי אותה מחדש - אותו תוכן, אותו אורך, אותו מבנה בדיוק. אם יש שורה טכנית שמתחילה ב-[[ (כמו [[IDEA_SUMMARY]] או [[SCRIPT_SUMMARY]]) - השאירי את התחילית [[...]] עצמה בדיוק כמו שהיא, שמרי בדיוק על אותם מפרידי "||" באותה שורה, ותרגמי לעברית רק את התוכן שבין המפרידים אם יש בו אנגלית. בכל שאר ההודעה - אך ורק אותיות עבריות, מלבד בתוך קישורי URL. השיבי אך ורק בטקסט המתוקן, בלי שום הקדמה או הסבר נוסף.`,
          },
        ],
      },
      `${fnName}_hebrewFix`
    );
    const fixed = getResponseText(data) || '';
    return fixed.trim() || text;
  } catch (err) {
    console.error(`${fnName}: corrective Hebrew rewrite failed:`, err);
    return text;
  }
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

// Feedback is submitted fully anonymously (no ownerUid stored at all) and
// firestore.rules blocks client-side reads entirely on purpose - the only
// way to actually read it back is server-side, through this admin-only
// function.
exports.getFeedback = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth || request.auth.token.email !== ADMIN_EMAIL) {
    throw new HttpsError('permission-denied', 'התכונה הזו זמינה כרגע רק למנהלת');
  }
  const snap = await db.collection('feedback').orderBy('createdAt', 'desc').limit(200).get();
  const items = snap.docs.map((doc) => {
    const d = doc.data();
    return {
      text: d.text || '',
      createdAt: d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toISOString() : null,
    };
  });
  return { items };
});

// שולפת לכל לקוחה מה-allowlist: מתי התחברה לאחרונה (מ-Firebase Auth,
// לא נשמר ב-Firestore) + כמה רעיונות כתבה ומתי (מ-collection ideas). 3
// קריאות מרוכזות (allowlist מלא, ideas מלא, listUsers מלא) ואז חיבור
// בזיכרון - עדיף על עשרות שאילתות בודדות אחת לכל לקוחה.
// admin.auth().listUsers() caps a single page at 1000 - beyond that it needs
// pageToken-based pagination or accounts past the first page would silently
// look like they've "never logged in." Not a real concern at current scale,
// but cheap to make correct for whenever the allowlist grows past 1000.
async function listAllAuthUsers() {
  let users = [];
  let pageToken;
  do {
    const result = await admin.auth().listUsers(1000, pageToken);
    users = users.concat(result.users);
    pageToken = result.pageToken;
  } while (pageToken);
  return users;
}

exports.getClientUsageStats = onCall({ region: 'us-central1', timeoutSeconds: 60 }, async (request) => {
  if (!request.auth || request.auth.token.email !== ADMIN_EMAIL) {
    throw new HttpsError('permission-denied', 'התכונה הזו זמינה כרגע רק למנהלת');
  }

  const [allowlistSnap, ideasSnap, allUsers] = await Promise.all([
    db.collection('allowlist').get(),
    db.collection('ideas').get(),
    listAllAuthUsers(),
  ]);

  const authByEmail = new Map();
  allUsers.forEach((u) => {
    if (u.email) authByEmail.set(u.email, u);
  });

  const ideasByUid = new Map();
  ideasSnap.forEach((doc) => {
    const d = doc.data();
    if (d.deletedAt || !d.ownerUid) return;
    if (!ideasByUid.has(d.ownerUid)) ideasByUid.set(d.ownerUid, []);
    ideasByUid.get(d.ownerUid).push({
      title: d.title || '',
      category: d.category || null,
      createdAt: d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toISOString() : null,
    });
  });

  const clients = allowlistSnap.docs.map((doc) => {
    const email = doc.id;
    const authUser = authByEmail.get(email);
    const ideas = authUser ? ideasByUid.get(authUser.uid) || [] : [];
    ideas.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return {
      email,
      lastSignInTime: (authUser && authUser.metadata.lastSignInTime) || null,
      ideaCount: ideas.length,
      lastIdeaAt: ideas.length ? ideas[0].createdAt : null,
      ideas,
    };
  });

  // הכי-ותיקה-קודם (מעולם לא התחברה, ואז מי שהתחברה הכי מזמן) - הכי
  // שימושי כדי לאתר במבט מהיר מי דורשת מעקב, לא מי כבר פעילה ממילא.
  clients.sort((a, b) => {
    const aTime = a.lastSignInTime ? new Date(a.lastSignInTime).getTime() : 0;
    const bTime = b.lastSignInTime ? new Date(b.lastSignInTime).getTime() : 0;
    return aTime - bTime;
  });

  return { clients };
});

// checkIdea היה onCall עד עכשיו - הומר ל-onRequest גולמי כדי לתמוך בסטרימינג
// אמיתי של תשובת ה-AI (טקסט מופיע תוך כ-1-2 שניות ומצטבר בהדרגה, במקום מסך
// "חושבת..." חסום למשך כל משך היצירה - עד 4096 טוקנים ללא סטרימינג, שזה מה
// שגרם לתלונה "מחכה הרבה זמן"). onCall בגרסת firebase-functions המותקנת כאן
// (5.1.1) לא תומך בסטרימינג - זה נוסף רק בגרסה מאוחרת יותר, ושדרוג גרסה היה
// מסכן את כל שאר הפונקציות בקובץ הזה (כולל אוטומציות תשלומים/כרטיסים
// לא-קשורות שחיות באותו ריפו/functions - ראו grow-payment-webhook.js וכו').
// לכן האימות כאן ידני (verifyIdToken) במקום האימות האוטומטי של onCall, וה-
// CORS מוגבל במפורש למקור האמיתי שהאפליקציה מוגשת ממנו.
exports.checkIdea = onRequest(
  { secrets: [anthropicApiKey], region: 'us-central1', cors: ALLOWED_STREAM_ORIGINS },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const authHeader = req.get('Authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) {
      res.status(401).json({ error: 'יש להתחבר כדי להשתמש בתכונה הזו' });
      return;
    }

    let uid, email;
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      uid = decoded.uid;
      email = decoded.email;
    } catch (err) {
      console.error('checkIdea: invalid ID token:', err.message);
      res.status(401).json({ error: 'התחברות לא תקינה, נסו להתחבר מחדש' });
      return;
    }

    try {
      await enforceAllowlist(email);
    } catch (err) {
      res.status(403).json({ error: err.message || 'אין הרשאה להשתמש בתכונה הזו' });
      return;
    }

    const messages = req.body && req.body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'חסרות הודעות בשיחה' });
      return;
    }
    try {
      assertMessagesWithinLimit(messages, 60000);
    } catch (err) {
      res.status(400).json({ error: err.message });
      return;
    }

    try {
      await enforceRateLimit(uid, 'checkIdea');
    } catch (err) {
      res.status(429).json({ error: err.message || 'הגעת למכסת השימוש היומית ב-AI, נסו שוב מחר' });
      return;
    }

    const profile = (req.body && req.body.profile) || null;
    let systemPrompt = buildSystemPrompt(profile);

    if (countClarifyingRepliesSinceLastAngles(messages) >= 2) {
      systemPrompt += '\n\n⚠️ הנחיה דחופה: כבר נשלחו 2 הודעות הבהרה או יותר על הרעיון הנוכחי בשיחה הזו. אסור לשאול שום שאלת הבהרה נוספת - חובה לעבור עכשיו, בהודעה הזו, ישירות לשלב ב\' (5 זוויות הנגשה) על סמך מה שכבר ידוע, גם אם זה לא מושלם. אם הרעיון כבר ברור מספיק, אפשר גם [[RECOGNIZED_EXCELLENT]] אם זה מתאים.';
    }

    let anthropicResponse;
    try {
      anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicApiKey.value(),
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-5',
          max_tokens: 4096,
          system: cachedText(systemPrompt),
          messages: withCacheControl(messages),
          stream: true,
        }),
      });
    } catch (err) {
      console.error('checkIdea: network error calling Anthropic API:', err);
      res.set('Content-Type', 'text/event-stream');
      res.write(`data: ${JSON.stringify({ error: 'לא ניתן להתחבר כרגע לשירות ה-AI, נסו שוב בעוד רגע' })}\n\n`);
      res.end();
      return;
    }

    if (!anthropicResponse.ok || !anthropicResponse.body) {
      const errText = await anthropicResponse.text().catch(() => '');
      console.error('checkIdea: Anthropic API error:', anthropicResponse.status, errText);
      res.set('Content-Type', 'text/event-stream');
      res.write(`data: ${JSON.stringify({ error: 'שגיאה בפנייה ל-AI, נסו שוב' })}\n\n`);
      res.end();
      return;
    }

    res.set('Content-Type', 'text/event-stream');
    res.set('Cache-Control', 'no-cache');
    res.set('Connection', 'keep-alive');
    if (res.flushHeaders) res.flushHeaders();

    const reader = anthropicResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let usage = null;

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const parsed = parseSSEChunk(buffer, decoder.decode(value, { stream: true }));
        buffer = parsed.remainder;
        for (const event of parsed.events) {
          if (event.type === 'message_start' && event.message && event.message.usage) {
            usage = { ...event.message.usage };
          } else if (event.type === 'content_block_delta' && event.delta && event.delta.type === 'text_delta') {
            fullText += event.delta.text;
            res.write(`data: ${JSON.stringify({ delta: event.delta.text })}\n\n`);
          } else if (event.type === 'message_delta' && event.usage) {
            // message_delta's usage is cumulative but only carries the fields
            // that changed (output_tokens) - merge onto message_start's base
            // so input/cache-token counts from message_start aren't lost.
            usage = { ...usage, ...event.usage };
          } else if (event.type === 'error') {
            console.error('checkIdea: Anthropic stream error event:', event.error);
          }
        }
      }
    } catch (err) {
      console.error('checkIdea: error reading Anthropic stream:', err);
    }

    if (usage) await recordTokenUsage('checkIdea', usage);

    // rewriteInHebrewIfNeeded already catches its own errors internally and
    // falls back to the original text - no try/catch needed here.
    const finalReply = await rewriteInHebrewIfNeeded(fullText, anthropicApiKey.value(), 'checkIdea');

    res.write(`data: ${JSON.stringify({ done: true, reply: finalReply })}\n\n`);
    res.end();
  }
);

exports.writeScript = onCall({ secrets: [anthropicApiKey], region: 'us-central1', timeoutSeconds: 180 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'יש להתחבר כדי להשתמש בתכונה הזו');
  }
  if (request.auth.token.email !== ADMIN_EMAIL) {
    throw new HttpsError('permission-denied', 'התכונה הזו זמינה כרגע רק למנהלת');
  }

  const messages = request.data && request.data.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new HttpsError('invalid-argument', 'חסרות הודעות בשיחה');
  }
  assertMessagesWithinLimit(messages, 60000);

  await enforceRateLimit(request.auth.uid, 'writeScript');

  const profile = (request.data && request.data.profile) || null;
  const ideaContext = (request.data && request.data.ideaContext) || null;
  let systemPrompt = buildScriptSystemPrompt(profile, ideaContext);

  if (messages.filter((m) => m.role === 'assistant').length >= 3) {
    systemPrompt += '\n\n⚠️ הנחיה דחופה: כבר נשלחו 3 הודעות או יותר בשיחה הזו בשלב חילוץ התוכן. אסור לשאול עוד שאלת הבהרה נוספת - חובה לעבור עכשיו, בהודעה הזו, ישירות לשלב הבא (שער הוק, ואז כתיבת הוקים) על סמך מה שכבר נמסר, גם אם אין בדיוק 5 פרטים מושלמים. עדיף להשתמש במה שיש מאשר להמשיך לשאול עוד.';
  }

  const data = await callAnthropic(
    anthropicApiKey.value(),
    {
      model: 'claude-sonnet-5',
      max_tokens: 4096,
      system: cachedText(systemPrompt),
      messages: withCacheControl(messages),
    },
    'writeScript'
  );

  let reply = getResponseText(data) || '';
  reply = await rewriteInHebrewIfNeeded(reply, anthropicApiKey.value(), 'writeScript');
  return { reply };
});

exports.classifyIdea = onCall({ secrets: [anthropicApiKey], region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'יש להתחבר כדי להשתמש בתכונה הזו');
  }
  await enforceAllowlist(request.auth.token.email);

  const title = (request.data && request.data.title) || '';
  const hookText = (request.data && request.data.hookText) || '';
  if (!title.trim()) {
    throw new HttpsError('invalid-argument', 'צריך לפחות כותרת כדי לסווג את הרעיון');
  }
  assertMaxLength(title, 2000, 'כותרת');
  assertMaxLength(hookText, 5000, 'זווית/הוק');

  await enforceRateLimit(request.auth.uid, 'classifyIdea');

  const prompt = `הרעיון לתוכן: "${title}"
פירוט נוסף: "${hookText}"

סווג/י את הרעיון הזה לפי שתי המערכות הבאות (המבוססות על המתודולוגיה המדויקת של מאיה קיסלב - אקדמיית המהלך השיווקי):

מערכת 1 - סוג תוכן, בחר/י בדיוק אחד לפי המספר שלו:
${CATEGORIES.map((c, i) => `${i + 1}. ${c}: ${CATEGORY_DEFINITIONS[c]}`).join('\n')}

**הבחנה קריטית שגורמת לטעויות סיווג בפועל - סיפור לקוח מול סיפור אישי:** "אישי" הוא **רק** על החיים/הסיפור/החוויות של **בעל/ת העסק עצמו/ה** - לא על לקוחות. סיפור שמתאר מה **קרה ללקוח/ה** (למשל "לקוחה הגיעה אליי מ...", "מטופל סיפר לי ש...", כל תיאור של תהליך/תוצאה/מקרה של מישהו אחר שפנה לעסק) הוא **לעולם לא "אישי"**, גם אם הוא מנוסח בגוף ראשון ("אליי", "אצלי") - הגוף הראשון כאן מתאר את הקשר בין הלקוח/ה לבעל/ת העסק, לא את החיים האישיים של בעל/ת העסק. סיפור לקוח כזה הוא "מכירתי" אם הוא מציג תוצאה/הוכחה/עדות שמטרתה לשכנע לרכוש, או "בעל ערך" אם הוא משמש כדוגמה להמחשת תובנה/טעות/עיקרון מקצועי בלי דגש מכירתי ישיר. דוגמה קונקרטית: "לא תאמינו שחר הגיעה אליי מבאר שבע עם [בעיה] ותוך [X זמן] הגיעה ל[תוצאה]" - זה **מכירתי** (סיפור הצלחה של לקוחה עם הוכחת תוצאה), **לא אישי**, למרות ה"אליי".

מערכת 2 - שלב שכנוע, בחר/י בדיוק אחד לפי המספר שלו. לשים לב: לכל תוכן יש בדרך כלל שלב שכנוע דומיננטי אחד, גם אם הוא נוגע קצת גם באחרים - תבחר/י את זה שהכי מתאר את המטרה המרכזית של הרעיון הספציפי הזה:
${PERSUASION_STAGES.map((s, i) => `${i + 1}. ${s}: ${PERSUASION_STAGE_DEFINITIONS[s]}`).join('\n')}

השב/י אך ורק ב-JSON תקין בפורמט הבא, בלי שום טקסט נוסף לפני או אחרי - רק שני מספרים שלמים, לא את הטקסט של הקטגוריה/השלב עצמם:
{"categoryIndex": <מספר בין 1 ל-${CATEGORIES.length}>, "persuasionStageIndex": <מספר בין 1 ל-${PERSUASION_STAGES.length}>}`;

  const data = await callAnthropic(
    anthropicApiKey.value(),
    { model: 'claude-haiku-4-5-20251001', max_tokens: 200, messages: [{ role: 'user', content: prompt }] },
    'classifyIdea'
  );

  const text = getResponseText(data) || '{}';
  let parsed;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : text);
  } catch (err) {
    console.error('Failed to parse classifyIdea response:', text);
    throw new HttpsError('internal', 'לא הצלחתי לסווג את הרעיון, נסו שוב');
  }

  // בעבר הותאמו מחרוזות תיאוריות ארוכות בהתאמה מדויקת (.includes) עם ברירת
  // מחדל שקטה לאפשרות הראשונה בכל אי-התאמה - זה יצר הטיה שיטתית ל"שלב
  // שכנוע 1" בכל פעם שה-AI סטה ולו במעט מהמחרוזת המדויקת (רווח, ניסוח
  // שונה וכו'), בלי שום סימן שזו בכלל טעות ולא סיווג אמיתי. מספר שלם קצר
  // הרבה יותר יציב להתאמה, ואי-התאמה עכשיו נכשלת בגלוי ומאפשרת ניסיון
  // חוזר, במקום לתייג בשקט תווית שגויה.
  const categoryIndex = Number(parsed.categoryIndex);
  const stageIndex = Number(parsed.persuasionStageIndex);
  const category = CATEGORIES[categoryIndex - 1];
  const persuasionStage = PERSUASION_STAGES[stageIndex - 1];
  if (!category || !persuasionStage) {
    console.error('classifyIdea returned invalid indices:', text);
    throw new HttpsError('internal', 'לא הצלחתי לסווג את הרעיון, נסו שוב');
  }
  return { category, persuasionStage };
});

exports.generateWarmingPlan = onCall({ secrets: [anthropicApiKey, sheetsServiceAccountKey], region: 'us-central1', timeoutSeconds: 180 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'יש להתחבר כדי להשתמש בתכונה הזו');
  }
  await enforceAllowlist(request.auth.token.email);

  const product = ((request.data && request.data.product) || '').trim();
  const audience = ((request.data && request.data.audience) || '').trim();
  const existingIdeasTitles = (request.data && request.data.existingIdeasTitles) || [];
  let extraContext = (request.data && request.data.extraContext) || '';

  if (!product || !audience) {
    throw new HttpsError('invalid-argument', 'צריך לפחות מוצר וקהל יעד כדי לבנות תוכנית חימום');
  }
  assertMaxLength(product, 500, 'מוצר');
  assertMaxLength(audience, 500, 'קהל יעד');
  assertMaxLength(extraContext, 5000, 'הקשר נוסף');

  await enforceRateLimit(request.auth.uid, 'generateWarmingPlan');

  const linkedContent = await fetchExtraContentLinks(extraContext);
  if (linkedContent && linkedContent.error) {
    throw new HttpsError(
      'failed-precondition',
      'לא הצלחתי לקרוא את קובץ ה-Sheets/Docs שצוין - ודאו שההרשאות שלו מוגדרות ל"כל מי שיש לו את הקישור - צופה" (Anyone with the link - Viewer) ונסו שוב'
    );
  }
  if (linkedContent && !linkedContent.error) {
    extraContext = `${extraContext}\n\nתוכן שנשלף מתוך הקבצים המצורפים (Sheets/Docs):\n${linkedContent.content}`;
  }

  const promptArgs = { product, audience, extraContext, existingIdeasTitles: existingIdeasTitles.slice(0, 40) };

  async function callAndParse(prompt, attempt = 1) {
    const data = await callAnthropic(
      anthropicApiKey.value(),
      { model: 'claude-haiku-4-5-20251001', max_tokens: 4096, messages: [{ role: 'user', content: prompt }] },
      'generateWarmingPlan'
    );
    const text = getResponseText(data) || '{}';
    try {
      const match = text.match(/\{[\s\S]*\}/);
      return JSON.parse(match ? match[0] : text);
    } catch (err) {
      console.error(`Failed to parse generateWarmingPlan response (attempt ${attempt}):`, text);
      // שתי הקריאות (ongoing+presale) רצות יחד ב-Promise.all - כישלון פירוק
      // JSON חד-פעמי באחת מהן מפיל את כל הבקשה ומבזבז את הטוקנים ששתיהן
      // כבר צרכו. ניסיון חוזר יחיד קולט את רוב המקרים החולפים בלי לשלש עלות.
      if (attempt < 2) return callAndParse(prompt, attempt + 1);
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

  // Both prompts run independently and can each flag their own gaps - dedupe
  // since the same missing piece of info (e.g. no real client story) is
  // very likely to show up from both the ongoing and presale generation.
  const missingInfo = [...new Set([...(ongoing.missingInfo || []), ...(presale.missingInfo || [])])];

  return { plan: { week1: ongoing.week1, week2: ongoing.week2, week3: presale.week3 }, missingInfo };
});

exports.generateContentPlan = onCall({ secrets: [anthropicApiKey], region: 'us-central1', timeoutSeconds: 180 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'יש להתחבר כדי להשתמש בתכונה הזו');
  }
  await enforceAllowlist(request.auth.token.email);

  const ideas = (request.data && request.data.ideas) || [];
  const pieceCount = Number(request.data && request.data.pieceCount) || 16;

  if (!Array.isArray(ideas) || ideas.length === 0) {
    throw new HttpsError('invalid-argument', 'צריך לפחות רעיון אחד עם קטגוריה כדי לבנות תכנית תוכן');
  }
  if (pieceCount < 16 || pieceCount > 60) {
    throw new HttpsError('invalid-argument', 'מספר תכנים לא סביר');
  }
  for (const idea of ideas.slice(0, 60)) {
    assertMaxLength((idea && idea.title) || '', 2000, 'כותרת רעיון');
  }

  await enforceRateLimit(request.auth.uid, 'generateContentPlan');

  const prompt = buildContentPlanPrompt({ pieceCount, ideas: ideas.slice(0, 60) });

  const data = await callAnthropic(
    anthropicApiKey.value(),
    { model: 'claude-sonnet-5', max_tokens: 8192, messages: [{ role: 'user', content: prompt }] },
    'generateContentPlan'
  );

  const text = getResponseText(data) || '{}';
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

  return { plan: { weeks: parsed.weeks, seriesNote: parsed.seriesNote || '' } };
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

Object.assign(exports, require('./grow-payment-webhook'));
Object.assign(exports, require('./gift-auto-reply'));
Object.assign(exports, require('./quick-deal'));
Object.assign(exports, require('./seminar-attendees'));
Object.assign(exports, require('./partner-details-form'));
Object.assign(exports, require('./daily-summary'));
Object.assign(exports, require('./seminar-registration-count'));
Object.assign(exports, require('./daily-summary'));
Object.assign(exports, require('./seminar-registration-count'));
