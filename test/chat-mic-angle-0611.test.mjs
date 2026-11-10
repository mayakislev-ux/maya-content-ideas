/* 06/11/2026 (מאיה), שלוש תלונות:
   1. "בצ'אט של הבדיקת רעיון במובייל כאילו לא רואים את המסל ואז צריך לגלול
      למעלה... והמסל של הצ'אט מאוד קטן".
   2. "בחלק של כתיבת הרעיון עצמו יש מיקרופון הוא כאילו לא עובד".
   3. "במסך של בדיקת רעיון הוא בוחר זווית אבל אחר כך כשאני מעבירה את הרעיון
      לביצוע הוא שוכח מהזווית ולא משלב אותה עם הרעיון עצמו".

   הסביבה כאן היא בדיוק המקרה שלה: אייפון (userAgent), עם webkitSpeechRecognition
   קיים (כמו בספארי) ועם MediaRecorder. הקוד האמיתי רץ על index.html האמיתי,
   והבדיקה לוחצת על הכפתורים עצמם. */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { register, createRequire } from 'node:module';
import { withAngle, stripAngle, parseIdeaTitle } from '../js/idea-reply.js';
import { INITIAL_STATE, nextStep } from '../js/video-assistant-flow.js';
import { syncIdea, buildParts } from '../js/video-assistant-build.js';

const require = createRequire(import.meta.url);
const dict = require('../functions/dictation.js');

/* ---------------- 2. השרת: transcribeDictation ---------------- */

class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function makeDeps(over = {}) {
  const state = { deleted: [], released: 0, committed: 0, gemini: [] };
  const meta = over.meta || { size: 300_000, contentType: 'audio/mp4' };
  const deps = {
    HttpsError,
    enforceAllowlist: async () => {},
    checkRate: async () => ({ commit: () => { state.committed += 1; }, release: async () => { state.released += 1; } }),
    bucket: { name: 'b', file: (p) => ({ getMetadata: async () => [meta], delete: async () => { state.deleted.push(p); } }) },
    getAccessToken: async () => 'tok',
    projectId: 'p',
    fetchImpl: over.fetchImpl || (async (url, opts) => {
      state.gemini.push(JSON.parse(opts.body));
      const text = over.raw !== undefined ? over.raw : JSON.stringify({ text: over.text ?? 'שלום עולם' });
      return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] }) };
    }),
  };
  return { deps, state };
}
const req = (path, uid = 'u1') => ({ auth: { uid, token: { email: 'a@b.c' } }, data: { path } });

