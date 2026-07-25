const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const fireberryApiKey = defineSecret('FIREBERRY_API_KEY');
const FIREBERRY_TRANSACTION_OBJECT = '1001'; // custom object "עסקה"

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formPage({ id, error, done }) {
  if (done) {
    return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>תודה!</title>
    <style>body{font-family:Assistant,Arial,sans-serif;background:#f4f0fa;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:1.5rem;}
    .card{background:#fff;border-radius:16px;padding:2rem;box-shadow:0 8px 20px rgba(36,9,63,0.1);max-width:360px;}
    h1{color:#24093f;font-size:1.2rem;}</style></head>
    <body><div class="card"><h1>תודה! 🎉</h1><p>קיבלנו את הפרטים, נתראה בסמינר.</p></div></body></html>`;
  }
  return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>פרטי בן/בת הזוג</title>
  <style>
    body { font-family: Assistant, Arial, sans-serif; background: #f4f0fa; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
    .card { background: #fff; border-radius: 16px; padding: 2rem; box-shadow: 0 8px 20px rgba(36,9,63,0.1); max-width: 380px; width: 100%; box-sizing: border-box; }
    h1 { color: #24093f; font-size: 1.2rem; margin-top: 0; }
    p { color: #695e80; font-size: 0.92rem; }
    input { width: 100%; box-sizing: border-box; padding: 0.7rem; margin-bottom: 0.8rem; border: 1px solid #ddd; border-radius: 8px; font-size: 1rem; }
    button { width: 100%; padding: 0.8rem; border: none; border-radius: 8px; background: #7b3799; color: #fff; font-size: 1rem; cursor: pointer; font-weight: 700; }
    .err { color: #b03030; font-size: 0.88rem; margin-bottom: 0.6rem; }
  </style>
  </head><body>
  <div class="card">
    <h1>פרטי בן/בת הזוג לכרטיס הזוגי 💛</h1>
    <p>סמינר להיות מותג</p>
    ${error ? `<div class="err">${escapeHtml(error)}</div>` : ''}
    <form method="POST">
      <input type="hidden" name="id" value="${escapeHtml(id)}">
      <input name="partnerName" placeholder="שם מלא" required>
      <input name="partnerPhone" placeholder="מספר נייד" required>
      <button type="submit">שליחה</button>
    </form>
  </div>
  </body></html>`;
}

async function updateFireberryPartner(recordId, partnerName, partnerPhone) {
  const getRes = await fetch(`https://api.fireberry.com/api/record/${FIREBERRY_TRANSACTION_OBJECT}/${recordId}`, {
    headers: { 'Content-Type': 'application/json', tokenid: fireberryApiKey.value() },
  });
  const getJson = await getRes.json();
  if (!getRes.ok || !getJson.success) throw new Error('record not found');
  const currentName = (getJson.data && getJson.data.Record && getJson.data.Record.name) || '';
  const baseName = currentName.replace(/\s*\(זוגי[^)]*\)\s*$/, '').trim();
  const newName = `${baseName} (זוגי - עם: ${partnerName}, ${partnerPhone})`;

  const putRes = await fetch(`https://api.fireberry.com/api/record/${FIREBERRY_TRANSACTION_OBJECT}/${recordId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', tokenid: fireberryApiKey.value() },
    body: JSON.stringify({ name: newName }),
  });
  const putText = await putRes.text();
  if (!putRes.ok) throw new Error(`Fireberry update failed (${putRes.status}): ${putText}`);
}

/**
 * Small form linked from the couple-ticket email ("fill in your partner's details")
 * instead of asking for an email reply - avoids needing any inbox-reading access at all
 * (which turned out to require infrastructure not readily available - see
 * grow-payment-ticket-automation-project memory). The Fireberry record's own GUID in the
 * link (?id=...) is the only "auth" - unguessable enough for this low-stakes update
 * (adding a name+phone to an already-existing deal), same trust model as a typical
 * email magic-link.
 */
exports.partnerDetails = onRequest(
  { region: 'us-central1', secrets: [fireberryApiKey] },
  async (req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8');

    if (req.method === 'POST') {
      const { id, partnerName, partnerPhone } = req.body || {};
      if (!id || !partnerName || !partnerPhone) {
        res.status(400).send(formPage({ id, error: 'נא למלא שם ומספר נייד' }));
        return;
      }
      try {
        await updateFireberryPartner(id, partnerName, partnerPhone);
        res.status(200).send(formPage({ done: true }));
      } catch (err) {
        console.error('partnerDetails update failed:', err);
        res.status(500).send(formPage({ id, error: 'שגיאה בשמירה, נסי שוב או כתבי לנו' }));
      }
      return;
    }

    const id = req.query.id;
    if (!id) {
      res.status(400).send('חסר מזהה');
      return;
    }
    res.status(200).send(formPage({ id }));
  }
);
