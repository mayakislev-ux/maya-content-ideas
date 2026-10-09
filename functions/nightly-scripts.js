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

async function notify(message) {
  const url = `https://api.green-api.com/waInstance${greenApiIdInstance.value()}/SendMessage/${greenApiTokenInstance.value()}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: MAYA_CHAT_ID, message }),
  });
  return (await res.text()).includes('"idMessage"');
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

function pickReferences(docs, used, howMany) {
  const usable = docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((v) => {
      const text = v.translationHe || v.transcriptHe || '';
      return text.trim().length >= MIN_REF_TEXT && !used.has(v.id);
    });
  /* ערבוב יציב לפי היום, כדי ששתי הרצות באותו יום ייתנו אותו דבר
     ושימים שונים ייתנו רפרנסים שונים. */
  const seed = new Date().toISOString().slice(0, 10);
  usable.sort((a, b) => (a.id + seed < b.id + seed ? -1 : 1));
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
פורמט: ${(ref.angleTags || []).join(', ') || 'לא צוין'}

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

  const unfit = raw.match(/^[ \t]*לא מתאים[ \t]*[:\-–—]?[ \t]*(.*)$/m);
  if (unfit) return { unfit: unfit[1].trim() || 'המנגנון לא מתאים' };

  const found = [];
  for (const [key, label] of LABELS) {
    const re = new RegExp(`^[ \\t]*${label}[ \\t]*[:\\-\\u2013\\u2014][ \\t]*`, 'm');
    const m = raw.match(re);
    if (m) found.push({ key, start: m.index, after: m.index + m[0].length });
  }
  found.sort((a, b) => a.start - b.start);

  const out = { mechanism: '', hook: '', script: '', production: '' };
  found.forEach((f, i) => {
    const end = i + 1 < found.length ? found[i + 1].start : raw.length;
    out[f.key] = raw.slice(f.after, end).trim();
  });
  return out;
}

/* שער האיכות. מחזיר סיבת פסילה, או null אם התוצר עובר. */
function rejectReason(parsed) {
  if (!parsed.hook) return 'אין הוק';
  if (!parsed.script) return 'אין תסריט';
  const all = `${parsed.hook}\n${parsed.script}\n${parsed.production || ''}\n${parsed.mechanism || ''}`;
  /* 09/10/2026: שני התוצרים הראשונים הכילו קו מפריד ארוך, שמאיה אסרה
     בכל טקסט יוצא. זה נבדק ולא רק מתבקש. */
  if (/[—–]/.test(all)) return 'קו מפריד ארוך';
  if (parsed.script.length < MIN_SCRIPT) return `תסריט קצר מדי (${parsed.script.length} תווים)`;
  /* סלבה ושרה ביקשו במפורש שלא יצוינו סכומים שלהן. זה לא העדפה
     סגנונית אלא בקשה של לקוחה, ולכן זה נבדק ולא רק נאמר בפרומפט. */
  /* 10/10/2026: תסריט אחד נפתח ב"ורגע, תתכונני", כלומר באמצע מחשבה, בזמן
     שההוק שלו נשאר רק בשדה שלו. בסרטון אמיתי השורה הראשונה היא ההוק. */
  const bare = (t) => t.replace(/[^֐-תa-zA-Z0-9]/g, '').slice(0, 20);
  if (bare(parsed.hook) && !bare(parsed.script).startsWith(bare(parsed.hook))) {
    return 'התסריט לא נפתח בהוק';
  }
  for (const name of ['סלבה', 'ירוסלבה', 'שרה']) {
    const at = all.indexOf(name);
    if (at === -1) continue;
    const around = all.slice(Math.max(0, at - 220), at + 220);
    if (/\d[\d,.]*\s*(שקל|ש"ח|₪)|₪\s*\d/.test(around)) return `סכום כספי ליד ${name}`;
  }
  return null;
}

async function runFactory(options) {
  const quiet = !!(options && options.quiet);
  const db = getFirestore();
  const key = anthropicApiKey.value();

  const [bankSnap, doneSnap, rejectSnap] = await Promise.all([
    db.collection('inspirationBank').get(),
    db.collection('nightlyScripts').get(),
    db.collection('nightlyRejects').get(),
  ]);

  /* רפרנס ששוכפל, ורפרנס שנפסל, שניהם לא נבחרים שוב. בלי זה אותו
     מקור גרוע נשרף כל לילה מחדש ועולה כסף על כלום. */
  const used = new Set();
  doneSnap.forEach((d) => { if (d.data().refId) used.add(d.data().refId); });
  rejectSnap.forEach((d) => { if (d.data().promptVersion === PROMPT_VERSION) used.add(d.id); });

  const refs = pickReferences(bankSnap.docs, used, MAX_TRIES);
  if (!refs.length) {
    console.log('nightlyScripts: no unused references with enough text');
    if (!quiet) await notify('🌙 מפעל התוכן: נגמרו הרפרנסים שעוד לא שוכפלו. שווה להוסיף סרטונים למאגר ההשראה.');
    return { made: 0, reason: 'no-refs' };
  }

  const made = [];
  const rejected = [];
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
      if (why && !parsed.unfit) {
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
            /* 09/10/2026: שלוש פסילות "אין הוק" לא אמרו לי אם התוצר היה
               גרוע או שהפרסור שלי פשוט פספס מבנה אחר. בלי התשובה הגולמית
               אני מנחשת, ולכן היא נשמרת כשנפסל. */
            raw: raw.slice(0, 1500),
            at: FieldValue.serverTimestamp(),
          });
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
      try {
        const sent = await fetch(PORTAL_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-sale-secret': portalSecret.value() },
          body: JSON.stringify({
            mechanism: parsed.mechanism,
            hook: parsed.hook,
            script: parsed.script,
            production: parsed.production,
            refId: ref.id,
            refUrl: ref.url || '',
            refDomain: ref.domain || '',
            refThumb: ref.thumbnailUrl || '',
            refText: (ref.translationHe || ref.transcriptHe || '').slice(0, 7000),
            source: 'nightly',
          }),
        });
        if (!sent.ok) console.error('nightlyScripts: portal refused', sent.status, (await sent.text()).slice(0, 200));
      } catch (err) {
        console.error('nightlyScripts: portal post failed', err?.message);
      }

      made.push({ id: doc.id, hook: parsed.hook });
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
      await notify(`🌙 ${made.length} תסריטים מוכנים לבוקר:\n\n${lines}\n\nהתסריטים המלאים מחכים בפורטל, בלשונית שיווק.`);
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
    secrets: [anthropicApiKey, greenApiIdInstance, greenApiTokenInstance, portalSecret],
  },
  async (req, res) => {
    if (req.query.key !== 'maya') return res.status(403).json({ ok: false });
    try {
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
