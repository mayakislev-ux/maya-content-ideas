/* 15/10/2026 (מאיה: "היא עשתה מנוי של 79 שקלים חודשי מתחדש וזה מחובר
   למורנינג, אז אשמח שברגע שזה יבוטל אוטומטית תכבי לה גישה").

   הגישה למנוי "רפרנסים בלבד" נקבעת לפי paidUntil ב-allowlist, וכבר נאכפת
   בשרת, בכללים ובמסך. מה שחסר היה מי שמזיז את התאריך. כאן: כל בוקר, לכל
   מנוית עם billing:'morning', מחפשים במורנינג את הקבלה האחרונה ששולמה על
   הסכום של המנוי, וקובעים paidUntil = חודש אחרי התשלום ועוד 7 ימי חסד.

   אין כאן "כיבוי". מנוי שבוטל פשוט לא מייצר קבלה חדשה, והתאריך עובר לבד.
   כך גם חיוב שנכשל סוגר את הגישה, ואף אחד לא צריך לזכור לעשות כלום. */
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

const MORNING_API_ID = defineSecret('MORNING_API_ID');
const MORNING_API_SECRET = defineSecret('MORNING_API_SECRET');
const GREEN_ID = defineSecret('GREEN_API_ID_INSTANCE');
const GREEN_TOKEN = defineSecret('GREEN_API_TOKEN_INSTANCE');
const BASE = 'https://api.greeninvoice.co.il/api/v1';
const RECEIPT_TYPES = [320, 400]; // חשבונית מס/קבלה, קבלה
const GRACE_DAYS = 7;
const LOOKBACK_DAYS = 75;

/** חודש קלנדרי אחרי התאריך, ועוד ימי חסד, בסוף היום. מיוצא לבדיקות. */
function paidUntilFrom(isoDate, graceDays = GRACE_DAYS) {
  const [y, m, d] = String(isoDate).split('-').map(Number);
  const next = new Date(Date.UTC(y, m, d)); // m כבר 1-based, ולכן זה החודש הבא
  if (next.getUTCDate() !== d) next.setUTCDate(0); // 31/01 -> סוף פברואר
  next.setUTCDate(next.getUTCDate() + graceDays);
  next.setUTCHours(20, 59, 59, 0); // 23:59 שעון ישראל
  return next;
}

/** הקבלה האחרונה ששולמה למייל הזה על הסכום הזה. מיוצא לבדיקות.
    22/11/2026: מנויה בשבוע ניסיון נמצאת גם לפי השם בקבלה, כי בדף התשלום
    לקוחה לא תמיד מקלידה את המייל שאיתו היא מתחברת. ורק קבלה מיום פתיחת
    הניסיון והלאה, כדי שתשלום ישן על משהו אחר לא יפתח גישה. */
function lastPaidReceipt(docs = [], { email, amount, name = null, since = null }) {
  const want = String(email || '').toLowerCase();
  const wantName = String(name || '').replace(/\s+/g, ' ').trim();
  const matches = (d) => {
    if (((d.client && d.client.emails) || []).some((e) => String(e).toLowerCase() === want)) return true;
    if (!wantName || wantName.length < 4) return false;
    return String((d.client && d.client.name) || '').replace(/\s+/g, ' ').includes(wantName);
  };
  return docs
    .filter((d) => d && RECEIPT_TYPES.includes(Number(d.type)))
    .filter((d) => Number(d.status) !== 4) // מבוטל
    .filter((d) => Math.abs(Number(d.amount) - Number(amount)) < 0.01)
    .filter((d) => !since || String(d.documentDate) >= since)
    .filter(matches)
    .sort((a, b) => String(b.documentDate).localeCompare(String(a.documentDate)))[0] || null;
}

