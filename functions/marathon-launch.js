/**
 * הכרזת ההשקה של "מרתון התוכן" בקבוצות "שיח פתוח" של מחזורים 1-4.
 *
 * מתי: 22/09/2026 בשעה 10:00 שעון ישראל, פעם אחת בלבד.
 *
 * למה בנוי ככה: זה אותו דפוס שעבד ב-agentKippurReminder2000 - onSchedule עם קרון
 * לתאריך ספציפי, בדיקת תאריך נוספת בתוך הפונקציה, ונעילה ב-Firestore לכל קבוצה
 * בנפרד דרך create() שנכשל אם המסמך כבר קיים. ככה גם אם הפונקציה תרוץ פעמיים
 * (ריטריי, דיפלוי מחדש, או הפעלה ידנית) אף קבוצה לא תקבל את ההודעה פעמיים.
 *
 * זיהוי הקבוצות: השם של כל ארבע הקבוצות הוא "💬 שיח פתוח" בלי ציון מחזור, אז הן
 * מופו ב-21/09/2026 לפי חפיפת משתתפות מול קבוצות "המהלך השיווקי - מחזור N".
 * כל אחת מהן נתנה התאמה של 100%, ותאריכי היצירה תואמים את סדר המחזורים.
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

const greenApiIdInstance = defineSecret('GREEN_API_ID_INSTANCE');
const greenApiTokenInstance = defineSecret('GREEN_API_TOKEN_INSTANCE');

const SEND_DATE = '2026-09-22';
const IMAGE_URL = 'https://maya-marathon.web.app/assets/wa-marathon.jpg';

const GROUPS = [
  { cycle: 1, chatId: '120363400471131209@g.us' },
  { cycle: 2, chatId: '120363406298106116@g.us' },
  { cycle: 3, chatId: '120363426080220220@g.us' },
  { cycle: 4, chatId: '120363424973898208@g.us' },
];

const CAPTION = [
  'אני ממש מתרגשת להגיד שסוף סוף זה בחוץ🤩🥳😍 *אירוע הבוגרות של המהלך - מרתון התוכן*🎥',
  'ב־3.11, בין 10:00–18:00, אנחנו נפגשות ליום שלם שמוקדש רק לדבר אחד:',
  '*לצאת עם תוכן. באמת.*',
  '',
  'כי אפשר לדעת איך ליצור תוכן, לשמור מיליון רפרנסים ולהגיד "השבוע אני מצלמת" אבל בתוך השגרה זה נדחה, מתפזר, ושוב מוצאים את עצמנו בלי מספיק תוכן מוכן. ובדיוק בשביל זה יצרתי את היום הזה.',
  '',
  '*ביום הזה יהיה לכן:*',
  '✨ יום שלם שסגור רק ליצירה וצילום בלי לדחות ובלי לברוח לזה אחר כך',
  '✨ הפידבק שלי בזמן אמת על הרעיונות, התסריטים והתוכן שלכן',
  '✨ סביבה של בוגרות שעובדות יחד ומכניסה אתכן לפול גז מוטיבציה',
  '✨ רענון ועדכון של כל מה שהשתנה והתחדש בתוכן ובשיווק מאז שעברתן את הליווי',
  '✨ זמן לעשות סדר, לחדד כיוונים ולייצר בפועל את כל מה שיושב לכן כבר חודשים בראש',
  '',
  'זו הפעם הראשונה שאני עושה אירוע כזה לבוגרות שלי וגם האחרונה , כדאי לכן ממש להגיע;) *מספר המקומות מוגבל*',
  'כל הפרטים וההרשמה כאן:',
  'https://maya-marathon.web.app/',
].join('\n');

function israelToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
}

async function sendToGroups(tag) {
  const idInstance = greenApiIdInstance.value();
  const token = greenApiTokenInstance.value();
  const results = [];

  for (const group of GROUPS) {
    const lockRef = admin.firestore()
      .collection('oneOffSends')
      .doc(`marathon-launch-${SEND_DATE}-${group.chatId}`);
    try {
      await lockRef.create({ state: 'sending', cycle: group.cycle, at: new Date().toISOString(), tag });
    } catch (err) {
      console.warn(`marathonLaunch: מחזור ${group.cycle} כבר נשלח, מדלגת`);
      results.push({ cycle: group.cycle, skipped: true });
      continue;
    }
    try {
      const res = await fetch(`https://api.green-api.com/waInstance${idInstance}/sendFileByUrl/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          chatId: group.chatId,
          urlFile: IMAGE_URL,
          fileName: 'מרתון התוכן.jpg',
          caption: CAPTION,
        }),
      });
      const text = await res.text();
      await lockRef.update({ state: res.ok ? 'sent' : 'failed', http: res.status, response: text.slice(0, 300) });
      results.push({ cycle: group.cycle, http: res.status });
      console.log(`marathonLaunch: מחזור ${group.cycle} -> ${res.status} ${text.slice(0, 120)}`);
    } catch (err) {
      await lockRef.update({ state: 'unknown', error: String(err).slice(0, 300) }).catch(() => {});
      results.push({ cycle: group.cycle, error: String(err).slice(0, 120) });
      console.error(`marathonLaunch: מחזור ${group.cycle} קרס`, err);
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  return results;
}

exports.agentMarathonLaunch = onSchedule(
  {
    schedule: '0 10 22 9 *',
    timeZone: 'Asia/Jerusalem',
    region: 'us-central1',
    retryCount: 0,
    timeoutSeconds: 300,
    secrets: [greenApiIdInstance, greenApiTokenInstance],
  },
  async () => {
    const today = israelToday();
    if (today !== SEND_DATE) {
      console.log('agentMarathonLaunch: לא תאריך השליחה, מדלגת', { today, SEND_DATE });
      return;
    }
    const results = await sendToGroups('schedule');
    console.log('agentMarathonLaunch: סיום', JSON.stringify(results));
  }
);

/** מצב השליחה, לבדיקה בלי לשלוח כלום. */
exports.marathonLaunchStatus = onRequest(
  { region: 'us-central1', timeoutSeconds: 60 },
  async (req, res) => {
    const docs = await admin.firestore().collection('oneOffSends')
      .where(admin.firestore.FieldPath.documentId(), '>=', `marathon-launch-${SEND_DATE}-`)
      .where(admin.firestore.FieldPath.documentId(), '<', `marathon-launch-${SEND_DATE}-`)
      .get();
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.json({
      sendDate: SEND_DATE,
      israelNow: new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }),
      groups: GROUPS.map((g) => g.cycle),
      sent: docs.docs.map((d) => ({ id: d.id, ...d.data() })),
    });
  }
);
