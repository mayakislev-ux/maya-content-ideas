/* טיוטה של שאלון, שמורה בשרת ולא רק במכשיר.
 *
 * 10/10/2026, מאופק: "אתמול התחלתי לעבוד על זה והייתי בטוחה שנשמר ולא
 * נשמר". הקוד בדף תקין, הוא שומר בכל הקלדה, בעזיבת שדה ובסגירת הדף,
 * ומזהיר באדום כשהדפדפן חוסם. אבל האחסון במכשיר הוא פר כתובת ופר
 * דפדפן, והדף מוגש משתי כתובות (web.app ו-firebaseapp.com), וגם נפתח
 * הרבה פעמים מתוך דפדפן מוטמע של וואטסאפ או אינסטגרם שלא בהכרח שומר
 * בין פתיחות. על 29 שאלות זה פער שעולה למישהי שעה של עבודה.
 *
 * לכן הטיוטה נשמרת גם בשרת, והדף טוען בפתיחה את מה שחדש יותר. מכאן
 * זה שורד החלפת דפדפן, החלפת מכשיר והחלפת כתובת.
 *
 * אין כאן אימות משתמש, כי לשאלון עצמו אין התחברות. המזהה ארוך ואינו
 * ניתן לניחוש, והוא יושב בדף שממילא רק מי שקיבלה את הקישור מגיעה אליו.
 */
const { onRequest } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const MAX_ANSWER = 4000;
const MAX_FIELDS = 60;

function clean(answers) {
  const out = {};
  if (!answers || typeof answers !== 'object') return out;
  let n = 0;
  for (const [k, v] of Object.entries(answers)) {
    if (n >= MAX_FIELDS) break;
    if (!/^\d{1,3}$/.test(String(k))) continue;
    if (typeof v !== 'string') continue;
    out[k] = v.slice(0, MAX_ANSWER);
    n += 1;
  }
  return out;
}

exports.formDraft = onRequest(
  { region: 'us-central1', cors: true, maxInstances: 3 },
  async (req, res) => {
    const db = getFirestore();
    const id = String(req.query.id || (req.body && req.body.id) || '').trim();
    /* מזהה ארוך בלבד, כדי שלא יהיה אפשר לסרוק טיוטות של אחרים. */
    if (!/^[a-z0-9-]{16,80}$/.test(id)) {
      res.status(400).json({ ok: false, error: 'מזהה לא תקין' });
      return;
    }
    const ref = db.collection('formDrafts').doc(id);

    if (req.method === 'GET') {
      const snap = await ref.get();
      res.json({
        ok: true,
        answers: snap.exists ? (snap.data().answers || {}) : {},
        savedAt: snap.exists ? (snap.data().savedAtMs || 0) : 0,
      });
      return;
    }

    /* ניקוי טיוטה, מאחורי המפתח הארוך. נדרש אחרי בדיקה, וגם אם מישהי
       רוצה להתחיל מחדש. ריקון רגיל בכוונה אינו יכול לדרוס תוכן. */
    if (req.method === 'DELETE' || req.query.clear === '1') {
      if (req.query.key !== '8cd9dd930910001365d33a48930453c8') {
        res.status(403).json({ ok: false });
        return;
      }
      await ref.delete();
      res.json({ ok: true, cleared: true });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ ok: false });
      return;
    }

    const answers = clean(req.body && req.body.answers);
    const filled = Object.values(answers).filter((v) => v.trim()).length;
    /* טיוטה ריקה לא דורסת טיוטה שיש בה תוכן. זה מונע מצב שבו פתיחה
       של הדף במכשיר אחר, לפני שהטעינה הספיקה, מוחקת את מה שנכתב. */
    if (filled === 0) {
      const snap = await ref.get();
      if (snap.exists && Object.values(snap.data().answers || {}).some((v) => String(v).trim())) {
        res.json({ ok: true, skipped: 'ריק, לא דרסתי' });
        return;
      }
    }

    await ref.set({
      answers,
      filled,
      savedAt: FieldValue.serverTimestamp(),
      savedAtMs: Date.now(),
    }, { merge: true });
    res.json({ ok: true, filled });
  },
);

module.exports.cleanAnswers = clean;
