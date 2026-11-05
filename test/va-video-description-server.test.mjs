/* 05/11/2026 (מאיה): writeVideoDescription, הפונקציה בשרת של "✍️ תיאור
   לסרטון". הכללים שלה חייבים להגיע לפרומפט מילה במילה, ומה שחוזר עובר
   ניקוי: בלי האשטגים, בלי קו ארוך, תיאור אחד ושלושה הוקים של טקסט.
   ההרשאה, המכסה והמודל מדומים, והפונקציה עצמה רצה. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const vd = require('../functions/video-description.js');
const INDEX = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');

class FakeHttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

test('הכללים של מאיה בפרומפט מילה במילה, וההוראה לפי סוג הסרטון', () => {
  assert.match(vd.MAYA_RULES, /^מה שמעניין זה רק תיאור\./);
  assert.match(vd.MAYA_RULES, /קאבר אין צורך\. כן הוק של טקסט \(טקסט על המסך\) כהצעה, כאופציה\.$/);
  const base = { script: 'התסריט', idea: 'הרעיון', hook: 'ההוק', cta: '', domain: 'גבות', audience: 'נשים 30+' };
  const broll = vd.buildVideoDescriptionPrompt({ ...base, videoType: 'בירול קצר עם טקסט' });
  assert.ok(broll.includes(vd.MAYA_RULES));
  assert.match(broll, /ארוך יותר ומפרט/);
  assert.match(broll, /התחום של העסק: גבות/);
  assert.match(broll, /קהל היעד: נשים 30\+/);
  assert.match(broll, /אין בסרטון הנעה לפעולה/);
  const talk = vd.buildVideoDescriptionPrompt({ ...base, videoType: 'סרטון דיבור', cta: 'לכתוב "מדריך" בתגובות' });
  assert.match(talk, /המסר של הסרטון בקצרה, או משפט אחד שמסקרן/);
  assert.match(talk, /יש בסרטון הנעה לפעולה: "לכתוב "מדריך" בתגובות"/);
  assert.match(talk, /אסור: האשטגים/);
  assert.match(talk, /textHooks/);
});

test('הפירוק מנקה האשטגים וקו ארוך, ומחזיר עד 3 הוקים', () => {
  const r = vd.parseVideoDescription('הנה: {"description": "שלוש טעויות — ואיך מתקנים #גבות #יופי\\nשמרו לפעם הבאה", "textHooks": ["\\"הוק 1\\"", "הוק 2 #תג", "הוק 3", "הוק 4"]}');
  assert.equal(r.description, 'שלוש טעויות, ואיך מתקנים\nשמרו לפעם הבאה');
  assert.deepEqual(r.textHooks, ['הוק 1', 'הוק 2', 'הוק 3']);
  assert.equal(vd.parseVideoDescription('לא JSON'), null);
  assert.equal(vd.parseVideoDescription('{"description": "", "textHooks": []}'), null);
});

test('הקלט: סוג לא מוכר הופך ל"אחר", שדה ארוך מדי נדחה, ובלי תסריט ורעיון אין מה לכתוב', () => {
  assert.equal(vd.validateInput({ script: 'x', videoType: 'משהו' }, FakeHttpsError).videoType, 'אחר');
  assert.throws(() => vd.validateInput({ script: 'x'.repeat(8001) }, FakeHttpsError), (e) => e.code === 'invalid-argument');
  assert.throws(() => vd.validateInput({ cta: 'לעקוב' }, FakeHttpsError), (e) => e.code === 'invalid-argument');
});

test('הפונקציה: התחברות, הרשאה, מכסה ואז המודל, בסדר הזה', async () => {
  const log = [];
  const handler = vd.createVideoDescriptionHandler({
    HttpsError: FakeHttpsError,
    enforceAllowlist: async (email) => { log.push(`allow:${email}`); },
    enforceRateLimit: async (uid) => { log.push(`rate:${uid}`); },
    callModel: async (prompt) => {
      log.push('model');
      assert.match(prompt, /סוג הסרטון: סרטון דיבור/);
      return '{"description": "המסר בקצרה", "textHooks": ["א", "ב", "ג"]}';
    },
  });
  await assert.rejects(handler({ data: { script: 'x' } }), (e) => e.code === 'unauthenticated');
  const out = await handler({ auth: { uid: 'u1', token: { email: 'a@b.c' } }, data: { script: 'התסריט', videoType: 'סרטון דיבור' } });
  assert.deepEqual(out, { description: 'המסר בקצרה', textHooks: ['א', 'ב', 'ג'] });
  assert.deepEqual(log, ['allow:a@b.c', 'rate:u1', 'model']);

  const bad = vd.createVideoDescriptionHandler({
    HttpsError: FakeHttpsError, enforceAllowlist: async () => {}, enforceRateLimit: async () => {}, callModel: async () => 'סתם טקסט',
  });
  await assert.rejects(bad({ auth: { uid: 'u1', token: { email: 'a@b.c' } }, data: { idea: 'רעיון' } }), (e) => e.code === 'internal');
});

test('index.js מייצא את writeVideoDescription, עם מכסה יומית, פתוח למנוי הרפרנסים, ב-Haiku', () => {
  assert.match(INDEX, /DAILY_LIMITS = \{[\s\S]*?writeVideoDescription: \d+,[\s\S]*?\};/);
  assert.match(INDEX, /exports\.writeVideoDescription = onCall\(\{ secrets: \[anthropicApiKey\]/);
  const block = INDEX.slice(INDEX.indexOf('exports.writeVideoDescription'), INDEX.indexOf('exports.writeVideoDescription') + 900);
  assert.match(block, /enforceAllowlist\(email, \{ allowRefs: true \}\)/);
  assert.match(block, /enforceRateLimit\(uid, 'writeVideoDescription'\)/);
  assert.match(block, /claude-haiku-4-5-20251001/);
});
