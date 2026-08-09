/**
 * Auto-delivers the free "10 marketing myths" gift video the instant a cold
 * visitor clicks the wa.me lead-magnet link on the seminar landing page, then
 * follows up ~24h later nudging toward the seminar itself.
 *
 * Trigger text must match the landing page's wa.me pre-filled `text=` param
 * EXACTLY (see .lead-magnet-link in סמינר-להיות-מותג.html) - this is what
 * keeps giftAutoReply from ever firing on a real client conversation on the
 * same WhatsApp business number: only a message that is byte-identical to
 * this specific pre-filled string triggers an automated reply.
 *
 * Requires a one-time manual step in the Green API console (Settings ->
 * Notifications): set "Webhook URL" to this deployed function's URL and
 * enable "Incoming message webhook". Not done automatically by this code -
 * that's a live-instance config change deliberately left as an explicit,
 * reviewable manual step rather than something this deploy does silently.
 */

const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

const greenApiIdInstance = defineSecret('GREEN_API_ID_INSTANCE');
const greenApiTokenInstance = defineSecret('GREEN_API_TOKEN_INSTANCE');

const GIFT_TRIGGER_TEXT = 'היי, אשמח לקבל את הסרטון החינמי על 10 המיתוסים בשיווק 🎁';
const GIFT_LANDING_PAGE_URL = 'https://mayakislev.ravpage.co.il/gift2';
const SEMINAR_LANDING_PAGE_URL = 'https://mayakislev-ux.github.io/lehiyot-brand/סמינר-להיות-מותג.html';
const FOLLOWUP_DELAY_HOURS = 24;

const GIFT_REPLY_MESSAGE = `היי! 🎁 הנה הסרטון שביקשת - "10 מיתוסים בשיווק שמשאירים אותך עם 0 מכירות":\n${GIFT_LANDING_PAGE_URL}\n\nצפייה מהנה 💜`;

const FOLLOWUP_MESSAGE = `היי! ראית את הסרטון על 10 המיתוסים בשיווק? 😊\nסקרן/ית לשמוע מה עלה לך.\n\nאם בא לך לקחת את זה צעד קדימה - "סמינר להיות מותג" הוא בדיוק ההמשך הטבעי לתוכן שראית. פרטים מלאים כאן:\n${SEMINAR_LANDING_PAGE_URL}`;

