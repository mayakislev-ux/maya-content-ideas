// שליחה חד-פעמית (19/09/2026, בקשת מאיה): הודעת "הפורטל עלה" + סרטון המדריך,
// ביום ראשון 20/09/2026 בשעה 08:59 בדיוק, לארבע קבוצות: הכרזות + פידבקים של
// מחזור 5 ומחזור 6. הקבוצות אומתו לפי חברות (הפידבקים של מחזור 5: כל 11 החברות
// הן חברות הכרזות מחזור 5; של מחזור 6: כל 13).
//
// הגנות: (1) רץ רק בתאריך 2026-09-20 (אחרת לא עושה כלום), (2) נעילה לכל קבוצה
// ב-Firestore עם create() - שליחה שנייה לאותה קבוצה נחסמת, (3) בלי ניסיונות
// חוזרים. אחרי שהשליחה עברה - למחוק את הפונקציה.
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

const greenApiIdInstance = defineSecret('GREEN_API_ID_INSTANCE');
const greenApiTokenInstance = defineSecret('GREEN_API_TOKEN_INSTANCE');

const SEND_DATE = '2026-09-20';
const VIDEO_URL =
  'https://firebasestorage.googleapis.com/v0/b/maya-client-portal.firebasestorage.app/o/public%2Fportal-guide-2026-09.mp4?alt=media&token=70363509-b596-46f2-b98e-ac645d4b62c5';
const GROUPS = [
  { label: 'מחזור 5 הכרזות', chatId: '120363410195771366@g.us' },
  { label: 'מחזור 5 פידבקים', chatId: '120363430421304423@g.us' },
  { label: 'מחזור 6 הכרזות', chatId: '120363428535207121@g.us' },
  { label: 'מחזור 6 פידבקים', chatId: '120363410650036434@g.us' },
];
const CAPTION = `🚨 *חדשות!*
*קבוצת הפידבקים נסגרת לאלתר - אפליקציית פורטל הלקוחות שלנו עלתה לאוויר! 🥳*

מהיום הכול מתנהל במקום אחד:
הקובץ האישי שלכן + הגשת כל המשימות (סרטונים, תסריטים ומשימות עומק) נמצאים ישירות בפורטל.

*והחלק הכי שווה?*
ברגע שקיבלתן פידבק, תקבלו הודעה אוטומטית ישירות לוואטסאפ האישי שלכן ממספר המשרד. בלי לבדוק אם ראיתי/פספסתי ובלי להיכנס כל רגע לקבוצה לבדוק אם קיבלתן מענה. *הפידבק מוכן? אתן יודעות ישר.*

🎥 הכנתי לכן מדריך קצר להתקנה ולשימוש בפורטל. *חשוב לצפות בו עד הסוף לפני שמתחילות* כדי למנוע בלבול ושאלות חוזרות.
👇 הפורטל + המדריך:
https://maya-client-portal.web.app`;

