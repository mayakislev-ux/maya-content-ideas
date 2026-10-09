/* מפעל התוכן הלילי.
 *
 * 09/10/2026 (מאיה, הכי דחוף ברשימת החמישים): "חיפוש רעיונות לתוכן לעסק"
 * לוקח לה שעתיים בשבוע, ומפעל התוכן נועד להחליף אותן. כל לילה נבחרים
 * רפרנסים מהמאגר שעוד לא שוכפלו, שיטת השכפול שלה מופעלת עליהם, ובבוקר
 * מחכים לה שלושה תסריטים מוכנים בקול שלה, בלשונית שיווק בפורטל.
 *
 * למה זה עובד דווקא אצלה: השיטה כבר כתובה ומסודרת (שכפול רגיל ושכפול
 * הפוך), והמאגר כבר מלא ברפרנסים אמיתיים עם תמלול ותרגום. אין כאן
 * המצאה, יש אוטומציה של מה שהיא כבר עושה ביד.
 *
 * מה הוא לא עושה: הוא לא סורק את האינטרנט לבד. אין API ציבורי לטיקטוק
 * ולאינסטגרם, ולכן הוא עובד מהמאגר שמאיה מזינה.
 *
 * 09/10/2026, אחרי בדיקת שלושת התוצרים הראשונים: שניים מהם לא היו
 * שמישים. אחד היה החלפת מילים מכנית של פרסומת להרמת ריסים, ואחד היה
 * ראיון רחוב שבלי המקור הוא פשוט לא מובן. שניהם גם הכילו קו מפריד ארוך,
 * שמאיה אסרה בכל טקסט יוצא. מכאן יש שער איכות: תוצר נפסל ונרשם, הרפרנס
 * מסומן כלא מתאים כדי שלא יישרף שוב, והמפעל ממשיך לרפרנס הבא עד שיש
 * שלושה תסריטים שעוברים.
 */
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');
const greenApiIdInstance = defineSecret('GREEN_API_ID_INSTANCE');
const greenApiTokenInstance = defineSecret('GREEN_API_TOKEN_INSTANCE');
/* 09/10/2026 (מאיה: "זה צריך להיות מרוכז בפורטל ניהול תחת לשונית שיווק"):
   התוצר נכתב לפורטל, שם היא עובדת, ולא רק לכאן. אותו סוד משותף שבו
   כבר משתמשים quick-deal ו-grow-payment-webhook. */
const portalSecret = defineSecret('EXTERNAL_SALE_SECRET');
const PORTAL_SCRIPT_URL = 'https://us-central1-maya-client-portal.cloudfunctions.net/recordMarketingScript';

const MAYA_CHAT_ID = '972525533679@c.us';
const MODEL = 'claude-sonnet-5';
const HOW_MANY = 3;
/* כמה רפרנסים מותר לנסות בשביל שלושה תוצרים טובים. שער האיכות פוסל,
   ובלי מרווח כזה בוקר אחד פשוט יוצא ריק. */
const MAX_TRIES = 9;
/* תמלול של 290 תווים הפיק תסריט של 269 תווים, כלומר כלום. */
const MIN_REF_TEXT = 500;
const MIN_SCRIPT = 300;
/* 10/10/2026, מהביקורת: הטריגר הידני היה מוגן במילה "maya" על כתובת
   שנגזרת משם הפרויקט ומשם הפונקציה, כלומר ניחוש של שתי מילים, בזמן שכל
   קריאה יכולה להוציא עד שמונה עשרה קריאות ל-Anthropic וגם לשלוח לה
   וואטסאפ. עכשיו יש מפתח ארוך, תקרה של שלוש הרצות ידניות ביום, ומופע
   אחד בלבד במקביל. הדפוס הנכון לגמרי הוא onCall עם בדיקת מייל, כמו
   classifyInspirationFormats, וזה שינוי שמחכה לאישור של מאיה כי הוא
   מבטל את האפשרות להפעיל מכתובת בדפדפן. */
const MANUAL_KEY = '8cd9dd930910001365d33a48930453c8';
const MANUAL_RUNS_PER_DAY = 3;
/* פסילה תלויה בפרומפט שבו היא נעשתה. כששער האיכות או בנק העובדות
   משתנים, פסילה ישנה היא מידע מיושן, ורפרנס שנפסל פעם חוזר להיות
   מועמד. בלי המספר הזה הייתי צריכה למחוק פסילות ביד בכל שיפור. */
const PROMPT_VERSION = 7;

/* שיטת השכפול, כפי שמאיה כתבה אותה. זה לא תקציר שלי: אלה הכללים
   שהיא מלמדת, ובלעדיהם התסריט יוצא גנרי. */
