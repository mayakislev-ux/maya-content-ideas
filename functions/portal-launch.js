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
