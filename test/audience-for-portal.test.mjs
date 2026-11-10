/* 10/11/2026: הרנטגן בפורטל קורא את הקהל העיקרי מהמוח. קריאה בלבד, מאיה לכל מייל, לקוחה רק לעצמה. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createAudienceForPortalHandler } = require('../functions/audience-for-portal.js');

const HttpsError = class extends Error { constructor(code, msg) { super(msg); this.code = code; } };
const TOKEN = 'x'.repeat(200);
const PROFILES = {
  u1: { primaryAudience: 'שכירות תקועות', business: 'ציפורניים', audiences: [{ name: 'מתחילות', line: 'שכירות תקועות' }, { name: 'נייליסטיות', line: 'רוצות לעלות רמה' }] },
  maya: { primaryAudience: 'בעלות עסקים', business: 'שיווק' },
};
const handler = (decoded) => createAudienceForPortalHandler({
  HttpsError,
  verifyPortalToken: async () => decoded,
  uidByEmail: async (e) => ({ 'client@x.com': 'u1', 'mayakislev@gmail.com': 'maya' }[e] || null),
  getProfile: async (uid) => PROFILES[uid] || null,
});

test('מאיה רואה כל לקוחה, ואת עצמה', async () => {
  const h = handler({ role: 'owner', email: 'mayakislev@gmail.com' });
  const c = await h({ data: { idToken: TOKEN, email: 'Client@x.com' } });
  assert.equal(c.primaryAudience, 'שכירות תקועות');
  assert.equal(c.audiences.length, 2);
  assert.equal(c.business, 'ציפורניים');
  assert.equal((await h({ data: { idToken: TOKEN, email: 'mayakislev@gmail.com' } })).primaryAudience, 'בעלות עסקים');
});

test('לקוחה רק לעצמה, אחרת ריק', async () => {
  const self = handler({ role: 'client', email: 'client@x.com' });
  assert.equal((await self({ data: { idToken: TOKEN, email: 'client@x.com' } })).primaryAudience, 'שכירות תקועות');
  const other = handler({ role: 'client', email: 'other@x.com' });
  assert.deepEqual(await other({ data: { idToken: TOKEN, email: 'client@x.com' } }), { primaryAudience: '', audiences: [], business: '' });
});

test('בלי חשבון במוח: ריק. בקשה לא תקינה או אימות שנכשל: שגיאה', async () => {
  const h = handler({ role: 'owner', email: 'mayakislev@gmail.com' });
  assert.equal((await h({ data: { idToken: TOKEN, email: 'nobody@x.com' } })).primaryAudience, '');
  await assert.rejects(h({ data: { idToken: 'short', email: 'a@b.co' } }), /לא תקינה/);
  const bad = createAudienceForPortalHandler({ HttpsError, verifyPortalToken: async () => { throw new Error('x'); }, uidByEmail: async () => null, getProfile: async () => null });
  await assert.rejects(bad({ data: { idToken: TOKEN, email: 'a@b.co' } }), /האימות/);
});
