// 29/10/2026 (מאיה: "אופציה שאוכל לצפות ולבצע בתור לקוחה, כמו שיש בפורטל")
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const store = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const { actsAsOwner, isClientView, setClientView, OWNER_EMAIL } = await import('../js/client-view.js');
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('בתצוגת לקוחה מאיה לא נחשבת מנהלת, ובחזרה כן', () => {
  setClientView(false);
  assert.equal(actsAsOwner(OWNER_EMAIL), true);
  setClientView(true);
  assert.equal(isClientView(), true);
  assert.equal(actsAsOwner(OWNER_EMAIL), false);
  setClientView(false);
  assert.equal(actsAsOwner(OWNER_EMAIL), true);
});

test('לקוחה לעולם לא מנהלת, גם בלי תצוגת לקוחה', () => {
  setClientView(false);
  assert.equal(actsAsOwner('client@example.com'), false);
  assert.equal(actsAsOwner(undefined), false);
});

test('בלי אחסון בדפדפן נשארים בתצוגה הרגילה ולא קורסים', async () => {
  const saved = globalThis.sessionStorage;
  globalThis.sessionStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} };
  assert.equal(isClientView(), false);
  assert.doesNotThrow(() => setClientView(true));
  globalThis.sessionStorage = saved;
});

test('כל בדיקת "רק למנהלת" במסך עוברת דרך actsAsOwner', () => {
  const app = read('../js/app.js');
  assert.ok(app.includes('const isAdmin = actsAsOwner(user.email);'));
  assert.ok(read('../js/idea-chat.js').includes('actsAsOwner(auth.currentUser.email)'));
  for (const f of ['story-table.js', 'story-sequence.js', 'story-assets.js']) {
    assert.ok(!read(`../js/${f}`).includes('OWNER_EMAIL'), `${f} עוד בודק מייל ישירות`);
  }
});

test('הכפתור והפס: כניסה רק למאיה, ויציאה גלויה תמיד', () => {
  const app = read('../js/app.js');
  const html = read('../index.html');
  assert.match(html, /id="client-view-btn"[^>]*hidden/, 'הכפתור מוסתר כברירת מחדל');
  assert.ok(app.includes("getElementById('client-view-btn').hidden = !isAdmin"));
  assert.ok(app.includes('user.email === ADMIN_EMAIL && isClientView()'), 'הפס רק בחשבון שלה');
  assert.ok(app.includes('data-exit-client-view'), 'יש חזרה לתצוגה שלה');
});

// 29/10/2026 (מאיה: "לבחור את הלקוחה ושיציג לי את הנתונים שלה", "גם לערוך אצלה")
const cv = await import('../js/client-view.js');
const require = (await import('node:module')).createRequire(import.meta.url);
const { actingUid } = require('../functions/acting-uid.js');

test('לקוחה שנבחרה: הנתונים הולכים ל-uid שלה, ויציאה מתצוגת לקוחה מחזירה לחשבון שלה', () => {
  cv.setClientView(true);
  cv.setViewedClient({ uid: 'clientUid1234', email: 'c@x.com', name: 'לקוחה' });
  assert.equal(cv.subjectUid('mayaUid123456'), 'clientUid1234');
  assert.deepEqual(cv.withAsUid({ a: 1 }), { a: 1, asUid: 'clientUid1234' });
  cv.setClientView(false);
  assert.equal(cv.viewedClient(), null);
  assert.equal(cv.subjectUid('mayaUid123456'), 'mayaUid123456');
  assert.deepEqual(cv.withAsUid({ a: 1 }), { a: 1 });
});

test('השרת: asUid מכובד רק למאיה', () => {
  assert.equal(actingUid('me', 'mayakislev@gmail.com', 'clientUid1234'), 'clientUid1234');
  assert.equal(actingUid('me', 'client@x.com', 'clientUid1234'), 'me', 'לקוחה לא יכולה לקרוא נתונים של אחרת');
  assert.equal(actingUid('me', 'mayakislev@gmail.com', '../x'), 'me');
  assert.equal(actingUid('me', 'mayakislev@gmail.com', undefined), 'me');
});

test('כל מאגר נתונים קורא וכותב דרך subjectUid, ולא ישר מהמחוברת', () => {
  for (const f of ['content-plan-store.js', 'ideas-store.js', 'story-table-store.js', 'user-profile.js', 'video-assistant-store.js', 'warming-store.js']) {
    const src = read(`../js/${f}`);
    assert.ok(!/(?<!subjectUid\()auth\.currentUser\??\.uid/.test(src), `${f} קורא uid ישירות`);
  }
  const app = read('../js/app.js');
  assert.ok(app.includes('if (!viewedNow) {\n    saveProfile({ lastActiveAt') || app.includes('if (!viewedNow) {\r\n    saveProfile({ lastActiveAt'), 'בתוך לקוחה לא מסמנים אותה כפעילה');
});
