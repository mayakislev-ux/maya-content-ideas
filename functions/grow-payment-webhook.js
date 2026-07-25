const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const nodemailer = require('nodemailer');
const { buildTicketPdf } = require('./ticket-pdf');

const webhookSecret = defineSecret('GROW_WEBHOOK_SECRET');
const fireberryApiKey = defineSecret('FIREBERRY_API_KEY');
const gmailAppPassword = defineSecret('GMAIL_APP_PASSWORD');

const SENDER_EMAIL = 'kislevmaya@gmail.com';
const PARTNER_FORM_BASE_URL = 'https://us-central1-content-ideas-becd7.cloudfunctions.net/partnerDetails';
const FIREBERRY_PRODUCT_ID = '04b62103-c047-48af-8d2d-c3ffdbede82c'; // "סמינר להיות מותג" product, created 2026-07-25
const FIREBERRY_TRANSACTION_OBJECT = '1001'; // custom object "עסקה"

/**
 * Pulls name/phone/email/amount out of an incoming Grow webhook payload.
 * Confirmed against a REAL Grow transaction on 2026-07-25 (a real 0.1 ₪ test purchase,
 * transactionId 82148713) - the real shape is:
 *   { err, status, data: { status, fullName, payerPhone, payerEmail, sum, transactionId,
 *     productData: [{ name, sum, quantity, ... }], ... } }
 * i.e. everything useful is nested one level under `data`, not at the top level as
 * originally guessed - that first guess silently dropped this real transaction (logged
 * but no Fireberry record/email), caught here and fixed.
 */
function extractFields(body) {
  const b = body || {};
  const d = b.data || b;
  const pick = (...candidates) => {
    for (const c of candidates) {
      if (c != null && String(c).trim() !== '') return String(c).trim();
    }
    return '';
  };
  const product = Array.isArray(d.productData) && d.productData[0] ? d.productData[0] : {};
  const ticketType = pick(product.name, d.description) || 'כרטיס יחיד';
  const amount = pick(d.sum, product.sum);
  const isCouple = /זוג/.test(ticketType);
  return {
    fullName: pick(d.fullName, d.full_name),
    phone: pick(d.payerPhone, d.phone),
    email: pick(d.payerEmail, d.email),
    amount,
    orderId: pick(d.transactionId, d.asmachta),
    ticketType,
    isCouple,
  };
}

async function createFireberryTransaction({ fullName, phone, email, amount, isCouple }) {
  const today = new Date().toISOString().slice(0, 10);
  const record = {
    name: `${fullName || 'לקוח'} - סמינר להיות מותג${isCouple ? ' (זוגי - ממתין לפרטי בן/בת זוג)' : ''} - ${today}`,
    pcfsystemfield102: phone || '',
    pcfsystemfield105: email || '',
    pcfsystemfield123: today, // תאריך סגירה
    pcfdate: today, // תאריך שסגר
    pcfsystemfield118: amount || '', // סכום ששולם
    pcfproduct: FIREBERRY_PRODUCT_ID, // משוייך למוצר
  };
  const res = await fetch(`https://api.fireberry.com/api/record/${FIREBERRY_TRANSACTION_OBJECT}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', tokenid: fireberryApiKey.value() },
    body: JSON.stringify(record),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Fireberry create failed (${res.status}): ${text}`);
  const parsed = JSON.parse(text);
  return parsed && parsed.data && (parsed.data.Record ? parsed.data.Record.customobject1001id : parsed.data.customobject1001id);
}

async function sendTicketEmail({ email, fullName, ticketType, orderId, isCouple, fireberryRecordId }) {
  const pdfBuffer = await buildTicketPdf({ fullName, ticketType, orderId, isCouple });
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: SENDER_EMAIL, pass: gmailAppPassword.value() },
  });
  const partnerFormLink = `${PARTNER_FORM_BASE_URL}?id=${encodeURIComponent(fireberryRecordId || '')}`;
  const coupleAsk = isCouple && fireberryRecordId
    ? `\n\nשמנו לב שרכשת כרטיס זוגי 💛 כדי שנוכל להכניס גם את בן/בת הזוג שמגיע/ה איתך, נשמח שתמלא/י את הפרטים שלו/ה כאן (לוקח חצי דקה):\n${partnerFormLink}\n`
    : '';
  await transporter.sendMail({
    from: `מאיה קיסלב <${SENDER_EMAIL}>`,
    to: email,
    subject: isCouple ? 'הכרטיס הזוגי שלך לסמינר להיות מותג 🎟️' : 'הכרטיס שלך לסמינר להיות מותג 🎟️',
    text: `היי ${fullName || ''},\n\nתודה שנרשמת לסמינר "להיות מותג"! מצורף כרטיס הכניסה שלך.${coupleAsk}\nמתי: יום חמישי, 3.9.2026, 15:30-21:00\nאיפה: בני ברק (הכתובת המדויקת תישלח בהודעה נפרדת קרוב לאירוע)\n\nנתראה שם!\nמאיה`,
    attachments: [{ filename: 'כרטיס-להיות-מותג.pdf', content: pdfBuffer, contentType: 'application/pdf' }],
  });
}

/**
 * HTTP endpoint for Grow's "webhook after every completed transaction" feature.
 * Grow can't do Firebase Auth, so this checks a shared secret instead - the URL Maya
 * pastes into Grow's dashboard must include ?secret=<GROW_WEBHOOK_SECRET value>.
 *
 * LIVE as of 2026-07-25 - deployed, all 3 secrets set with real values, and verified
 * end-to-end with a real test transaction (Fireberry record created correctly, ticket
 * PDF emailed successfully from kislevmaya@gmail.com). Fireberry TokenID retrieved from
 * Fireberry's own gear icon -> "ממשקי אינטרנט" (not a "Settings -> API" path as first
 * guessed).
 */
exports.growPaymentWebhook = onRequest(
  { region: 'us-central1', secrets: [webhookSecret, fireberryApiKey, gmailAppPassword] },
  async (req, res) => {
    console.log('Grow webhook raw payload:', JSON.stringify(req.body));

    if (req.query.secret !== webhookSecret.value()) {
      console.warn('Grow webhook: bad or missing secret, rejecting.');
      res.status(401).send('unauthorized');
      return;
    }

    const fields = extractFields(req.body);
    console.log('Grow webhook extracted fields:', JSON.stringify(fields));

    if (!fields.email) {
      console.error('Grow webhook: no email found in payload, cannot send ticket. Raw payload logged above for manual follow-up.');
      res.status(200).send('received, no email found');
      return;
    }

    let fireberryRecordId = null;
    try {
      fireberryRecordId = await createFireberryTransaction(fields);
    } catch (err) {
      console.error('Fireberry record creation failed:', err);
      // continue anyway - the customer should still get their ticket even if the CRM write failed
    }

    try {
      await sendTicketEmail({ ...fields, fireberryRecordId });
    } catch (err) {
      console.error('Ticket email send failed:', err);
      res.status(500).send('email failed');
      return;
    }

    res.status(200).send('ok');
  }
);
