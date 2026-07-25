const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const attendeesSecret = defineSecret('SEMINAR_ATTENDEES_SECRET');
const fireberryApiKey = defineSecret('FIREBERRY_API_KEY');

const FIREBERRY_PRODUCT_ID = '04b62103-c047-48af-8d2d-c3ffdbede82c'; // "סמינר להיות מותג"
const FIREBERRY_TRANSACTION_OBJECT = '1001';

async function fetchAttendees() {
  const url = `https://api.fireberry.com/api/record/${FIREBERRY_TRANSACTION_OBJECT}?pagesize=200`;
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json', tokenid: fireberryApiKey.value() } });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error('Fireberry query failed: ' + JSON.stringify(json));
  const all = (json.data && json.data.Records) || [];
  return all.filter((r) => r.pcfproduct === FIREBERRY_PRODUCT_ID);
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderPage(records) {
  const rows = records
    .slice()
    .sort((a, b) => new Date(b.createdon) - new Date(a.createdon))
    .map((r) => `
      <tr>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.pcfsystemfield102)}</td>
        <td>${escapeHtml(r.pcfsystemfield105)}</td>
        <td>${escapeHtml(r.pcfsystemfield118 ? r.pcfsystemfield118 + ' ₪' : '')}</td>
        <td>${escapeHtml((r.createdon || '').slice(0, 10))}</td>
      </tr>`)
    .join('');

  return `<!doctype html>
<html dir="rtl" lang="he"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>נרשמים לסמינר להיות מותג</title>
<style>
  body { font-family: Assistant, Arial, sans-serif; background: #f4f0fa; margin: 0; padding: 1.5rem; }
  h1 { color: #24093f; font-size: 1.3rem; }
  .count { color: #7b3799; font-weight: 700; margin-bottom: 1rem; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 20px rgba(36,9,63,0.08); }
  th, td { padding: 0.7rem 1rem; text-align: right; font-size: 0.92rem; }
  th { background: #24093f; color: #d9ac5e; }
  tr:nth-child(even) { background: #f7f2fc; }
  .empty { text-align: center; color: #999; padding: 2rem; }
</style>
</head><body>
<h1>נרשמים לסמינר להיות מותג</h1>
<div class="count">${records.length} נרשמים</div>
${records.length ? `<table><thead><tr><th>שם</th><th>טלפון</th><th>מייל</th><th>סכום</th><th>תאריך</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">אין עדיין נרשמים</div>'}
</body></html>`;
}

/**
 * Read-only view of everyone who bought the "סמינר להיות מותג" ticket - the closest
 * thing to Fireberry's own "saved view filtered by product" (a native Fireberry
 * Layout-Designer feature not reachable via the API) that's buildable outside their UI.
 * Gated by a shared secret in the URL, same pattern as quickDeal/growPaymentWebhook.
 */
exports.seminarAttendees = onRequest(
  { region: 'us-central1', secrets: [attendeesSecret, fireberryApiKey] },
  async (req, res) => {
    if (req.query.secret !== attendeesSecret.value()) {
      res.status(401).send('unauthorized');
      return;
    }
    try {
      const records = await fetchAttendees();
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(renderPage(records));
    } catch (err) {
      console.error('seminarAttendees failed:', err);
      res.status(500).send('שגיאה: ' + String(err.message || err));
    }
  }
);
