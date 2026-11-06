/* 06/11/2026 ערב (מאיה): "בדף הבית כשאני לוחצת על מה היה היום, סבבה זה
   מקליט ומזהה אבל לא אהבתי שזה פותח מסך נפרד מוזר כזה וטוען הרבה זמן.
   הייתי רוצה שתוך כדי שמקליטה יתומלל בו זמנית למתחת ל'מה הרעיון שקפץ לך
   עכשיו' ואז ישמור כפופאפ מסודר".

   1. השרת: קטעים קצרים לתמלול (מכסה נפרדת), ורעיונות מתוך טקסט.
   2. העזרים הטהורים של החיתוך והחיבור.
   3. הזרימה האמיתית ב-jsdom: לוחצים על הכרטיס, הטקסט מופיע בתיבה בזמן
      ההקלטה, "סיימתי", חלון עם הרעיונות, שמירה. ושגיאות גלויות. */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { register, createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dict = require('../functions/dictation.js');
const ifr = require('../functions/ideas-from-recording.js');

class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function geminiReply(state, payload) {
  return async (url, opts) => {
    state.gemini.push(JSON.parse(opts.body));
    const text = JSON.stringify(payload);
    return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] }) };
  };
}

/* ---------------- 1. השרת ---------------- */

describe('transcribeDictation: קטעים של מיקרופון הבית', () => {
  function makeDeps(meta = { size: 60_000, contentType: 'audio/mp4' }) {
    const state = { deleted: [], gemini: [], rate: [], committed: 0, released: 0 };
    const slot = (name) => async () => {
      state.rate.push(name);
      return { commit: () => { state.committed += 1; }, release: async () => { state.released += 1; } };
    };
    const deps = {
      HttpsError,
      enforceAllowlist: async () => {},
      checkRate: slot('dictation'),
      checkSegmentRate: slot('segment'),
      bucket: { name: 'b', file: (p) => ({ getMetadata: async () => [meta], delete: async () => { state.deleted.push(p); } }) },
      getAccessToken: async () => 'tok',
      projectId: 'p',
      fetchImpl: geminiReply(state, { text: 'היום לקוחה שאלה' }),
    };
    return { deps, state };
  }
  const req = (data) => ({ auth: { uid: 'u1', token: { email: 'a@b.c' } }, data });

  test('קטע נספר במכסה נפרדת ומקבל את הפרומפט של קטע מתוך דיבור רצוף', async () => {
    const { deps, state } = makeDeps();
    const out = await dict.createDictationHandler(deps)(req({ path: 'transcribeUploads/u1/s-abc.m4a', segment: true }));
    assert.deepEqual(out, { text: 'היום לקוחה שאלה' });
    assert.deepEqual(state.rate, ['segment']);
    assert.equal(state.committed, 1);
    assert.deepEqual(state.deleted, ['transcribeUploads/u1/s-abc.m4a']);
    const prompt = state.gemini[0].contents[0].parts[1].text;
    assert.equal(prompt, dict.SEGMENT_PROMPT);
    assert.match(prompt, /באמצע משפט/);
    assert.match(prompt, /לא לנחש/);
  });

  test('בלי segment: אותה הכתבה כמו קודם, באותה מכסה', async () => {
    const { deps, state } = makeDeps();
    await dict.createDictationHandler(deps)(req({ path: 'transcribeUploads/u1/d-abc.m4a' }));
    assert.deepEqual(state.rate, ['dictation']);
    assert.equal(state.gemini[0].contents[0].parts[1].text, dict.PROMPT);
    /* segment חייב להיות true בדיוק, לא סתם ערך */
    const again = makeDeps();
    await dict.createDictationHandler(again.deps)(req({ path: 'transcribeUploads/u1/d-abc.m4a', segment: 'yes' }));
    assert.deepEqual(again.state.rate, ['dictation']);
  });

  test('קטע גדול מדי נדחה, והמקום במכסה חוזר', async () => {
    const { deps, state } = makeDeps({ size: dict.MAX_SEGMENT_BYTES + 1, contentType: 'audio/mp4' });
    await assert.rejects(dict.createDictationHandler(deps)(req({ path: 'transcribeUploads/u1/s-a.m4a', segment: true })), /קטע ההקלטה גדול מדי/);
    assert.equal(state.released, 1);
    assert.equal(state.gemini.length, 0);
    assert.ok(dict.MAX_SEGMENT_BYTES < dict.MAX_AUDIO_BYTES);
  });

  test('index.js: מכסה יומית נפרדת לקטעים, שמספיקה לכמה שיחות של 10 דקות', () => {
    const index = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
    const m = index.match(/transcribeDictationSegment: (\d+)/);
    assert.ok(m, 'אין מכסה לקטעים');
    /* 10 דקות בקטעים של 5 שניות לכל היותר = 120 קטעים. לפחות 4 שיחות כאלה ביום. */
    assert.ok(Number(m[1]) >= 480, `המכסה ${m[1]} קטנה מדי`);
    assert.match(index, /transcribeDictation: 80/);
    const block = index.slice(index.indexOf("require('./dictation')"), index.indexOf('exports.transcribeDictation'));
    assert.match(block, /checkSegmentRate: \(uid\) => reserveRateLimit\(uid, 'transcribeDictationSegment'\)/);
  });
});