exports.agentPortalLaunch0859 = onSchedule(
  {
    schedule: '59 8 20 9 *',
    timeZone: 'Asia/Jerusalem',
    region: 'us-central1',
    retryCount: 0,
    timeoutSeconds: 300,
    secrets: [greenApiIdInstance, greenApiTokenInstance],
  },
  async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
    if (today !== SEND_DATE) {
      console.log('agentPortalLaunch0859: not the send date, skipping', { today });
      return;
    }
    const db = admin.firestore();
    const idInstance = greenApiIdInstance.value();
    const token = greenApiTokenInstance.value();
    for (const g of GROUPS) {
      const lockRef = db.collection('oneOffSends').doc(`portal-launch-${SEND_DATE}-${g.chatId}`);
      try {
        await lockRef.create({ state: 'sending', label: g.label, at: new Date().toISOString() });
      } catch (err) {
        console.warn('agentPortalLaunch0859: already sent (lock exists), skipping', g.label);
        continue;
      }
      try {
        const res = await fetch(`https://api.green-api.com/waInstance${idInstance}/sendFileByUrl/${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({ chatId: g.chatId, urlFile: VIDEO_URL, fileName: 'מדריך הפורטל.mp4', caption: CAPTION }),
        });
        const text = await res.text();
        await lockRef.update({ state: res.ok ? 'sent' : 'failed', http: res.status, response: text.slice(0, 300) });
        console.log('agentPortalLaunch0859:', g.label, res.status, text.slice(0, 120));
      } catch (err) {
        // לא מנסים שוב אוטומטית - עדיף הודעה חסרה מהודעה כפולה
        await lockRef.update({ state: 'unknown', error: String(err).slice(0, 300) }).catch(() => {});
        console.error('agentPortalLaunch0859: send crashed', g.label, err);
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
);

// 19/09/2026 (מאיה): תזכורת "מחר נפגשים" למחזור 6 במוצאי כיפור, 21/09/2026 בשעה
// 20:00 בדיוק, עם "גמר חתימה טובה" בראש ההודעה. מחליפה את ה-GitHub Action
// (שאיחר בעבר בשעתיים וגרם לכפילות). רק לקבוצת ההכרזות של מחזור 6.
const KIPPUR_DATE = '2026-09-21';
const KIPPUR_BANNER = 'https://firebasestorage.googleapis.com/v0/b/maya-client-portal.firebasestorage.app/o/public%2Fbanner-tomorrow-meeting.jpeg?alt=media&token=f47e192f-edf6-45ff-8bfd-97e59ea7d6f6';
const KIPPUR_CAPTION = `גמר חתימה טובה 🤍

מחר זה קורה🤩
נפגשים למפגש ה-4 שלנו בזום!

⏰ שעות: 10:00–14:00

מה להכין?‼️
*אין דבר כזה לעלות למפגש בלי לצפות בפרק שנפתח - המהלך הויזואלי ולעשות את המשימות.* זה מפגש יישום – לא מפגש לימוד. תבואו אחרי שצפיתם, רשמתם שאלות, התחלתם ליישם, וכל דבר שלא ברור או נתקעתם עליו - נפתור ביחד במפגש.

תבואו עם אנרגיות!
נתראה מחר`;

exports.agentKippurReminder2000 = onSchedule(
  {
    schedule: '0 20 21 9 *',
    timeZone: 'Asia/Jerusalem',
    region: 'us-central1',
    retryCount: 0,
    timeoutSeconds: 120,
    secrets: [greenApiIdInstance, greenApiTokenInstance],
  },
  async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
    if (today !== KIPPUR_DATE) {
      console.log('agentKippurReminder2000: not the send date, skipping', { today });
      return;
    }
    const chatId = '120363428535207121@g.us';
    const lockRef = admin.firestore().collection('oneOffSends').doc(`kippur-reminder-${KIPPUR_DATE}-${chatId}`);
    try {
      await lockRef.create({ state: 'sending', at: new Date().toISOString() });
    } catch (err) {
      console.warn('agentKippurReminder2000: already sent (lock exists), skipping');
      return;
    }
    try {
      const res = await fetch(`https://api.green-api.com/waInstance${greenApiIdInstance.value()}/sendFileByUrl/${greenApiTokenInstance.value()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ chatId, urlFile: KIPPUR_BANNER, fileName: 'תזכורת.jpeg', caption: KIPPUR_CAPTION }),
      });
      const text = await res.text();
      await lockRef.update({ state: res.ok ? 'sent' : 'failed', http: res.status, response: text.slice(0, 300) });
      console.log('agentKippurReminder2000:', res.status, text.slice(0, 120));
    } catch (err) {
      await lockRef.update({ state: 'unknown', error: String(err).slice(0, 300) }).catch(() => {});
      console.error('agentKippurReminder2000: send crashed', err);
    }
  }
);