const METHOD = `שיטת השכפול של מאיה קיסלב:
- לוקחים סרטון שכבר עבד, מפרקים את המנגנון שלו, ומכניסים לתוכו את הרעיון והקהל שלנו.
- קודם מבינים מה בעצם קורה בסרטון: מה הפתיחה עושה, מה הגוף עושה, איך הוא נסגר.
- משכפלים את המנגנון אחד לאחד: אותו מבנה, אותו אורך, אותו מספר ביטים.
- ההוק הוא מצב, לא הכרזה על נושא. הוא מתאר סיטואציה שהצופה מזהה את עצמו בה.
- חוק הספציפיות: מספר, שם, תאריך או פרט אמיתי עדיפים על תיאור כללי.
- לא ממציאים עובדות, לא ממציאים סיפורים אישיים ולא ממציאים תוצאות של לקוחות.
- עברית מדוברת. אם משפט לא נאמר בקול בשיחה אמיתית, הוא לא נכנס.`;

/* מי מאיה, כדי שהתסריט יישמע כמוה ולא כמו כל אחד. הפרטים כאן מתוך
   תיעוד הקול שלה, לא ניחוש: משפטים ארוכים עם פסיקים שרצים כמו מחשבה
   אחת, דימוי גופני ובוטה במקום תיאור מופשט, ושאלות קצרות כל אחת בשורה. */
const VOICE = `הקול של מאיה קיסלב:
- אסטרטגית שיווק ומותג אישי. מלווה בעלי עסקים קטנים שכבר משווקים ולא רואים תוצאות.
- ישירה, בלי ריכוך ובלי מליצות. אומרת את הדבר עצמו במשפט הראשון.
- מדברת מהצד של בעלת העסק שמתוסכלת, לא מהצד של המומחית שמסבירה מלמעלה.
- משפטים ארוכים עם פסיקים, שרצים כמו מחשבה אחת ולא מפורקים למשפטים נקיים וקצרים.
- דימוי קונקרטי ובוטה עדיף על תיאור מנומס. היא תכתוב "יושבים באסלה וגוללים בטלפון" ולא "אנשים עייפים גוללים".
- כשהיא רוצה להמחיש מה עובר בראש של הקהל, היא מניחה שלוש שאלות קצרות, כל אחת בשורה נפרדת.
- מילים שלה: בגדול, רגע, יאללה, פספוס ענק, לעוף, להתפוצץ. לא "להצליח" ולא "לקבל חשיפה".
- לא משתמשת במילים "קסם", "סוד", "פריצת דרך".
- הקהל: בעלי עסקים קטנים בישראל, רובם נשים, שמוציאים תוכן ולא מקבלים לידים.`;

/* 09/10/2026: ההרצה הראשונה עם שער האיכות פסלה שבעה מתוך תשעה רפרנסים
   בנימוק אחד, "אין לי עובדות אמיתיות על מאיה או על לקוחות שלה". זה היה
   נימוק נכון, וחלק גדול מהמאגר שלה בנוי בדיוק על מנגנון של סיפור אישי
   או סיפור לקוחה. התשובה היא לא לרכך את האיסור להמציא, אלא לתת לו את
   החומר האמיתי. כל מספר כאן נאמר על ידי מאיה, והמגבלות שבסוף הן מגבלות
   שלקוחות ביקשו במפורש. */
const FACTS = `עובדות אמיתיות שמותר להשתמש בהן, ורק בהן:

מאיה עצמה:
- העסק הראשון שלה נתקע על 2,000 שקל בחודש, אחרי שהוציאה יותר מ-100,000 שקל על קורסים.
- אחר כך הגיעה מאפס ל-120,000 שקל בחודש בתוך עשרה חודשים.

לקוחות:
- רון בובליל, מעצבת פנים. לפני: הוציאה כ-90,000 שקל על ייעוצים וליווים שלא עבדו, אפס לידים מאינסטגרם, כל ההכנסה מפה לאוזן. אחרי: מ-15,000 ל-45,000 שקל בחודש, בתוך חודשיים. מנסחים את זה כתהליך שנמצא בעיצומו, לא כסוף סופי.
- ליאל. מ-10,000 ל-50,000 שקל, בתוך שלושה חודשים. לפני: כל הליד הגיע מסטטוסים בוואטסאפ ומפה לאוזן, והלידים מאינסטגרם היו קרים ומתישים.
- אורי אמסלם. לפני: אפס קורסים ועסק לא יציב. אחרי: אקדמיית ביוטי שמוכרת קורסים באופן קבוע, בלי שקל על פרסום ממומן.
- ליאור עזר. הגיעה עם מוצר חדש ובלי מושג איך לשווק אותו, והיום יש שתי סניפים והקורסים נמכרים.
- ירוסלבה (סלבה) סטפנוב, צלמת תדמית. לפני: שיווקה את התמונות שלה ולא את עצמה, חשבה שהיא לא מעניינת מספיק, 2,830 עוקבים. אחרי: 4,593 עוקבים, לידים חמים אורגניים, בלי ממומן.
- שרה. מאלף צפיות למאות אלפים, ולידים אורגניים.

מגבלות קשות:
- אסור להמציא מספר, אסור להמציא טווח זמן, ואסור להמציא שם של לקוחה. מה שלא כתוב כאן, לא קיים.
- אסור לציין סכום כספי של סלבה, ואסור לציין סכום כספי או הכנסה של שרה. הן ביקשו במפורש. אצלן מדברים רק על צפיות, עוקבים ולידים.
- ולכן, אם את מזכירה את סלבה או את שרה, אל תכתבי שום סכום כספי באותה פסקה, גם לא סכום של מאיה ולא של לקוחה אחרת. אם התסריט חייב סכום, בחרי לקוחה אחרת.
- אסור להמציא איך תוצאה הושגה. אם כתוב שלקוחה עברה מאלף צפיות למאות אלפים, זה מה שידוע, ואסור להוסיף סיפור על מה עשינו בדיוק כדי להגיע לזה.
- נכסים שקיימים ואפשר להפנות אליהם: שאלון אבחון חינמי בפרופיל, הודעה פרטית, ועקיבה אחרי העמוד. זה הכול. אסור להבטיח שיעור חינמי, מדריך, רשימה, קובץ, אוסף או וובינר, וגם לא "כתבי מילה בתגובות ואשלח לך", כי אין נכס כזה והיא תיתקע עם הבטחה שאינה יכולה לקיים.
- על החיים הפרטיים של מאיה אין מידע מעבר למה שכתוב כאן. מנגנון שדורש סיפור אינטימי, ילדות, משפחה, הורים או משבר זוגי, הוא מנגנון שלא מתאים, ואז מחזירים "לא מתאים".
- אבל מנגנון של ציר זמן, "לפני ואחרי" או סיפור אישי עסקי, כן מתאים, ומשכפלים אותו על הציר האמיתי שכתוב למעלה: עסק ראשון תקוע על 2,000 שקל, יותר מ-100,000 שקל שהלכו על קורסים, ואחר כך מאפס ל-120,000 שקל בעשרה חודשים. זה סיפור אישי אמיתי ומותר להישען עליו, כולל בתסריט שמדבר בגוף ראשון. מה שאסור זה להוסיף לו תחנות, גילאים או סכומים שלא כתובים כאן.`;

