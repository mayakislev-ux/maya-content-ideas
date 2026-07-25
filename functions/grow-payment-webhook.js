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
 * The exact field names Grow actually sends were NOT verified against a real payload
 * (Grow's webhook feature was only confirmed to exist, not documented in detail) - this
 * tries several plausible candidates defensively. Whatever comes in is logged in full
 * either way, so the real field names can be read from the logs on the first real (or
 * test) transaction and this extraction tightened up afterward.
 */
function extractFields(body) {
  const b = body || {};
  const pick = (...candidates) => {
    for (const c of candidates) {
      if (c != null && String(c).trim() !== '') return String(c).trim();
    }
    return '';
  };
  const customer = b.customer || b.client || b.payer || {};
  const ticketType = pick(b.product_name, b.item_name, b.offer_name) || 'כרטיס יחיד';
  const amount = pick(b.amount, b.total, b.sum, b.price, b.transaction_amount);
  // "כרטיס זוגי" detection is best-effort until a real Grow payload is seen: checks the
  // product/item name text first, falls back to the couple-ticket price (297 ₪, per the
  // seminar page's own JSON-LD offers) if the name doesn't say it outright.
  const isCouple = /זוג/.test(ticketType) || amount === '297';
  return {
    fullName: pick(b.full_name, b.fullName, b.customer_name, b.name, customer.full_name, customer.name,
      [b.first_name, b.last_name].filter(Boolean).join(' '), [customer.first_name, customer.last_name].filter(Boolean).join(' ')),
    phone: pick(b.phone, b.phone_number, b.customer_phone, customer.phone, customer.phone_number),
    email: pick(b.email, b.customer_email, b.payer_email, customer.email),
    amount,
    orderId: pick(b.transaction_id, b.order_id, b.payment_id, b.id, b.reference),
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