describe('transcribeDictation בשרת', () => {
  test('מתמלל, סופר מכסה ומוחק את הקובץ', async () => {
    const { deps, state } = makeDeps({ text: '  רעיון על   לקוחה שביטלה  ' });
    const out = await dict.createDictationHandler(deps)(req('transcribeUploads/u1/d-abc.m4a'));
    assert.deepEqual(out, { text: 'רעיון על לקוחה שביטלה' });
    assert.equal(state.committed, 1);
    assert.equal(state.released, 0);
    assert.deepEqual(state.deleted, ['transcribeUploads/u1/d-abc.m4a']);
    const parts = state.gemini[0].contents[0].parts;
    assert.deepEqual(parts[0].fileData, { fileUri: 'gs://b/transcribeUploads/u1/d-abc.m4a', mimeType: 'audio/mp4' });
    assert.match(parts[1].text, /מילה במילה/);
  });

  test('נתיב של מישהו/י אחר/ת נחסם לפני הכל', async () => {
    const { deps, state } = makeDeps();
    await assert.rejects(dict.createDictationHandler(deps)(req('transcribeUploads/u2/d.m4a')), /ההקלטה לא נמצאה/);
    await assert.rejects(dict.createDictationHandler(deps)(req('transcribeUploads/u1/../u2/d.m4a')), /ההקלטה לא נמצאה/);
    assert.equal(state.gemini.length, 0);
  });

  test('כשל של ג\'מיני או תשובה לא קריאה: המכסה חוזרת והקובץ נמחק', async () => {
    let { deps, state } = makeDeps({ fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }) });
    await assert.rejects(dict.createDictationHandler(deps)(req('transcribeUploads/u1/a.webm')), /לא הצלחנו לתמלל/);
    assert.equal(state.released, 1);
    assert.equal(state.deleted.length, 1);
    ({ deps, state } = makeDeps({ raw: 'not json at all' }));
    await assert.rejects(dict.createDictationHandler(deps)(req('transcribeUploads/u1/a.webm')), /לא הצלחנו לתמלל/);
    assert.equal(state.released, 1);
  });

  test('קובץ שאינו הקלטה, או גדול מדי, נדחה', async () => {
    let { deps } = makeDeps({ meta: { size: 10, contentType: 'image/png' } });
    await assert.rejects(dict.createDictationHandler(deps)(req('transcribeUploads/u1/a.png')), /לא הקלטה/);
    ({ deps } = makeDeps({ meta: { size: dict.MAX_AUDIO_BYTES + 1, contentType: 'audio/webm' } }));
    await assert.rejects(dict.createDictationHandler(deps)(req('transcribeUploads/u1/a.webm')), /ארוכה מדי/);
  });

  test('שקט מחזיר טקסט ריק ולא נכשל', async () => {
    const { deps } = makeDeps({ text: '' });
    assert.deepEqual(await dict.createDictationHandler(deps)(req('transcribeUploads/u1/a.webm')), { text: '' });
    assert.equal(dict.parseText('{"text":"x"}'), 'x');
    assert.equal(dict.parseText('```json\n{"text":"y"}\n```'), 'y');
    assert.equal(dict.parseText('garbage'), null);
  });

  test('מחובר ב-index.js עם מכסה יומית, ופתוח גם למנוי רפרנסים (המיקרופון בעוזר)', () => {
    const index = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
    assert.match(index, /transcribeDictation: 80/);
    assert.match(index, /exports\.transcribeDictation = onCall/);
    assert.match(index, /require\('\.\/dictation'\)/);
    const block = index.slice(index.indexOf("require('./dictation')"), index.indexOf('exports.transcribeDictation'));
    assert.match(block, /allowRefs: true/);
    assert.match(block, /reserveRateLimit\(uid, 'transcribeDictation'\)/);
  });
});

/* ---------------- 3. הזווית: עזרים טהורים ומכונת המצבים ---------------- */

