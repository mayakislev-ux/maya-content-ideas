/* תזכורת אחת לאופק, במוצאי שבת 10/10/2026 בשעה 19:30 שעון ישראל.
 *
 * מאיה: "תוכלי לכוון לתזכורת נוספת במוצש בשעה 19:30 היום, משהו קצר עם
 * הלינק, אבל לא עכשיו כי היא שומרת שבת, ושייצא אוטומטי".
 *
 * למה Cloud Scheduler ולא טריגר חד פעמי: טריגר חד פעמי טרי כבר דיווח
 * הצלחה ולא שלח כלום בפועל, ואפילו שגרה ותיקה ומוכחת נכשלה בשקט פעם
 * אחת. Cloud Scheduler הוא השכבה שהוכחה אצלה כאמינה. אחרי השליחה
 * בודקים ביומן של Green API עצמו ולא מאמינים לסטטוס.
 *
 * שתי הגנות מפני שליחה כפולה, כי זאת הודעה ללקוחה אמיתית:
 *   1. התאריך נבדק מול היום היחיד שבו מותר לשלוח.
 *   2. סימון ב-Firestore, שנכתב לפני השליחה.
 * הפונקציה רצה כל יום ב-19:30 ולא עושה כלום בשום יום אחר. אפשר למחוק
 * אותה אחרי שהתזכורת יצאה.
 */
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

/**
 * כתובת הבסיס של גרין, נגזרת ממזהה המופע.
 *
 * 11/10/2026: api.green-api.com יושב על ענן רוסי ונחסם מהרשת של מאיה.
 * הדומיין לכל מופע עובד, והוא גם מה שגרין ממליצים עליו.
 */
function greenBase(idInstance) {
  const prefix = String(idInstance || '').slice(0, 4);
  return prefix ? `https://${prefix}.api.greenapi.com` : 'https://api.greenapi.com';
}


const greenApiIdInstance = defineSecret('GREEN_API_ID_INSTANCE');
const greenApiTokenInstance = defineSecret('GREEN_API_TOKEN_INSTANCE');

/* אופק אסתר אמסילי. המספר אומת מול כרטיס הלקוחה בפורטל, ומאיה אישרה
   במפורש שזאת היא ולא אופק לוי, כי יש שתי לקוחות בשם אופק. */
const OFEK_CHAT_ID = '972546517430@c.us';
const ONLY_ON = '2026-10-10';
const MARK = 'ofekStrategyFormReminder';

const TEXT = [
  'היי אופק, שבוע טוב 🙏',
  '',
  'לקראת הפגישה על יום הצילום עם הרב, זה השאלון:',
  'https://maya-liui.web.app/ofek',
  '',
  'הוא נשמר לך תוך כדי, אז אפשר לעצור ולחזור. אשמח לקבל אותו הערב כדי שנגיע לפגישה מוכנות.',
  '',
  'תודה!',
].join('\n');

/** התאריך בישראל, בלי להסתמך על שעון המכונה. */
function israelDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

async function sendOnce(db, now = new Date()) {
  const today = israelDate(now);
  if (today !== ONLY_ON) {
    console.log('ofekReminder: not the day', today);
    return { sent: false, reason: 'לא היום' };
  }

  /* הסימון נכתב לפני השליחה ובאופן אטומי. אם שתי הרצות נפגשות, רק
     אחת תעבור, וזה עדיף על הודעה כפולה ללקוחה. */
  const ref = db.collection('oneOffSends').doc(MARK);
  try {
    await ref.create({ startedAt: FieldValue.serverTimestamp(), day: today });
  } catch {
    console.log('ofekReminder: already handled');
    return { sent: false, reason: 'כבר טופל' };
  }

  const url = `${greenBase(greenApiIdInstance.value())}/waInstance${greenApiIdInstance.value()}/SendMessage/${greenApiTokenInstance.value()}`;
  let body = '';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: OFEK_CHAT_ID, message: TEXT }),
      signal: AbortSignal.timeout(20000),
    });
    body = (await res.text()).slice(0, 300);
  } catch (err) {
    body = `שגיאה: ${err?.message}`;
  }

  const ok = body.includes('"idMessage"');
  await ref.set({ sentAt: FieldValue.serverTimestamp(), ok, body }, { merge: true });
  console.log('ofekReminder:', ok ? 'נשלח' : 'נכשל', body);
  return { sent: ok, body };
}

exports.ofekReminder = onSchedule(
  {
    schedule: '30 19 * * *',
    timeZone: 'Asia/Jerusalem',
    region: 'us-central1',
    maxInstances: 1,
    retryCount: 0,
    secrets: [greenApiIdInstance, greenApiTokenInstance],
  },
  async () => { await sendOnce(getFirestore()); },
);

/* בדיקה בלבד: מחזיר מה היה נשלח ואם הסימון כבר נתפס, בלי לשלוח כלום. */
exports.ofekReminderStatus = onRequest(
  { region: 'us-central1', maxInstances: 1 },
  async (req, res) => {
    if (req.query.key !== '8cd9dd930910001365d33a48930453c8') return res.status(403).json({ ok: false });
    const snap = await getFirestore().collection('oneOffSends').doc(MARK).get();
    return res.json({
      ok: true,
      israelDate: israelDate(),
      willSendToday: israelDate() === ONLY_ON && !snap.exists,
      alreadyMarked: snap.exists,
      record: snap.exists ? snap.data() : null,
      to: OFEK_CHAT_ID,
      text: TEXT,
    });
  },
);

module.exports.israelDate = israelDate;
module.exports.sendOnce = sendOnce;
module.exports.TEXT = TEXT;