describe('ideasFromRecording: רעיונות מתוך טקסט', () => {
  const TAXONOMY = {
    categories: ['בעל ערך', 'אישי', 'מכירתי'],
    categoryDefinitions: {},
    stages: ['שלב 1', 'שלב 2', 'שלב 3'],
    audienceScopes: ['עיקרי', 'משני', 'רחב'],
    strongRating: '🔥 חייב לצלם',
    normalRating: '⭐ שווה לצלם',
  };
  function makeDeps(fetchImpl) {
    const state = { gemini: [], rate: [], committed: 0, released: 0, touched: 0 };
    const slot = (name) => async () => {
      state.rate.push(name);
      return { commit: () => { state.committed += 1; }, release: async () => { state.released += 1; } };
    };
    const deps = {
      HttpsError,
      enforceAllowlist: async () => {},
      checkRate: slot('recording'),
      checkTextRate: slot('text'),
      bucket: { name: 'b', file: () => { state.touched += 1; return {}; } },
      getAccessToken: async () => 'tok',
      projectId: 'p',
      fetchImpl: fetchImpl || geminiReply(state, { ideas: [
        { title: 'לקוחה שאלה למה המחיר שלי גבוה', context: 'היום בשיחה', categoryIndex: 3, persuasionStageIndex: 3, audienceScopeIndex: 1, strong: true },
      ] }),
      taxonomy: TAXONOMY,
    };
    return { deps, state };
  }
  const req = (data) => ({ auth: { uid: 'u1', token: { email: 'a@b.c' } }, data });

  test('טקסט: אותו סיווג, מכסה של טקסט, בלי Storage, וחשיבה קלה (מהיר)', async () => {
    const { deps, state } = makeDeps();
    const out = await ifr.createIdeasFromRecordingHandler(deps)(req({ text: 'היום לקוחה שאלה אותי למה המחיר שלי גבוה' }));
    assert.deepEqual(out.ideas, [{
      title: 'לקוחה שאלה למה המחיר שלי גבוה', context: 'היום בשיחה', category: 'מכירתי',
      persuasionStage: 'שלב 3', audienceScope: 'עיקרי', rating: '🔥 חייב לצלם',
    }]);
    assert.deepEqual(state.rate, ['text']);
    assert.equal(state.committed, 1);
    assert.equal(state.touched, 0, 'בקשת טקסט נגעה ב-Storage');
    const body = state.gemini[0];
    const parts = body.contents[0].parts;
    assert.equal(parts.length, 2);
    assert.ok(!parts.some((p) => p.fileData));
    assert.equal(parts[0].text, ifr.buildPrompt(TAXONOMY, { source: 'text' }));
    assert.match(parts[1].text, /היום לקוחה שאלה אותי למה המחיר שלי גבוה/);
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'LOW');
  });

  test('הפרומפט של טקסט הוא אותו פרומפט, רק על טקסט, ורעיון קצר אחד נשאר אחד', () => {
    const audio = ifr.buildPrompt(TAXONOMY);
    const text = ifr.buildPrompt(TAXONOMY, { source: 'text' });
    assert.match(text, /זה תמלול/);
    assert.match(text, /למצוא בתוך הטקסט/);
    assert.match(text, /אם אין בטקסט אף רעיון/);
    assert.match(text, /רעיון אחד קצר, להחזיר אותו כרעיון אחד/);
    assert.match(audio, /זו הקלטה קולית/);
    assert.match(audio, /אם אין בהקלטה אף רעיון/);
    assert.doesNotMatch(audio, /רעיון אחד קצר/);
    /* הכללים והסיווג משותפים */
    const tail = (p) => p.slice(p.indexOf('לכל רעיון לסווג'));
    assert.equal(tail(text), tail(audio));
  });

  test('טקסט ריק, לא מחרוזת או ארוך מדי נדחה לפני ג\'מיני', async () => {
    const { deps, state } = makeDeps();
    const h = ifr.createIdeasFromRecordingHandler(deps);
    await assert.rejects(h(req({ text: '   ' })), /אין טקסט/);
    await assert.rejects(h(req({ text: 42 })), /הטקסט לא הגיע/);
    await assert.rejects(h(req({ text: 'א'.repeat(ifr.MAX_TEXT_CHARS + 1) })), /ארוך מדי/);
    assert.equal(state.gemini.length, 0);
    assert.equal(state.rate.length, 0);
  });

  test('כשל של ג\'מיני על טקסט מחזיר את המקום במכסה', async () => {
    const { deps, state } = makeDeps(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    await assert.rejects(ifr.createIdeasFromRecordingHandler(deps)(req({ text: 'משהו' })), /לא הצלחנו למצוא רעיונות בטקסט/);
    assert.equal(state.released, 1);
    assert.equal(state.committed, 0);
  });

  test('index.js: מכסה לטקסט, מחוברת ל-ideasFromRecording', () => {
    const index = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
    assert.match(index, /ideasFromText: \d+/);
    const block = index.slice(index.indexOf("require('./ideas-from-recording')"), index.indexOf('exports.ideasFromRecording'));
    assert.match(block, /checkTextRate: \(uid\) => reserveRateLimit\(uid, 'ideasFromText'\)/);
  });
});

