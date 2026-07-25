const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const quickDealSecret = defineSecret('QUICK_DEAL_SECRET');
const fireberryApiKey = defineSecret('FIREBERRY_API_KEY');

const FIREBERRY_TRANSACTION_OBJECT = '1001'; // custom object "עסקה"

/** Real products pulled from Fireberry on 2026-07-25 - keep in sync if she adds/renames products. */
const PRODUCTS = [
  { id: '04b62103-c047-48af-8d2d-c3ffdbede82c', name: 'סמינר להיות מותג', price: 197 },
  { id: '987459a9-f3be-4e1d-a278-7f91fa0c4224', name: 'תהליך המהלך השיווקי', price: 11900 },
  { id: '25f9ca45-8a38-4258-8415-febaa8759a9a', name: 'פגישה אישית', price: 2360 },
  { id: '39b8187f-0997-4b37-9fff-cc375edf8fea', name: 'אבחון המצפן העסקי', price: 0 },
  { id: 'f1e5c59b-fce5-4ae3-bc85-466294442eb6', name: 'המתכון לסרטון שמוכר', price: 449 },
  { id: 'd760b62c-d3a0-4e5a-b520-24e98ac73496', name: '10 מיתוסים לשיווק', price: 0 },
  { id: 'c467cfde-bb53-4278-a47c-f81dd0c8d2ce', name: 'אתגר', price: 97 },
  { id: '525128cf-3aa0-4496-81eb-1f595f8b47c7', name: 'יום צילום - חוצפה שיווקית', price: 7900 },
];

const PAGE_HTML = `<!doctype html>
<html dir="rtl" lang="he"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>יצירת עסקה מהירה</title>
<style>
  body { font-family: Assistant, Arial, sans-serif; background: #f4f0fa; margin: 0; padding: 2rem 1rem; }
  h1 { text-align: center; color: #24093f; font-size: 1.4rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; max-width: 900px; margin: 2rem auto; }
  .card { background: #fff; border-radius: 16px; padding: 1.2rem; box-shadow: 0 8px 20px rgba(36,9,63,0.1); cursor: pointer; border: 2px solid transparent; transition: border-color .15s; text-align: center; }
  .card:hover { border-color: #d9ac5e; }
  .card b { display: block; color: #24093f; font-size: 1.05rem; margin-bottom: 0.3rem; }
  .card span { color: #7b3799; font-weight: 700; }
  dialog { border: none; border-radius: 16px; padding: 1.6rem; width: min(360px, 90vw); box-shadow: 0 20px 50px rgba(0,0,0,0.3); }
  dialog h2 { margin-top: 0; font-size: 1.1rem; color: #24093f; }
  dialog input { width: 100%; box-sizing: border-box; padding: 0.6rem; margin-bottom: 0.7rem; border: 1px solid #ddd; border-radius: 8px; font-size: 1rem; }
  dialog button { width: 100%; padding: 0.7rem; border: none; border-radius: 8px; background: #7b3799; color: #fff; font-size: 1rem; cursor: pointer; font-weight: 700; }
  dialog button:disabled { opacity: 0.5; }
  .msg { text-align: center; margin-top: 0.6rem; font-size: 0.9rem; }
  .msg.ok { color: #1a7a3c; } .msg.err { color: #b03030; }
</style>
</head><body>
<h1>יצירת עסקה מהירה - לחיצה על מוצר</h1>
<div class="grid" id="grid"></div>
<dialog id="dlg">
  <h2 id="dlgTitle"></h2>
  <input id="fName" placeholder="שם מלא">
  <input id="fPhone" placeholder="טלפון">
  <input id="fEmail" placeholder="אימייל" type="email">
  <button id="submitBtn">צור עסקה</button>
  <div class="msg" id="msg"></div>
</dialog>
<script>
  const PRODUCTS = __PRODUCTS_JSON__;
  const grid = document.getElementById('grid');
  const dlg = document.getElementById('dlg');
  let current = null;
  PRODUCTS.forEach(p => {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = '<b>' + p.name + '</b><span>' + (p.price ? p.price + ' ₪' : '') + '</span>';
    div.onclick = () => {
      current = p;
      document.getElementById('dlgTitle').textContent = p.name;
      document.getElementById('fName').value = '';
      document.getElementById('fPhone').value = '';
      document.getElementById('fEmail').value = '';
      document.getElementById('msg').textContent = '';
      dlg.showModal();
    };
    grid.appendChild(div);
  });
  document.getElementById('submitBtn').onclick = async () => {
    const name = document.getElementById('fName').value.trim();
    const phone = document.getElementById('fPhone').value.trim();
    const email = document.getElementById('fEmail').value.trim();
    const msg = document.getElementById('msg');
    if (!name) { msg.textContent = 'צריך שם'; msg.className = 'msg err'; return; }
    const btn = document.getElementById('submitBtn');
    btn.disabled = true; msg.textContent = 'שולחת...'; msg.className = 'msg';
    try {
      const res = await fetch(window.location.pathname + '/create' + window.location.search, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: current.id, name, phone, email }),
      });
      if (!res.ok) throw new Error(await res.text());
      msg.textContent = 'נוצר בהצלחה!'; msg.className = 'msg ok';
      setTimeout(() => dlg.close(), 900);
    } catch (e) {
      msg.textContent = 'שגיאה: ' + e.message; msg.className = 'msg err';
    } finally {
      btn.disabled = false;
    }
  };
</script>
</body></html>`;

async function createFireberryTransaction({ name, phone, email, product }) {
  const today = new Date().toISOString().slice(0, 10);
  const record = {
    name: `${name} - ${product.name} - ${today}`,
    pcfsystemfield102: phone || '',
    pcfsystemfield105: email || '',
    pcfsystemfield123: today,
    pcfdate: today,
    pcfsystemfield118: product.price || '',
    pcfproduct: product.id,
  };
  const res = await fetch(`https://api.fireberry.com/api/record/${FIREBERRY_TRANSACTION_OBJECT}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', tokenid: fireberryApiKey.value() },
    body: JSON.stringify(record),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Fireberry create failed (${res.status}): ${text}`);
  return text;
}

/**
 * Small private tool: one button per real product, click -> fill name/phone/email ->
 * creates a real "עסקה" record in Fireberry instantly. Gated by a shared secret in the
 * URL (?secret=...), same pattern as growPaymentWebhook - simplest option since this is
 * a single-user (Maya-only) internal tool, not worth building real Firebase Auth login
 * for. Bookmark the URL with the secret already in it.
 */
exports.quickDeal = onRequest(
  { region: 'us-central1', secrets: [quickDealSecret, fireberryApiKey] },
  async (req, res) => {
    if (req.query.secret !== quickDealSecret.value()) {
      res.status(401).send('unauthorized');
      return;
    }

    const path = req.path || '/';
    if (path.endsWith('/create') && req.method === 'POST') {
      const { productId, name, phone, email } = req.body || {};
      const product = PRODUCTS.find((p) => p.id === productId);
      if (!product || !name) {
        res.status(400).send('missing product or name');
        return;
      }
      try {
        await createFireberryTransaction({ name, phone, email, product });
        res.status(200).send('ok');
      } catch (err) {
        console.error('quickDeal create failed:', err);
        res.status(500).send(String(err.message || err));
      }
      return;
    }

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(PAGE_HTML.replace('__PRODUCTS_JSON__', JSON.stringify(PRODUCTS)));
  }
);
