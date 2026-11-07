/* 06/11/2026 לילה (מאיה, על מוקאפ שנבנה על המסכים האמיתיים): מסך הבית עונה
   על "מה אני מצלמ/ת". "שיהיה למעלה אופציה להוסיף ישירות רעיון ואז מתחת את
   המיקרופון ושלוחצים נפתח הפופאפ. לא צריך פעמיים מיקרופון."

   1. השרת: קריאת "ניתוח קהל יעד" ו"פרסונה שיווקית" על המבנים האמיתיים,
      בחירת הלשונית (כולל "*דוגמא*"), צילום מסך (בדיקות קלט), שורה -> רעיונות.
   2. jsdom: סדר מסך הבית, סדר הדלתות, דלת 1 מקליטה, צילום מסך, שורה ->
      רעיונות -> שמירה עם sourceRow -> ✓, פרסונה, רפרנס ושכפול, ושגיאות גלויות. */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { register, createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sections = require('../functions/sheet-sections.js');
const ifs = require('../functions/ideas-from-sources.js');
const ifr = require('../functions/ideas-from-recording.js');

class HttpsError extends Error {
  constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}

/* ---------- המבנים האמיתיים (כמו בקובץ של מאיה) ---------- */

const AUDIENCE_ROWS = [
  ['ניתוח קהל יעד'],
  [],
  ['שאלות לניתוח קהל היעד', 'קבוצה 1: נשים בעלות עסקים קטנים', 'קבוצה 2: מאמנים ומטפלים', 'קבוצה 3:', 'קבוצה 4:'],
  ['  "מי הקהל?"', 'נשים 30-50', 'מטפלים'],
  ['  "איזה כאבים/בעיות יש להם?"',
    'כאבים רגשיים:\n1️⃣ מרגישות שהן מדברות לקיר\n2️⃣ "אין לי זמן לצלם"\n- לא יודעות מה לכתוב בפוסט\n- לא יודעות מה לכתוב בפוסט\n•  פוחדות להיחשף מול לקוחות ישנים',
    '1. אין לקוחות חדשים\n2) המחירים שלהם נמוכים מדי\n\n', '', ''],
  ['שאלות נפוצות ששואלים אותך', 'כמה זה עולה?\nכמה זמן זה לוקח?\nאוקיי', 'איך מתחילים?', '', ''],
  ['"אמונות מגבילות"', '✔️ אני לא טובה מול מצלמה\n✔️ אף אחד לא ירצה לשמוע אותי', '', '', ''],
  ['עוד דרכים שהם ניסו לפתור את הבעיה', '* קורס דיגיטלי שלא סיימו\n* מנהלת סושיאל', 'יועץ עסקי', '', ''],
  ['מה קורה אם לא פותרים את הבעיה?', 'העסק נשאר קטן\nממשיכות לעבוד בשביל אחרים', '', '', ''],
];

/* קובץ אחר, שבו יש גם "איזה תוצאה" ובלי שורת הכותרת של הקבוצות */
const AUDIENCE_WITH_RESULT = [
  ['איזה כאבים יש לקהל?', 'עייפות\nחוסר ביטחון'],
  ['איזה תוצאה הם רוצים?', 'להרגיש בטוחות מול המצלמה'],
];

const PERSONA_ROWS = [
  ['שאלה', 'תשובה'],
  ['מה הסיפור שלך?', 'גדלתי בקיבוץ ועבדתי שנים כשכירה.\n\nב-2019 פתחתי עסק והכל השתנה.'],
  ['מה האג׳נדות העסקיות שלך?', 'יש לי שלוש אג׳נדות:\n## אג׳נדה 1 — כל עסק צריך תוכן\nבלי תוכן אין לקוחות.\n## אג׳נדה 2 — אותנטיות מנצחת\nלא צריך הפקה.'],
  ['מה הערכים שלך?', '1️⃣ כנות\n2️⃣ נתינה\n3️⃣ התמדה'],
  ['במה את שונה מאחרים בתחום?', 'אני מלמדת שיטה ולא טיפים'],
  ['איזו ביקורת מקצועית יש לך על התחום?', ''],
  ['שאלה שאף אחד לא שאל אף פעם על כלום בעצם', 'תשובה ארוכה מספיק'],
];

describe('ניתוח קהל יעד: הלשונית והשורות', () => {
  test('בחירת הלשונית: השם המדויק קודם, אחרת "קהל יעד" שאינו דוגמא', () => {
    assert.equal(sections.pickAudienceTab(['ניתוח קהל יעד *דוגמא*', 'ניתוח קהל יעד', 'פרסונה שיווקית']), 'ניתוח קהל יעד');
    assert.equal(sections.pickAudienceTab(['ניתוח קהל יעד *דוגמא*', 'הקהל יעד שלי']), 'הקהל יעד שלי');
    assert.equal(sections.pickAudienceTab(['ניתוח קהל יעד *דוגמא*', 'פרסונה שיווקית']), null);
    assert.equal(sections.pickAudienceTab(['קהל יעד - דוגמה']), null);
    assert.equal(sections.pickPersonaTab(['פרסונה שיווקית *דוגמא*', 'פרסונה שיווקית']), 'פרסונה שיווקית');
    assert.equal(sections.pickPersonaTab(['ניתוח קהל יעד']), null);
  });

  test('קבוצות מהכותרת, ריקות ("קבוצה 3:", "קבוצה 4:") נשמטות, נושאים בסדר של מאיה', () => {
    const { groups } = sections.parseAudienceTab(AUDIENCE_ROWS);
    assert.deepEqual(groups.map((g) => g.label), ['נשים בעלות עסקים קטנים', 'מאמנים ומטפלים']);
    assert.equal(groups[0].header, 'קבוצה 1: נשים בעלות עסקים קטנים');
    assert.deepEqual(groups[0].sections.map((s) => s.label), ['כאבים ובעיות', 'שאלות נפוצות', 'אמונות מגבילות', 'פתרונות אחרים', 'אם לא פותרים']);
    /* אין "איזה תוצאה" בקובץ הזה: אין צ'יפ */
    assert.ok(!groups[0].sections.some((s) => s.id === 'result'));
    /* בקבוצה 2 רק מה שמולא */
    assert.deepEqual(groups[1].sections.map((s) => s.id), ['pains', 'faq', 'alternatives']);
  });

  test('תא חופשי מתפרק לשורות נקיות: בלי תבליטים, מספור, מרכאות, כותרות וכפולות', () => {
    const { groups } = sections.parseAudienceTab(AUDIENCE_ROWS);
    const pains = groups[0].sections.find((s) => s.id === 'pains').rows;
    assert.deepEqual(pains, [
      'מרגישות שהן מדברות לקיר',
      'אין לי זמן לצלם',
      'לא יודעות מה לכתוב בפוסט',
      'פוחדות להיחשף מול לקוחות ישנים',
    ]);
    assert.deepEqual(groups[1].sections.find((s) => s.id === 'pains').rows, ['אין לקוחות חדשים', 'המחירים שלהם נמוכים מדי']);
    assert.deepEqual(groups[0].sections.find((s) => s.id === 'faq').rows, ['כמה זה עולה?', 'כמה זמן זה לוקח?', 'אוקיי']);
    assert.deepEqual(groups[0].sections.find((s) => s.id === 'beliefs').rows, ['אני לא טובה מול מצלמה', 'אף אחד לא ירצה לשמוע אותי']);
    assert.deepEqual(groups[0].sections.find((s) => s.id === 'alternatives').rows, ['קורס דיגיטלי שלא סיימו', 'מנהלת סושיאל']);
    /* מספר שהוא חלק מהטקסט נשאר */
    assert.deepEqual(sections.splitCell('3 ילדים וגם עסק'), ['3 ילדים וגם עסק']);
  });

  test('עד 40 שורות לנושא', () => {
    const cell = Array.from({ length: 60 }, (_, i) => `שורה מספר ${i + 1} בטבלה`).join('\n');
    assert.equal(sections.splitCell(cell).length, sections.MAX_ROWS_PER_SECTION);
    assert.equal(sections.MAX_ROWS_PER_SECTION, 40);
  });

  test('בלי שורת כותרת: עמודה B היא הקבוצה, ו"התוצאה" מופיעה כשיש אותה', () => {
    const { groups } = sections.parseAudienceTab(AUDIENCE_WITH_RESULT);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].label, '');
    assert.deepEqual(groups[0].sections.map((s) => s.label), ['כאבים ובעיות', 'התוצאה']);
    assert.deepEqual(sections.parseAudienceTab([]).groups, []);
  });
});