/* השער שנולד מהתוצרים הגרועים. כל סעיף כאן הוא כלל שנשבר בפועל. */
const GUARD = `כללי פסילה. אם אחד מהם נשבר, התוצר לא שמיש:
- אסור קו מפריד ארוך, לא זה ולא אחיו הקצר ממנו. רק פסיק, נקודה או נקודתיים. בדיאלוג מסמנים דובר בשם שלו.
- התסריט חייב להיות מובן למי שלא ראה את הסרטון המקורי. אם הוא מובן רק בהשוואה למקור, הוא נכשל.
- אסור להחליף מילים מכנית. אם שכפול המנגנון מחייב פרסומת למוצר או לטיפול, וההקבלה בעולם של מאיה יוצאת מאולצת, זה נכשל.
- אסור להמציא תוצאה של לקוחה, אסור להמציא טווח זמן לתוצאה, ואסור להבטיח מה יקרה.
- התסריט חייב להיפתח בשורת ההוק עצמה, מילה במילה. תסריט שמתחיל באמצע מחשבה, בלי ההוק, נכשל.
- פונים לצופה בלשון נוכחת יחיד, "את", כי הקהל הוא בעיקר בעלות עסק. לא "אתם" ולא "שמתם לב". חריג אחד: אם המקור בנוי כדיאלוג בין שני דוברים, משכפלים דיאלוג.

אם המנגנון של הסרטון הזה לא יכול לשאת תוכן אמיתי של מאיה בלי לשבור את הכללים האלה, אל תכתבי תסריט בכוח. החזירי שורה אחת בלבד:
לא מתאים: [סיבה בחצי שורה]`;

async function askClaude(prompt, key) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    /* 10/10/2026, מהביקורת: לקריאה לא היה שום גבול זמן, ולכן שתי קריאות
       איטיות יכלו לחתוך את כל הריצה אחרי שכבר שילמנו עליהן. */
    signal: AbortSignal.timeout(100000),
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      /* 10/10/2026: שתי קריאות חזרו בלי טקסט עם stop=max_tokens ובלוק
         אחד, כלומר התקציב נגמר לפני שיצא תסריט. 4000 היה צפוף לתסריט
         ארוך ולמנגנון וגם להנגשה. */
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = (data.content || []).map((c) => c.text || '').join('').trim();
  /* 10/10/2026: קריאה אחת חזרה בלי שום טקסט, ואני רשמתי את זה כ"אין הוק",
     כלומר האשמתי את התוצר במקום לדעת שלא היה תוצר. עכשיו זה נופל בקול
     עם הסיבה שהמודל עצמו דיווח. */
  if (!text) throw new Error(`anthropic empty: stop=${data.stop_reason || '?'} blocks=${(data.content || []).length}`);
  return text;
}

/* 10/10/2026, מהביקורת: לקריאה לא היה try, והערך החוזר לא נקרא אף פעם.
   תקלה רגעית ב-Green API הפכה ריצה שיצרה שלושה תסריטים לריצה שנרשמה
   ככושלת, ומאיה לא קיבלה כלום. */
