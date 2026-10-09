/* קליטת שאלון ההכנה לפגישת אסטרטגיה.
 *
 * 08/10/2026 (מאיה: "אני רוצה שהיא תמלא ושזה יגיע אליי איך שהוא, אני
 * חייבת קובץ מסודר"). עד עכשיו הדף רק שמר את התשובות בדפדפן של הלקוחה
 * ופתח לה תפריט שיתוף, כלומר אם היא לא זכרה לשלוח בעצמה בוואטסאפ, מאיה
 * לא קיבלה כלום ואפילו לא ידעה שהיא מילאה.
 *
 * מה קורה כאן, בסדר הזה בכוונה:
 *   1. שמירה ב-Firestore. זה קודם לכל השאר, כי ברגע שהתשובות שמורות הן
 *      כבר לא יכולות ללכת לאיבוד גם אם המייל או הוואטסאפ ייכשלו.
 *   2. מייל למאיה עם הקובץ מצורף.
 *   3. הודעת וואטסאפ קצרה, כדי שהיא תדע מיד בלי לבדוק מייל.
 *
 * כישלון בשלב 2 או 3 לא מחזיר שגיאה ללקוחה: מבחינתה ההגשה הצליחה, כי
 * התשובות באמת נשמרו. מה שנכשל נרשם בלוג ובמסמך עצמו, כדי שיהיה אפשר
 * לדעת שצריך לשלוף ידנית.
 */
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// nodemailer נטען רק כשבאמת שולחים, כמו ב-grow-payment-webhook
let mailer = null;
function transport(pass) {
  if (!mailer) mailer = require('nodemailer');
  return mailer.createTransport({ service: 'gmail', auth: { user: SENDER_EMAIL, pass } });
}

const gmailAppPassword = defineSecret('GMAIL_APP_PASSWORD');
const greenApiIdInstance = defineSecret('GREEN_API_ID_INSTANCE');
const greenApiTokenInstance = defineSecret('GREEN_API_TOKEN_INSTANCE');

const SENDER_EMAIL = 'kislevmaya@gmail.com';
const MAYA_EMAIL = 'mayakislev@gmail.com';
const MAYA_CHAT_ID = '972525533679@c.us';
const MAX_TEXT = 60000;
/* תו סימון שגורם לווינדוס לפתוח את הקובץ בעברית ולא בג'יבריש.
   כתוב כקוד ולא כתו עצמו, כי תו בלתי נראה בקוד נעלם בעריכה. */
const BOM = String.fromCharCode(0xFEFF);

/* רק הדפים של מאיה רשאים לשלוח לכאן. זה לא סוד ולא אימות, זו חסימה של
   שימוש מאתר זר. */
const ALLOWED_ORIGINS = new Set([
  'https://maya-liui.web.app',
  'https://mayakislev-ux.github.io',
  'https://maya-client-portal.web.app',
]);

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Max-Age', '3600');
}

const israelStamp = () => new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });

async function notifyWhatsApp(message) {
  const url = `https://api.green-api.com/waInstance${greenApiIdInstance.value()}/SendMessage/${greenApiTokenInstance.value()}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: MAYA_CHAT_ID, message }),
  });
  const raw = await res.text();
  return raw.includes('"idMessage"');
}

const strategyForm = onRequest(
  { region: 'us-central1', secrets: [gmailAppPassword, greenApiIdInstance, greenApiTokenInstance], cors: false },
  async (req, res) => {
    cors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST בלבד' });

    const body = req.body || {};
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const who = (typeof body.who === 'string' ? body.who : 'לא ידוע').trim().slice(0, 80) || 'לא ידוע';
    const form = (typeof body.form === 'string' ? body.form : 'שאלון').trim().slice(0, 80) || 'שאלון';
    const answered = Number.isFinite(body.answered) ? body.answered : null;
    const total = Number.isFinite(body.total) ? body.total : null;

    if (!text) return res.status(400).json({ ok: false, error: 'אין תשובות לשמור' });
    if (text.length > MAX_TEXT) return res.status(413).json({ ok: false, error: 'השאלון ארוך מדי' });

    const db = getFirestore();
    const stamp = israelStamp();
    const fileName = `${form} ${who} ${stamp.replace(/[/:]/g, '-')}.txt`;

    /* 1. שמירה קודם. מכאן והלאה התשובות לא הולכות לאיבוד. */
    let docId = null;
    try {
      const ref = await db.collection('strategyForms').add({
        form, who, text, answered, total,
        receivedAt: FieldValue.serverTimestamp(),
        receivedAtLocal: stamp,
        userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
        emailSent: false,
        whatsappSent: false,
      });
      docId = ref.id;
    } catch (err) {
      console.error('strategyForm: save failed', err?.message);
      return res.status(500).json({ ok: false, error: 'השמירה נכשלה, אפשר לנסות שוב' });
    }

    /* 2. מייל עם הקובץ. BOM בתחילת הקובץ כדי שעברית תיפתח נכון בווינדוס. */
    let emailSent = false;
    try {
      await transport(gmailAppPassword.value()).sendMail({
        from: `שאלוני מאיה <${SENDER_EMAIL}>`,
        to: MAYA_EMAIL,
        subject: `${form} · ${who} · ${stamp}`,
        text: `${who} מילאה את ${form}.\n`
          + (answered !== null && total !== null ? `ענתה על ${answered} מתוך ${total} שאלות.\n` : '')
          + `\nהתשובות מצורפות כקובץ, ומופיעות גם למטה.\n\n${'-'.repeat(50)}\n\n${text}`,
        attachments: [{ filename: fileName, content: BOM + text, contentType: 'text/plain; charset=utf-8' }],
      });
      emailSent = true;
    } catch (err) {
      console.error('strategyForm: email failed', err?.message);
    }

    /* 3. התראה בוואטסאפ, כדי שהיא תדע בלי לבדוק מייל. */
    let whatsappSent = false;
    try {
      whatsappSent = await notifyWhatsApp(
        `📋 ${who} מילאה את ${form}.`
        + (answered !== null && total !== null ? `\nענתה על ${answered} מתוך ${total} שאלות.` : '')
        + (emailSent ? '\n\nהקובץ נשלח אלייך למייל.' : '\n\n⚠️ המייל לא יצא. התשובות שמורות, אפשר לשלוף אותן.'),
      );
    } catch (err) {
      console.error('strategyForm: whatsapp failed', err?.message);
    }

    try {
      await db.collection('strategyForms').doc(docId).update({ emailSent, whatsappSent });
    } catch { /* סימון בלבד, לא קריטי */ }

    console.log('strategyForm', JSON.stringify({ docId, form, who, emailSent, whatsappSent, chars: text.length }));
    /* ללקוחה תמיד מוחזרת הצלחה אם נשמר, כי מבחינתה זה באמת הצליח. */
    return res.status(200).json({ ok: true, id: docId });
  },
);

module.exports = { strategyForm, ALLOWED_ORIGINS, MAX_TEXT };
