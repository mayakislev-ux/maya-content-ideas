/**
 * קריאת נתוני Reel מצילום מסך של Instagram Insights.
 *
 * 09/10/2026 (מאיה): "אני רוצה סריקה, יותר מהיר וקל בלי מאמץ, אבל שיעשה
 * סריקה מדויקת, אין מה לטעות יותר מדי".
 *
 * הפונקציה הזאת חיה כאן ולא בפורטל מסיבה אחת: מפתח ה-AI נמצא כאן, ואין
 * שום סיבה להעתיק אותו לפרויקט שני. הפורטל קורא לכאן עם אסימון ההתחברות
 * שלו, בדיוק כמו שכבר עובדת הכניסה בין שתי המערכות (ראו portal-sso).
 *
 * ========================================================================
 * הכלל שמעצב את כל הקובץ
 * ========================================================================
 * מסכי Insights נראים שונה באייפון ובאנדרואיד, בעברית ובאנגלית, ובין
 * גרסאות. מודל ראייה יקרא את רוב המספרים נכון ויטעה בחלק.
 *
 * וטעות בקריאה גרועה יותר מהקלדה ידנית, כי אף אחד לא יודע שהיא קרתה.
 * לכן:
 *   - שדה שלא נקרא בוודאות מוחלטת חוזר null. אף פעם לא ניחוש.
 *   - לכל שדה שנקרא מוחזר גם הטקסט המדויק שנראה במסך, כדי שאפשר יהיה
 *     להשוות בעין.
 *   - אם חסרים מדדים, הפונקציה אומרת איזה מסך צריך לצלם כדי להשלים.
 *   - בצד הלקוחה המספרים מוצגים לאישור לפני שמאבחנים עליהם.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

const PORTAL_PROJECT = 'maya-client-portal';
const OWNER_EMAIL = 'mayakislev@gmail.com';
const MAX_IMAGES = 12;
/** 5MB לתמונה אחרי קידוד. צילום מסך של טלפון הוא בדרך כלל חמישית מזה. */
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

let portalApp = null;
function portalAuth() {
  if (!portalApp) portalApp = admin.initializeApp({ projectId: PORTAL_PROJECT }, 'insights-verify');
  return portalApp.auth();
}

/** השדות שאנחנו מנסים לקרוא. הסדר הוא סדר החשיבות לאבחון. */
const FIELDS = [
  ['reach', 'Accounts reached / חשבונות שהגיעו אליהם'],
  ['views', 'Views / Plays / צפיות'],
  ['lengthSec', 'אורך ה-Reel בשניות'],
  ['avgWatchSec', 'Average watch time / זמן צפייה ממוצע, בשניות'],
  ['retention3s', 'אחוז הצופים שנשארו אחרי 3 השניות הראשונות, אם מוצג גרף או מספר'],
  ['likes', 'Likes / לייקים'],
  ['comments', 'Comments / תגובות'],
  ['shares', 'Shares / שיתופים'],
  ['saves', 'Saves / שמירות'],
  ['nonFollowerPct', 'אחוז הצפיות ממי שאינם עוקבים'],
  ['follows', 'Follows מה-Reel'],
];

const PROMPT = `אתה קורא צילום מסך של Instagram Insights של Reel אחד, ומחזיר את המספרים שמופיעים בו.

השדות:
${FIELDS.map(([k, d]) => `- ${k}: ${d}`).join('\n')}

חוקים שאסור להפר:

1. **אל תנחש.** שדה שאינו מופיע בבירור בצילום, או שאינך בטוח בו לחלוטין, חוזר null. עדיף null מאשר מספר שגוי.
2. **אל תחשב ואל תגזור.** אם מופיע "15s" כאורך ו"8s" כזמן צפייה, אל תחשב אחוזים. רק מה שכתוב.
3. **קיצורים מתורגמים למספר מלא.** 12.4K הוא 12400. 1.2M הוא 1200000.
4. **אחוזים חוזרים כמספר בלבד**, בלי סימן. 68% הוא 68.
5. **זמנים חוזרים בשניות.** 0:14 הוא 14.
6. לכל שדה שקראת, החזר גם את הטקסט המדויק שראית במסך, כדי שאפשר יהיה להשוות בעין.

החזר JSON בלבד, בלי שום טקסט לפניו ואחריו, במבנה:
{
  "values": { "reach": 15000, "views": null, ... },
  "seen": { "reach": "15K", ... },
  "screen": "overview" או "retention" או "other",
  "notes": "משפט קצר בעברית אם משהו חריג בצילום, אחרת מחרוזת ריקה"
}

"screen" מתאר מה הצילום מראה: overview הוא מסך הסיכום עם החשיפה והאינטראקציות, retention הוא גרף הצפייה לאורך הסרטון.`;

/** מספר הקריאות שרצות במקביל */
const CONCURRENCY = 4;

/**
 * מריץ job על כל פריט, עד limit במקביל, ומחזיר את התוצאות בסדר המקורי.
 * כתוב ביד כדי לא להוסיף תלות לפונקציה שרצה בענן.
 */
