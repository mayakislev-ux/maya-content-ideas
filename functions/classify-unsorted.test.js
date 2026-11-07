const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cu = require('./classify-unsorted');
const ci = require('./classify-idea');
const { CATEGORIES, PERSUASION_STAGES } = require('./ideas-constants');

/* 07/11/2026 (מאיה): לסווג את כל הרעיונות שלא סווגו, של כל המשתמשים.
   הכללים שנבדקים: דוח לא כותב, ההחלה כותבת רק מה שבדוח ורק שדות ריקים,
   רעיון שקיבל סוג בינתיים מדולג, וההחזרה לא דורסת בחירה מאוחרת. */

class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const DELETE = Symbol('delete');
const FieldValue = { serverTimestamp: () => 'ts', delete: () => DELETE };

function fakeDb(initial) {
  const docs = new Map(Object.entries(initial).map(([id, d]) => [id, { ...d }]));
  const writes = [];
  const refOf = (id) => ({
    id,
    async get() { return { id, exists: docs.has(id), data: () => (docs.has(id) ? { ...docs.get(id) } : undefined) }; },
    async update(patch) {
      writes.push({ id, patch });
      const cur = { ...docs.get(id) };
      for (const [k, v] of Object.entries(patch)) {
        if (v === DELETE) delete cur[k]; else cur[k] = v;
      }
      docs.set(id, cur);
    },
  });
  const snapOf = (ids) => ({ docs: ids.map((id) => ({ id, ref: refOf(id), data: () => ({ ...docs.get(id) }) })) });
  return {
    docs,
    writes,
    collection(name) {
      assert.equal(name, 'ideas');
      return {
        doc: refOf,
        async get() { return snapOf([...docs.keys()]); },
        where(field, op, value) {
          assert.equal(op, '==');
          return { async get() { return snapOf([...docs.keys()].filter((id) => docs.get(id)[field] === value)); } };
        },
      };
    },
  };
}

const OWNER = { auth: { uid: 'm', token: { email: 'mayakislev@gmail.com' } } };
const req = (data, base = OWNER) => ({ ...base, data });

function make(initial, classify) {
  const db = fakeDb(initial);
  const calls = [];
  const h = cu.createClassifyUnsortedHandlers({
    HttpsError,
    db,
    FieldValue,
    isOwner: (r) => r.auth.token.email === 'mayakislev@gmail.com',
    classify: async (title) => {
      calls.push(title);
      return classify ? classify(title) : { category: 'אישי', persuasionStage: PERSUASION_STAGES[2], audienceScope: 'עיקרי' };
    },
  });
  return { h, db, calls };
}

const IDEAS = {
  a1: { title: 'רעיון בלי סוג', category: '', ownerUid: 'u1' },
  a2: { title: 'רעיון בלי שדה סוג בכלל', ownerUid: 'u2', persuasionStage: PERSUASION_STAGES[0] },
  a3: { title: 'כבר מסווג', category: 'מכירתי', ownerUid: 'u1' },
  a4: { title: 'מחוק', category: '', deletedAt: 'x', ownerUid: 'u1' },
  a5: { title: '  ', category: '', ownerUid: 'u3' },
  a6: { title: 'עם קהל משלה', category: null, audienceScope: 'רחב', ownerUid: 'u3' },
};

test('רק מאיה', async () => {
  const { h } = make(IDEAS);
  const other = { auth: { uid: 'x', token: { email: 'c@x.com' } } };
  for (const fn of [h.report, h.apply, h.undo]) {
    await assert.rejects(fn(req({ decisions: [{ id: 'a1', category: 'אישי' }] }, other)), (e) => e.code === 'permission-denied');
    await assert.rejects(fn({ data: {} }), (e) => e.code === 'permission-denied');
  }
});

