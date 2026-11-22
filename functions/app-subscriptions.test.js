// 22/11/2026: לשונית "אפליקציה מנויים" בפורטל. רק מאיה, ולקוחת ליווי לא נוגעים בה.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAppSubscriptionsHandler, statusOf, lastPayment, endOfIsraelDay } = require('./app-subscriptions');

class HttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const TOKEN = 'x'.repeat(200);
const NOW = new Date('2026-11-22T12:00:00Z');

function make(store = {}, { role = 'owner', receipts = [] } = {}) {
  const writes = [];
  const h = createAppSubscriptionsHandler({
    HttpsError, now: () => NOW,
    verifyPortalToken: async () => ({ role, email: 'mayakislev@gmail.com' }),
    listAllowlist: async () => Object.entries(store).map(([id, data]) => ({ id, data })),
    getAllowlist: async (e) => store[e] || null,
    setAllowlist: async (e, patch, opts) => { writes.push({ e, patch, opts }); },
    receipts: async () => receipts,
    lastActive: async () => null,
    enableUser: async () => {},
  });
  return { call: (data) => h({ data: { idToken: TOKEN, ...data } }), writes };
}

test('רק owner', async () => {
  const { call } = make({}, { role: 'client' });
  await assert.rejects(call({ action: 'list' }), (e) => e.code === 'permission-denied');
});

test('רשימה: רק רפרנסים, עם מצב ותשלום אחרון לפי מייל או שם', async () => {
  const { call } = make({
    'a@x.com': { plan: 'refs', billing: 'standing', name: 'אביגיל' },
    'b@x.com': { plan: 'refs', billing: 'trial', paidUntil: new Date('2026-11-29T21:59:00Z'), name: 'לירון עמר' },
    'c@x.com': { plan: 'refs', billing: 'cancelled', paidUntil: new Date('2026-11-01T00:00:00Z') },
    'full@x.com': { name: 'לקוחת ליווי' },
  }, { receipts: [
    { status: 1, amount: 79, documentDate: '2026-11-01', number: 60980, client: { emails: ['a@x.com'] } },
    { status: 1, amount: 79, documentDate: '2026-11-30', number: 61001, client: { name: 'לירון  עמר', emails: [] }, type: 320 },
    { status: 4, amount: 79, documentDate: '2026-11-20', number: 61002, client: { emails: ['a@x.com'] } },
  ] });
  const r = await call({ action: 'list' });
  assert.equal(r.fullCount, 1);
  const by = Object.fromEntries(r.rows.map((x) => [x.email, x]));
  assert.equal(by['a@x.com'].status, 'standing');
  assert.deepEqual(by['a@x.com'].lastPayment, { date: '2026-11-01', number: '60980', byName: false });
  assert.equal(by['b@x.com'].status, 'trial');
  assert.equal(by['b@x.com'].lastPayment.number, '61001');
  assert.equal(by['c@x.com'].status, 'closed');
});

test('פתיחת מנוי קבוע: בלי תאריך סיום', async () => {
  const { call, writes } = make({});
  await call({ action: 'open', email: 'New@X.com', name: 'דנה', mode: 'standing' });
  assert.equal(writes[0].e, 'new@x.com');
  assert.equal(writes[0].patch.billing, 'standing');
  assert.equal(writes[0].patch.ideaChat, true);
  assert.equal(writes[0].patch.paidUntil, undefined);
  assert.ok(writes[0].opts.deleteFields.includes('paidUntil'));
});

test('שבוע ניסיון: נסגר בסוף היום השביעי בשעון ישראל', async () => {
  const { call, writes } = make({});
  await call({ action: 'open', email: 'n@x.com', name: 'דנה', mode: 'trial', days: 7 });
  assert.equal(writes[0].patch.billing, 'trial');
  assert.equal(writes[0].patch.paidUntil.toISOString(), '2026-11-29T21:59:00.000Z');
  assert.equal(writes[0].patch.renewOffer, true);
});

test('סגירה: הגישה נסגרת מיד', async () => {
  const { call, writes } = make({ 'a@x.com': { plan: 'refs', billing: 'standing' } });
  const r = await call({ action: 'close', email: 'a@x.com' });
  assert.equal(writes[0].patch.billing, 'cancelled');
  assert.equal(writes[0].patch.paidUntil.getTime(), NOW.getTime());
  assert.equal(r.row.status, 'closed');
});

test('לקוחת ליווי עם גישה מלאה לא נפתחת ולא נסגרת מכאן', async () => {
  const { call, writes } = make({ 'full@x.com': { name: 'ליווי' } });
  await assert.rejects(call({ action: 'close', email: 'full@x.com' }), (e) => e.code === 'failed-precondition');
  await assert.rejects(call({ action: 'open', email: 'full@x.com', mode: 'standing' }), (e) => e.code === 'failed-precondition');
  assert.equal(writes.length, 0);
});

test('עזרים: מצב, סוף יום בקיץ ובחורף', () => {
  assert.equal(statusOf({ billing: 'standing' }, NOW), 'standing');
  assert.equal(statusOf({ billing: 'morning', paidUntil: new Date('2026-12-08') }, NOW), 'until');
  assert.equal(endOfIsraelDay(0, new Date('2026-07-01T10:00:00Z')).toISOString(), '2026-07-01T20:59:00.000Z');
  assert.equal(lastPayment([], { email: 'a@x.com' }), null);
});

test('שם קצר או חלקי לא פותח מנוי לאחרת, ומנויה קבועה לא יורדת לניסיון', async () => {
  const { lastPaidReceipt } = require('./refs-subscription');
  const docs = [{ type: 320, status: 1, amount: 79, documentDate: '2026-11-25', number: 1, client: { name: 'נועה כהן', emails: ['x@y.com'] } }];
  assert.equal(lastPaidReceipt(docs, { email: 'noa@gmail.com', amount: 79, name: 'נועה', since: '2026-11-22' }), null);
  assert.equal(lastPaidReceipt(docs, { email: 'noa@gmail.com', amount: 79, name: 'נועה לוי', since: '2026-11-22' }), null);
  assert.equal(lastPaidReceipt(docs, { email: 'noa@gmail.com', amount: 79, name: 'נועה  כהן', since: '2026-11-22' }).matchedByName, true);
  const { call, writes } = make({ 'a@x.com': { plan: 'refs', billing: 'standing' } });
  await assert.rejects(call({ action: 'open', email: 'a@x.com', mode: 'trial', days: 7 }), (e) => e.code === 'failed-precondition');
  assert.equal(writes.length, 0);
});

test('owner אחר מהצוות לא נכנס', async () => {
  const h = createAppSubscriptionsHandler({ HttpsError, verifyPortalToken: async () => ({ role: 'owner', email: 'staff@x.com' }) });
  await assert.rejects(h({ data: { idToken: TOKEN, action: 'list' } }), (e) => e.code === 'permission-denied');
});