describe('פרסונה שיווקית: שאלה | תשובה', () => {
  test('תווית קצרה לכל שאלה, שאלה לא מוכרת מקוצרת, תשובה ריקה נשמטת', () => {
    const { groups } = sections.parsePersonaTab(PERSONA_ROWS);
    assert.equal(groups.length, 1);
    const labels = groups[0].sections.map((s) => s.label);
    assert.deepEqual(labels.slice(0, 4), ['הסיפור שלך', 'אג׳נדה עסקית', 'ערכים', 'במה את/ה שונה']);
    assert.ok(!labels.includes('ביקורת מקצועית'), 'שאלה בלי תשובה נכנסה');
    assert.ok(labels[4].length <= 27 && labels[4].endsWith('…'), labels[4]);
    assert.equal(sections.personaLabel('איפה חווית בעצמך את הכאבים של הקהל?'), 'איפה חווית את זה בעצמך');
    assert.equal(sections.personaLabel('מה החלומות שלך ואיך את חיה אותם?'), 'איך את/ה חי/ה את החלומות שלהם');
    assert.equal(sections.personaLabel('מה הקהל צריך לשמוע ממך?'), 'מה הקהל צריך לשמוע');
    assert.equal(sections.personaLabel('למה את חזקה במה שאת עושה?'), 'למה את/ה חזק/ה');
    assert.equal(sections.personaLabel('איזו ביקורת מקצועית יש לך?'), 'ביקורת מקצועית');
    assert.equal(sections.personaLabel('מה האג׳נדה האישית שלך?'), 'אג׳נדה אישית');
    assert.equal(sections.personaLabel('אילו תוצאות הבאת ללקוחות?'), 'התוצאות שאת/ה מביא/ה');
  });

  test('תשובה ארוכה מתפרקת ליחידות: כותרות ##, מספור 1️⃣, פסקאות', () => {
    const { groups } = sections.parsePersonaTab(PERSONA_ROWS);
    const by = (label) => groups[0].sections.find((s) => s.label === label).rows;
    assert.deepEqual(by('הסיפור שלך'), ['גדלתי בקיבוץ ועבדתי שנים כשכירה.', 'ב-2019 פתחתי עסק והכל השתנה.']);
    assert.deepEqual(by('אג׳נדה עסקית'), ['אג׳נדה 1 — כל עסק צריך תוכן\nבלי תוכן אין לקוחות.', 'אג׳נדה 2 — אותנטיות מנצחת\nלא צריך הפקה.']);
    assert.deepEqual(by('ערכים'), ['כנות', 'נתינה', 'התמדה']);
    assert.deepEqual(by('במה את/ה שונה'), ['אני מלמדת שיטה ולא טיפים']);
    assert.deepEqual(sections.splitPersonaAnswer('1. ראשון וזהו\nהמשך של הראשון\n2. שני וזהו'), ['ראשון וזהו\nהמשך של הראשון', 'שני וזהו']);
  });
});

/* ---------- השרת ---------- */

function slotDeps(state) {
  return async () => {
    state.rate += 1;
    return { commit: () => { state.committed += 1; }, release: async () => { state.released += 1; } };
  };
}
const TAXONOMY = {
  categories: ['בעל ערך', 'אישי', 'מכירתי'],
  categoryDefinitions: {},
  stages: ['שלב 1', 'שלב 2', 'שלב 3'],
  audienceScopes: ['עיקרי', 'משני', 'רחב'],
  strongRating: '🔥 חייב לצלם',
  normalRating: '⭐ שווה לצלם',
};
const req = (data, email = 'c@x.com') => ({ auth: { uid: 'u1', token: { email } }, data });
const actingUid = (uid, email, asUid) => (email === 'mayakislev@gmail.com' && asUid ? asUid : uid);