describe('הזווית נוסעת עם הרעיון', () => {
  test('withAngle / stripAngle: סיומת אחת קבועה, בלי כפילות', () => {
    assert.equal(withAngle('המסר. נושא הסרטון: ממומן', 'השוואה'), 'המסר. נושא הסרטון: ממומן. זווית ההנגשה: השוואה');
    const twice = withAngle(withAngle('רעיון.', 'השוואה'), 'מיתוס');
    assert.equal(twice, 'רעיון. זווית ההנגשה: מיתוס');
    assert.equal(stripAngle(twice), 'רעיון');
    assert.equal(withAngle('רעיון', ''), 'רעיון');
  });

  test('כותרת מהבנק מתפרקת לרעיון, זווית וסיפור', () => {
    assert.deepEqual(parseIdeaTitle('3 טעויות בעמוד | זווית: השוואה | סיפור: לקוחה שביטלה'),
      { text: '3 טעויות בעמוד', angle: 'השוואה', story: 'לקוחה שביטלה' });
    assert.deepEqual(parseIdeaTitle('רעיון בלי כלום'), { text: 'רעיון בלי כלום', angle: '', story: '' });
    assert.equal(parseIdeaTitle('למחוק vs לפרסם\nזווית הנגשה:השוואה').angle, 'השוואה');
  });

  test('IDEA_SHARPENED: משפט הרעיון שהפרומפטים קוראים כולל את הזווית', () => {
    const s0 = { ...INITIAL_STATE, branch: 'idea', screen: 'idea-sharpen', ideaAngle: 'השוואה' };
    const s1 = nextStep(s0, { type: 'IDEA_SHARPENED', idea: 'העמוד מוכר. נושא הסרטון: ממומן', topic: 'ממומן', punchline: 'העמוד מוכר' });
    assert.equal(s1.ideaDescription, 'העמוד מוכר. נושא הסרטון: ממומן. זווית ההנגשה: השוואה');
    const s2 = nextStep(s1, { type: 'PACKAGING_CHOSEN', packaging: 'משחק תפקידים', startingPoint: 'כללי' });
    assert.match(s2.ideaDescription, /זווית ההנגשה: השוואה\. האריזה הקריאייטיבית: משחק תפקידים$/);
    /* בלי זווית: בדיוק כמו קודם */
    const plain = nextStep({ ...s0, ideaAngle: null }, { type: 'IDEA_SHARPENED', idea: 'רעיון' });
    assert.equal(plain.ideaDescription, 'רעיון');
    assert.equal(INITIAL_STATE.ideaAngle, null);
  });

  test('עריכת הזווית ב"התסריטים שלי" מעדכנת את המשפט, ומחיקה מורידה אותה', () => {
    const s = { branch: 'idea', ideaTopic: 'ממומן', ideaPunchline: 'העמוד מוכר', ideaAngle: 'השוואה', packaging: 'X' };
    const changed = syncIdea({ ...s, ideaAngle: 'מיתוס' }, 'ideaAngle');
    assert.equal(changed.ideaDescription, 'העמוד מוכר. נושא הסרטון: ממומן. זווית ההנגשה: מיתוס. האריזה הקריאייטיבית: X');
    const removed = syncIdea({ ...s, ideaAngle: '' }, 'ideaAngle');
    assert.equal(removed.ideaDescription, 'העמוד מוכר. נושא הסרטון: ממומן. האריזה הקריאייטיבית: X');
  });

  test('"מה שנבנה עד עכשיו" מציג את הזווית, ולא מציג שורה ריקה כשאין', () => {
    const base = { branch: 'idea', screen: 'creative-packaging', ideaTopic: 'ממומן', ideaPunchline: 'העמוד מוכר' };
    const withIt = buildParts({ ...base, ideaAngle: 'השוואה' });
    assert.deepEqual(withIt.find((p) => p.key === 'angle'), {
      key: 'angle', label: 'זווית ההנגשה', value: 'השוואה', full: '', big: false, here: false, status: 'done',
    });
    assert.ok(!buildParts(base).some((p) => p.key === 'angle'));
  });
});

/* ---------------- לחיצות אמיתיות ב-jsdom ---------------- */

const JSDOM_PATH = 'C:/dev/portal-sales/node_modules/jsdom/lib/api.js';
const hasJsdom = existsSync(JSDOM_PATH);
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const store = new Map();
const calls = { fetch: [], callable: [], uploads: [] };
let REPLY = '';
const callableResult = { transcribeDictation: { text: 'ותגידי להם שזה עובד' } };
const recognitions = [];