test('הדוח: רק רעיונות חיים בלי סוג, לא כותב כלום, וממלא רק שדות ריקים', async () => {
  const { h, db, calls } = make(IDEAS);
  const out = await h.report(req({}));
  assert.equal(db.writes.length, 0, 'הדוח כתב משהו');
  assert.equal(out.found, 4);
  assert.deepEqual(out.report.map((r) => r.id), ['a1', 'a2', 'a5', 'a6']);
  assert.deepEqual(calls, ['רעיון בלי סוג', 'רעיון בלי שדה סוג בכלל', 'עם קהל משלה'], 'כותרת ריקה נשלחה לסיווג');
  const by = Object.fromEntries(out.report.map((r) => [r.id, r]));
  assert.deepEqual(by.a1.fill, { category: 'אישי', persuasionStage: PERSUASION_STAGES[2], audienceScope: 'עיקרי' });
  assert.deepEqual(by.a2.fill, { category: 'אישי', audienceScope: 'עיקרי' }, 'שלב השכנוע של המשתמשת נדרס');
  assert.deepEqual(by.a6.fill, { category: 'אישי', persuasionStage: PERSUASION_STAGES[2] }, 'הקהל של המשתמשת נדרס');
  assert.equal(by.a5.to, null);
  assert.equal(out.failed, 1);
  assert.deepEqual(out.byCategory, { 'אישי': 3 });
  assert.equal(out.nextAfterId, null);
  assert.deepEqual(out.decisions.map((d) => d.id), ['a1', 'a2', 'a6']);
});

test('מנה וסמן: limit עד 150, ו-afterId ממשיך אחרי הכישלונות', async () => {
  const many = {};
  for (let i = 0; i < 160; i += 1) many[`i${String(i).padStart(3, '0')}`] = { title: `ר${i}`, category: '' };
  const { h } = make(many);
  const first = await h.report(req({ limit: 999 }));
  assert.equal(first.handled, 150);
  assert.equal(first.nextAfterId, 'i149');
  const second = await h.report(req({ afterId: first.nextAfterId }));
  assert.equal(second.handled, 10);
  assert.equal(second.nextAfterId, null);
  const small = await h.report(req({ limit: 2 }));
  assert.equal(small.handled, 2);
});

test('סיווג שנכשל או לא תקין: נשאר בלי סוג ולא נכנס להחלטות', async () => {
  const { h } = make({ b1: { title: 'x', category: '' }, b2: { title: 'y', category: '' } },
    (t) => (t === 'x' ? null : { category: 'בידורי', persuasionStage: PERSUASION_STAGES[0] }));
  const out = await h.report(req({}));
  assert.equal(out.failed, 2);
  assert.deepEqual(out.decisions, []);
});

test('החלה: כותבת רק מה שבדוח, מסמנת classifiedBy, ומדלגת על מי שקיבל סוג בינתיים', async () => {
  const { h, db } = make(IDEAS);
  const { decisions } = await h.report(req({}));
  db.docs.get('a6').category = 'מכירתי'; /* המשתמשת סיווגה בינתיים */
  const out = await h.apply(req({ decisions: [...decisions, { id: 'a3', category: 'אישי' }, { id: 'a4', category: 'אישי' }, { id: 'zz', category: 'אישי' }, { id: 'a1', category: 'בידורי' }] }));
  assert.equal(out.changed, 2);
  assert.equal(out.skipped, 5);
  assert.equal(db.docs.get('a6').category, 'מכירתי');
  assert.equal(db.docs.get('a3').category, 'מכירתי');
  const a1 = db.docs.get('a1');
  assert.equal(a1.category, 'אישי');
  assert.equal(a1.persuasionStage, PERSUASION_STAGES[2]);
  assert.equal(a1.classifiedBy, 'backfill-2026-11-07');
  const a2 = db.docs.get('a2');
  assert.equal(a2.persuasionStage, PERSUASION_STAGES[0], 'שלב השכנוע של המשתמשת נדרס');
  assert.deepEqual(a2.backfillFilled, { category: 'אישי', audienceScope: 'עיקרי' });
  assert.deepEqual(a2.backfillBefore, {}, 'שדות שלא היו קיימים נרשמו כקיימים');
  assert.deepEqual(a1.backfillBefore, { category: '' });
  assert.equal(out.remaining, 1, 'רק הרעיון בלי כותרת נשאר');
  assert.ok(!db.writes.some((w) => ['a3', 'a4', 'a6'].includes(w.id)));
});

