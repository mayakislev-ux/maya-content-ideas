/**
 * טיוטת פידבק לתסריט, בשיטה של מאיה ובקול שלה.
 *
 * מאיה (10/10/2026): "מה שגוזל לי הכי הרבה זמן זה בעיקר בדיקת תסריטים
 * וסרטונים, וזה כל הזמן דגשים די דומים... אשמח שיהיה סוכן שיבדוק לבד
 * אבל לא ישלח להם, ואז בפורטל ניהול שאבוא לבדוק הטיוטה יהיה לי מוכן,
 * וזה יחסוך לי שעות שעות שעות. ושהכל בשפה שלי במילים שלי בשיטה שלי".
 *
 * ========================================================================
 * מאיפה השיטה
 * ========================================================================
 * מתוך 98 פידבקים אמיתיים שהיא כתבה בגיליונות של הלקוחות, 59 מהם עם
 * התסריט שעליו נכתבו ו-45 גם עם הגרסה שנכתבה אחריהם. סדר הבדיקה כאן הוא
 * מה שחזר בהם, והוא אושר על ידה לפני שנבנה משהו.
 * ראו docs/SCRIPT_FEEDBACK_HARVEST.md בפרויקט הפורטל.
 *
 * ========================================================================
 * למה זה כאן ולא בפורטל
 * ========================================================================
 * מפתח ה-AI יושב בפרויקט הזה, ואין סיבה להעתיק אותו. הפורטל קורא לכאן עם
 * אסימון ההתחברות שלו, בדיוק כמו readInsights. הוא זה שקורא את הגיליון,
 * כי רק לו יש הרשאת Sheets, ושולח לכאן טקסט בלבד.
 *
 * ========================================================================
 * מה הפונקציה הזאת לא עושה
 * ========================================================================
 * לא שולחת כלום לאף אחת. היא מחזירה טקסט למסך של מאיה, והיא עורכת
 * ושולחת. זה מה שהיא ביקשה במפורש.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

const PORTAL_PROJECT = 'maya-client-portal';
const OWNER_EMAIL = 'mayakislev@gmail.com';
const MAX_CHARS = 20000;

let portalApp = null;
function portalAuth() {
  if (!portalApp) portalApp = admin.initializeApp({ projectId: PORTAL_PROJECT }, 'script-draft-verify');
  return portalApp.auth();
}

/**
 * סדר הבדיקה. הדבר הכי בולט בפידבקים שלה: היא לא מתקנת למטה כשמשהו
 * שבור למעלה. רפרנס לא מתאים לא מתוקן בניסוחים, הוא מוחלף.
 */
const METHOD = `אלה שמונת השלבים, לפי הסדר. עוצרים בשלב הראשון שנכשל ולא ממשיכים לדייק מתחתיו.

1. יש הוק ורפרנס? בלעדיהם אין מה לבדוק, כי הכל נבנה עליהם. אם חסר, מבקשים אותם ולא מפדבקים.
2. הרפרנס מתאים לקהל? רפרנס שמלמד פעולה מקצועית למי שכבר בתחום לא ניתן לשכפל לקהל שעוד לא נכנס אליו. אם לא מתאים: להחליף רפרנס, לא לתקן תסריט.
3. זה קהל היעד שהוגדר? אם לא: להגיש תסריט חדש.
4. שוכפל הרעיון או רק המילים? זה הכלל המרכזי. קודם משכפלים את המנגנון של הסרטון, ורק כשהרעיון עומד בפני עצמו כותבים. שכפול טכני של מילים ומבנה הוא הכשל הנפוץ ביותר.
5. ההמשך נאמן למנגנון? מתארים צעד אחר צעד מה הסרטון המקורי עושה, ומצביעים על המשפט המדויק שבו התסריט התחיל להתרחק. הנטייה החוזרת היא להסביר יותר מדי במקום להוריד למצבים מוחשיים.
6. חוק הספציפיות. כללי וסיסמתי לא עובד. לא מסתפקים בהנחיה "תהיי ספציפית", אלא כותבים את הגרסה הספציפית במקומה, ממוספרת.
7. אורך ושומן. גם תסריט טוב מתקצר בערך בשליש: חזרתיות ופרטים שלא נדרשים להבנה. כלי כתיבה נוטים לנפח.
8. הערת ביצוע. כשמאושר, מוסיפים איך לצלם: זווית, וויס אובר, ומה הסרטון הבא.`;

const VOICE = `הקול של מאיה, מתוך מה שהיא באמת כותבת:

- פותחת בשבח אמיתי ובשם הפרטי. "אלופה", "מצוינתתתת", "גאה בך". גם כשכל השאר תיקון.
- מנסחת תיקון כ"הייתי..." ולא כ"תעשי". ההחלטה נשארת אצל הלקוחה.
- מצטטת את המקור ואת הגרסה של הלקוחה זה מול זה, כדי שההבדל ייראה ולא רק יוסבר.
- נותנת דוגמאות כתובות וממוספרות, לא הנחיות מופשטות.
- מזהה דפוס חוזר אצל אותה לקוחה ואומרת אותו בפה מלא.
- סוגרת בפעולה אחת ברורה או בעידוד אמיתי. אף פעם לא בשתיקה.
- כותבת בגוף שני נקבה, בעברית מדוברת, בלי מקף ארוך.`;

