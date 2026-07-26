const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');

const fireberryApiKey = defineSecret('FIREBERRY_API_KEY');
const greenApiIdInstance = defineSecret('GREEN_API_ID_INSTANCE');
const greenApiTokenInstance = defineSecret('GREEN_API_TOKEN_INSTANCE');

const FIREBERRY_TRANSACTION_OBJECT = 1001; // custom object "עסקה"
const FIREBERRY_PRODUCT_ID = '04b62103-c047-48af-8d2d-c3ffdbede82c'; // "סמינר להיות מותג"
const RECIPIENT_CHAT_ID = '972525533679@c.us'; // מאיה, 0525533679

function israelToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

async function fetchSeminarRecords() {
  const res = await fetch('https://api.fireberry.com/api/v3/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', tokenid: fireberryApiKey.value() },
    body: JSON.stringify({
      objectType: FIREBERRY_TRANSACTION_OBJECT,
      fields: [{ name: 'name' }, { name: 'pcfsum' }, { name: 'createdon' }],
      filter: [{ type: 'AND', conditions: [{ fieldName: 'pcfproduct', operator: 'eq', value: FIREBERRY_PRODUCT_ID }] }],
      pageSize: 200,
      pageNumber: 1,
    }),
  });
  if (!res.ok) throw new Error(`Fireberry query failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  return json.data || [];
}

function buildSummaryMessage(records) {
  const today = israelToday();
  // The 0.1 ₪ records are Maya's own test purchases, never a real ticket price - exclude them.
  const real = records.filter((r) => Number(r.pcfsum) >= 1);
  const totalRevenue = real.reduce((sum, r) => sum + Number(r.pcfsum), 0);
  const singleCount = real.filter((r) => Number(r.pcfsum) < 250).length;
  const coupleCount = real.filter((r) => Number(r.pcfsum) >= 250).length;
  const todayRecords = real.filter((r) => (r.createdon || '').slice(0, 10) === today);

  const lines = [
    `📊 סיכום יומי - סמינר להיות מותג (${today})`,
    '',
    `היום: ${todayRecords.length} רכישות חדשות`,
    todayRecords.length
      ? todayRecords.map((r) => `• ${(r.name || '').split(' - ')[0]} - ${Number(r.pcfsum)}₪`).join('\n')
      : null,
    '',
    `סה"כ עד כה: ${real.length} רכישות (${singleCount} יחיד, ${coupleCount} זוגי)`,
    `סה"כ הכנסות: ${totalRevenue}₪`,
  ].filter((l) => l !== null);

  return lines.join('\n');
}

async function sendGreenApiMessage(chatId, message) {
  const url = `https://api.green-api.com/waInstance${greenApiIdInstance.value()}/SendMessage/${greenApiTokenInstance.value()}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, message }),
  });
  const raw = await res.text();
  return { ok: raw.includes('"idMessage"'), raw };
}

/**
 * Daily WhatsApp summary of real seminar purchases, sent to Maya's own number every day
 * at 20:00 Israel time - runs in the cloud so it fires even with her computer off.
 * GA4 entry/traffic-source numbers are NOT included yet (no live GA4 API connection set
 * up as of 2026-07-26) - this covers only real Fireberry purchase data for now.
 */
exports.dailySummary = onSchedule(
  { schedule: '0 20 * * *', timeZone: 'Asia/Jerusalem', region: 'us-central1', secrets: [fireberryApiKey, greenApiIdInstance, greenApiTokenInstance] },
  async () => {
    const records = await fetchSeminarRecords();
    const message = buildSummaryMessage(records);
    const { ok, raw } = await sendGreenApiMessage(RECIPIENT_CHAT_ID, message);
    if (!ok) {
      console.error('dailySummary: WhatsApp send failed:', raw);
      throw new Error('WhatsApp send failed');
    }
    console.log('dailySummary: sent successfully');
  }
);
