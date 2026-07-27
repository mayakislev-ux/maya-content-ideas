const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { buildTicketPdf } = require('./ticket-pdf');

const webhookSecret = defineSecret('GROW_WEBHOOK_SECRET');
const fireberryApiKey = defineSecret('FIREBERRY_API_KEY');
const gmailAppPassword = defineSecret('GMAIL_APP_PASSWORD');
const metaCapiAccessToken = defineSecret('META_CAPI_ACCESS_TOKEN');

const SENDER_EMAIL = 'kislevmaya@gmail.com';
const PARTNER_FORM_BASE_URL = 'https://us-central1-content-ideas-becd7.cloudfunctions.net/partnerDetails';
const FIREBERRY_PRODUCT_ID = '04b62103-c047-48af-8d2d-c3ffdbede82c'; // "סמינר להיות מותג" product, created 2026-07-25
const FIREBERRY_TRANSACTION_OBJECT = '1001'; // custom object "עסקה"
const META_PIXEL_ID = '896185345331438';
const SEMINAR_LANDING_PAGE_URL = 'https://mayakislev-ux.github.io/lehiyot-brand/סמינר-להיות-מותג.html';

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
    pcfsum: amount || '',
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
  const recordId = parsed && parsed.data && (parsed.data.Record ? parsed.data.Record.customobject1001id : parsed.data.customobject1001id);

  // Fireberry auto-fills pcfsum ("שווי עסקה") from the linked product's CATALOG price the
  // instant pcfproduct is set, overwriting whatever was sent - and this override does not
  // always happen synchronously within the create request. A same-request PUT fixup usually
  // sticks, but was confirmed 2026-07-25 to sometimes lose a race against Fireberry's own
  // async default-fill (two real couple tickets, both 297, deployed under identical code 7
  // minutes apart: one landed correctly, one silently reverted to the 197 catalog price).
  // So: PUT, then re-check and retry a few times with a short delay, instead of trusting a
  // single PUT to be final.
  if (recordId && amount) {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    for (let attempt = 0; attempt < 3; attempt++) {
      const putRes = await fetch(`https://api.fireberry.com/api/record/${FIREBERRY_TRANSACTION_OBJECT}/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', tokenid: fireberryApiKey.value() },
        body: JSON.stringify({ pcfsum: amount }),
      });
      if (!putRes.ok) {
        console.error(`Fireberry pcfsum fixup PUT failed (${putRes.status}): ${await putRes.text()}`);
        break;
      }
      await sleep(1500);
      const checkRes = await fetch(`https://api.fireberry.com/api/record/${FIREBERRY_TRANSACTION_OBJECT}/${recordId}`, {
        headers: { 'Content-Type': 'application/json', tokenid: fireberryApiKey.value() },
      });
      const checkJson = await checkRes.json();
      const currentSum = checkJson && checkJson.data && checkJson.data.Record && checkJson.data.Record.pcfsum;
      if (Number(currentSum) === Number(amount)) break;
      console.warn(`Fireberry pcfsum fixup: attempt ${attempt + 1} did not stick (got ${currentSum}, wanted ${amount}), retrying.`);
    }
  }

  return recordId;
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// Meta requires E.164-ish digits only (country code, no +, no leading 0) before hashing.
// Israeli numbers arrive from Grow as a local 0-prefixed number (e.g. 0525533679).
function normalizeIsraeliPhoneForMeta(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  return digits;
}

/**
 * Reports a real purchase back to Meta server-side (Conversions API), keyed by hashed
 * email/phone since Grow's checkout is a separate domain that never carries Meta's own
 * click ID (fbc/fbp) through to the payment step - there is no browser-side click context
 * available here at all, only who paid and how much, from the Grow webhook payload.
 *
 * Why this exists: the ad campaign is optimized for "Purchase" (OUTCOME_SALES), but the
 * Meta Pixel installed on the landing page can only ever see a PageView/InitiateCheckout -
 * the actual payment happens on Grow, off-site, so Meta never saw a single real Purchase
 * event and had zero signal to learn who actually buys. Confirmed by comparing to Maya's
 * past successful "אתגר" OUTCOME_SALES campaigns, which used a third-party tool ("Smart
 * Leads") that did this same server-side reporting - this is the same fix, self-built.
 */
async function reportMetaPurchase({ email, phone, amount, orderId }) {
  const userData = {};
  if (email) userData.em = [sha256Hex(email.trim().toLowerCase())];
  const normalizedPhone = normalizeIsraeliPhoneForMeta(phone);
  if (normalizedPhone) userData.ph = [sha256Hex(normalizedPhone)];
  if (!userData.em && !userData.ph) {
    console.warn('reportMetaPurchase: no email or phone to match on, skipping.');
    return;
  }

  const event = {
    event_name: 'Purchase',
    event_time: Math.floor(Date.now() / 1000),
    event_id: orderId || undefined,
    event_source_url: SEMINAR_LANDING_PAGE_URL,
    action_source: 'website',
    user_data: userData,
    custom_data: { value: Number(amount) || 0, currency: 'ILS' },
  };

  const res = await fetch(`https://graph.facebook.com/v21.0/${META_PIXEL_ID}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [event], access_token: metaCapiAccessToken.value() }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Meta Conversions API failed (${res.status}): ${text}`);
  console.log('reportMetaPurchase: sent successfully:', text);
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
// TEMPORARY (2026-07-27, Maya's explicit go-ahead): metaCapiAccessToken left
// out of the secrets list below - META_CAPI_ACCESS_TOKEN was never actually
// set in Secret Manager (confirmed: `firebase functions:secrets:get` returns
// 404), which blocks ANY function deploy in this whole functions/ directory,
// not just this one (Firebase validates every declared secret across the
// codebase before deploying anything). reportMetaPurchase() already wraps
// its own failure in a try/catch that logs and continues without blocking
// the customer's ticket, so this doesn't change real behavior for anyone who
// hits this webhook - it just stops it from blocking unrelated deploys until
// the real token is set. Restore metaCapiAccessToken to this array once it is.
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
      await reportMetaPurchase(fields);
    } catch (err) {
      console.error('Meta Conversions API report failed:', err);
      // continue anyway - a failed ad-optimization signal must never block the customer's ticket
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