/**
 * שני דברים שחוזרים בפידבקים שלה והם שיפוט שלה ולא כלל. הסוכן מסמן
 * אותם ומעביר אליה במקום להמציא.
 */
const ESCALATE = `שני דברים שאסור להכריע בהם:

- מיהו קהל היעד כשהלקוחה מתלבטת בין שני קהלים.
- ציר חזק יותר מתוך סיפור החיים האישי שלה.

אם אחד מהם נדרש, לכתוב את הטיוטה עד הנקודה הזאת ולסמן בסופה שורה
שמתחילה ב"צריך אותך:" ומסבירה מה ההכרעה שנדרשת.`;

/** סרטון בידורי או טרנד לא צריך תסריט מראש, והיא מאשרת אותו מיד */
const FUN_RULE = `אם סוג הסרטון הוא בידורי או שזה טרנד: מאיה לא מבקשת תסריט מראש על
סרטונים כאלה. הטיוטה צריכה לאשר בקצרה ולהציע להעלות, בלי ביקורת מפורטת.`;

function buildPrompt({ block, history }) {
  const prior = (history || [])
    .filter((h) => h && h.feedback && h.feedback.length > 80)
    .slice(0, 4)
    .map((h, i) => `--- פידבק קודם ${i + 1} שמאיה כתבה לאותה לקוחה ---\n${h.feedback}`)
    .join('\n\n');

  return `את כותבת טיוטת פידבק על תסריט, בשביל מאיה כסלב, מאמנת שיווק.
הטיוטה הזאת לא נשלחת לאף אחת: מאיה קוראת אותה, עורכת, ושולחת בעצמה.

${METHOD}

${VOICE}

${ESCALATE}

${FUN_RULE}

${prior ? `כך מאיה כתבה לאותה לקוחה בעבר. זה המקור הכי טוב לקול ולדפוסים שחוזרים אצלה:\n\n${prior}\n` : ''}
התסריט שצריך לפדבק:

כותרת: ${block.title || '(אין)'}
רעיון התסריט: ${block.idea || '(לא מולא)'}
סוג הסרטון: ${block.videoType || '(לא מולא)'}
פורמט: ${block.format || '(לא מולא)'}
הנעה לפעולה: ${block.cta || '(לא מולא)'}

התסריט עצמו:
${block.body || '(ריק)'}

כתבי את הטיוטה בלבד, כאילו מאיה כותבת אותה ללקוחה. בלי כותרות, בלי
הסברים עלייך, ובלי להזכיר שזאת טיוטה.`;
}

exports.buildPrompt = buildPrompt;
exports._internal = { METHOD, VOICE, ESCALATE, FUN_RULE };

exports.draftScriptFeedback = onCall(
  { secrets: [anthropicApiKey], region: 'us-central1', timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    const idToken = request.data?.idToken;
    if (typeof idToken !== 'string' || idToken.length < 100 || idToken.length > 5000) {
      throw new HttpsError('invalid-argument', 'ההתחברות לא תקינה. רעננו את הדף ונסו שוב');
    }
    let decoded;
    try {
      decoded = await portalAuth().verifyIdToken(idToken);
    } catch (err) {
      console.warn('draftScriptFeedback: bad portal token', err.code || err.message);
      throw new HttpsError('unauthenticated', 'פג תוקף ההתחברות. רעננו את הדף ונסו שוב');
    }
    if (String(decoded.email || '').toLowerCase() !== OWNER_EMAIL || decoded.email_verified !== true) {
      throw new HttpsError('permission-denied', 'התכונה הזו עדיין לא זמינה');
    }

    const block = request.data?.block;
    if (!block || typeof block !== 'object' || !String(block.body || '').trim()) {
      throw new HttpsError('invalid-argument', 'אין תסריט לבדוק');
    }
    const prompt = buildPrompt({ block, history: request.data?.history });
    if (prompt.length > MAX_CHARS) {
      throw new HttpsError('invalid-argument', 'התסריט ארוך מדי לבדיקה אוטומטית');
    }

    let text = '';
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: AbortSignal.timeout(90000),
        headers: {
          'x-api-key': anthropicApiKey.value(),
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-opus-5-5',
          max_tokens: 1800,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.error('draftScriptFeedback: Anthropic error', res.status, body.slice(0, 200));
        throw new HttpsError('internal', 'לא הצלחנו להכין טיוטה. אפשר לנסות שוב');
      }
      const data = await res.json();
      text = (data.content || []).map((c) => c.text || '').join('').trim();
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error('draftScriptFeedback failed', err.message);
      throw new HttpsError('internal', 'לא הצלחנו להכין טיוטה. אפשר לנסות שוב');
    }

    if (!text) throw new HttpsError('internal', 'הטיוטה חזרה ריקה. אפשר לנסות שוב');
    /* "צריך אותך:" הוא הסימן שהסוכן נתקל בהכרעה ששייכת למאיה */
    const needsMaya = /צריך אותך:/.test(text);
    console.log('draftScriptFeedback done', { chars: text.length, needsMaya });
    return { draft: text, needsMaya };
  },
);
