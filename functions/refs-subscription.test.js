// 15/10/2026: מנוי הרפרנסים של הדס, 79 ש"ח בחודש דרך מורנינג
const test = require('node:test');
const assert = require('node:assert/strict');
const { paidUntilFrom, lastPaidReceipt } = require('./refs-subscription');

const receipt = (number, date, amount, email = 'hadasatai5678@gmail.com', extra = {}) =>
  ({ number, type: 320, status: 1, documentDate: date, amount, client: { emails: [email] }, ...extra });

test('חודש אחרי התשלום ועוד 7 ימי חסד, בסוף היום בשעון ישראל', () => {
  assert.equal(paidUntilFrom('2026-10-15').toISOString(), '2026-11-22T20:59:59.000Z');
  // 31/01 אין בפברואר: סוף פברואר ועוד 7
  assert.equal(paidUntilFrom('2027-01-31').toISOString(), '2027-03-07T20:59:59.000Z');
});

test('הקבלה האחרונה על הסכום של המנוי, ולא כרטיס לסמינר', () => {
  const docs = [
    receipt('60899', '2026-08-12', 197),
    receipt('60973', '2026-10-15', 79),
    receipt('60900', '2026-09-15', 79),
    receipt('70000', '2026-10-16', 79, 'someone@else.com'),
  ];
  assert.equal(lastPaidReceipt(docs, { email: 'HadasAtai5678@gmail.com', amount: 79 }).number, '60973');
});

test('חשבון עסקה (לא שולם) וקבלה מבוטלת לא מאריכים את הגישה', () => {
  const docs = [
    { ...receipt('40001', '2026-11-10', 79), type: 300 },
    receipt('60999', '2026-11-15', 79, undefined, { status: 4 }),
  ];
  assert.equal(lastPaidReceipt(docs, { email: 'hadasatai5678@gmail.com', amount: 79 }), null);
});
