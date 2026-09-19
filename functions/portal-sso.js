// 19/09/2026 (מאיה: "שהמעבר ישאר חלק ולא ידרוש מהן להתחבר עם המייל"):
// כניסה מהפורטל ("המהלך השיווקי", פרויקט maya-client-portal) בלי התחברות
// נוספת. הפורטל שולח את אסימון ההתחברות שלו, בודקים אותו מול הפרויקט של
// הפורטל (מפתחות ציבוריים של גוגל, בלי סוד משותף), ומחזירים אסימון כניסה
// לחשבון עם אותו מייל כאן - אותו חשבון בדיוק, עם כל הרעיונות שכבר יש לה.
// מסמנים בפרופיל שהיא מהפורטל, כדי שיופיע אצלה "חזרה לפורטל". מחזורים 1-4
// לא בפורטל, אז אצלן אין סימון ואין כפתור.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const ADMIN_EMAIL = 'mayakislev@gmail.com';
const PORTAL_PROJECT = 'maya-client-portal';
const PORTAL_ROLES = new Set(['owner', 'client']);

let portalApp = null;
function portalAuth() {
  if (!portalApp) portalApp = admin.initializeApp({ projectId: PORTAL_PROJECT }, 'portal-verify');
  return portalApp.auth();
}

exports.portalSso = onCall({ region: 'us-central1', invoker: 'public' }, async (request) => {
  const idToken = request.data?.idToken;
  if (typeof idToken !== 'string' || idToken.length < 100 || idToken.length > 5000) {
    throw new HttpsError('invalid-argument', 'הקישור מהפורטל לא תקין. נסו שוב מהפורטל');
  }
  let decoded;
  try {
    decoded = await portalAuth().verifyIdToken(idToken);
  } catch (err) {
    console.warn('portalSso: bad portal token', err.code || err.message);
    throw new HttpsError('unauthenticated', 'פג תוקף המעבר מהפורטל. חזרו לפורטל ולחצו שוב');
  }
  const email = String(decoded.email || '').toLowerCase();
  const role = decoded.role;
  if (!email || decoded.email_verified === false) {
    throw new HttpsError('permission-denied', 'לא נמצא מייל מאומת בחשבון הפורטל');
  }
  if (email !== ADMIN_EMAIL && !PORTAL_ROLES.has(role)) {
    throw new HttpsError('permission-denied', 'החשבון הזה לא מחובר למוח השיווקי. פנו למאיה');
  }

  const db = admin.firestore();
  // לקוחה בפורטל = לקוחה פעילה (מאיה פותחת כל חשבון בעצמה), אז אם המייל
  // עוד לא ברשימה - מוסיפים, כדי שלא תיתקע במסך "מייל לא קיים במערכת"
  if (email !== ADMIN_EMAIL) {
    const allowRef = db.collection('allowlist').doc(email);
    const allowSnap = await allowRef.get();
    if (!allowSnap.exists) {
      await allowRef.set({ source: 'פורטל המהלך השיווקי (כניסה מהפורטל)', addedAt: admin.firestore.FieldValue.serverTimestamp() });
    }
  }

  // אותו חשבון שנוצר בכניסה עם גוגל - לפי המייל. אין חשבון? יוצרים אחד
  // עם המייל, וכשתתחבר פעם עם גוגל זה יתחבר לאותו חשבון
  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
    user = await admin.auth().createUser({ email, emailVerified: true });
  }

  const portalLink = email === ADMIN_EMAIL || role === 'owner' ? 'owner' : 'client';
  await db.collection('profiles').doc(user.uid).set({ portalLink, portalLinkedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

  const token = await admin.auth().createCustomToken(user.uid);
  return { token, portalLink, uid: user.uid };
});