/* ---------------- 2+3. הדפדפן ---------------- */

const JSDOM_PATH = 'C:/dev/portal-sales/node_modules/jsdom/lib/api.js';
const hasJsdom = existsSync(JSDOM_PATH);

const added = [];
const uploads = new Map(); // path -> size
const calls = [];
const handlers = {};
let uploadCount = 0;

describe('מיקרופון הבית (jsdom)', { skip: hasJsdom ? false : 'jsdom לא מותקן' }, () => {
  let w;
  let homeMic;
  const $ = (s) => document.querySelector(s);
  const until = async (fn, label, ms = 3000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (fn()) return;
      await new Promise((r) => setTimeout(r, 5));
    }
    assert.fail(`לא קרה: ${label}`);
  };
  const box = () => $('#quick-add-input');
  const card = () => $('#home-mic-card');
  const recorders = [];
  const stoppedTracks = [];
  let gumImpl = null;

  before(async () => {
    register('./helpers/cdn-stub-hooks.mjs', import.meta.url);
    globalThis.__fbStub = {
      initializeApp: () => ({}),
      getAuth: () => ({ currentUser: { uid: 'u1', email: 'c@x.com' } }),
      getFirestore: () => ({}),
      getFunctions: () => ({}),
      enableIndexedDbPersistence: () => Promise.resolve(),
      collection: (_db, name) => ({ path: name }),
      doc: (_db, ...p) => ({ path: p.join('/') }),
      query: (c) => c,
      where: () => ({}),
      onSnapshot: () => () => {},
      serverTimestamp: () => 'ts',
      addDoc: async (col, data) => { added.push({ col: col.path, data }); return { id: `n${added.length}` }; },
      getStorage: () => ({}),
      ref: (_s, path) => ({ path }),
      uploadBytesResumable: (r, blob) => {
        uploadCount += 1;
        uploads.set(r.path, blob.size);
        return { on: (_e, _progress, _err, done) => { setTimeout(done, 0); } };
      },
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
    w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));

    /* כל הקלטה מחזירה קובץ בגודל 1000+מספר ההקלטה, כך שהתמלול המדומה
       יודע איזה קטע זה ומחזיר "מילהN" */
    class FakeRecorder {
      static isTypeSupported(t) { return t === 'audio/mp4'; }
      constructor(stream, opts) {
        this.mimeType = (opts && opts.mimeType) || 'audio/mp4';
        this.state = 'inactive';
        this.n = recorders.length;
        recorders.push(this);
      }
      start() { this.state = 'recording'; }
      stop() {
        if (this.state === 'inactive') return;
        this.state = 'inactive';
        const size = FakeRecorder.empty ? 0 : 1000 + this.n;
        setTimeout(() => {
          if (size) this.ondataavailable({ data: new w.Blob(['x'.repeat(size)], { type: this.mimeType }) });
          if (this.onstop) this.onstop();
        }, 0);
      }
    }
    globalThis.FakeRecorder = FakeRecorder;
    w.MediaRecorder = FakeRecorder;
    Object.defineProperty(w.navigator, 'mediaDevices', {
      value: { getUserMedia: (...a) => gumImpl(...a) },
      configurable: true,
    });
    for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent',
      'KeyboardEvent', 'MouseEvent', 'sessionStorage', 'localStorage', 'getComputedStyle', 'requestAnimationFrame',
      'cancelAnimationFrame', 'history', 'location', 'DocumentFragment', 'HTMLTextAreaElement', 'HTMLInputElement',
      'MutationObserver', 'MediaRecorder', 'Blob']) {
      Object.defineProperty(globalThis, k, { value: k === 'window' ? w : w[k], configurable: true, writable: true });
    }
    (await import('../js/confirm-dialog.js')).wireConfirmDialog();
    homeMic = await import('../js/home-mic.js');
    /* קטעים קצרים כדי שהבדיקה לא תחכה 7 שניות לכל קטע */
    Object.assign(homeMic.TIMING, { fixedMs: 80, minMs: 50, maxMs: 120, tickMs: 10, finishWaitMs: 2000 });
    homeMic.wireHomeMic();
    homeMic.setHomeMicVisible(true);
  });

  beforeEach(() => {
    gumImpl = async () => ({ getTracks: () => [{ stop: () => stoppedTracks.push(1) }] });
    globalThis.FakeRecorder.empty = false;
    delete w.webkitSpeechRecognition;
    delete globalThis.webkitSpeechRecognition;
    /* קטע 0 חוזר לאט מקטע 1: הטקסט עדיין חייב להיכנס לפי הסדר */
    handlers.transcribeDictation = async ({ path }) => {
      const n = uploads.get(path) - 1000;
      await new Promise((r) => setTimeout(r, n === 0 ? 60 : 5));
      return { text: `מילה${n}` };
    };
    recorders.length = 0;
  });



  test('עזרים: חיתוך ברגע של שקט, וחיבור לפי הסדר בלבד', () => {
    const T = homeMic.TIMING;
    assert.equal(homeMic.shouldCut({ elapsedMs: T.minMs - 1, quietForMs: 9999, hasLevels: true }), false);
    assert.equal(homeMic.shouldCut({ elapsedMs: T.minMs, quietForMs: T.quietHoldMs, hasLevels: true }), true);
    assert.equal(homeMic.shouldCut({ elapsedMs: T.minMs, quietForMs: 0, hasLevels: true }), false);
    assert.equal(homeMic.shouldCut({ elapsedMs: T.maxMs, quietForMs: 0, hasLevels: true }), true);
    assert.equal(homeMic.shouldCut({ elapsedMs: T.fixedMs - 1, hasLevels: false }), false);
    assert.equal(homeMic.shouldCut({ elapsedMs: T.fixedMs, hasLevels: false }), true);
    assert.deepEqual(homeMic.joinedSoFar(['א', undefined, 'ג']), { text: 'א', pending: 1 });
    assert.deepEqual(homeMic.joinedSoFar(['א', '', ' ב ', 'ג']), { text: 'א ב ג', pending: 0 });
    assert.equal(homeMic.appendToBase('היה כבר  ', 'חדש'), 'היה כבר חדש');
    assert.equal(homeMic.appendToBase('', 'חדש'), 'חדש');
    assert.equal(homeMic.appendToBase('היה', ''), 'היה');
    assert.equal(homeMic.MAX_SECONDS, 600);
  });

  test('אייפון: לוחצים, הטקסט נכתב בתיבה בזמן ההקלטה, "סיימתי", חלון עם רעיונות, שמירה', async () => {
    box().value = 'רעיון שהתחלתי';
    let draft = null;
    box().addEventListener('input', () => { draft = box().value; });
    card().click();
    await until(() => card().classList.contains('home-mic-card--live'), 'מצב הקלטה');
    assert.equal($('#home-mic-stop').hidden, false, 'אין כפתור "סיימתי"');
    assert.equal(card().getAttribute('aria-pressed'), 'true');
    assert.match($('#home-mic-title').textContent, /מקשיבים · 0:0\d/);
    assert.equal(box().readOnly, true);
    assert.ok(!$('#recorder-modal') || $('#recorder-modal').hidden, 'נפתח מסך נפרד בלחיצה');

    await until(() => /מילה1/.test(box().value), 'טקסט בתיבה בזמן ההקלטה');
    assert.ok(card().classList.contains('home-mic-card--live'), 'הטקסט הגיע רק אחרי שעצרו');
    assert.match(box().value, /^רעיון שהתחלתי מילה0 מילה1/, 'הסדר נשבר או שהטקסט הקודם נמחק');
    assert.equal(draft, box().value, 'הטיוטה של התיבה לא קיבלה אירוע input');
    const seg = calls.find((c) => c.name === 'transcribeDictation');
    assert.equal(seg.payload.segment, true);
    assert.match(seg.payload.path, /^transcribeUploads\/u1\/s-[a-z0-9]+-[a-z0-9]+\.m4a$/);

    handlers.ideasFromRecording = async () => ({ ideas: [
      { title: 'לקוחה שאלה למה המחיר גבוה', context: 'בשיחה היום', category: 'מכירתי', persuasionStage: '', audienceScope: 'עיקרי', rating: '🔥 חייב לצלם' },
      { title: 'הטעות בסטורי', context: '', category: 'בעל ערך', persuasionStage: '', audienceScope: 'רחב', rating: '⭐ שווה לצלם' },
    ] });
    card().click(); // "סיימתי"
    assert.equal($('#recorder-modal').hidden, false, 'החלון לא נפתח מיד');
    assert.equal($('#rec-step-working').hidden, false, 'אין התקדמות בחלון');
    assert.equal($('#rec-step-intro').hidden, true);
    assert.equal($('#rec-working-hint').hidden, true);
    await until(() => !$('#rec-step-results').hidden, 'רשימת הרעיונות');

    const spoken = box().value.replace(/^רעיון שהתחלתי /, '');
    assert.match(spoken, /^מילה0 מילה1( מילה\d+)*$/);
    const ask = calls.filter((c) => c.name === 'ideasFromRecording').at(-1);
    assert.deepEqual(ask.payload, { text: spoken }, 'נשלח לרעיונות משהו אחר ממה שנכתב בתיבה');
    assert.equal(recorders.every((r) => r.state === 'inactive'), true, 'הקלטה נשארה פתוחה');
    assert.ok(stoppedTracks.length >= 1 || await new Promise((r) => setTimeout(() => r(stoppedTracks.length >= 1), 3200)), 'המיקרופון לא נסגר');
    assert.equal(card().classList.contains('home-mic-card--live'), false);
    assert.equal(box().readOnly, false);
    assert.equal(document.querySelectorAll('#rec-list .rec-item').length, 2);
    assert.equal($('#rec-title').textContent, '✨ הרעיונות ממה שסיפרת');

    const second = $('#rec-keep-1');
    second.checked = false;
    second.dispatchEvent(new w.Event('change', { bubbles: true }));
    const before = added.length;
    $('#rec-save-btn').click();
    await until(() => $('#recorder-modal').hidden, 'סגירה אחרי שמירה');
    assert.equal(added.length, before + 1);
    assert.equal(added.at(-1).col, 'ideas');
    assert.equal(added.at(-1).data.title, 'לקוחה שאלה למה המחיר גבוה');
    assert.equal(added.at(-1).data.category, 'מכירתי');
    assert.equal(added.at(-1).data.source, 'הקלטה');
    assert.equal(added.at(-1).data.hookText, 'בשיחה היום');
    assert.equal(box().value, 'רעיון שהתחלתי', 'מה שנאמר נשמר כרעיון אבל נשאר בתיבה, או שמה שהיה בה נמחק');
  });

  test('אין הרשאה למיקרופון: הודעה גלויה, הכרטיס חוזר, הטקסט בתיבה נשאר', async () => {
    box().value = 'טקסט שלי';
    gumImpl = async () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); };
    card().click();
    await until(() => !$('#home-mic-status').hidden, 'הודעת שגיאה');
    assert.match($('#home-mic-status').textContent, /אין גישה למיקרופון/);
    assert.equal($('#home-mic-status').getAttribute('role'), 'alert');
    assert.equal(card().classList.contains('home-mic-card--live'), false);
    assert.equal($('#home-mic-title').textContent, 'אין לי רעיון?');
    assert.equal(box().value, 'טקסט שלי');
    assert.equal(box().readOnly, false);
  });

  test('תמלול שנכשל בכל הקטעים: החלון מציג שגיאה בעברית, והתיבה לא נפגעת', async () => {
    box().value = 'טקסט שלי';
    handlers.transcribeDictation = async () => { throw new Error('לא הצלחנו לתמלל את ההקלטה הפעם. לנסות שוב בעוד רגע'); };
    card().click();
    await until(() => card().classList.contains('home-mic-card--live'), 'מצב הקלטה');
    await until(() => !$('#home-mic-status').hidden, 'הודעה על קטע שלא תומלל');
    assert.match($('#home-mic-status').textContent, /לא תומלל/);
    assert.ok(card().classList.contains('home-mic-card--live'), 'קטע אחד שנכשל עצר את כל ההקלטה');
    card().click();
    await until(() => !$('#rec-step-error').hidden, 'שגיאה בחלון');
    assert.match($('#rec-error-text').textContent, /לא הצלחנו לתמלל/);
    assert.equal($('#rec-retry-btn').hidden, true);
    assert.equal(box().value, 'טקסט שלי');
    $('#rec-close-error').click();
    assert.equal($('#recorder-modal').hidden, true);
  });

  test('הקלטה ריקה: "לא שמענו דיבור", בלי לשלוח כלום לרעיונות', async () => {
    box().value = '';
    globalThis.FakeRecorder.empty = true;
    const asked = calls.filter((c) => c.name === 'ideasFromRecording').length;
    card().click();
    await until(() => card().classList.contains('home-mic-card--live'), 'מצב הקלטה');
    await new Promise((r) => setTimeout(r, 100));
    card().click();
    await until(() => !$('#rec-step-error').hidden, 'שגיאה בחלון');
    assert.match($('#rec-error-text').textContent, /לא שמענו דיבור/);
    assert.equal(calls.filter((c) => c.name === 'ideasFromRecording').length, asked);
    $('#rec-close-error').click();
  });

  test('חילוץ הרעיונות נכשל: שגיאה עם "לנסות שוב", שעובד בלי להקליט מחדש', async () => {
    box().value = '';
    let fail = true;
    handlers.ideasFromRecording = async () => {
      if (fail) throw new Error('לא הצלחנו למצוא רעיונות בטקסט הפעם. לנסות שוב בעוד רגע');
      return { ideas: [] };
    };
    card().click();
    await until(() => /מילה0/.test(box().value), 'טקסט בתיבה');
    card().click();
    await until(() => !$('#rec-step-error').hidden, 'שגיאה');
    assert.match($('#rec-error-text').textContent, /לא הצלחנו למצוא רעיונות.*הטקסט נשאר בתיבה/);
    assert.equal($('#rec-retry-btn').hidden, false);
    assert.equal($('#rec-retry-btn').textContent, 'לנסות שוב');
    assert.equal($('#rec-new-btn').hidden, true, '"להקליט מחדש" שייך לטופס');
    const text = box().value;
    const uploadsBefore = uploadCount;
    fail = false;
    $('#rec-retry-btn').click();
    await until(() => !$('#rec-step-results').hidden, 'תוצאות אחרי ניסיון חוזר');
    assert.equal(uploadCount, uploadsBefore, 'הניסיון החוזר העלה הקלטה');
    assert.match($('#rec-results-lead').textContent, /הטקסט נשאר בתיבה/);
    assert.equal($('#rec-save-btn').hidden, true);
    $('#rec-close-results').click();
    assert.equal(box().value, text, 'סגירה בלי שמירה מחקה את הטקסט');
  });

  test('כרום/מחשב: זיהוי חי, הטקסט בתיבה מיד, ובסוף אותו חלון', async () => {
    box().value = '';
    const instances = [];
    class FakeSpeech {
      constructor() { instances.push(this); }
      start() { this.started = true; }
      stop() { setTimeout(() => this.onend && this.onend(), 0); }
      abort() {}
    }
    w.webkitSpeechRecognition = FakeSpeech;
    globalThis.webkitSpeechRecognition = FakeSpeech;
    const gumBefore = stoppedTracks.length;
    card().click();
    await until(() => card().classList.contains('home-mic-card--live'), 'מצב הקלטה');
    const rec = instances.at(-1);
    assert.equal(rec.lang, 'he-IL');
    assert.equal(rec.continuous, true);
    const result = (t, isFinal) => Object.assign([{ transcript: t }], { isFinal });
    rec.onresult({ results: [result('היום לקוחה', true), result(' שאלה', false)] });
    assert.equal(box().value, 'היום לקוחה שאלה', 'הטקסט לא נכתב תוך כדי');
    /* כרום מסיים לבד אחרי שקט: ממשיכים, והטקסט נשמר */
    rec.onend();
    const rec2 = instances.at(-1);
    assert.notEqual(rec2, rec);
    rec2.onresult({ results: [result('למה המחיר גבוה', true)] });
    assert.equal(box().value, 'היום לקוחה שאלה למה המחיר גבוה');
    handlers.ideasFromRecording = async ({ text }) => ({ ideas: [
      { title: text, context: '', category: 'מכירתי', persuasionStage: '', audienceScope: 'עיקרי', rating: '⭐ שווה לצלם' },
    ] });
    card().click();
    await until(() => !$('#rec-step-results').hidden, 'תוצאות');
    assert.equal(document.querySelectorAll('#rec-list .rec-item').length, 1);
    assert.equal(document.querySelector('.rec-item__title').value, 'היום לקוחה שאלה למה המחיר גבוה');
    assert.equal(stoppedTracks.length, gumBefore, 'במצב זיהוי חי לא נפתח מיקרופון להקלטה');
    $('#rec-save-btn').click();
    await until(() => $('#recorder-modal').hidden, 'שמירה');
    assert.equal(box().value, '');
  });

  test('המקליט של טופס "רעיון חדש" לא השתנה: פותח בשלב הפתיחה עם הכותרת שלו', async () => {
    const rec = await import('../js/idea-recorder.js');
    rec.openRecorder();
    assert.equal($('#rec-step-intro').hidden, false);
    assert.equal($('#rec-title').textContent, '🎙️ לספר ולמצוא רעיונות');
    assert.equal($('#rec-working-hint').hidden, false);
    assert.equal($('#rec-new-btn').hidden, false);
    assert.equal($('#rec-close-working').hidden, true);
    $('#rec-cancel-intro').click();
    assert.equal($('#recorder-modal').hidden, true);
  });

  test('index.html: הכרטיס, "סיימתי" ושורת ההודעות קיימים, וה-CSS רק עם טוקנים קיימים', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    assert.match(html, /id="home-mic-stop" class="home-mic-card__stop" hidden/);
    assert.match(html, /id="home-mic-status" class="home-mic-status" role="status"/);
    /* 06/11/2026 לילה (מאיה): "שיהיה למעלה אופציה להוסיף ישירות רעיון ואז
       מתחת את המיקרופון". התיבה למעלה, הכרטיס מתחתיה, וההודעות מיד אחריו. */
    assert.ok(html.indexOf('id="quick-add-input"') < html.indexOf('id="home-mic-card"'), 'הכרטיס חייב להיות מתחת לתיבה');
    const home = html.slice(html.indexOf('id="home-mic-card"'), html.indexOf('id="home-progress-widget"'));
    assert.match(home, /home-mic-status/, 'ההודעות חייבות להיות מיד אחרי הכרטיס');
    const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
    const defined = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const block = css.slice(css.indexOf('מיקרופון הבית מקליט במקום'));
    const used = [...block.slice(0, block.indexOf('prefers-reduced-motion')).matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]);
    assert.ok(used.length > 0);
    assert.deepEqual(used.filter((v) => !defined.has(v)), []);
  });
});