test('החלה: גם אם ההחלטה כוללת שדה שבינתיים מולא, הוא לא נדרס', async () => {
  const { h, db } = make({ c1: { title: 't', category: '' } });
  db.docs.get('c1').persuasionStage = PERSUASION_STAGES[1];
  await h.apply(req({ decisions: [{ id: 'c1', category: 'בעל ערך', persuasionStage: PERSUASION_STAGES[0], audienceScope: 'עיקרי' }] }));
  assert.equal(db.docs.get('c1').persuasionStage, PERSUASION_STAGES[1]);
  assert.equal(db.docs.get('c1').category, 'בעל ערך');
});

test('החלה: בלי החלטות או יותר מ-150 נדחה', async () => {
  const { h } = make(IDEAS);
  await assert.rejects(h.apply(req({ decisions: [] })), (e) => e.code === 'invalid-argument');
  await assert.rejects(h.apply(req({ decisions: Array.from({ length: 151 }, (_, i) => ({ id: `x${i}`, category: 'אישי' })) })), (e) => e.code === 'invalid-argument');
});

test('חזרה אחורה: מחזירה רק שדות שלא שונו, ומשאירה בחירה מאוחרת', async () => {
  const { h, db } = make(IDEAS);
  const { decisions } = await h.report(req({}));
  await h.apply(req({ decisions }));
  db.docs.get('a2').category = 'מכירתי'; /* המשתמשת שינתה אחרי ההשלמה */
  const out = await h.undo(req({}));
  assert.equal(out.restored, 3);
  assert.equal(out.kept, 1);
  const a1 = db.docs.get('a1');
  assert.equal(a1.category, '', 'הסוג לא חזר לריק');
  assert.ok(!('persuasionStage' in a1) && !('audienceScope' in a1), 'שדה שלא היה קיים לא נמחק');
  assert.ok(!('classifiedBy' in a1) && !('backfillFilled' in a1));
  const a2 = db.docs.get('a2');
  assert.equal(a2.category, 'מכירתי');
  assert.equal(a2.persuasionStage, PERSUASION_STAGES[0]);
  assert.ok(!('audienceScope' in a2));
  assert.equal(db.docs.get('a6').category, null);
  assert.equal(db.docs.get('a6').audienceScope, 'רחב');
});

test('אותו מסווג כמו classifyIdea: פרומפט, פענוח, וקהל לא תקין לא מפיל', () => {
  const p = ci.buildClassifyPrompt('כותרת', '');
  assert.match(p, /הרעיון לתוכן: "כותרת"/);
  for (const c of CATEGORIES) assert.ok(p.includes(`${c}: `));
  assert.ok(!p.includes('בידורי'), 'בידורי בפרומפט');
  assert.deepEqual(ci.parseClassification('{"categoryIndex": 2, "persuasionStageIndex": 3, "audienceScopeIndex": 1}'),
    { category: CATEGORIES[1], persuasionStage: PERSUASION_STAGES[2], audienceScope: 'עיקרי' });
  assert.deepEqual(ci.parseClassification('קודם טקסט {"categoryIndex": 1, "persuasionStageIndex": 1, "audienceScopeIndex": 9}'),
    { category: CATEGORIES[0], persuasionStage: PERSUASION_STAGES[0], audienceScope: '' });
  assert.equal(ci.parseClassification('{"categoryIndex": 7, "persuasionStageIndex": 1}'), null);
  assert.equal(ci.parseClassification('לא JSON'), null);

  const index = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  const classify = index.slice(index.indexOf('exports.classifyIdea'), index.indexOf('exports.guessClientDomain'));
  assert.match(classify, /buildClassifyPrompt\(title, hookText\)/);
  assert.match(classify, /parseClassification\(text\)/);
  const block = index.slice(index.indexOf("require('./classify-unsorted')"), index.indexOf("require('./acting-uid')"));
  assert.match(block, /model: CLASSIFY_MODEL, max_tokens: 200, temperature: 0/);
  assert.match(block, /buildClassifyPrompt\(title, ''\)/);
  assert.match(block, /parseClassification\(/);
  for (const name of ['classifyUnsortedIdeas', 'applyClassifyUnsorted', 'undoClassifyUnsorted']) {
    assert.match(block, new RegExp(`exports\\.${name} = onCall`));
  }
  assert.match(block, /request\.auth\.token\.email === ADMIN_EMAIL/);
});