describe('readSheetSections', () => {
  function make({ profile = { sheetId: 'S1' }, tab } = {}) {
    const state = { rate: 0, committed: 0, released: 0, profiles: [], picks: [] };
    const h = ifs.createReadSheetSectionsHandler({
      HttpsError,
      enforceAllowlist: async () => {},
      checkRate: slotDeps(state),
      actingUid,
      getProfile: async (uid) => { state.profiles.push(uid); return profile; },
      readTab: async (sheetId, pick) => {
        state.picks.push(pick(['ניתוח קהל יעד *דוגמא*', 'ניתוח קהל יעד', 'פרסונה שיווקית']));
        return tab === undefined ? { title: state.picks.at(-1), rows: AUDIENCE_ROWS } : tab;
      },
    });
    return { h, state };
  }

  test('מחזיר קבוצות ונושאים מהלשונית האמיתית, ונספר במכסה', async () => {
    const { h, state } = make();
    const out = await h(req({ kind: 'audience' }));
    assert.equal(out.tab, 'ניתוח קהל יעד');
    assert.deepEqual(state.picks, ['ניתוח קהל יעד']);
    assert.equal(out.groups.length, 2);
    assert.equal(state.committed, 1);
  });

  test('תצוגה כלקוחה: מאיה קוראת את הקובץ של הלקוח/ה, ואחרים תמיד את שלהם', async () => {
    const a = make();
    await a.h(req({ kind: 'audience', asUid: 'clientUid123456' }, 'mayakislev@gmail.com'));
    assert.deepEqual(a.state.profiles, ['clientUid123456']);
    const b = make();
    await b.h(req({ kind: 'audience', asUid: 'clientUid123456' }));
    assert.deepEqual(b.state.profiles, ['u1']);
  });

  test('שגיאות ברורות: אין קובץ, אין לשונית, אין גישה, מקור לא מוכר. המקום במכסה חוזר', async () => {
    let m = make({ profile: {} });
    await assert.rejects(m.h(req({ kind: 'audience' })), (e) => e.code === 'failed-precondition' && /אין קובץ Sheets מקושר/.test(e.message));
    assert.equal(m.state.released, 1);
    m = make({ tab: { title: null } });
    await assert.rejects(m.h(req({ kind: 'audience' })), (e) => e.code === 'not-found' && e.message === "לא מצאנו לשונית 'ניתוח קהל יעד' בקובץ שלך");
    m = make({ tab: { title: null } });
    await assert.rejects(m.h(req({ kind: 'persona' })), /לא מצאנו לשונית 'פרסונה שיווקית' בקובץ שלך/);
    m = make({ tab: null });
    await assert.rejects(m.h(req({ kind: 'audience' })), (e) => e.code === 'unavailable');
    m = make({ tab: { title: 'ניתוח קהל יעד', rows: [] } });
    await assert.rejects(m.h(req({ kind: 'audience' })), /עוד ריקה/);
    m = make();
    await assert.rejects(m.h(req({ kind: 'other' })), /מקור לא מוכר/);
    assert.equal(m.state.rate, 0);
  });

  /* 07/11/2026 (מאיה): שגיאה ברורה לכל מקרה, ולא "לא הצלחנו לקרוא את קובץ ה-Sheets" כללי */
  test('אין גישה / קובץ שנמחק / אין קובץ / אין לשונית: קוד וסיבה נפרדים לכל אחד', async () => {
    const reasonOf = async (opts, kind = 'audience') => {
      const m = make(opts);
      try { await m.h(req({ kind })); } catch (e) { return { code: e.code, reason: e.details && e.details.reason, message: e.message }; }
      return null;
    };
    const access = await reasonOf({ tab: { error: 'no-access' } });
    assert.deepEqual(access, { code: 'permission-denied', reason: 'no-access', message: 'אין לנו גישה לקובץ שלך. מאיה צריכה לשתף אותו עם המערכת' });
    const file = await reasonOf({ tab: { error: 'no-file' } });
    assert.equal(file.code, 'not-found');
    assert.equal(file.reason, 'no-file');
    assert.match(file.message, /לא מצאנו את קובץ ה-Sheets/);
    assert.equal((await reasonOf({ profile: {} })).reason, 'no-sheet');
    assert.equal((await reasonOf({ tab: { title: null } }, 'persona')).reason, 'no-tab');
    assert.equal((await reasonOf({ tab: { title: 'ניתוח קהל יעד', rows: [] } })).reason, 'empty-tab');
    assert.equal((await reasonOf({ tab: null })).reason, 'unavailable');
    for (const r of Object.values(ifs.SHEET_ERRORS)) assert.ok(!/[—–]/.test(r.message));
  });

  test('קריאת הקובץ: 403 הוא אין גישה, 404 הוא קובץ שלא קיים, וכל השאר תקלה רגעית', () => {
    const { sheetErrorReason } = require('../functions/sheets-content.js');
    assert.equal(sheetErrorReason({ code: 403 }), 'no-access');
    assert.equal(sheetErrorReason({ code: 'ERR_X', status: 403 }), 'no-access');
    assert.equal(sheetErrorReason({ response: { status: 404 } }), 'no-file');
    assert.equal(sheetErrorReason({ code: 500 }), null);
    assert.equal(sheetErrorReason({ code: 'ECONNRESET' }), null);
    assert.equal(sheetErrorReason(null), null);
    const src = readFileSync(new URL('../functions/sheets-content.js', import.meta.url), 'utf8');
    const fn = src.slice(src.indexOf('async function fetchSheetTabPicked'));
    assert.match(fn, /return reason \? \{ error: reason \} : null;/);
  });
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 1, 2, 3, 4]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 2, 3, 4, 5]);

function claudeReply(state, payload) {
  return async (body) => {
    state.claude.push(body);
    if (payload instanceof Error) throw payload;
    /* ה-prefill הוא "{", והתשובה ממשיכה ממנו */
    return JSON.stringify(payload).slice(1);
  };
}

describe('ideasFromImage: צילום מסך של שאלה', () => {
  function make(payload = {
    seen: 'מישהי שאלה בקבוצה איך מתחילים לצלם בלי להתבייש',
    ideas: [
      { title: 'איך מתחילים לצלם כשמתביישים', context: 'שאלה מהקבוצה', categoryIndex: 1, persuasionStageIndex: 1, audienceScopeIndex: 1, strong: true },
      { title: 'בלי קטגוריה', categoryIndex: 9, persuasionStageIndex: 1, audienceScopeIndex: 1 },
    ],
  }) {
    const state = { rate: 0, committed: 0, released: 0, claude: [] };
    const h = ifs.createIdeasFromImageHandler({
      HttpsError,
      enforceAllowlist: async () => {},
      checkRate: slotDeps(state),
      callClaude: claudeReply(state, payload),
      getAudience: async () => 'בעלי עסקים',
      actingUid,
      taxonomy: TAXONOMY,
    });
    return { h, state };
  }

  test('תמונה תקינה: Claude רואה אותה, חוזרים רעיונות מסווגים ומה שנראה בצילום', async () => {
    const { h, state } = make();
    const out = await h(req({ image: PNG.toString('base64'), mediaType: 'image/png' }));
    assert.equal(out.seen, 'מישהי שאלה בקבוצה איך מתחילים לצלם בלי להתבייש');
    assert.deepEqual(out.ideas, [{
      title: 'איך מתחילים לצלם כשמתביישים', context: 'שאלה מהקבוצה', category: 'בעל ערך',
      persuasionStage: 'שלב 1', audienceScope: 'עיקרי', rating: '🔥 חייב לצלם',
    }]);
    const msg = state.claude[0].messages[0].content;
    assert.equal(msg[0].type, 'image');
    assert.equal(msg[0].source.media_type, 'image/png');
    assert.equal(msg[0].source.data, PNG.toString('base64'));
    assert.match(msg[1].text, /לשון רבים ניטרלית/);
    assert.match(msg[1].text, /categoryIndex/);
    /* המודל לא תומך ב-prefill: ההודעה האחרונה היא של המשתמש */
    assert.equal(state.claude[0].messages.length, 1);
    assert.equal(state.committed, 1);
    /* גם data URL וגם JPEG */
    await make().h(req({ image: `data:image/jpeg;base64,${JPG.toString('base64')}`, mediaType: 'image/jpeg' }));
  });

  test('קלט לא תקין נדחה לפני Claude ולפני המכסה', async () => {
    const { h, state } = make();
    await assert.rejects(h(req({ image: PNG.toString('base64'), mediaType: 'application/pdf' })), /רק תמונה/);
    await assert.rejects(h(req({ mediaType: 'image/png' })), /התמונה לא הגיעה/);
    await assert.rejects(h(req({ image: 'לא base64!!', mediaType: 'image/png' })), /לא נקראה/);
    await assert.rejects(h(req({ image: JPG.toString('base64'), mediaType: 'image/png' })), /לא תמונה/);
    await assert.rejects(h(req({ image: 'A'.repeat(Math.ceil((ifs.MAX_IMAGE_BYTES * 4) / 3) + 8), mediaType: 'image/png' })), /גדולה מדי/);
    await assert.rejects(h({ data: {} }), (e) => e.code === 'unauthenticated');
    assert.equal(state.rate, 0);
    assert.equal(state.claude.length, 0);
  });

  test('כשל של Claude מחזיר את המקום במכסה, עם הודעה בעברית', async () => {
    const { h, state } = make(new Error('boom'));
    await assert.rejects(h(req({ image: PNG.toString('base64'), mediaType: 'image/png' })), /לא הצלחנו לקרוא את צילום המסך/);
    assert.equal(state.released, 1);
    assert.equal(state.committed, 0);
  });
});

