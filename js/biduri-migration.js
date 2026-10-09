import { functions } from './firebase-init.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { confirmDialog } from './confirm-dialog.js';
import { categoryColorVar } from './ideas-logic.js';
import {
  shouldOfferApply,
  reportSummary,
  appliedSummary,
  biduriErrorText,
} from './biduri-logic.js';

/* 09/10/2026 (מאיה: "בעצם לכל הלקוחות להעיף בריעונות סינון לפי בידורי
   ופשוט להתאים לשאר סוגי התוכן אפשרי ואז להעלות לאפליקציה?").

   "בידורי" ירדה מהקטגוריות, ולכן רעיונות שכבר מתויגים בה נשארו בלי
   לשונית סינון ובלי מקום בתכנית התוכן. המסך הזה מתאים אותם לאחת משלוש
   הקטגוריות, דרך אותו מסווג שמסווג רעיון חדש.

   קודם דוח, אחר כך ביצוע, כי זה נוגע לרעיונות של כל הלקוחות ולא רק
   שלה. ההחלטות שהיא רואה בדוח הן בדיוק מה שנשלח לכתיבה: השרת לא מסווג
   מחדש, ולכן אין מסלול שבו נכתב משהו אחר ממה שהיא אישרה.

   יש גם החזרה אחורה, שלא דורסת לקוחה ששינתה רעיון בעצמה אחרי ההתאמה. */

const recategorizeBiduri = httpsCallable(functions, 'recategorizeBiduri', { timeout: 1200000 });
const applyRecategorizeBiduri = httpsCallable(functions, 'applyRecategorizeBiduri', { timeout: 540000 });
const undoRecategorizeBiduri = httpsCallable(functions, 'undoRecategorizeBiduri', { timeout: 540000 });

const el = (id) => document.getElementById(id);

/* ההחלטות מהדוח האחרון. זה מה שנשלח לכתיבה, ולכן "להחיל" לא קיים
   בלעדיהן. */
let pendingDecisions = [];

function renderReport(rows) {
  const list = el('biduri-list');
  list.textContent = '';
  rows.forEach((row) => {
    const li = document.createElement('li');
    li.className = 'biduri-row';
    const title = document.createElement('span');
    title.className = 'biduri-row-title';
    title.textContent = row.title || row.id || '';
    const to = document.createElement('strong');
    to.className = 'biduri-row-to';
    if (row.to) {
      to.textContent = row.to;
      /* הצבע לפי הקטגוריה שהרעיון עובר אליה. צבע אחד לכולם לא נושא שום
         מידע, ובדיוק את זה היא קוראת בדוח. */
      to.style.color = categoryColorVar(row.to);
    } else {
      to.textContent = row.note;
      to.classList.add('biduri-row-failed');
    }
    li.append(title, to);
    list.appendChild(li);
  });
  el('biduri-list-wrap').hidden = rows.length === 0;
}

function setBusy(busy, label) {
  ['biduri-report-btn', 'biduri-apply-btn', 'biduri-undo-btn'].forEach((id) => {
    const btn = el(id);
    if (btn) btn.disabled = busy;
  });
  el('biduri-status').textContent = busy ? label : '';
}

function fail(err) {
  const errorEl = el('biduri-error');
  errorEl.textContent = biduriErrorText(err);
  errorEl.hidden = false;
}

async function showReport() {
  el('biduri-error').hidden = true;
  setBusy(true, 'בודקת מה יש במאגר. זה לוקח דקה או שתיים.');
  try {
    const result = await recategorizeBiduri({});
    const data = result.data || {};
    const rows = data.report || [];
    pendingDecisions = rows
      .filter((row) => row && row.id && row.to)
      .map((row) => ({ id: row.id, to: row.to }));
    el('biduri-summary').textContent = reportSummary(data);
    renderReport(rows);
    el('biduri-apply-btn').hidden = !shouldOfferApply(rows);
  } catch (err) {
    fail(err);
  } finally {
    setBusy(false);
  }
}

async function applyReport() {
  if (!pendingDecisions.length) {
    fail({ message: 'צריך קודם להציג דוח, כדי שיהיה מה להחיל.' });
    return;
  }
  const ok = await confirmDialog(
    `להעביר ${pendingDecisions.length} רעיונות לקטגוריות החדשות, אצל כל הלקוחות? אפשר להחזיר אחורה מהמסך הזה.`,
    { okLabel: 'להחיל', cancelLabel: 'ביטול' }
  );
  if (!ok) return;

  el('biduri-error').hidden = true;
  setBusy(true, 'מעבירה את הרעיונות...');
  try {
    const result = await applyRecategorizeBiduri({ decisions: pendingDecisions });
    const data = result.data || {};
    el('biduri-summary').textContent = appliedSummary(data);
    renderReport(data.report || []);
    pendingDecisions = [];
    el('biduri-apply-btn').hidden = true;
  } catch (err) {
    fail(err);
  } finally {
    setBusy(false);
  }
}

async function undo() {
  const ok = await confirmDialog(
    'להחזיר ל"בידורי" את הרעיונות שהותאמו? רעיון שלקוחה שינתה בעצמה אחרי ההתאמה יישאר כמו שהיא בחרה.',
    { okLabel: 'להחזיר', cancelLabel: 'ביטול' }
  );
  if (!ok) return;

  el('biduri-error').hidden = true;
  setBusy(true, 'מחזירה אחורה...');
  try {
    const result = await undoRecategorizeBiduri({});
    const data = result.data || {};
    const kept = data.kept ? ` ${data.kept} נשארו כמו שהלקוחה בחרה.` : '';
    el('biduri-summary').textContent = `הוחזרו ${data.restored || 0} רעיונות ל"בידורי".${kept}`;
    el('biduri-list-wrap').hidden = true;
    el('biduri-apply-btn').hidden = true;
    pendingDecisions = [];
  } catch (err) {
    fail(err);
  } finally {
    setBusy(false);
  }
}

export function wireBiduriMigration() {
  const openBtn = el('biduri-migrate-btn');
  const modal = el('biduri-modal');
  const closeBtn = el('biduri-close-btn');
  const reportBtn = el('biduri-report-btn');
  const applyBtn = el('biduri-apply-btn');
  const undoBtn = el('biduri-undo-btn');
  if (!openBtn || !modal || !closeBtn || !reportBtn || !applyBtn || !undoBtn) return;

  const close = () => { modal.hidden = true; };

  openBtn.addEventListener('click', () => {
    modal.hidden = false;
    pendingDecisions = [];
    el('biduri-summary').textContent = '';
    el('biduri-status').textContent = '';
    el('biduri-error').hidden = true;
    el('biduri-list-wrap').hidden = true;
    el('biduri-list').textContent = '';
    applyBtn.hidden = true;
  });
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  reportBtn.addEventListener('click', showReport);
  applyBtn.addEventListener('click', applyReport);
  undoBtn.addEventListener('click', undo);
}
