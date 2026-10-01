// 30/09/2026 (מאיה): "שאת בעצם תיצרי לכל אחת טבלה כבר מהשיטס האישי שלה, יש
// שם מלא מלא נתונים... הן כבר מילאו הכל, למה לעשות עבודה כפולה".
//
// כאן נסגר המעגל: מזהים את הקובץ של הלקוחה, קוראים ממנו שלוש לשוניות,
// ומחלצים טבלה (story-table-extract.js עושה את החילוץ עצמו, והוא טהור
// ונבדק). מה שהיא מילאה בעצמה באפליקציה יושב בשדות נפרדים ולכן סנכרון
// מחדש מהגיליון לא דורס אותו - זה לא ניואנס, זו הסיבה היחידה שאפשר בכלל
// לסנכרן שוב בלי לפחד.
//
// אין כאן כתיבה לגיליון. הקובץ של מאיה נשאר המקור, והעריכות של הלקוחה
// נשמרות באפליקציה בלבד.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { buildStoryTable, TAB } = require('./story-table-extract');
const { fetchSheetTabs, sheetsServiceAccountKey } = require('./sheets-content');

const WANTED_TABS = [TAB.persona, TAB.audience, TAB.products];
const SHEET_ID_PATTERN = /^[a-zA-Z0-9_-]{20,}$/;
const SHEETS_URL_PATTERN = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/;

/** מזהה גיליון מתוך מזהה גולמי או מתוך קישור מלא שהודבק */
function toSheetId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const fromUrl = raw.match(SHEETS_URL_PATTERN);
  if (fromUrl) return fromUrl[1];
  return SHEET_ID_PATTERN.test(raw) ? raw : '';
}

/**
 * הקובץ של הלקוחה.
 *
 * profiles/{uid}.sheetId הוא המקור. הוא נזרע מראש לכל מי שיש לה קובץ
 * בפורטל (התאמה לפי מייל), ומי שאין לה מדביקה קישור פעם אחת - ולא בכל
 * פעם מחדש כמו שהיה עד היום בשדה ההקשר החופשי.
 */
async function resolveSheetId(db, uid, override) {
  const snap = await db.collection('profiles').doc(uid).get();
  const saved = toSheetId(snap.exists ? snap.data().sheetId : '');
  if (saved) return { sheetId: saved, source: snap.data().sheetSource || 'profile' };

  // 30/09/2026, ביקורת 10 סוכנים: עד כאן אפשר היה לשלוח מזהה של כל גיליון
  // ולקבל את התוכן שלו. הקישור נקבע על ידי מאיה בלבד, ולכן אין יותר
  // קבלת מזהה מהקריאה.
  if (override) console.warn('syncStoryTable: ignoring caller-supplied sheet', { uid });
  return { sheetId: '', source: '' };
}

exports.sheetsServiceAccountKey = sheetsServiceAccountKey;

exports.makeSyncStoryTable = ({ enforceAllowlist }) =>
  onCall(
    { secrets: [sheetsServiceAccountKey], region: 'us-central1', timeoutSeconds: 120 },
    async (request) => {
      if (!request.auth) throw new HttpsError('unauthenticated', 'יש להתחבר קודם');
      await enforceAllowlist(request.auth.token.email);

      const uid = request.auth.uid;
      const db = admin.firestore();
      const { sheetId, source } = await resolveSheetId(db, uid, request.data && request.data.sheetUrl);

      if (!sheetId) {
        return {
          ready: false,
          reason: 'no-sheet',
          message: 'צריך קישור לקובץ העבודה האישי שלך פעם אחת, ואחר כך זה יזכור אותו.',
        };
      }

      const tabs = await fetchSheetTabs(sheetId, WANTED_TABS);
      if (tabs === null) {
        return {
          ready: false,
          reason: 'no-access',
          message: 'לא הצלחנו לקרוא את הקובץ. צריך לשתף אותו עם מאיה בהרשאת צפייה.',
        };
      }

      const table = buildStoryTable(tabs);
      if (!table.ready) {
        const missing = (table.missingTabs || []).join(', ');
        return {
          ready: false,
          reason: table.reason,
          message:
            table.reason === 'missing-tabs'
              ? `בקובץ שלך חסרות הלשוניות: ${missing}`
              : 'בלשונית ניתוח קהל יעד עוד לא מולאו קבוצות קהל, ובלי קהל אין מה לבנות.',
        };
      }

      // merge, ולא set: answers ו-overrides הם מה שהלקוחה כתבה בעצמה,
      // וסנכרון מהגיליון לא נוגע בהם.
      await db.collection('storyTables').doc(uid).set(
        {
          ownerUid: uid,
          sheetId,
          sheetSource: source,
          // השם נשמר כדי שמאיה תוכל לבחור לקוחה בשמה כשהיא בודקת מה הן רואות
          clientName: request.auth.token.name || request.auth.token.email || uid,
          // 30/09/2026, ביקורת 10 סוכנים: כל פריט נשמר פעמיים (groups ו-bullets)
          // וניפח את המסמך ב-49%. המסמך הגדול הגיע ל-74% ממגבלת 1MB של
          // Firestore. bullets נגזר מ-groups בצד הלקוח, ולכן אינו נשמר.
          audiences: table.audiences.map(stripDerived),
          syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );


      return { ready: true, reason: '', audiences: table.audiences, sheetId };
    }
  );

module.exports.toSheetId = toSheetId;
module.exports.WANTED_TABS = WANTED_TABS;