async function sendGreenApiMessage(idInstance, token, chatId, message) {
  const url = `https://api.green-api.com/waInstance${idInstance}/SendMessage/${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, message }),
  });
  const raw = await res.text();
  return { ok: raw.includes('"idMessage"'), raw };
}

// WhatsApp clients sometimes inject invisible Unicode bidi control characters
// (LRM/RLM, embedding/override/isolate marks) into mixed Hebrew+digit+emoji
// text - stripped here, from both the incoming text and the trigger constant,
// so a message that LOOKS identical but differs only by invisible characters
// still matches.
const BIDI_CONTROL_CHARS_RE = /[‎‏‪-‮⁦-⁩]/g;
// A real production message failed to match only because its trailing emoji
// arrived as a corrupted U+FFFD replacement character (likely a client-side
// retyping/encoding issue, not something under our control) - trailing
// emoji/symbol/replacement-char noise is stripped from both sides before
// comparing, so the match rests on the actual sentence, not the decorative emoji.
const BIDI_CONTROL_CHARS_RE_G = BIDI_CONTROL_CHARS_RE;
const TRAILING_SYMBOL_RE = /[\s\u{FFFD}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]+$/u;
function normalizeText(text) {
  return (text || '')
    .replace(BIDI_CONTROL_CHARS_RE_G, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(TRAILING_SYMBOL_RE, '')
    .trim();
}
const NORMALIZED_TRIGGER_TEXT = normalizeText(GIFT_TRIGGER_TEXT);

/**
 * Green API's incoming-message webhook shape (typeWebhook: "incomingMessageReceived"):
 * { senderData: { chatId, ... }, messageData: { textMessageData: { textMessage } } }
 * Everything that isn't exactly this shape, or whose text isn't an exact match
 * to GIFT_TRIGGER_TEXT, is ignored (200 OK, no action) - this must never throw
 * or 4xx/5xx on unrelated traffic, or Green API may disable the webhook.
 */
exports.giftAutoReply = onRequest(
  { region: 'us-central1', secrets: [greenApiIdInstance, greenApiTokenInstance] },
  async (req, res) => {
    const body = req.body || {};
    // Always logged, unconditionally, so any future "nothing happened" report
    // can be diagnosed from real data instead of guesswork - this line must
    // never be removed even once matching is confirmed reliable.
    console.log('giftAutoReply: received webhook body:', JSON.stringify(body));

    if (body.typeWebhook !== 'incomingMessageReceived') {
      console.log('giftAutoReply: ignored - typeWebhook was', body.typeWebhook);
      res.status(200).send('ignored: not an incoming message');
      return;
    }

    const chatId = body.senderData && body.senderData.chatId;
    // Green API sends plain text as messageData.textMessageData.textMessage, but
    // messages Green API classifies as "extended" (link previews, certain client
    // formatting) arrive instead as messageData.extendedTextMessageData.text - a
    // real message with the exact trigger phrase was missed in production because
    // only the first shape was checked. Both are checked here now.
    const md = body.messageData || {};
    const rawText = (md.textMessageData && md.textMessageData.textMessage) || (md.extendedTextMessageData && md.extendedTextMessageData.text);
    if (!chatId || !rawText) {
      console.log('giftAutoReply: ignored - missing chatId or text. chatId:', chatId, 'rawText:', rawText);
      res.status(200).send('ignored: no chatId/text');
      return;
    }

    const normalized = normalizeText(rawText);
    if (normalized !== NORMALIZED_TRIGGER_TEXT) {
      console.log('giftAutoReply: ignored - text did not match trigger. Got:', JSON.stringify(rawText), 'normalized:', JSON.stringify(normalized));
      res.status(200).send('ignored: not the gift trigger phrase');
      return;
    }

    const db = admin.firestore();
    const ref = db.collection('giftFollowups').doc(chatId);
    const existing = await ref.get();
    if (existing.exists) {
      // Already handled once for this chat (e.g. they clicked the link twice) -
      // never re-send the gift or reset the 24h follow-up clock.
      console.log('giftAutoReply: ignored - gift already sent to', chatId);
      res.status(200).send('ignored: gift already sent to this chat');
      return;
    }

    const { ok, raw } = await sendGreenApiMessage(greenApiIdInstance.value(), greenApiTokenInstance.value(), chatId, GIFT_REPLY_MESSAGE);
    if (!ok) {
      console.error('giftAutoReply: Green API send failed:', raw);
      res.status(200).send('send failed, logged');
      return;
    }

    await ref.set({
      chatId,
      sentGiftAt: admin.firestore.FieldValue.serverTimestamp(),
      followupSent: false,
    });
    console.log('giftAutoReply: gift sent to', chatId);
    res.status(200).send('gift sent');
  }
);

/** Runs hourly; sends the 24h nudge to anyone who received the gift >=24h ago and hasn't gotten it yet. */
exports.giftFollowupSender = onSchedule(
  { schedule: 'every 60 minutes', region: 'us-central1', secrets: [greenApiIdInstance, greenApiTokenInstance] },
  async () => {
    const db = admin.firestore();
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - FOLLOWUP_DELAY_HOURS * 3600 * 1000);
    const snap = await db
      .collection('giftFollowups')
      .where('followupSent', '==', false)
      .where('sentGiftAt', '<=', cutoff)
      .get();

    if (snap.empty) {
      console.log('giftFollowupSender: nothing due.');
      return;
    }

    const { id, token } = { id: greenApiIdInstance.value(), token: greenApiTokenInstance.value() };
    for (const doc of snap.docs) {
      const { chatId } = doc.data();
      const { ok, raw } = await sendGreenApiMessage(id, token, chatId, FOLLOWUP_MESSAGE);
      if (ok) {
        await doc.ref.update({ followupSent: true, followupSentAt: admin.firestore.FieldValue.serverTimestamp() });
        console.log('giftFollowupSender: follow-up sent to', chatId);
      } else {
        console.error('giftFollowupSender: send failed for', chatId, raw);
      }
    }
  }
);