describe('ideasFromRow: שורה -> 3 רעיונות', () => {
  function make(payload) {
    const state = { rate: 0, committed: 0, released: 0, claude: [], audienceOf: [] };
    const h = ifs.createIdeasFromRowHandler({
      HttpsError,
      enforceAllowlist: async () => {},
      checkRate: slotDeps(state),
      callClaude: claudeReply(state, payload || { ideas: [1, 2, 3, 4].map((n) => ({ title: `רעיון ${n}`, context: 'כי', categoryIndex: n === 3 ? 3 : 1, persuasionStageIndex: 2, audienceScopeIndex: 1 })) }),
      getAudience: async (uid) => { state.audienceOf.push(uid); return ''; },
      actingUid,
      taxonomy: TAXONOMY,
    });
    return { h, state };
  }

  test('שלושה רעיונות בדיוק, הפרומפט נשען על השורה, הנושא והקבוצה, באותם כללים', async () => {
    const { h, state } = make();
    const out = await h(req({ kind: 'audience', section: 'כאבים ובעיות', row: 'אין לי זמן לצלם', group: 'נשים בעלות עסקים' }));
    assert.equal(out.ideas.length, ifs.ROW_IDEAS);
    assert.equal(out.ideas[2].category, 'מכירתי');
    assert.equal(out.ideas[0].persuasionStage, 'שלב 2');
    const prompt = state.claude[0].messages[0].content;
    assert.match(prompt, /ניתוח קהל יעד/);
    assert.match(prompt, /הנושא בטבלה: "כאבים ובעיות"/);
    assert.match(prompt, /קבוצת הקהל: "נשים בעלות עסקים"/);
    assert.match(prompt, /<<<\nאין לי זמן לצלם\n>>>/);
    assert.match(prompt, /במילים של הקהל/);
    assert.match(prompt, /לא מטאפורה שהמצאת/);
    assert.match(prompt, /לשון רבים ניטרלית/);
    assert.ok(prompt.includes(ifr.classificationBlock(TAXONOMY)), 'הסיווג לא זהה לסיווג של המקליט');
    assert.ok(!/[—–]/.test(ifs.rowPrompt(TAXONOMY, { kind: 'persona', section: 'x', group: '', audience: '' })));
    assert.equal(state.committed, 1);
  });

  test('פרסונה + תצוגה כלקוחה: לשון הקהל לפי הפרופיל של הלקוח/ה', async () => {
    const { h, state } = make();
    await h(req({ kind: 'persona', section: 'ערכים', row: 'כנות', asUid: 'clientUid123456' }, 'mayakislev@gmail.com'));
    assert.deepEqual(state.audienceOf, ['clientUid123456']);
    assert.match(state.claude[0].messages[0].content, /הפרסונה השיווקית/);
  });

  test('קלט לא תקין נדחה, ותשובה בלי רעיונות מחזירה את המקום', async () => {
    const { h, state } = make();
    await assert.rejects(h(req({ kind: 'x', section: 'a', row: 'b' })), /מקור לא מוכר/);
    await assert.rejects(h(req({ kind: 'audience', section: 'a', row: '   ' })), /חסר השורה/);
    await assert.rejects(h(req({ kind: 'audience', section: 'a', row: 5 })), /לא תקין/);
    assert.equal(state.rate, 0);
    /* שורה ארוכה מהקובץ נחתכת ועוברת, אחרת היא הייתה נכשלת בכל ניסיון */
    await assert.doesNotReject(h(req({ kind: 'audience', section: 'a', row: 'א'.repeat(ifs.MAX_ROW_CHARS + 50) })));
    const empty = make({ ideas: [] });
    await assert.rejects(empty.h(req({ kind: 'audience', section: 'a', row: 'שורה' })), /לא יצאו רעיונות/);
    assert.equal(empty.state.released, 1);
  });

  test('index.js: שלוש הפונקציות מחוברות, עם מכסה יומית, מנוי ותצוגה כלקוחה', () => {
    const index = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
    for (const name of ['ideasFromImage', 'ideasFromRow', 'readSheetSections']) {
      assert.match(index, new RegExp(`\\n  ${name}: \\d+,`), `אין מכסה ל-${name}`);
      assert.match(index, new RegExp(`exports\\.${name} = onCall`));
      assert.match(index, new RegExp(`checkRate: \\(uid\\) => reserveRateLimit\\(uid, '${name}'\\)`));
    }
    const block = index.slice(index.indexOf("require('./ideas-from-sources')"));
    assert.match(block.slice(0, 4000), /enforceAllowlist: \(email\) => enforceAllowlist\(email\)/);
    assert.match(block.slice(0, 4000), /actingUid,/);
    assert.match(block.slice(0, 4000), /readTab: \(sheetId, pick\) => fetchSheetTabPicked\(sheetId, pick\)/);
  });
});

/* ---------------- jsdom ---------------- */

const JSDOM_PATH = 'C:/dev/portal-sales/node_modules/jsdom/lib/api.js';
const hasJsdom = existsSync(JSDOM_PATH);

const added = [];
const calls = [];
const handlers = {};
let profileDoc = null;

