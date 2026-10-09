/* מפעל התוכן הלילי.
 *
 * 09/10/2026 (מאיה, הכי דחוף ברשימת החמישים): "חיפוש רעיונות לתוכן לעסק"
 * לוקח לה שעתיים בשבוע, ומפעל התוכן נועד להחליף אותן. כל לילה נבחרים
 * שלושה רפרנסים מהמאגר שעוד לא שוכפלו, שיטת השכפול שלה מופעלת עליהם,
 * ובבוקר מחכים לה שלושה תסריטים מוכנים בקול שלה.
 *
 * למה זה עובד דווקא אצלה: השיטה כבר כתובה ומסודרת (שכפול רגיל ושכפול
 * הפוך), והמאגר כבר מלא ברפרנסים אמיתיים עם תמלול ותרגום. אין כאן
 * המצאה, יש אוטומציה של מה שהיא כבר עושה ביד.
 *
 * מה הוא לא עושה: הוא לא סורק את האינטרנט לבד. אין API ציבורי לטיקטוק
 * ולאינסטגרם, ולכן הוא עובד מהמאגר שמאיה מזינה. ככל שהמאגר מתמלא, כך
 * התפוקה טובה יותר.
 */
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');
const greenApiIdInstance = defineSecret('GREEN_API_ID_INSTANCE');
const greenApiTokenInstance = defineSecret('GREEN_API_TOKEN_INSTANCE');

const MAYA_CHAT_ID = '972525533679@c.us';
const MODEL = 'claude-sonnet-5';
const HOW_MANY = 3;

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

/* מי מאיה, כדי שהתסריט יישמע כמוה ולא כמו כל אחד. */
const VOICE = `הקול של מאיה קיסלב:
- אסטרטגית שיווק ומותג אישי. מלווה בעלי עסקים קטנים שכבר משווקים ולא רואים תוצאות.
- ישירה, בלי ריכוך ובלי מליצות. אומרת את הדבר עצמו במשפט הראשון.
- מדברת מהצד של בעלת העסק שמתוסכלת, לא מהצד של המומחית שמסבירה מלמעלה.
- לא משתמשת במילים "קסם", "סוד", "פריצת דרך", ולא בסימני קריאה מיותרים.
- הקהל: בעלי עסקים קטנים בישראל, רובם נשים, שמוציאים תוכן ולא מקבלים לידים.`;

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
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return (data.content || []).map((c) => c.text || '').join('').trim();
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

/* בוחר רפרנסים שעוד לא שוכפלו. מעדיף כאלה שיש להם טקסט קריא, כי בלי
   תמלול אין מה לפרק, ומעדיף את מי שלא נבחר לאחרונה. */
function pickReferences(docs, used, howMany) {
  const usable = docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((v) => {
      const text = v.translationHe || v.transcriptHe || '';
      return text.trim().length > 200 && !used.has(v.id);
    });
  /* ערבוב יציב לפי היום, כדי ששתי הרצות באותו יום ייתנו אותו דבר
     ושימי שונים ייתנו רפרנסים שונים. */
  const seed = new Date().toISOString().slice(0, 10);
  usable.sort((a, b) => (a.id + seed < b.id + seed ? -1 : 1));
  return usable.slice(0, howMany);
}

function buildPrompt(ref) {
  const text = (ref.translationHe || ref.transcriptHe || '').slice(0, 6000);
  return `${METHOD}

${VOICE}

להלן תמלול של סרטון רפרנס שעבד. שכפלי אותו לעולם של מאיה.

תחום הרפרנס: ${ref.domain || 'לא צוין'}
פורמט: ${(ref.angleTags || []).join(', ') || 'לא צוין'}

--- התמלול ---
${text}
--- סוף התמלול ---

החזירי בדיוק במבנה הזה, בלי שום טקסט נוסף לפני או אחרי:

מנגנון: [משפט אחד, מה בעצם קורה בסרטון המקורי ומה גורם לו לעבוד]
הוק: [שורת הפתיחה המשוכפלת, בעולם של מאיה]
תסריט:
[התסריט המלא, באותו מבנה ובאותו אורך כמו המקור]
הנגשה: [משפט אחד, איך לצלם את זה ויזואלית, לפי איך שהמקור הונגש]`;
}

function parseScript(raw) {
  const grab = (label, next) => {
    const re = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n${next}:|$)`);
    const m = raw.match(re);
    return m ? m[1].trim() : '';
  };
  return {
    mechanism: grab('מנגנון', 'הוק'),
    hook: grab('הוק', 'תסריט'),
    script: grab('תסריט', 'הנגשה'),
    production: grab('הנגשה', '\\u0000'),
  };
}

async function runFactory() {
  const db = getFirestore();
  const key = anthropicApiKey.value();

  const [bankSnap, doneSnap] = await Promise.all([
    db.collection('inspirationBank').get(),
    db.collection('nightlyScripts').get(),
  ]);

  const used = new Set();
  doneSnap.forEach((d) => { if (d.data().refId) used.add(d.data().refId); });

  const refs = pickReferences(bankSnap.docs, used, HOW_MANY);
  if (!refs.length) {
    console.log('nightlyScripts: no unused references with text');
    await notify('🌙 מפעל התוכן: נגמרו הרפרנסים שעוד לא שוכפלו. שווה להוסיף סרטונים למאגר ההשראה.');
    return { made: 0, reason: 'no-refs' };
  }

  const made = [];
  for (const ref of refs) {
    try {
      const raw = await askClaude(buildPrompt(ref), key);
      const parsed = parseScript(raw);
      if (!parsed.hook || !parsed.script) {
        console.error('nightlyScripts: unparsable answer', ref.id, raw.slice(0, 200));
        continue;
      }
      const doc = await db.collection('nightlyScripts').add({
        ...parsed,
        refId: ref.id,
        refUrl: ref.url || null,
        refDomain: ref.domain || null,
        createdAt: FieldValue.serverTimestamp(),
        used: false,
      });
      made.push({ id: doc.id, hook: parsed.hook });
    } catch (err) {
      console.error('nightlyScripts: failed on', ref.id, err?.message);
    }
  }

  if (made.length) {
    const lines = made.map((m, i) => `${i + 1}. ${m.hook}`).join('\n\n');
    await notify(`🌙 ${made.length} תסריטים מוכנים לבוקר:\n\n${lines}\n\nהתסריטים המלאים מחכים במוח השיווקי.`);
  } else {
    await notify('🌙 מפעל התוכן רץ אבל לא הצליח לייצר תסריטים. שווה להציץ בלוג.');
  }

  console.log('nightlyScripts', JSON.stringify({ made: made.length, tried: refs.length }));
  return { made: made.length };
}

/* 05:30 בישראל, כדי שזה יחכה לה בבוקר ולא יעיר אותה. */
exports.nightlyScripts = onSchedule(
  {
    schedule: '30 5 * * *',
    timeZone: 'Asia/Jerusalem',
    region: 'us-central1',
    timeoutSeconds: 540,
    secrets: [anthropicApiKey, greenApiIdInstance, greenApiTokenInstance],
    retryCount: 0,
  },
  async () => { await runFactory(); },
);

/* הרצה ידנית, לבדיקה ולפעמים שבהן היא רוצה עוד שלושה עכשיו. */
exports.nightlyScriptsNow = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 540,
    secrets: [anthropicApiKey, greenApiIdInstance, greenApiTokenInstance],
  },
  async (req, res) => {
    if (req.query.key !== 'maya') return res.status(403).json({ ok: false });
    try {
      const out = await runFactory();
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