function installFirebaseStub() {
  const path = (...parts) => parts.filter((p) => typeof p === 'string').join('/');
  globalThis.__fbStub = {
    initializeApp: () => ({}),
    getAuth: () => ({ currentUser: { uid: 'u1', email: 'client@example.com', getIdToken: async () => 'tok' } }),
    getFirestore: () => ({ __db: true }),
    enableIndexedDbPersistence: () => Promise.resolve(),
    getFunctions: () => ({}),
    collection: (base, ...parts) => ({ path: base && base.path ? path(base.path, ...parts) : path(...parts) }),
    doc: (base, ...parts) => ({ path: base && base.path ? path(base.path, ...parts) : path(...parts) }),
    query: (col) => col,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    serverTimestamp: () => Date.now(),
    getDoc: async (ref) => ({ exists: () => store.has(ref.path), data: () => structuredClone(store.get(ref.path)), id: ref.path.split('/').pop() }),
    setDoc: async (ref, data, opts) => {
      const prev = opts && opts.merge ? (store.get(ref.path) || {}) : {};
      store.set(ref.path, structuredClone({ ...prev, ...data }));
    },
    getDocs: async (col) => {
      const prefix = `${col.path}/`;
      const docs = [...store.entries()]
        .filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
        .map(([k, v]) => ({ id: k.slice(prefix.length), data: () => structuredClone(v) }));
      return { docs, forEach: (f) => docs.forEach(f) };
    },
    onSnapshot: () => () => {},
    getStorage: () => ({}),
    ref: (_s, p) => ({ path: p }),
    uploadBytesResumable: (r, blob, meta) => {
      calls.uploads.push({ path: r.path, type: meta.contentType, size: blob.size });
      return { on: (_e, _progress, _err, done) => { setTimeout(done, 0); } };
    },
    httpsCallable: (_f, name) => async (data) => {
      calls.callable.push({ name, data });
      const r = callableResult[name];
      if (typeof r === 'function') return { data: await r(data) };
      if (r instanceof Error) throw r;
      return { data: r || {} };
    },
  };
}

function sseResponse(reply) {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(`data: ${JSON.stringify({ delta: reply })}\n\n`));
      c.enqueue(enc.encode(`data: ${JSON.stringify({ done: true, reply })}\n\n`));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

async function until(fn, label, tries = 300) {
  for (let i = 0; i < tries; i += 1) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.fail(`לא קרה: ${label}`);
}

let $;
let w;
let mods;
let vv;