async function runPool(items, job, limit) {
  const out = new Array(items.length);
  let next = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      out[i] = await job(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

function cleanNumber(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

/** מה חסר, ואיזה מסך ישלים אותו */
function whatIsMissing(values) {
  const missing = [];
  if (values.reach === null && values.views === null) {
    missing.push({ field: 'reach', hint: 'מסך הסיכום של ה-Reel, שבו מופיעים החשיפה והצפיות.' });
  }
  if (values.lengthSec === null) {
    missing.push({ field: 'lengthSec', hint: 'אורך הסרטון. אפשר לראות אותו על הסרטון עצמו.' });
  }
  if (values.avgWatchSec === null && values.retention3s === null) {
    missing.push({
      field: 'watch',
      hint: 'מסך הצפייה, שבו מופיעים זמן הצפייה הממוצע או גרף הנשירה. בלעדיו אפשר לאבחן רק חלקית.',
    });
  }
  return missing;
}

/* מיוצאים לבדיקה: אלה החלקים שאפשר לבדוק בלי רשת ובלי מודל */
exports.cleanNumber = cleanNumber;
exports.whatIsMissing = whatIsMissing;
exports.FIELDS = FIELDS;
exports.PROMPT = PROMPT;
exports.runPool = runPool;
exports.CONCURRENCY = CONCURRENCY;

exports.readInsights = onCall(
  { secrets: [anthropicApiKey], region: 'us-central1', timeoutSeconds: 300, memory: '512MiB' },
  async (request) => {
    /* ---- מי מדבר ---- */
    const idToken = request.data?.idToken;
    if (typeof idToken !== 'string' || idToken.length < 100 || idToken.length > 5000) {
      throw new HttpsError('invalid-argument', 'ההתחברות לא תקינה. רעננו את הדף ונסו שוב');
    }
    let decoded;
    try {
      decoded = await portalAuth().verifyIdToken(idToken);
    } catch (err) {
      console.warn('readInsights: bad portal token', err.code || err.message);
      throw new HttpsError('unauthenticated', 'פג תוקף ההתחברות. רעננו את הדף ונסו שוב');
    }
    if (String(decoded.email || '').toLowerCase() !== OWNER_EMAIL || decoded.email_verified !== true) {
      throw new HttpsError('permission-denied', 'התכונה הזו עדיין לא זמינה');
    }

    /* ---- מה הגיע ---- */
    const images = Array.isArray(request.data?.images) ? request.data.images : [];
    if (!images.length) throw new HttpsError('invalid-argument', 'לא הגיע שום צילום מסך');
    if (images.length > MAX_IMAGES) {
      throw new HttpsError('invalid-argument', `אפשר עד ${MAX_IMAGES} צילומים בבת אחת`);
    }
    for (const img of images) {
      if (!ALLOWED_TYPES.includes(img?.type)) {
        throw new HttpsError('invalid-argument', 'אפשר להעלות רק תמונות: PNG, JPG או WEBP');
      }
      if (typeof img.data !== 'string' || img.data.length > MAX_BYTES * 1.4) {
        throw new HttpsError('invalid-argument', 'אחד הצילומים גדול מדי. צילום מסך רגיל מהטלפון תמיד מתאים');
      }
    }

    /* ---- קריאה, כל תמונה בנפרד כדי שלא יתערבבו ---- */
    /* 09/10/2026: עד שנים עשר צילומים בבקשה אחת, כי כל סרטון מגיע בשניים.
       בטור זה היה חורג מהזמן, ולכן ארבע קריאות במקביל, וכל אחת עומדת
       בפני עצמה: צילום שנכשל לא מפיל את השאר. */
    async function readOne(img, i) {
      let parsed = null;
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          signal: AbortSignal.timeout(45000),
          headers: {
            'x-api-key': anthropicApiKey.value(),
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-5',
            max_tokens: 1200,
            messages: [{
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: img.type, data: img.data } },
                { type: 'text', text: PROMPT },
              ],
            }],
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          console.error('readInsights: Anthropic error', res.status, body.slice(0, 200));
          return { index: i, ok: false, error: 'לא הצלחנו לקרוא את הצילום הזה' };
        }
        const data = await res.json();
        const text = (data.content || []).map((c) => c.text || '').join('');
        const from = text.indexOf('{');
        const to = text.lastIndexOf('}');
        if (from === -1 || to === -1) throw new Error('no json');
        parsed = JSON.parse(text.slice(from, to + 1));
      } catch (err) {
        console.error('readInsights: read failed', err.message);
        return { index: i, ok: false, error: 'לא הצלחנו לקרוא את הצילום הזה' };
      }

      /* ערך שלא הוחזר כמספר תקין הופך ל-null. בלי ניחושים. */
      const values = {};
      FIELDS.forEach(([key]) => { values[key] = cleanNumber(parsed?.values?.[key]); });

      return {
        index: i,
        ok: true,
        values,
        /* מה המודל ראה במסך, מילה במילה, כדי שאפשר יהיה להשוות בעין */
        seen: parsed?.seen && typeof parsed.seen === 'object' ? parsed.seen : {},
        screen: typeof parsed?.screen === 'string' ? parsed.screen : 'other',
        notes: typeof parsed?.notes === 'string' ? parsed.notes.slice(0, 200) : '',
        missing: whatIsMissing(values),
      };
    }

    const out = await runPool(images, readOne, CONCURRENCY);

    const readable = out.filter((r) => r.ok).length;
    console.log('readInsights done', { images: images.length, readable });
    return { reels: out };
  }
);