async function notify(message) {
  try {
    const url = `https://api.green-api.com/waInstance${greenApiIdInstance.value()}/SendMessage/${greenApiTokenInstance.value()}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: MAYA_CHAT_ID, message }),
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.text();
    const ok = body.includes('"idMessage"');
    if (!ok) console.error('nightlyScripts: whatsapp refused', body.slice(0, 200));
    return ok;
  } catch (err) {
    console.error('nightlyScripts: whatsapp failed', err?.message);
    return false;
  }
}

/* תקרה להרצות ידניות, ביום לפי שעון ישראל. מונע מצב שבו מי שניחש את
   הכתובת מריץ אותה שוב ושוב ושורף כסף על Anthropic. */
async function takeManualRun(db) {
  const day = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
  const ref = db.collection('nightlyRuns').doc(day);
  const snap = await ref.get();
  const used = Number(snap.exists ? snap.data().manual : 0) || 0;
  if (used >= MANUAL_RUNS_PER_DAY) return false;
  await ref.set({ manual: used + 1, at: FieldValue.serverTimestamp() }, { merge: true });
  return true;
}

/* שליחה אחת לפורטל, במקום אחד, כדי שגם הדחיפה החוזרת תשתמש בה. */
async function pushToPortal(script, ref) {
  try {
    const sent = await fetch(PORTAL_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sale-secret': portalSecret.value() },
      body: JSON.stringify({
        mechanism: script.mechanism || '',
        hook: script.hook || '',
        script: script.script || '',
        production: script.production || '',
        refId: script.refId || '',
        refUrl: script.refUrl || ref.url || '',
        refDomain: script.refDomain || ref.domain || '',
        refThumb: ref.thumbnailUrl || '',
        refText: (ref.translationHe || ref.transcriptHe || '').slice(0, 7000),
        source: 'nightly',
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (sent.ok) return true;
    console.error('nightlyScripts: portal refused', sent.status, (await sent.text()).slice(0, 200));
    return false;
  } catch (err) {
    console.error('nightlyScripts: portal post failed', err?.message);
    return false;
  }
}

/* 10/10/2026: מדדתי את המאגר. 453 רפרנסים, 200 מהם עם תמלול של 500
   תווים ומעלה, והם מתחלקים לשישה תחומים. כל תשע הפסילות הראשונות באו
   מתחומים של סיפור חיים, רוח ומיסטיקה, שבהם המנגנון דורש ביוגרפיה
   שאין. מיון לפי אורך דווקא דחף אותם לראש התור. מכאן התחום קובע את
   הסדר, והאורך הוא רק רצפה. */
const DOMAIN_RANK = {
  'עסקים ויזמות': 0,
  'יופי וקוסמטיקה': 1,
  'עיצוב, נדל"ן ואדריכלות': 1,
  'כושר ותזונה': 2,
  'תוכן אישי וחיבור': 3,
  'בריאות נפשית, טיפול ורוח': 4,
};

function pickReferences(docs, used, howMany, options) {
  const usable = docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((v) => {
      const text = v.translationHe || v.transcriptHe || '';
      /* 10/10/2026, מהביקורת: הפורטל דורש refUrl ודוחה בלעדיו, ולכן
         רפרנס בלי כתובת שילם על קריאה ל-Anthropic ולא הגיע לשום מקום. */
      return text.trim().length >= MIN_REF_TEXT && !used.has(v.id) && !!v.url;
    });
  /* ערבוב יציב לפי היום, כדי ששתי הרצות באותו יום ייתנו אותו דבר
     ושימים שונים ייתנו רפרנסים שונים.
     10/10/2026, מהביקורת: קודם היה כאן (a.id + seed < b.id + seed), כלומר
     שרשור אותה סיומת לשני הצדדים, שלא משנה את ההשוואה בכלל. זה היה מיון
     אלפביתי טהור, ואותם רפרנסים חזרו לראש התור כל לילה. עכשיו זה חשיב
     אמיתי של המזהה יחד עם התאריך. */
  const seed = (options && options.seed) || new Date().toISOString().slice(0, 10);
  const hash = (text) => {
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  const order = new Map(usable.map((v) => [v.id, hash(v.id + seed)]));
  usable.sort((a, b) => order.get(a.id) - order.get(b.id) || (a.id < b.id ? -1 : 1));
  const rank = (v) => (v.domain in DOMAIN_RANK ? DOMAIN_RANK[v.domain] : 2);
  usable.sort((a, b) => rank(a) - rank(b));
  return usable.slice(0, howMany);
}

function buildPrompt(ref) {
  const text = (ref.translationHe || ref.transcriptHe || '').slice(0, 6000);
  return `${METHOD}

${VOICE}

${FACTS}

${GUARD}

להלן תמלול של סרטון רפרנס שעבד. שכפלי אותו לעולם של מאיה.

תחום הרפרנס: ${ref.domain || 'לא צוין'}
פורמט: ${(ref.formatTags || []).join(', ') || 'לא צוין'}
זווית: ${(ref.angleTags || []).join(', ') || 'לא צוין'}

--- התמלול ---
${text}
--- סוף התמלול ---

אם זה מתאים, החזירי בדיוק במבנה הזה, בלי שום טקסט נוסף לפני או אחרי:

מנגנון: [משפט אחד, מה בעצם קורה בסרטון המקורי ומה גורם לו לעבוד]
הוק: [שורת הפתיחה המשוכפלת, בעולם של מאיה]
תסריט:
[התסריט המלא, באותו מבנה ובאותו אורך כמו המקור]
הנגשה: [משפט אחד, איך לצלם את זה ויזואלית, לפי איך שהמקור הונגש]`;
}

/* 10/10/2026: הפרסור הקודם דרש בדיוק "תווית:" ובדיוק בסדר הזה. כשהמודל
   כתב "**הוק**" או "הנגשה -" הייתי מקבלת תסריט בן 39 תווים, או "אין הוק"
   על תוצר שהיה בסדר גמור. עכשיו מחפשים את מקומות התוויות בטקסט, בכל
   סדר, עם נקודתיים או מקף, ועם או בלי כוכביות. */
const LABELS = [
  ['mechanism', 'מנגנון'],
  ['hook', 'הוק'],
  ['script', 'תסריט'],
  ['production', 'הנגשה'],
];

function parseScript(input) {
  /* הכוכביות מגיעות גם כ-"**הוק:**" וגם כ-"**הוק**:", ולכן פשוט מורידים
     אותן לפני שמחפשים תוויות. תסריט מדובר לא צריך כוכביות בכלל. */
  const raw = String(input || '').replace(/\*/g, '');

  const found = [];
  for (const [key, label] of LABELS) {
    const re = new RegExp(`^[ \\t]*${label}[ \\t]*[:\\-\\u2013\\u2014][ \\t]*`, 'm');
    const m = raw.match(re);
    if (m) found.push({ key, start: m.index, after: m.index + m[0].length });
  }
  found.sort((a, b) => a.start - b.start);

  /* 10/10/2026, מהביקורת: הזיהוי של "לא מתאים" רץ על כל הפלט עם דגל m,
     ולכן שורה בתוך גוף התסריט, כמו "לא מתאים לך הפורמט הזה", נקראה
     כפסק דין: התסריט המלא נזרק והרפרנס נחסם לצמיתות. בקול שלה זאת שורה
     סבירה לגמרי. עכשיו זה נבדק רק כשלא נמצאו תוויות בכלל, או כשזאת
     השורה הראשונה ממש. */
  const first = raw.trim().match(/^לא מתאים[ \t]*[:\-–—]?[ \t]*(.*)$/m);
  if (found.length === 0 || (first && first.index === 0)) {
    const unfit = first || raw.match(/^[ \t]*לא מתאים[ \t]*[:\-–—]?[ \t]*(.*)$/m);
    if (unfit) return { unfit: unfit[1].trim() || 'המנגנון לא מתאים' };
  }

  const out = { mechanism: '', hook: '', script: '', production: '' };
  found.forEach((f, i) => {
    const end = i + 1 < found.length ? found[i + 1].start : raw.length;
    out[f.key] = raw.slice(f.after, end).trim();
  });
  return out;
}

/* 10/10/2026, מהביקורת: סכום כספי לא תמיד נושא את המילה "שקל". בעברית
   מדוברת המטבע משתמע, ותסריט כותב "45 אלף בחודש", "50K" או "הכנסה של
   50,000". הביטוי הקודם דרש מטבע מפורש, וכל אלה חמקו ממנו.

   מצד שני, מספר גדול לבדו הוא לא סכום. "4,593 עוקבים" ו"מאות אלפי
   צפיות" הם בדיוק מה שמותר לספר על סלבה ועל שרה, ולכן מספר נחשב סכום
   רק כשיש לו הקשר כספי: מטבע, סדר גודל בלי יחידה אחרת, מילת הכנסה,
   או "בחודש". */
const UNIT = '(?!\\s*(עוקבים|עוקבות|צפיות|לידים|פניות|לקוחות|לקוחה|אנשים|נשים|שעות|ימים))';
const MONEY = [
  /\d[\d,.]*\s*(אלפי|אלף|מיליון)?\s*(שקל|ש"ח|₪)/,
  /₪\s*\d/,
  /(מיליון|אלפי|אלף)\s*(שקל|ש"ח|₪)/,
  new RegExp(`\\d[\\d,.]*\\s*(אלף|אלפי|מיליון)${UNIT}`),
  /\d\s*[Kk](\s|$|[.,!?])/,
  /(הכנסה|הכנסות|מכירות|מחזור|רווח)[^.!?]{0,60}\d/,
  new RegExp(`\\d[\\d,.]*\\s*(אלף|אלפי|מיליון)?\\s*(בחודש|לחודש)${UNIT}`),
];

function hasMoney(text) {
  return MONEY.some((re) => re.test(text));
}

/* גבול מילה בעברית. בלי זה indexOf('שרה') נתפס גם בתוך "התקשרה",
   "אישרה", "הכשרה" ו"פשרה", וכל תסריט שמשלב סכום מותר עם אחת מהמילים
   האלה נפסל בטעות ושרף קריאה. הסכומים האלה דווקא מופיעים בבנק העובדות. */
const HEB_LETTER = /[֐-ת]/;

function mentionsName(paragraph, name) {
  let from = 0;
  for (;;) {
    const at = paragraph.indexOf(name, from);
    if (at === -1) return false;
    const before = at > 0 ? paragraph[at - 1] : '';
    const after = paragraph[at + name.length] || '';
    if (!HEB_LETTER.test(before) && !HEB_LETTER.test(after)) return true;
    from = at + 1;
  }
}

/* הכלל שנכתב בפרומפט הוא "לא באותה פסקה", ולכן הבדיקה היא לפי פסקה ולא
   לפי מרחק תווים. הבדיקה הקודמת הסתכלה על 220 תווים סביב ההופעה
   הראשונה בלבד, ולכן שם שמופיע פעמיים והסכום צמוד לשנייה פשוט עבר. */
function moneyNearClient(text, names) {
  const paragraphs = text.split('\n').filter((p) => p.trim());
  for (const paragraph of paragraphs) {
    for (const name of names) {
      if (mentionsName(paragraph, name) && hasMoney(paragraph)) return name;
    }
  }
  return null;
}

/* שער האיכות. מחזיר סיבת פסילה, או null אם התוצר עובר. */
function rejectReason(parsed) {
  if (!parsed.hook) return 'אין הוק';
  if (!parsed.script) return 'אין תסריט';
  const all = `${parsed.hook}\n${parsed.script}\n${parsed.production || ''}\n${parsed.mechanism || ''}`;
  /* 09/10/2026: שני התוצרים הראשונים הכילו קו מפריד ארוך, שמאיה אסרה
     בכל טקסט יוצא. זה נבדק ולא רק מתבקש. */
  if (/[—–―]/.test(all)) return 'קו מפריד ארוך';
  if (parsed.script.length < MIN_SCRIPT) return `תסריט קצר מדי (${parsed.script.length} תווים)`;
  /* 10/10/2026: תסריט אחד נפתח ב"ורגע, תתכונני", כלומר באמצע מחשבה, בזמן
     שההוק שלו נשאר רק בשדה שלו. בסרטון אמיתי השורה הראשונה היא ההוק.
     מהביקורת: קידומת של שם דובר מותרת, כי ה-GUARD מתיר במפורש לשכפל
     דיאלוג, ואז השורה הראשונה היא "מאיה: " ואחריה ההוק. */
  const bare = (t) => t.replace(/[^֐-תa-zA-Z0-9]/g, '').slice(0, 20);
  const opening = parsed.script.replace(/^\s*\S{1,20}:\s*/, '');
  if (bare(parsed.hook) && !bare(opening).startsWith(bare(parsed.hook))) {
    return 'התסריט לא נפתח בהוק';
  }
  /* 10/10/2026: שלושה תסריטים הבטיחו נכס שלא קיים, "שיעור חינמי",
     "רשימה מפורקת", "כתבי מילה בתגובות ואשלח לך". אם מאיה מצלמת את זה
     היא נשארת עם הבטחה שאינה יכולה לקיים, ולכן זה נפסל ולא רק נבקש. */
  const promise = /(שיעור|מדריך|רשימה|קובץ|אוסף|וובינר|סדנה)\s+(חינמי|חינמית|בחינם)|(בחינם|חינמי)[^.!?]{0,40}(אשלח|אעביר|אשתף)|(אשלח|אעביר)[^.!?]{0,40}(בחינם|חינם)/;
  if (promise.test(parsed.script)) return 'מבטיח נכס שלא קיים';

  /* סלבה ושרה ביקשו במפורש שלא יצוינו סכומים שלהן. זה לא העדפה
     סגנונית אלא בקשה של לקוחה, ולכן זה נבדק ולא רק נאמר בפרומפט.
     "ירוסלבה" מכיל את "סלבה", ולכן אין צורך בשניהם. */
  const leaked = moneyNearClient(all, ['סלבה', 'שרה']);
  if (leaked) return `סכום כספי ליד ${leaked}`;
  return null;
}

async function runFactory(options) {
  const quiet = !!(options && options.quiet);
  const db = getFirestore();
  const key = anthropicApiKey.value();

  /* 10/10/2026, מהביקורת: שתי הקריאות האחרונות נקראו במלואן רק כדי
     לבנות קבוצת מזהים. nightlyScripts נושא תסריט מלא לכל רשומה, ובקצב
     שלושה בלילה זה כמה מגהבייט בשנה, ו-nightlyRejects נושא raw של 1,500
     תווים לכל פסילה. select מוריד את זה למה שבאמת נדרש. */
  const [bankSnap, doneSnap, rejectSnap] = await Promise.all([
    db.collection('inspirationBank').get(),
    db.collection('nightlyScripts').select('refId', 'portalSynced').get(),
    db.collection('nightlyRejects').select('promptVersion', 'formatFails').get(),
  ]);

  /* רפרנס ששוכפל, ורפרנס שנפסל, שניהם לא נבחרים שוב. בלי זה אותו
     מקור גרוע נשרף כל לילה מחדש ועולה כסף על כלום. */
  const used = new Set();
  doneSnap.forEach((d) => { if (d.data().refId) used.add(d.data().refId); });
  /* 10/10/2026, מהביקורת: פסילת ניסוח לא נרשמה בכלל, ומכיוון שהסדר
     היומי קבוע, אותו רפרנס חזר לאותו מקום בתור כל לילה ושרף שתי קריאות
     לנצח. עכשיו יש מונה, והוא נחסם אחרי שלוש פעמים. */
  const formatFails = new Map();
  rejectSnap.forEach((d) => {
    const v = d.data();
    if (v.promptVersion === PROMPT_VERSION) used.add(d.id);
    if (Number(v.formatFails) >= 3) used.add(d.id);
    formatFails.set(d.id, Number(v.formatFails) || 0);
  });

  const refs = pickReferences(bankSnap.docs, used, MAX_TRIES);
  if (!refs.length) {
    console.log('nightlyScripts: no unused references with enough text');
    if (!quiet) await notify('🌙 מפעל התוכן: נגמרו הרפרנסים שעוד לא שוכפלו. שווה להוסיף סרטונים למאגר ההשראה.');
    return { made: 0, reason: 'no-refs' };
  }

  const made = [];
  const rejected = [];
  const notSynced = [];

  /* תסריט שנכתב אצלנו ולא הגיע לפורטל נדחף שוב, אוטומטית. לפי הכלל
     שלה, תקלת שליחה מקבלת ניסיון חוזר מובנה ולא בקשה לאישור. */
  let resent = 0;
  for (const d of doneSnap.docs) {
    if (d.data().portalSynced !== false) continue;
    const full = await d.ref.get();
    const v = full.data() || {};
    const ref = bankSnap.docs.find((b) => b.id === v.refId);
    const extra = ref ? ref.data() : {};
    if (await pushToPortal(v, extra)) {
      await d.ref.set({ portalSynced: true }, { merge: true });
      resent += 1;
    }
  }
  if (resent) console.log('nightlyScripts: resent to portal', resent);
  /* 10/10/2026: הרצה אחת ארכה 366 שניות מתוך 540 שיש לפונקציה. עוד שני
     רפרנסים איטיים והריצה האוטומטית נחתכת באמצע, אחרי שכבר שילמנו על
     הקריאות. לכן יש דדליין שעוצר בנחת ומחזיר את מה שהספיק. */
  const startedAt = Date.now();
  /* 10/10/2026, נמדד: הרצה אחת ארכה 471 שניות מתוך 540 ונעצרה בשער.
     זה צמוד מדי, כי קריאה אחרונה שמתחילה על הגבול עוד מוסיפה דקה. */
  const outOfTime = () => Date.now() - startedAt > 330000;

  for (const ref of refs) {
    if (made.length >= HOW_MANY) break;
    if (outOfTime()) {
      console.log('nightlyScripts: stopped on time budget after', made.length);
      rejected.push({ refId: ref.id, why: 'נעצר בגלל מגבלת זמן' });
      break;
    }
    try {
      let raw = await askClaude(buildPrompt(ref), key);
      let parsed = parseScript(raw);
      let why = parsed.unfit || rejectReason(parsed);

      /* פסילת ניסוח היא לא אשמת הרפרנס. פעמיים נפסל תסריט רק כי לא נפתח
         בהוק שלו, וזה בדיוק סוג הדבר שהמודל מתקן כשאומרים לו מה נשבר.
         ולכן: הזדמנות שנייה אחת, ורק אחר כך דילוג. */
      if (why && !parsed.unfit && !outOfTime()) {
        console.log('nightlyScripts: second try for', ref.id, why);
        raw = await askClaude(`${buildPrompt(ref)}

ניסיון קודם נפסל מהסיבה הזאת: ${why}. כתבי מחדש, ותקפידי בדיוק על הנקודה הזאת.`, key);
        parsed = parseScript(raw);
        why = parsed.unfit || rejectReason(parsed);
      }

      if (why) {
        rejected.push({ refId: ref.id, why, raw: why.startsWith('אין ') ? raw.slice(0, 400) : undefined });
        /* רק חוסר התאמה אמיתית של המנגנון חוסמת את הרפרנס לעתיד. כשל
           ניסוח חוזר מותיר אותו מועמד, אחרת שרפתי רפרנס טוב על ניסוח. */
        if (parsed.unfit) {
          await db.collection('nightlyRejects').doc(ref.id).set({
            why,
            url: ref.url || null,
            promptVersion: PROMPT_VERSION,
            formatFails: formatFails.get(ref.id) || 0,
            /* 09/10/2026: שלוש פסילות "אין הוק" לא אמרו לי אם התוצר היה
               גרוע או שהפרסור שלי פשוט פספס מבנה אחר. בלי התשובה הגולמית
               אני מנחשת, ולכן היא נשמרת כשנפסל. */
            raw: raw.slice(0, 1500),
            at: FieldValue.serverTimestamp(),
          });
        }
        if (!parsed.unfit) {
          /* פסילת ניסוח: נספרת ולא חוסמת, עד שלוש פעמים. */
          await db.collection('nightlyRejects').doc(ref.id).set({
            why,
            url: ref.url || null,
            formatFails: (formatFails.get(ref.id) || 0) + 1,
            at: FieldValue.serverTimestamp(),
          }, { merge: true });
        }
        console.log('nightlyScripts: rejected', ref.id, why);
        continue;
      }
      const doc = await db.collection('nightlyScripts').add({
        mechanism: parsed.mechanism,
        hook: parsed.hook,
        script: parsed.script,
        production: parsed.production,
        refId: ref.id,
        refUrl: ref.url || null,
        refDomain: ref.domain || null,
        createdAt: FieldValue.serverTimestamp(),
        used: false,
      });

      /* הפורטל הוא המקום שבו מאיה עובדת. התסריט נשלח לשם עם הרפרנס
         שממנו הוא נבנה ועם המנגנון, כי תסריט בלי אלה הוא רעיון מרחף. */
      const synced = await pushToPortal({
        mechanism: parsed.mechanism,
        hook: parsed.hook,
        script: parsed.script,
        production: parsed.production,
        refId: ref.id,
        refUrl: ref.url || '',
        refDomain: ref.domain || '',
      }, ref);

      /* 10/10/2026, מהביקורת: כשל בשליחה לפורטל נרשם ללוג בלבד, ומיד
         אחר כך נשלחה לה הודעה שהתסריטים מחכים בפורטל, כשאולי אף אחד
         מהם לא שם. עכשיו הכשל מסומן על הרשומה, ההרצה הבאה דוחפת אותו
         שוב בלי שתצטרך לבקש, וההודעה אומרת את האמת. */
      await doc.set({ portalSynced: synced }, { merge: true });
      if (!synced) notSynced.push(ref.id);

      made.push({ id: doc.id, hook: parsed.hook, synced });
    } catch (err) {
      /* תקלת קריאה היא לא פסילת תוכן, ולכן היא לא נרשמת ב-nightlyRejects
         ואינה חוסמת את הרפרנס מחר. היא כן מופיעה בתשובה, כדי שלא אחשוב
         שהתוצר היה גרוע. */
      console.error('nightlyScripts: failed on', ref.id, err?.message);
      rejected.push({ refId: ref.id, why: `תקלה: ${err?.message || 'לא ידוע'}` });
    }
  }

  if (!quiet) {
    if (made.length) {
      const lines = made.map((m, i) => `${i + 1}. ${m.hook}`).join('\n\n');
      /* 10/10/2026, מהביקורת: ההודעה אמרה "מחכים בפורטל" גם כשהשליחה
         לשם נכשלה, כלומר היא הייתה מחפשת שם משהו שאינו קיים. */
      const stuck = made.filter((m) => !m.synced).length;
      const tail = stuck
        ? `\n\n${made.length - stuck} מהם מחכים בפורטל בלשונית שיווק. ${stuck} לא הצליחו להגיע לשם, והם יישלחו שוב אוטומטית בהרצה הבאה.`
        : '\n\nהתסריטים המלאים מחכים בפורטל, בלשונית שיווק.';
      await notify(`🌙 ${made.length} תסריטים מוכנים לבוקר:\n\n${lines}${tail}`);
    } else {
      await notify('🌙 מפעל התוכן רץ אבל לא הצליח לייצר תסריטים. שווה להציץ בלוג.');
    }
  }

  console.log('nightlyScripts', JSON.stringify({ made: made.length, tried: refs.length, rejected }));
  return { made: made.length, tried: refs.length, rejected };
}

/* 05:30 בישראל, כדי שזה יחכה לה בבוקר ולא יעיר אותה. */
exports.nightlyScripts = onSchedule(
  {
    schedule: '30 5 * * *',
    timeZone: 'Asia/Jerusalem',
    region: 'us-central1',
    timeoutSeconds: 540,
    maxInstances: 1,
    secrets: [anthropicApiKey, greenApiIdInstance, greenApiTokenInstance, portalSecret],
    retryCount: 0,
  },
  async () => { await runFactory(); },
);

/* הרצה ידנית, לבדיקה ולפעמים שבהן היא רוצה עוד שלושה עכשיו.
   quiet=1 מריץ בלי וואטסאפ, לבדיקות בשעות שינה. */
exports.nightlyScriptsNow = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 540,
    maxInstances: 1,
    secrets: [anthropicApiKey, greenApiIdInstance, greenApiTokenInstance, portalSecret],
  },
  async (req, res) => {
    if (req.query.key !== MANUAL_KEY) return res.status(403).json({ ok: false });
    try {
      const allowed = await takeManualRun(getFirestore());
      if (!allowed) return res.status(429).json({ ok: false, error: 'נגמרו ההרצות הידניות להיום' });
      const out = await runFactory({ quiet: req.query.quiet === '1' });
      return res.json({ ok: true, ...out });
    } catch (err) {
      console.error('nightlyScriptsNow', err?.message);
      return res.status(500).json({ ok: false, error: err?.message });
    }
  },
);

module.exports.runFactory = runFactory;
module.exports.pickReferences = pickReferences;
module.exports.parseScript = parseScript;
module.exports.rejectReason = rejectReason;
