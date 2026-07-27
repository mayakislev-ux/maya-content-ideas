const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const fireberryApiKey = defineSecret('FIREBERRY_API_KEY');
const FIREBERRY_PRODUCT_ID = '04b62103-c047-48af-8d2d-c3ffdbede82c'; // "סמינר להיות מותג"

/**
 * Public, read-only count of real seminar registrations - used on the landing page itself
 * as an honest live "X already registered" number instead of a static/fake scarcity claim.
 * Safe to expose with no secret gate: it returns a single integer, never names/emails/phones.
 * Excludes the 0.1 ₪ test purchases the same way the daily WhatsApp summary does.
 */
exports.seminarRegistrationCount = onRequest(
  { region: 'us-central1', secrets: [fireberryApiKey], cors: true },
  async (req, res) => {
    try {
      const r = await fetch('https://api.fireberry.com/api/v3/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', tokenid: fireberryApiKey.value() },
        body: JSON.stringify({
          objectType: 1001,
          fields: [{ name: 'pcfsum' }],
          filter: [{ type: 'AND', conditions: [{ fieldName: 'pcfproduct', operator: 'eq', value: FIREBERRY_PRODUCT_ID }] }],
          pageSize: 200,
          pageNumber: 1,
        }),
      });
      const json = await r.json();
      const records = json.data || [];
      const count = records.filter((rec) => Number(rec.pcfsum) >= 1).length;
      res.set('Cache-Control', 'public, max-age=300');
      res.status(200).json({ count });
    } catch (err) {
      console.error('seminarRegistrationCount failed:', err);
      res.status(200).json({ count: null });
    }
  }
);