describe('"אין לי רעיון?" במסך הבית (jsdom)', { skip: hasJsdom ? false : 'jsdom לא מותקן' }, () => {
  let w;
  let noIdea;
  let homeMic;
  const ideas = [];
  const duplicated = [];
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const until = async (fn, label, ms = 3000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (fn()) return;
      await new Promise((r) => setTimeout(r, 5));
    }
    assert.fail(`לא קרה: ${label}`);
  };
  const BANK = [
    { id: 'v1', url: 'https://www.instagram.com/reel/1', platform: 'instagram', domain: 'עסקים ויזמות', contentSummary: 'איך לתמחר שירות', thumbnailUrl: 'https://x/1.jpg' },
    { id: 'v2', url: 'https://www.tiktok.com/@a/video/2', platform: 'tiktok', domain: 'עסקים ויזמות', contentSummary: 'טעות בפתיחה של סרטון' },
    { id: 'v3', url: 'https://www.instagram.com/reel/3', platform: 'instagram', domain: 'יופי וקוסמטיקה', contentSummary: 'לפני ואחרי' },
  ];

  before(async () => {
    register('./helpers/cdn-stub-hooks.mjs', import.meta.url);
    globalThis.__fbStub = {
      initializeApp: () => ({}),
      getAuth: () => ({ currentUser: { uid: 'u1', email: 'mayakislev@gmail.com' } }),
      getFirestore: () => ({}),
      getFunctions: () => ({}),
      enableIndexedDbPersistence: () => Promise.resolve(),
      collection: (_db, name) => ({ path: name }),
      doc: (_db, ...p) => ({ path: p.join('/') }),
      getDoc: async (ref) => ({ exists: () => Boolean(profileDoc) && ref.path.startsWith('profiles/'), data: () => profileDoc }),
      query: (c) => c,
      where: () => ({}),
      onSnapshot: () => () => {},
      serverTimestamp: () => 'ts',
      addDoc: async (col, data) => { added.push({ col: col.path, data }); return { id: `n${added.length}` }; },
      getStorage: () => ({}),
      ref: (_s, path) => ({ path }),
      uploadBytesResumable: () => ({ on: (_e, _p, _err, done) => setTimeout(done, 0) }),
      httpsCallable: (_f, name) => async (payload) => {
        calls.push({ name, payload });
        const h = handlers[name];
        if (!h) throw new Error(`no handler for ${name}`);
        return { data: await h(payload) };
      },
    };
    const { JSDOM } = require(JSDOM_PATH);
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const dom = new JSDOM(html, { url: 'https://mayakislev-ux.github.io/maya-content-ideas/', pretendToBeVisual: true });
    w = dom.window;
    w.scrollTo = () => {};
    w.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
    class FakeRecorder {
      static isTypeSupported(t) { return t === 'audio/mp4'; }
      constructor() { this.state = 'inactive'; this.mimeType = 'audio/mp4'; }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; setTimeout(() => { if (this.onstop) this.onstop(); }, 0); }
    }
    w.MediaRecorder = FakeRecorder;
    Object.defineProperty(w.navigator, 'mediaDevices', {
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
      configurable: true,
    });
    for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent',
      'KeyboardEvent', 'MouseEvent', 'sessionStorage', 'localStorage', 'getComputedStyle', 'requestAnimationFrame',
      'cancelAnimationFrame', 'history', 'location', 'DocumentFragment', 'HTMLTextAreaElement', 'HTMLInputElement',
      'MutationObserver', 'MediaRecorder', 'Blob', 'File', 'FileReader']) {
      Object.defineProperty(globalThis, k, { value: k === 'window' ? w : w[k], configurable: true, writable: true });
    }
    (await import('../js/confirm-dialog.js')).wireConfirmDialog();
    homeMic = await import('../js/home-mic.js');
    noIdea = await import('../js/no-idea.js');
    homeMic.wireHomeMic();
    noIdea.wireNoIdea({
      getIdeas: () => ideas,
      loadBankVideos: async () => BANK,
      duplicate: async (video) => { duplicated.push(video); },
    });
    noIdea.setNoIdeaHome(true);
    homeMic.setHomeMicVisible(true);
    /* ברירת המחדל בבדיקות: יש קובץ מקושר, וכל הדלתות מוצגות */
    profileDoc = { sheetId: 'S1' };
  });

  beforeEach(() => {
    if ($('#no-idea-modal')) $('#no-idea-modal').hidden = true;
    if ($('#recorder-modal')) $('#recorder-modal').hidden = true;
  });

  test('מסך הבית: הוספה מהירה למעלה, "אין לי רעיון?" מתחתיה, בלי "השבוע" ובלי "הרעיונות האחרונים"', () => {
    const home = $('#home-view');
    const order = [...home.children].filter((n) => !n.hidden).map((n) => n.id || n.className);
    assert.deepEqual(order, ['home-capture-card', 'home-mic-card']);
    assert.equal($('.home-capture-title').textContent, '✨ מה הרעיון שקפץ לך עכשיו?');
    assert.equal($('#home-mic-title').textContent, 'אין לי רעיון?');
    assert.match($('#home-mic-text').textContent, /מספרים מה קרה, או שולפים רעיון מהקהל, מהפרסונה או מרפרנס/);
    assert.equal($('#home-progress-widget').hidden, true);
    assert.equal($('.home-recent-section').hidden, true);
    /* 07/11: מאיה: "ההתקדמות שלי - מיותר". אין כניסה בתפריט */
    assert.equal($('#tab-progress').hidden, true);
    const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
    assert.match(app, /setNoIdeaHome\(ideasRedesign\);\s*setHomeMicVisible\(ideasRedesign\);/);
    /* בלי המתג: הכל כמו קודם */
    noIdea.setNoIdeaHome(false);
    homeMic.setHomeMicVisible(false);
    assert.equal($('#home-progress-widget').hidden, false);
    assert.equal($('.home-recent-section').hidden, false);
    assert.equal($('#tab-progress').hidden, true);
    assert.equal($('#home-mic-card').hidden, true);
    noIdea.setNoIdeaHome(true);
    homeMic.setHomeMicVisible(true);
  });

  test('לחיצה על הכרטיס פותחת ארבע דלתות בסדר של מאיה, בלי להקליט', () => {
    $('#home-mic-card').click();
    assert.equal($('#no-idea-modal').hidden, false);
    assert.ok($('#no-idea-modal').classList.contains('modal'));
    assert.ok($('#no-idea-modal .modal-content'));
    assert.equal($('#home-mic-card').classList.contains('home-mic-card--live'), false, 'הכרטיס התחיל להקליט');
    const doors = $$('#no-idea-modal .no-idea-door');
    assert.deepEqual(doors.map((d) => d.querySelector('.home-mic-card__title').textContent),
      ['ממה שקרה היום / השבוע', 'מקהל היעד', 'מהפרסונה השיווקית: הבידול שלך', 'לשכפל רפרנס']);
    for (const d of doors) assert.ok(d.classList.contains('home-mic-card'), 'הדלת לא באותו מראה של הכרטיס');
    assert.equal($('#no-idea-prompt').textContent, `💡 שאלה של היום: ${noIdea.promptOfDay()}`);
    assert.deepEqual($$('.no-idea-door__actions button').map((b) => b.textContent), ['🎙️ לספר בקול', '📷 שאלה שראיתי ברשת']);
    $('#no-idea-close-btn').click();
    assert.equal($('#no-idea-modal').hidden, true);
  });

  test('שאלה של היום: מתחלפת כל יום, קבועה באותו יום, מתוך הרשימה של מאיה', () => {
    assert.equal(noIdea.DAILY_PROMPTS.length, 7);
    assert.ok(noIdea.DAILY_PROMPTS.includes('מה לקוח/ה אמר/ה בשיחת מכירה'));
    const d = (day, h) => new Date(2026, 10, day, h);
    assert.equal(noIdea.promptOfDay(d(6, 1)), noIdea.promptOfDay(d(6, 23)));
    const week = Array.from({ length: 7 }, (_, i) => noIdea.promptOfDay(d(1 + i, 12)));
    assert.equal(new Set(week).size, 7, 'בשבוע אחד כל השאלות');
    for (const p of noIdea.DAILY_PROMPTS) assert.ok(!/[—–]/.test(p));
  });

  test('דלת 1, "לספר בקול": החלון נסגר וההקלטה במקום מתחילה, עם השאלה של היום', async () => {
    $('#home-mic-card').click();
    $('#no-idea-record').click();
    assert.equal($('#no-idea-modal').hidden, true);
    await until(() => $('#home-mic-card').classList.contains('home-mic-card--live'), 'הקלטה');
    assert.ok($('#home-mic-text').textContent.includes(`שאלה של היום: ${noIdea.promptOfDay()}`));
    assert.equal($('#quick-add-input').readOnly, true);
    /* כשמקליטים, לחיצה על הכרטיס היא "סיימתי" ולא פותחת שוב את הדלתות */
    handlers.transcribeDictation = async () => ({ text: '' });
    $('#home-mic-card').click();
    assert.equal($('#no-idea-modal').hidden, true);
    await until(() => !$('#home-mic-card').classList.contains('home-mic-card--live'), 'סיום');
    await until(() => !$('#rec-step-error').hidden, 'הודעה על הקלטה ריקה');
    $('#rec-close-error').click();
  });

  test('דלת 1, צילום מסך: התמונה נשלחת, הרעיונות בחלון עם מה שהיה בצילום, ונשמרים', async () => {
    handlers.ideasFromImage = async () => ({
      seen: 'שאלה בקבוצה: איך מתחילים לצלם',
      ideas: [{ title: 'איך מתחילים לצלם כשמתביישים', context: 'מהקבוצה', category: 'בעל ערך', persuasionStage: '', audienceScope: 'עיקרי', rating: '⭐ שווה לצלם' }],
    });
    $('#home-mic-card').click();
    const input = $('#no-idea-shot-input');
    assert.equal(input.getAttribute('accept'), 'image/*');
    const file = new w.File([PNG], 'shot.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    assert.equal($('#no-idea-modal').hidden, true);
    assert.equal($('#recorder-modal').hidden, false);
    await until(() => !$('#rec-step-results').hidden, 'רעיונות מהצילום');
    const call = calls.filter((c) => c.name === 'ideasFromImage').at(-1);
    assert.equal(call.payload.mediaType, 'image/png');
    assert.equal(call.payload.image, PNG.toString('base64'));
    assert.equal($('#rec-title').textContent, '✨ רעיונות מצילום המסך');
    assert.equal($('#rec-context-line').textContent, 'מצילום המסך: "שאלה בקבוצה: איך מתחילים לצלם"');
    assert.match($('#rec-results-lead').textContent, /בצילום המסך/);
    const before = added.length;
    $('#rec-save-btn').click();
    await until(() => $('#recorder-modal').hidden, 'נשמר ונסגר');
    assert.equal(added.length, before + 1);
    assert.equal(added.at(-1).data.source, 'צילום מסך');
    assert.ok(!('sourceRow' in added.at(-1).data), 'רעיון שלא בא משורה קיבל sourceRow');
  });

  test('צילום מסך: שגיאה מהשרת גלויה בחלון, עם "לנסות שוב"', async () => {
    handlers.ideasFromImage = async () => { throw Object.assign(new Error('הגעת למכסת השימוש היומית ב-AI, נסו שוב מחר'), { code: 'functions/resource-exhausted' }); };
    $('#home-mic-card').click();
    const input = $('#no-idea-shot-input');
    Object.defineProperty(input, 'files', { value: [new w.File([PNG], 's.png', { type: 'image/png' })], configurable: true });
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    await until(() => !$('#rec-step-error').hidden, 'שגיאה');
    assert.match($('#rec-error-text').textContent, /מכסת השימוש/);
    assert.equal($('#rec-retry-btn').hidden, false);
    /* קובץ שאינו תמונה: שגיאה מיידית, בלי לשלוח */
    const sent = calls.filter((c) => c.name === 'ideasFromImage').length;
    $('#rec-close-error').click();
    $('#home-mic-card').click();
    Object.defineProperty(input, 'files', { value: [new w.File(['x'], 'a.pdf', { type: 'application/pdf' })], configurable: true });
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    await until(() => !$('#rec-step-error').hidden, 'שגיאה על קובץ');
    assert.match($('#rec-error-text').textContent, /רק תמונה/);
    assert.equal(calls.filter((c) => c.name === 'ideasFromImage').length, sent);
    $('#rec-close-error').click();
  });

  test('מקהל היעד: קבוצות, נושאים, שורות עם ✓, שורה -> 3 רעיונות -> שמירה עם sourceRow -> ✓', async () => {
    sessionStorage.clear();
    const parsed = sections.parseAudienceTab(AUDIENCE_ROWS);
    handlers.readSheetSections = async ({ kind }) => ({ kind, tab: 'ניתוח קהל יעד', groups: parsed.groups });
    ideas.length = 0;
    ideas.push({ id: 'old', title: 'ישן', sourceRow: 'אין לי זמן לצלם' });
    $('#home-mic-card').click();
    $('.no-idea-door[data-door="audience"]').click();
    assert.equal($('#no-idea-step-table').hidden, false);
    assert.equal($('#no-idea-step-doors').hidden, true);
    await until(() => $$('#no-idea-rows li').length > 0, 'שורות');
    assert.deepEqual(calls.filter((c) => c.name === 'readSheetSections').at(-1).payload, { kind: 'audience' });
    assert.deepEqual($$('#no-idea-groups .quick-chip').map((c) => c.textContent), ['נשים בעלות עסקים קטנים', 'מאמנים ומטפלים']);
    assert.ok($('#no-idea-groups .quick-chip').classList.contains('active'), 'ברירת המחדל היא קבוצה 1');
    assert.deepEqual($$('#no-idea-sections .quick-chip').map((c) => c.textContent),
      ['כאבים ובעיות', 'שאלות נפוצות', 'אמונות מגבילות', 'פתרונות אחרים', 'אם לא פותרים']);
    const rows = $$('#no-idea-rows li');
    assert.deepEqual(rows.map((li) => li.querySelector('.no-idea-row__text').textContent), parsed.groups[0].sections[0].rows);
    assert.ok(rows.every((li) => li.classList.contains('calm-card')));
    const done = rows.find((li) => li.textContent.includes('אין לי זמן לצלם'));
    assert.ok(done.classList.contains('no-idea-row--done'));
    assert.match(done.textContent, /✓ כבר יש עליה רעיון/);
    const fresh = rows.find((li) => li.textContent.includes('מרגישות שהן מדברות לקיר'));
    assert.match(fresh.textContent, /עוד אין עליה רעיון/);

    /* החלפת נושא וקבוצה */
    $$('#no-idea-sections .quick-chip')[1].click();
    assert.deepEqual($$('#no-idea-rows .no-idea-row__text').map((n) => n.textContent), ['כמה זה עולה?', 'כמה זמן זה לוקח?', 'אוקיי']);
    $$('#no-idea-groups .quick-chip')[1].click();
    assert.deepEqual($$('#no-idea-sections .quick-chip').map((c) => c.textContent), ['כאבים ובעיות', 'שאלות נפוצות', 'פתרונות אחרים']);
    $$('#no-idea-groups .quick-chip')[0].click();

    handlers.ideasFromRow = async () => ({ ideas: [
      { title: 'מדברת לקיר? זה לא את', context: 'כי', category: 'בעל ערך', persuasionStage: 'שלב שכנוע 1 - מודעות לבעיה / חומרת הבעיה', audienceScope: 'עיקרי', rating: '⭐ שווה לצלם' },
      { title: 'הסיבה שאף אחד לא מגיב', context: '', category: 'בעל ערך', persuasionStage: '', audienceScope: 'עיקרי', rating: '⭐ שווה לצלם' },
      { title: 'מה עשיתי כשדיברתי לקיר', context: '', category: 'אישי', persuasionStage: '', audienceScope: 'עיקרי', rating: '⭐ שווה לצלם' },
    ] });
    $$('#no-idea-rows li').find((li) => li.textContent.includes('מרגישות שהן מדברות לקיר')).querySelector('button').click();
    assert.equal($('#no-idea-modal').hidden, true);
    assert.equal($('#recorder-modal').hidden, false);
    await until(() => !$('#rec-step-results').hidden, 'רעיונות מהשורה');
    assert.deepEqual(calls.filter((c) => c.name === 'ideasFromRow').at(-1).payload,
      { kind: 'audience', section: 'כאבים ובעיות', row: 'מרגישות שהן מדברות לקיר', group: 'נשים בעלות עסקים קטנים' });
    assert.equal($('#rec-context-line').textContent, 'מהטבלה שלך · כאבים ובעיות: "מרגישות שהן מדברות לקיר"');
    assert.equal($$('#rec-list .rec-item').length, 3);
    assert.equal($('#rec-back-btn').hidden, false);
    assert.equal($('#rec-back-btn').textContent, '‹ חזרה לשורות');

    const before = added.length;
    $('#rec-save-btn').click();
    await until(() => added.length === before + 3, 'שלושה נשמרו');
    for (const a of added.slice(before)) {
      assert.equal(a.data.sourceRow, 'מרגישות שהן מדברות לקיר');
      assert.equal(a.data.sourceSection, 'כאבים ובעיות');
      assert.equal(a.data.sourceTab, 'ניתוח קהל יעד');
      assert.equal(a.data.source, 'ניתוח קהל יעד');
    }
    /* חוזרים לשורות, והשורה מסומנת מיד (גם לפני שהמנוי לרעיונות מתעדכן) */
    await until(() => !$('#no-idea-modal').hidden && !$('#no-idea-step-table').hidden, 'חזרה לשורות');
    const now = $$('#no-idea-rows li').find((li) => li.textContent.includes('מרגישות שהן מדברות לקיר'));
    assert.ok(now.classList.contains('no-idea-row--done'));
    assert.match(now.textContent, /✓ כבר יש עליה רעיון/);
  });

  test('"חזרה לשורות" באמצע ההמתנה חוזר לרשימה, ותשובה מאוחרת לא פותחת חלון', async () => {
    let release;
    handlers.ideasFromRow = () => new Promise((r) => { release = r; });
    $('#home-mic-card').click();
    $('.no-idea-door[data-door="audience"]').click();
    const reads = calls.filter((c) => c.name === 'readSheetSections').length;
    await until(() => $$('#no-idea-rows li').length > 0, 'שורות');
    assert.equal(calls.filter((c) => c.name === 'readSheetSections').length, reads, 'הטבלה נקראה שוב במקום מהמטמון');
    $$('#no-idea-rows li button')[3].click();
    await until(() => typeof release === 'function', 'נשלח');
    $('#rec-back-btn').click();
    assert.equal($('#recorder-modal').hidden, true);
    assert.equal($('#no-idea-modal').hidden, false);
    assert.equal($('#no-idea-step-table').hidden, false);
    release({ ideas: [{ title: 'מאוחר', category: 'אישי' }] });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal($('#recorder-modal').hidden, true, 'תשובה מאוחרת פתחה את החלון');

    /* "רענון מהקובץ" קורא שוב */
    $('#no-idea-refresh').click();
    await until(() => calls.filter((c) => c.name === 'readSheetSections').length === reads + 1, 'רענון');
    await until(() => $$('#no-idea-rows li').length > 0, 'שורות אחרי רענון');
    $('#no-idea-close-btn').click();
  });

  /* 07/11/2026 (מאיה: למשתמשי המרתון הזמניים אין טבלאות, "פשוט לבטל את הקהל יעד והפרסונה") */
  test('בלי קובץ Sheets מקושר: אין דלתות "מקהל היעד" ו"מהפרסונה", ועם קובץ הן חוזרות', async () => {
    const visible = () => $$('#no-idea-modal .no-idea-door').filter((d) => !d.hidden).map((d) => d.dataset.door);
    const saved = profileDoc;
    try {
      for (const profile of [null, {}, { sheetId: '' }, { sheetId: '   ' }]) {
        profileDoc = profile;
        noIdea.__test.sheetKnown.clear();
        $('#home-mic-card').click();
        await new Promise((r) => setTimeout(r, 10));
        assert.deepEqual(visible(), ['today', 'reference'], `פרופיל ${JSON.stringify(profile)}`);
        $('#no-idea-close-btn').click();
      }
      /* הקובץ קושר בינתיים: בפתיחה הבאה הדלתות מופיעות */
      profileDoc = { sheetId: 'S1' };
      $('#home-mic-card').click();
      await until(() => visible().length === 4, 'הדלתות חזרו');
      assert.deepEqual(visible(), ['today', 'audience', 'persona', 'reference']);
      $('#no-idea-close-btn').click();
      /* בפתיחה הבאה הן מוצגות מיד, בלי לחכות לפרופיל */
      $('#home-mic-card').click();
      assert.deepEqual(visible(), ['today', 'audience', 'persona', 'reference']);
      $('#no-idea-close-btn').click();
      assert.equal(noIdea.hasSheet({ sheetId: 'x' }), true);
      assert.equal(noIdea.hasSheet({ sheetId: 5 }), false);
      /* הבדיקה קוראת את הפרופיל של מי שבתצוגה (getProfile עם subjectUid) */
      const src = readFileSync(new URL('../js/no-idea.js', import.meta.url), 'utf8');
      assert.match(src, /function checkSheetDoors\(\) \{[\s\S]*?getProfile\(\)/);
      const prof = readFileSync(new URL('../js/user-profile.js', import.meta.url), 'utf8');
      assert.match(prof, /doc\(db, 'profiles', subjectUid\(auth\.currentUser\.uid\)\)/);
    } finally {
      profileDoc = saved;
    }
  });

  test('אין גישה לקובץ: הודעה ספציפית, ולא "לא הצלחנו לקרוא את הקובץ"', async () => {
    sessionStorage.clear();
    handlers.readSheetSections = async () => {
      throw Object.assign(new Error('permission'), { code: 'functions/permission-denied', details: { reason: 'no-access' } });
    };
    $('#home-mic-card').click();
    $('.no-idea-door[data-door="persona"]').click();
    await until(() => /אין לנו גישה/.test($('#no-idea-table-status').textContent), 'הודעת גישה');
    assert.equal($('#no-idea-table-status').textContent, 'אין לנו גישה לקובץ שלך. מאיה צריכה לשתף אותו עם המערכת');
    assert.equal($('#no-idea-retry').textContent, 'בדיקה מחדש בקובץ');
    handlers.readSheetSections = async () => {
      throw Object.assign(new Error('gone'), { code: 'functions/not-found', details: { reason: 'no-file' } });
    };
    $('#no-idea-retry').click();
    await until(() => /לא מצאנו את קובץ ה-Sheets/.test($('#no-idea-table-status').textContent), 'הודעת קובץ חסר');
    for (const t of Object.values(noIdea.SHEET_ERROR_TEXT)) assert.ok(!/[—–]/.test(t));
    $('#no-idea-close-btn').click();
  });

  test('אין לשונית / אין קובץ: הודעה ברורה בחלון, ולא מסך ריק', async () => {
    sessionStorage.clear();
    handlers.readSheetSections = async () => {
      throw Object.assign(new Error("לא מצאנו לשונית 'ניתוח קהל יעד' בקובץ שלך"), { code: 'functions/not-found' });
    };
    $('#home-mic-card').click();
    $('.no-idea-door[data-door="audience"]').click();
    await until(() => /לא מצאנו לשונית/.test($('#no-idea-table-status').textContent), 'הודעה');
    assert.equal($('#no-idea-table-status').getAttribute('role'), 'alert');
    assert.equal($('#no-idea-table-status').textContent, "לא מצאנו לשונית 'ניתוח קהל יעד' בקובץ שלך");
    assert.equal($('#no-idea-retry').hidden, false);
    assert.equal($$('#no-idea-rows li').length, 0);
    handlers.readSheetSections = async () => { throw new Error('internal'); };
    $('#no-idea-retry').click();
    await until(() => /לא הצלחנו לקרוא את הקובץ/.test($('#no-idea-table-status').textContent), 'הודעה כללית בעברית');
    $('#no-idea-table-back').click();
    assert.equal($('#no-idea-step-doors').hidden, false);
    $('#no-idea-close-btn').click();
  });

  test('מהפרסונה: אותה זרימה על "פרסונה שיווקית", עם השורות המפורקות', async () => {
    sessionStorage.clear();
    const parsed = sections.parsePersonaTab(PERSONA_ROWS);
    handlers.readSheetSections = async ({ kind }) => ({ kind, tab: 'פרסונה שיווקית', groups: parsed.groups });
    $('#home-mic-card').click();
    $('.no-idea-door[data-door="persona"]').click();
    assert.equal($('#no-idea-table-title').textContent, '✨ מהפרסונה השיווקית: הבידול שלך');
    await until(() => $$('#no-idea-rows li').length > 0, 'שורות');
    assert.equal(calls.filter((c) => c.name === 'readSheetSections').at(-1).payload.kind, 'persona');
    assert.equal($('#no-idea-groups').hidden, true, 'בפרסונה אין קבוצות');
    assert.deepEqual($$('#no-idea-sections .quick-chip').map((c) => c.textContent).slice(0, 4), ['הסיפור שלך', 'אג׳נדה עסקית', 'ערכים', 'במה את/ה שונה']);
    $$('#no-idea-sections .quick-chip')[1].click();
    assert.equal($$('#no-idea-rows li').length, 2);
    handlers.ideasFromRow = async () => ({ ideas: [{ title: 'למה כל עסק צריך תוכן', category: 'בעל ערך' }] });
    $$('#no-idea-rows li button')[0].click();
    await until(() => !$('#rec-step-results').hidden, 'רעיונות');
    const p = calls.filter((c) => c.name === 'ideasFromRow').at(-1).payload;
    assert.equal(p.kind, 'persona');
    assert.equal(p.section, 'אג׳נדה עסקית');
    assert.equal(p.row, 'אג׳נדה 1 — כל עסק צריך תוכן\nבלי תוכן אין לקוחות.');
    assert.match($('#rec-context-line').textContent, /^מהפרסונה שלך · אג׳נדה עסקית: /);
    const before = added.length;
    $('#rec-save-btn').click();
    await until(() => added.length === before + 1, 'נשמר');
    assert.equal(added.at(-1).data.sourceTab, 'פרסונה שיווקית');
    assert.equal(added.at(-1).data.sourceRow, p.row);
    $('#no-idea-close-btn').click();
  });

  test('שורה ארוכה מוצגת עד 300 תווים, והטקסט המלא נשלח', () => {
    const long = 'א'.repeat(500);
    assert.equal(noIdea.shortRowText(long).length, noIdea.ROW_SHOWN_CHARS);
    assert.ok(noIdea.shortRowText(long).endsWith('…'));
    assert.equal(noIdea.shortRowText('קצר'), 'קצר');
    assert.deepEqual(noIdea.rowsWithMarks(['א', 'ב', 'ג'], [{ sourceRow: 'ב' }, { title: 'x' }], new Set(['ג'])).map((r) => r.done), [false, true, true]);
  });

  test('לשכפל רפרנס: אקראי מהתחום, "עוד אחד" מחליף, "לשכפל" פותח את השכפול הקיים עם הרפרנס', async () => {
    profileDoc = { videoAssistantDomain: 'עסקים ויזמות' };
    $('#home-mic-card').click();
    $('.no-idea-door[data-door="reference"]').click();
    await until(() => !$('#no-idea-ref-card').hidden, 'רפרנס');
    const shown = () => BANK.find((v) => v.contentSummary === $('#no-idea-ref-summary').textContent);
    const first = shown();
    assert.equal(first.domain, 'עסקים ויזמות');
    assert.equal($('#no-idea-ref-link').getAttribute('href'), first.url);
    assert.equal($('#no-idea-ref-link').getAttribute('target'), '_blank');
    assert.match($('#no-idea-ref-link').textContent, /לצפייה ב-(Instagram|TikTok)/);
    $('#no-idea-ref-next').click();
    const second = shown();
    assert.notEqual(second.id, first.id);
    assert.equal(second.domain, 'עסקים ויזמות');
    $('#no-idea-ref-dup').click();
    await until(() => duplicated.length === 1, 'שכפול');
    assert.equal(duplicated[0], second, 'נשלח לשכפול סרטון אחר ממה שמוצג');
    assert.equal($('#no-idea-modal').hidden, true);

    /* אותו שכפול בדיוק כמו הכפתור על הכרטיס במאגר */
    const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
    assert.match(app, /wireNoIdea\(\{ getIdeas: getAllIdeas, loadBankVideos, duplicate: startBankDuplication, guessDomain, saveDomain \}\)/);
    const insp = readFileSync(new URL('../js/inspiration-view.js', import.meta.url), 'utf8');
    assert.match(insp, /export \{ loadVideos as loadBankVideos, startDuplication as startBankDuplication \}/);
    assert.match(insp, /info\.appendChild\(duplicateButton\(video\)\)/);
    assert.match(insp, /startDuplication\(video\)\.finally/);
  });

  test('רפרנס: בלי תחום או בלי סרטונים בתחום, מכל התחומים, ושגיאת טעינה גלויה', async () => {
    const pool = noIdea.referencePool(BANK, 'תחום שאין');
    assert.equal(pool.list.length, 3);
    assert.equal(pool.fallback, true);
    assert.equal(noIdea.referencePool(BANK, '').fallback, false);
    /* 07/11: תת-הקטגוריה קודמת לשאר התחום (קוסמטיקאית לאקנה לא מקבלת שיער) */
    const sub = noIdea.referencePool([
      { id: 'a', url: 'u1', domain: 'יופי', subCategory: 'טיפוח עור', contentSummary: 'x' },
      { id: 'b', url: 'u2', domain: 'יופי', subCategory: 'שיער', contentSummary: 'y' },
      { id: 'c', url: 'u3', domain: 'כושר', subCategory: 'ציוד ספורט', contentSummary: 'z' },
    ], 'יופי', 'טיפוח עור');
    assert.deepEqual(sub.list.map((v) => v.id), ['a']);
    assert.equal(noIdea.pickReference([BANK[0]], 'v1'), BANK[0]);
    assert.equal(noIdea.pickReference([], null), null);
    profileDoc = { videoAssistantDomain: 'תחום שאין' };
    $('#home-mic-card').click();
    $('.no-idea-door[data-door="reference"]').click();
    await until(() => !$('#no-idea-ref-card').hidden, 'רפרנס');
    assert.match($('#no-idea-ref-status').textContent, /מכל התחומים/);
    noIdea.wireNoIdea({ loadBankVideos: async () => { throw new Error('offline'); } });
    $('#no-idea-ref-back').click();
    $('.no-idea-door[data-door="reference"]').click();
    await until(() => !$('#no-idea-ref-retry').hidden, 'שגיאה');
    assert.match($('#no-idea-ref-status').textContent, /לא הצלחנו לטעון את המאגר/);
    assert.equal($('#no-idea-ref-status').getAttribute('role'), 'alert');
    noIdea.wireNoIdea({ loadBankVideos: async () => BANK });
    $('#no-idea-close-btn').click();
  });

  test('בדפדפן בלי מיקרופון: הכרטיס עדיין מוצג (יש עוד שלוש דלתות), ו"לספר בקול" אומר למה לא', () => {
    const saved = w.MediaRecorder;
    const savedGlobal = globalThis.MediaRecorder;
    delete w.MediaRecorder;
    globalThis.MediaRecorder = undefined;
    try {
      homeMic.setHomeMicVisible(true);
      assert.equal($('#home-mic-card').hidden, false);
      $('#home-mic-card').click();
      $('#no-idea-record').click();
      assert.equal($('#no-idea-modal').hidden, false);
      assert.match($('#no-idea-doors-status').textContent, /הקלטה קולית לא זמינה/);
      assert.equal($('#no-idea-doors-status').hidden, false);
      $('#no-idea-close-btn').click();
    } finally {
      w.MediaRecorder = saved;
      globalThis.MediaRecorder = savedGlobal;
    }
  });

  test('בלי מקף ארוך בטקסטים החדשים, וה-CSS רק עם טוקנים קיימים', () => {
    const src = readFileSync(new URL('../js/no-idea.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/[—–]/.test(src), 'מקף ארוך ב-js/no-idea.js');
    const srv = readFileSync(new URL('../functions/ideas-from-sources.js', import.meta.url), 'utf8');
    assert.ok(!/[—–]/.test(srv), 'מקף ארוך בפרומפטים');
    const base = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../css/ideas-shelves.css', import.meta.url), 'utf8');
    const defined = new Set([...base.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    const block = css.slice(css.indexOf('"אין לי רעיון?" במסך הבית'));
    for (const [, name] of block.matchAll(/var\((--[\w-]+)/g)) assert.ok(defined.has(name), `טוקן לא קיים: ${name}`);
  });
});