/** תאריך פתיחת הניסיון כ-YYYY-MM-DD בישראל, או null. */
function trialStart(data) {
  const c = data && data.createdAt;
  const d = c && c.toDate ? c.toDate() : (c ? new Date(c) : null);
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

async function tellMaya(message) {
  const id = GREEN_ID.value();
  try {
    const res = await fetch(`https://${String(id).slice(0, 4)}.api.greenapi.com/waInstance${id}/SendMessage/${GREEN_TOKEN.value()}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: '972525533679@c.us', message }), signal: AbortSignal.timeout(20000),
    });
    console.log('syncRefsSubscriptions: וואטסאפ למאיה', (await res.text()).slice(0, 120));
  } catch (err) { console.error('syncRefsSubscriptions: וואטסאפ נכשל', err.message); }
}

async function morning(path, body, token) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`morning ${path} ${res.status}`);
  return res.json();
}

/* 20/10/2026: מורנינג סגרו את /account/token (404 לכל מפתח), והסנכרון נכשל
   ב-19/10 וב-20/10. הכתובת החדשה: OAuth 2.0 עם client_credentials, אותו
   מפתח. שאר הקריאות נשארות ב-BASE. */
async function morningToken(id, secret) {
  const res = await fetch('https://api.morning.co/idp/v1/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
  });
  if (!res.ok) throw new Error(`morning token ${res.status}`);
  const j = await res.json();
  const token = j.accessToken || j.token;
  if (!token) throw new Error('morning token missing');
  return token;
}

async function recentReceipts(token, now = new Date()) {
  const from = new Date(now.getTime() - LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  const out = [];
  for (let page = 1; page <= 20; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const r = await morning('/documents/search', { type: RECEIPT_TYPES, fromDate: from, toDate: to, pageSize: 100, page }, token);
    const items = (r && r.items) || [];
    out.push(...items);
    if (items.length < 100) break;
  }
  return out;
}

/* 22/11/2026 (מאיה, לפני הטיסה: "אם עובר שבוע והיא רוצה לשלם 79... המחשב
   כבוי... שזה יעבוד בלי צורך במחשב או בך"). רץ כל שעתיים ולא פעם ביום,
   ובודק גם מנויות בשבוע ניסיון. ניסיון ששולם הופך למנוי רגיל לבד, ומאיה
   מקבלת וואטסאפ. ניסיון שלא שולם נסגר בתאריך שלו, כמו קודם. */
const syncRefsSubscriptions = onSchedule(
  { schedule: '15 */2 * * *', timeZone: 'Asia/Jerusalem', region: 'us-central1', secrets: [MORNING_API_ID, MORNING_API_SECRET, GREEN_ID, GREEN_TOKEN] },
  async () => {
    const db = admin.firestore();
    const subs = (await db.collection('allowlist').where('billing', 'in', ['morning', 'trial']).get()).docs
      .filter((d) => (d.data() || {}).plan === 'refs');
    if (subs.length === 0) return;
    const token = await morningToken(MORNING_API_ID.value(), MORNING_API_SECRET.value());
    const receipts = await recentReceipts(token);
    for (const sub of subs) {
      const data = sub.data() || {};
      const isTrial = data.billing === 'trial';
      const since = isTrial ? trialStart(data) : null;
      if (isTrial && !since) continue;
      const last = lastPaidReceipt(receipts, {
        email: data.billingEmail || sub.id,
        amount: data.monthlyPrice || 79,
        name: isTrial ? data.name : null,
        since,
      });
      if (!last) continue;
      const until = paidUntilFrom(last.documentDate);
      const current = data.paidUntil && data.paidUntil.toDate ? data.paidUntil.toDate() : null;
      if (!isTrial && current && current.getTime() >= until.getTime()) continue;
      const upd = {
        paidUntil: admin.firestore.Timestamp.fromDate(current && current.getTime() > until.getTime() ? current : until),
        lastPaidAt: last.documentDate,
        lastPaidDoc: String(last.number || last.id || ''),
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (isTrial) {
        Object.assign(upd, {
          billing: 'morning',
          monthlyPrice: data.monthlyPrice || 79,
          showCountdown: admin.firestore.FieldValue.delete(),
          renewOffer: admin.firestore.FieldValue.delete(),
          convertedFromTrialAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      // eslint-disable-next-line no-await-in-loop
      await sub.ref.set(upd, { merge: true });
      console.log('syncRefsSubscriptions: הוארך', { email: sub.id, trial: isTrial, lastPaidAt: last.documentDate });
      if (isTrial) {
        const who = data.name || sub.id;
        const date = upd.paidUntil.toDate().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });
        // eslint-disable-next-line no-await-in-loop
        await tellMaya([`${who} שילמה 79 ש"ח על המוח השיווקי (קבלה ${upd.lastPaidDoc}).`, `הגישה שלה נפתחה לבד, עד ${date}, ומעכשיו מתחדשת עם כל תשלום.`, 'לא צריך לעשות כלום.'].join(String.fromCharCode(10)));
      }
    }
  }
);

module.exports = { syncRefsSubscriptions, paidUntilFrom, lastPaidReceipt, trialStart };