describe('באייפון (jsdom)', { skip: hasJsdom ? false : 'jsdom לא מותקן במחשב הזה' }, () => {
  before(async () => {
    register('./helpers/cdn-stub-hooks.mjs', import.meta.url);
    installFirebaseStub();
    const { JSDOM } = require(JSDOM_PATH);
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const dom = new JSDOM(html, { url: 'https://mayakislev-ux.github.io/maya-content-ideas/', pretendToBeVisual: true });
    w = dom.window;
    w.scrollTo = () => {};
    w.HTMLElement.prototype.scrollIntoView = function () { calls.scrolled = this; };
    /* טלפון: רק שאילתת המובייל מתאימה */
    w.matchMedia = (q) => ({ matches: q === '(max-width: 720px)', addEventListener() {}, removeEventListener() {} });
    Object.defineProperty(w.navigator, 'userAgent', { value: IPHONE_UA, configurable: true });
    /* ספארי באייפון: זיהוי הדיבור "קיים", אבל לא באמת עובד באפליקציה המותקנת */
    w.webkitSpeechRecognition = class {
      constructor() { recognitions.push(this); }
      start() { this.started = true; }
      stop() { this.started = false; if (this.onend) this.onend(); }
    };
    class FakeRecorder {
      static isTypeSupported(t) { return t === 'audio/mp4'; }
      constructor(stream, opts) { this.mimeType = (opts && opts.mimeType) || 'audio/mp4'; this.state = 'inactive'; FakeRecorder.last = this; }
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        this.ondataavailable({ data: new w.Blob(['x'.repeat(3000)], { type: this.mimeType }) });
        setTimeout(() => this.onstop && this.onstop(), 0);
      }
    }
    w.MediaRecorder = FakeRecorder;
    calls.micOpened = 0;
    calls.micStopped = 0;
    Object.defineProperty(w.navigator, 'mediaDevices', {
      value: { getUserMedia: async () => { calls.micOpened += 1; return { getTracks: () => [{ stop: () => { calls.micStopped += 1; } }] }; } },
      configurable: true,
    });
    /* המקלדת: visualViewport אמיתי של אייפון זז ומשתנה */
    vv = new w.EventTarget();
    vv.offsetTop = 0;
    vv.height = 700;
    w.visualViewport = vv;
    for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent',
      'KeyboardEvent', 'MouseEvent', 'sessionStorage', 'localStorage', 'getComputedStyle', 'requestAnimationFrame',
      'cancelAnimationFrame', 'history', 'location', 'DocumentFragment', 'HTMLTextAreaElement', 'HTMLInputElement',
      'MutationObserver', 'Blob']) {
      Object.defineProperty(globalThis, k, { value: k === 'window' ? w : w[k], configurable: true, writable: true });
    }
    globalThis.fetch = async (url, opts) => {
      calls.fetch.push({ url, body: JSON.parse(opts.body) });
      return sseResponse(REPLY);
    };
    w.HTMLMediaElement && (w.HTMLMediaElement.prototype.play = () => Promise.resolve());
    w.localStorage.setItem('video-assistant-muted', '1');
    Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async () => {} }, configurable: true });
    store.set('profiles/u1', { name: 'מיכל', pronoun: 'את', business: 'שיווק', primaryAudience: 'בעלות עסקים' });

    const ideaChat = await import('../js/idea-chat.js');
    const va = await import('../js/video-assistant.js');
    const router = await import('../js/view-router.js');
    const voice = await import('../js/voice-input.js');
    const composer = await import('../js/chat-composer.js');
    ideaChat.wireIdeaChat();
    va.wireVideoAssistantView();
    mods = { ideaChat, va, router, voice, composer };
    $ = (sel) => document.querySelector(sel);
    document.body.dataset.plan = 'full';
  });

  const visible = (id) => !document.getElementById(id).hidden;
  const type = (el, value) => { el.value = value; el.dispatchEvent(new w.Event('input', { bubbles: true })); };

  async function openIdeaScreen() {
    store.delete('videoAssistantSessions/u1');
    mods.router.showView('video-assistant');
    $('#hub-link-video-assistant').click();
    await until(() => $('#va-idea-btn') || $('#va-start-over-btn'), 'מסך הפתיחה');
    if ($('#va-start-over-btn')) { $('#va-start-over-btn').click(); await until(() => $('#va-idea-btn'), 'פתיחה'); }
    $('#va-idea-btn').click();
    await until(() => $('#va-idea-sharp'), 'מסך הרעיון');
  }

  /* ---------- 2. המיקרופון ---------- */

  test('איזה מנוע: אייפון מקליט ומתמלל בשרת, מחשב עם כרום נשאר בזיהוי החי', () => {
    assert.equal(mods.voice.dictationMode(w), 'record');
    assert.equal(mods.voice.isAppleTouch({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 }), true, 'אייפד');
    assert.equal(mods.voice.isAppleTouch({ userAgent: DESKTOP_UA, maxTouchPoints: 0 }), false);
    assert.equal(mods.voice.dictationMode({ navigator: { userAgent: DESKTOP_UA }, SpeechRecognition: class {} }), 'speech');
    assert.equal(mods.voice.dictationMode({ navigator: { userAgent: DESKTOP_UA } }), 'none');
  });

  test('"על מה הסרטון?": לחיצה מקליטה, לחיצה שנייה מתמללת בשרת, והטקסט נכנס לתיבה ונשמר', async () => {
    await openIdeaScreen();
    const box = $('#va-idea-sharp');
    type(box, 'לקוחה שאלה אותי היום');
    const mic = $('#va-idea-sharp-mic');
    assert.ok(mic && !mic.hidden, 'אין מיקרופון בתיבת הרעיון');
    const before = recognitions.length;
    mic.click();
    await until(() => /מקליטים/.test(mic.textContent), 'הכפתור לא אומר שמקליטים');
    assert.equal(recognitions.length, before, 'באייפון עדיין נפתח זיהוי הדיבור שלא עובד שם');
    assert.equal(calls.micOpened, 1);
    const callsBefore = calls.callable.length;
    mic.click();
    await until(() => calls.callable.length > callsBefore, 'לא נשלח לתמלול');
    const sent = calls.callable.at(-1);
    assert.equal(sent.name, 'transcribeDictation');
    assert.match(sent.data.path, /^transcribeUploads\/u1\/d-[a-z0-9]+-[a-z0-9]+\.m4a$/);
    assert.equal(calls.uploads.at(-1).path, sent.data.path);
    assert.equal(calls.uploads.at(-1).type, 'audio/mp4');
    await until(() => box.value === 'לקוחה שאלה אותי היום ותגידי להם שזה עובד', `הטקסט לא נכנס: "${box.value}"`);
    await until(() => /לדבר במקום לכתוב/.test(mic.textContent) && !mic.disabled, 'הכפתור לא חזר למצב רגיל');
    assert.ok(calls.micStopped >= 1, 'המיקרופון נשאר דולק אחרי ההקלטה');
    await until(() => ((store.get('videoAssistantSessions/u1') || {}).drafts || {})['idea-sharpen|va-idea-sharp'] === box.value,
      'הטקסט מההקלטה לא נשמר כטיוטה');
  });

  test('בזמן התמלול הכפתור אומר "מתמללים" ולא מקבל לחיצות; כישלון מוצג בעברית ולא נבלע', async () => {
    await openIdeaScreen();
    const mic = $('#va-idea-sharp-mic');
    let release;
    const pending = new Promise((r) => { release = r; });
    callableResult.transcribeDictation = async () => {
      await pending;
      throw new Error('לא הצלחנו לתמלל את ההקלטה הפעם. לנסות שוב בעוד רגע');
    };
    try {
      mic.click();
      await until(() => /מקליטים/.test(mic.textContent), 'לא התחיל להקליט');
      mic.click();
      await until(() => /מתמללים/.test(mic.textContent), 'אין חיווי בזמן התמלול');
      assert.equal(mic.disabled, true);
      const opened = calls.micOpened;
      mic.click();
      await new Promise((r) => setTimeout(r, 20));
      assert.equal(calls.micOpened, opened, 'לחיצה בזמן התמלול פתחה הקלטה נוספת');
      release();
      await until(() => /לדבר במקום לכתוב/.test(mic.textContent) && !mic.disabled, 'הכפתור נתקע אחרי כישלון');
      await until(() => /לא הצלחנו לתמלל/.test(document.body.textContent), 'הכישלון לא הוצג');
    } finally {
      callableResult.transcribeDictation = { text: 'ותגידי להם שזה עובד' };
    }
  });

  test('מחשב: זיהוי חי, לא נעצר לפני המילה הראשונה, ושגיאת שירות עוברת להקלטה במקום להיתקע', async () => {
    Object.defineProperty(w.navigator, 'userAgent', { value: DESKTOP_UA, configurable: true });
    try {
      await openIdeaScreen();
      const mic = $('#va-idea-sharp-mic');
      const before = recognitions.length;
      mic.click();
      assert.equal(recognitions.length, before + 1, 'במחשב לא נפתח זיהוי חי');
      /* הטיימר הישן (2.5 שניות מהלחיצה) עצר לפני שהספיקו לדבר */
      await new Promise((r) => setTimeout(r, 2700));
      assert.match(mic.textContent, /מקליטים/, 'נעצר לפני המילה הראשונה');
      const rec = recognitions.at(-1);
      rec.onerror({ error: 'service-not-allowed' });
      await until(() => /לדבר במקום לכתוב/.test(mic.textContent), 'נשאר במצב הקלטה אחרי שגיאת שירות');
      assert.match(document.body.textContent, /נעבור להקלטה/);
      const opened = calls.micOpened;
      mic.click();
      await until(() => calls.micOpened === opened + 1, 'הלחיצה הבאה לא הקליטה');
      assert.equal(recognitions.length, before + 1, 'שוב נפתח זיהוי חי שכבר נכשל');
      mic.click();
      await until(() => /לדבר במקום לכתוב/.test(mic.textContent) && !mic.disabled, 'לא חזר אחרי התמלול');
    } finally {
      Object.defineProperty(w.navigator, 'userAgent', { value: IPHONE_UA, configurable: true });
    }
  });

  /* ---------- 1. שורת הכתיבה של הצ'אט ---------- */

  test('הצ\'אט במובייל: השורה מעוגנת לתחתית המסך הנראה, גם כשהמקלדת פתוחה', async () => {
    mods.router.showView('chat');
    await until(() => document.documentElement.classList.contains('chat-docked'), 'השורה לא עוגנה');
    const line = () => document.documentElement.style.getPropertyValue('--chat-dock-line');
    assert.equal(line(), '700px');
    /* המקלדת נפתחת: המסך הנראה מתקצר, ובאייפון גם זז */
    vv.height = 380;
    vv.offsetTop = 120;
    vv.dispatchEvent(new w.Event('resize'));
    assert.equal(line(), '500px', 'השורה לא עלתה מעל המקלדת');
    vv.height = 700;
    vv.offsetTop = 0;
    vv.dispatchEvent(new w.Event('scroll'));
    assert.equal(line(), '700px');
    /* כשהתפריט התחתון נראה, השורה יושבת עליו ולא מתחתיו */
    assert.equal(mods.composer.dockLine({ offsetTop: 0, height: 800 }, { top: 725, height: 75 }), 725);
    assert.equal(mods.composer.dockLine({ offsetTop: 0, height: 400 }, { top: 725, height: 75 }), 400, 'התפריט מאחורי המקלדת');
    mods.router.showView('archive');
    await until(() => !document.documentElement.classList.contains('chat-docked'), 'העיגון נשאר במסך אחר');
  });

  test('CSS: התיבה 16px לפחות (בלי זום באייפון), שלוש שורות לפחות, ומעוגנת מלמעלה', () => {
    const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
    const block = css.slice(css.indexOf('/* 06/11/2026 (מאיה): "בצ\'אט של הבדיקת רעיון במובייל'));
    assert.match(block, /#chat-form\.chat-input-row textarea \{[^}]*font-size: max\(16px, 1rem\)/);
    assert.match(block, /min-height: calc\(4\.35em \+ 1\.4rem\)/);
    assert.match(block, /html\.chat-docked #chat-form\.chat-input-row \{[^}]*top: var\(--chat-dock-line\);[^}]*bottom: auto;[^}]*translate\(-50%, -100%\)/);
  });

  test('הודעה שנשלחת נגללת לתוך המסך, והתיבה מתאפסת אחרי שליחה', async () => {
    REPLY = 'מעולה.';
    await mods.ideaChat.startIdeaChat();
    mods.router.showView('chat');
    await until(() => !$('#chat-input').disabled && document.querySelectorAll('#chat-messages .chat-row').length, 'הצ\'אט לא מוכן');
    const input = $('#chat-input');
    input.value = 'רעיון ארוך\nשורה שנייה\nשורה שלישית';
    input.dispatchEvent(new w.Event('input', { bubbles: true }));
    calls.scrolled = null;
    $('#chat-form').requestSubmit();
    await until(() => calls.scrolled, 'ההודעה לא נגללה לתוך המסך');
    assert.ok(calls.scrolled.classList.contains('chat-row-user'));
    assert.equal(input.value, '');
    assert.equal(input.style.height, '', 'גובה ישן נשאר על התיבה הריקה');
    await until(() => !input.disabled, 'התשובה לא נגמרה');
  });

  /* ---------- 3. הזווית מהצ'אט לעוזר, ומשם לפרומפטים ---------- */

  test('הזווית שהצ\'אט בחר חוזרת לעוזר, מוצגת, ונכנסת לפרומפט האריזה ולמשפט הרעיון', async () => {
    await openIdeaScreen();
    REPLY = 'הנה ניסוח חד יותר.\n[[IDEA_SUMMARY]]3 טעויות שמבריחות לקוחות מהעמוד||השוואה||||העמוד מוכר, לא המודעה';
    type($('#va-idea-sharp'), 'למה הממומן לא עובד');
    type($('#va-idea-punch'), 'העמוד מוכר');
    $('#va-angle-chat-btn').click();
    await until(() => visible('chat-view'), 'הצ\'אט לא נפתח');
    await until(() => $('.chat-back-assistant-btn'), 'אין כפתור חזרה עם הרעיון');
    $('.chat-back-assistant-btn').click();
    await until(() => visible('video-assistant-view') && $('#va-idea-sharp'), 'לא חזרנו לעוזר');
    assert.equal($('#va-idea-sharp').value, '3 טעויות שמבריחות לקוחות מהעמוד');
    assert.equal($('#va-idea-punch').value, 'העמוד מוכר, לא המודעה');
    assert.ok($('#va-angle-picked'), 'הזווית לא מוצגת במסך הרעיון');
    assert.equal($('#va-angle-picked-name').textContent, 'השוואה');
    await until(() => (store.get('videoAssistantSessions/u1') || {}).ideaAngle === 'השוואה', 'הזווית לא נשמרה בסשן');

    $('#va-idea-next-btn').click();
    await until(() => $('#va-packaging-input'), 'מסך האריזה');
    const promptText = document.querySelector('#video-assistant-view').textContent;
    assert.match(promptText, /זווית ההנגשה: השוואה/, 'הזווית לא נכנסה לפרומפט האריזה');
    await until(() => /זווית ההנגשה: השוואה/.test((store.get('videoAssistantSessions/u1') || {}).ideaDescription || ''),
      'הזווית לא נכנסה למשפט הרעיון שכל הפרומפטים קוראים');
    assert.match(document.querySelector('#video-assistant-view').textContent, /זווית ההנגשה[\s\S]*השוואה/, 'הזווית לא מופיעה ב"מה שנבנה"');
  });

  test('"להוריד את הזווית" מוריד אותה מהרעיון', async () => {
    assert.ok($('#va-packaging-input'), 'הבדיקה הקודמת לא הגיעה למסך האריזה');
    $('#va-back-btn').click();
    await until(() => $('#va-idea-sharp'), 'חזרה למסך הרעיון');
    assert.ok($('#va-angle-remove'), 'אין דרך להוריד את הזווית');
    $('#va-angle-remove').click();
    assert.ok(!$('#va-angle-picked'));
    await until(() => (store.get('videoAssistantSessions/u1') || {}).ideaAngle == null, 'הזווית לא ירדה מהסשן');
    if (!$('#va-idea-sharp').value) type($('#va-idea-sharp'), '3 טעויות שמבריחות לקוחות מהעמוד');
    if (!$('#va-idea-punch').value) type($('#va-idea-punch'), 'העמוד מוכר, לא המודעה');
    $('#va-idea-next-btn').click();
    await until(() => $('#va-packaging-input'), 'מסך האריזה');
    assert.doesNotMatch((store.get('videoAssistantSessions/u1') || {}).ideaDescription || '', /זווית ההנגשה/);
  });

  test('רעיון מהבנק שנשמר עם זווית: הרעיון נכנס נקי לתיבה, והזווית עוברת לשדה שלה', async () => {
    store.set('ideas/i1', { title: '3 טעויות בעמוד | זווית: השוואה | סיפור: לקוחה שביטלה', category: 'בעל ערך', ownerUid: 'u1' });
    await openIdeaScreen();
    $('#va-pull-idea-link').click();
    await until(() => $('#va-accept-idea-btn'), 'מסך הרעיון מהבנק');
    $('#va-accept-idea-btn').click();
    await until(() => $('#va-idea-sharp'), 'חזרה למסך הרעיון');
    assert.equal($('#va-idea-sharp').value, '3 טעויות בעמוד. סיפור: לקוחה שביטלה');
    assert.equal($('#va-angle-picked-name').textContent, 'השוואה');
  });
});
