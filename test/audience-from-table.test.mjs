/* 09/11/2026 (מאיה): קהל היעד במוח השיווקי נלקח מהטבלה שאושרה בפורטל. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const af = require('../functions/audience-from-table.js');
const sections = require('../functions/sheet-sections.js');

const ROWS = [
  ['שאלות לניתוח קהל היעד', 'קבוצה 1: מתחילות מאפס', 'קבוצה 2: נייליסטיות'],
  ['איזה כאבים/בעיות יש לקהל?', 'יש לה בוס שמחליט עבורה\nהיא מרגישה תקועה', 'העבודה לא נראית מקצועית'],
];
const HttpsError = class extends Error { constructor(code, msg) { super(msg); this.code = code; } };
const TOKEN = 'x'.repeat(200);

function deps(over = {}) {
  const saved = [];
  return {
    saved,
    d: {
      HttpsError,
      verifyPortalToken: async () => ({ role: 'owner', email: 'mayakislev@gmail.com' }),
      uidByEmail: async () => 'u1',
      getProfile: async () => ({ sheetId: 's1', primaryAudience: 'מתחילות מאפס', business: 'ציפורנים מדריכה' }),
      saveProfile: async (uid, u) => saved.push({ uid, u }),
      readTab: async () => ({ title: 'ניתוח קהל יעד', rows: ROWS }),
      sections,
      callModel: async () => '{"primary":"שכירות שתקועות — ותלויות בבוס","secondary":"נייליסטיות שרוצות לעלות רמה","business":"משהו אחר"}',
      ...over,
    },
  };
}

test('הפרומפט: שתי הקבוצות מהטבלה, הדוגמה של מאיה, ובלי להמציא גיל', () => {
  const { groups } = sections.parseAudienceTab(ROWS);
  const p = af.buildAudiencePrompt({ groups, business: 'ציפורנים מדריכה' });
  assert.match(p, /קבוצה 1: מתחילות מאפס/);
  assert.match(p, /קבוצה 2: נייליסטיות/);
  assert.match(p, /נשים 16-30 שהן שכירות/);
  assert.match(p, /לא ממציאים גיל/);
});

test('אישור בפורטל: השורה מהטבלה נכנסת, הישנה נשמרת בצד, והתחום הקיים לא נדרס', async () => {
  const { d, saved } = deps();
  const out = await af.createAudienceFromTableHandler(d)({ data: { idToken: TOKEN, email: 'Hen@x.com' } });
  assert.equal(out.updated, true);
  assert.equal(saved[0].u.primaryAudience, 'שכירות שתקועות, ותלויות בבוס');
  assert.equal(saved[0].u.primaryAudienceBeforeTable, 'מתחילות מאפס');
  assert.equal(saved[0].u.audienceSource, 'table');
  assert.equal(saved[0].u.secondaryAudience, 'נייליסטיות שרוצות לעלות רמה');
  assert.equal(saved[0].u.business, undefined);
});

test('שורה שמאיה כתבה בעצמה לא נדרסת', async () => {
  const { d, saved } = deps({ getProfile: async () => ({ sheetId: 's1', audienceSource: 'maya', primaryAudience: 'של מאיה' }) });
  const out = await af.createAudienceFromTableHandler(d)({ data: { idToken: TOKEN, email: 'a@b.co' } });
  assert.deepEqual(out, { updated: false, reason: 'maya-wrote-it' });
  assert.equal(saved.length, 0);
});

test('רק מאיה, ותקלות לא שוברות כלום', async () => {
  const notOwner = deps({ verifyPortalToken: async () => ({ role: 'client', email: 'c@x.com' }) });
  await assert.rejects(af.createAudienceFromTableHandler(notOwner.d)({ data: { idToken: TOKEN, email: 'a@b.co' } }), /רק מאיה/);
  const noTab = deps({ readTab: async () => ({ error: 'no-access' }) });
  assert.deepEqual(await af.createAudienceFromTableHandler(noTab.d)({ data: { idToken: TOKEN, email: 'a@b.co' } }), { updated: false, reason: 'no-access' });
  const junk = deps({ callModel: async () => 'לא JSON' });
  assert.deepEqual(await af.createAudienceFromTableHandler(junk.d)({ data: { idToken: TOKEN, email: 'a@b.co' } }), { updated: false, reason: 'model' });
  const noUser = deps({ uidByEmail: async () => null });
  assert.deepEqual(await af.createAudienceFromTableHandler(noUser.d)({ data: { idToken: TOKEN, email: 'a@b.co' } }), { updated: false, reason: 'no-brain-user' });
  assert.equal(junk.saved.length + noTab.saved.length + noUser.saved.length, 0);
});
