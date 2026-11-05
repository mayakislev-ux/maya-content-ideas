/* 05/11/2026 (מאיה): סבב תיקונים מביקורת: שמירה כפולה של רעיון, חזרה לעוזר
   שנשארה תלויה, חורי עלות בשרת, טיוטת חימום משותפת בין חשבונות, תיקוני
   מובייל, וכפתור "כניסה ללקוחה" למנהלת. חלק מהבדיקות לוחצות באמת ב-jsdom,
   והשאר נועלות את הניסוח בקבצים שאי אפשר לטעון ב-node (functions/index.js
   דורש firebase-functions, app.js דורש את כל האפליקציה). */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { register, createRequire } from 'node:module';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const SERVER = read('../functions/index.js');
const CSS = read('../css/style.css');
const CSS_NO_COMMENTS = CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');
const HTML = read('../index.html');
const APP = read('../js/app.js');

/** פונקציה עליונה מתוך functions/index.js, כטקסט */
function serverFn(name) {
  const at = SERVER.indexOf(`function ${name}(`);
  assert.ok(at !== -1, `${name} לא נמצאה`);
  const end = SERVER.indexOf('\n}\n', at);
  return SERVER.slice(at, end + 2);
}

class FakeHttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/* ---------- 9: חורי עלות בשרת ---------- */

describe('השרת: מכסות ובדיקות קלט', () => {
  test('כל פונקציה שנספרת במכסה רשומה ב-DAILY_LIMITS', () => {
    const block = SERVER.slice(SERVER.indexOf('const DAILY_LIMITS = {'), SERVER.indexOf('};', SERVER.indexOf('const DAILY_LIMITS = {')));
    const keys = new Set([...block.matchAll(/^\s*(\w+):\s*\d+,/gm)].map((m) => m[1]));
    const used = new Set([...SERVER.matchAll(/(?:enforceRateLimit|reserveRateLimit)\([^,]+,\s*'(\w+)'\)/g)].map((m) => m[1]));
    assert.ok(used.size >= 9, 'נמצאו קריאות למכסה');
    for (const name of used) assert.ok(keys.has(name), `${name} בלי תקרה יומית`);
    assert.ok(keys.has('guessClientDomain') && keys.has('suggestSearchKeywords'));
  });

  test('שם בלי שורה ב-DAILY_LIMITS נכשל, ולא עובר בלי תקרה', () => {
    const dailyLimitFor = new Function('DAILY_LIMITS', 'HttpsError', `${serverFn('dailyLimitFor')}; return dailyLimitFor;`)({ checkIdea: 60 }, FakeHttpsError);
    assert.equal(dailyLimitFor('checkIdea'), 60);
    assert.throws(() => dailyLimitFor('somethingNew'), { code: 'internal' });
  });

  test('השיחה: רק טקסט, רק user/assistant, ותקרת התווים לא נעקפת במערך', () => {
    const check = new Function('HttpsError', `${serverFn('assertMessagesWithinLimit')}; return assertMessagesWithinLimit;`)(FakeHttpsError);
    assert.doesNotThrow(() => check([{ role: 'user', content: 'שלום' }, { role: 'assistant', content: 'היי' }], 100));
    const huge = 'א'.repeat(70000);
    assert.throws(() => check([{ role: 'user', content: [{ type: 'text', text: huge }] }], 60000), { code: 'invalid-argument' });
    assert.throws(() => check([{ role: 'system', content: 'x' }], 60000), { code: 'invalid-argument' });
    assert.throws(() => check([null], 60000), { code: 'invalid-argument' });
    assert.throws(() => check([{ role: 'user', content: huge }], 60000), { code: 'invalid-argument' });
  });

  test('שדות הפרופיל שנכנסים לפרומפט נחתכים ל-500 תווים', () => {
    const clampProfile = new Function(`const PROFILE_FIELD_MAX = 500; ${serverFn('clampProfile')}; return clampProfile;`)();
    const out = clampProfile({ name: 'דנה', business: 'ב'.repeat(5000), nested: { a: 1 }, list: ['x'], age: 3 });
    assert.equal(out.name, 'דנה');
    assert.equal(out.business.length, 500);
    assert.equal(out.nested, undefined);
    assert.equal(out.list, undefined);
    assert.equal(out.age, 3);
    assert.equal(clampProfile(null), null);
    assert.equal(clampProfile(['x']), null);
    assert.ok(SERVER.includes('const profile = clampProfile(req.body && req.body.profile);'));
  });

  test('המקום במכסה נשמר מראש בטרנזקציה, ומוחזר בכל יציאה בלי הצלחה', () => {
    assert.ok(!SERVER.includes('checkRateLimitNotExceeded'), 'בדיקה בנפרד מהספירה חזרה');
    assert.ok(!SERVER.includes('incrementRateLimit'), 'ספירה אחרי ההצלחה חזרה');
    const reserve = serverFn('reserveRateLimit');
    assert.ok(reserve.includes('db.runTransaction'));
    assert.ok(reserve.includes('count >= limit'));
    for (const fn of ['checkIdea', 'generateWarmingPlan', 'breakdownStorySequence', 'generateContentPlan']) {
      const at = SERVER.indexOf(`rateSlot = await reserveRateLimit(uid, '${fn}');`);
      assert.ok(at !== -1, `${fn} לא שומר מקום מראש`);
      const body = SERVER.slice(at, SERVER.indexOf('\n);\n', at));
      assert.ok(body.includes('rateSlot.commit();'), `${fn} לא מסמן הצלחה`);
      assert.ok(body.includes('await rateSlot.release();'), `${fn} לא מחזיר מקום בכישלון`);
      assert.ok(/finally \{\n\s+(?:clearInterval\(heartbeat\);\n\s+)?await rateSlot\.release\(\);/.test(body), `${fn}: ההחזרה לא ב-finally`);
    }
    assert.ok(SERVER.includes("checkRate: (uid) => reserveRateLimit(uid, 'transcribeReference')"));
    assert.ok(SERVER.includes('releaseRate: (uid, slot) => slot.release()'));
  });
});

/* 05/11/2026: הכלל נשאר בחוץ עד שיש לחשבון השירות של Storage הרשאה לקרוא
   מ-Firestore. בלעדיה כל העלאה של לקוחה נחסמת, ורק מאיה עוברת. */
describe('storage.rules: העלאה לתמלול', { skip: 'ממתין להרשאת firestoreServiceAgent לפני פרסום' }, () => {
  const RULES = read('../storage.rules');
  test('רק מי שברשימה ובמנוי בתוקף, כמו isAllowed/notExpired ב-firestore.rules', () => {
    const block = RULES.slice(RULES.indexOf('match /transcribeUploads/'));
    assert.match(block, /allow create: if canTranscribe\(\)/);
    assert.ok(RULES.includes('firestore.exists(allowlistDoc())'));
    assert.ok(RULES.includes("data.get('paidUntil', null) == null"));
    assert.ok(RULES.includes('paidUntil > request.time'));
    assert.ok(RULES.includes('/databases/(default)/documents/allowlist/$(request.auth.token.email)'));
    assert.match(block, /request\.resource\.size < 200 \* 1024 \* 1024/);
  });
});

/* ---------- 10 + 5 + 8: טיוטות, שמירה כפולה, חזרה לעוזר ---------- */

describe('טיוטות לפי חשבון', () => {
  test('טיוטת תוכנית החימום נשמרת לפי subjectUid, לא במפתח אחד למכשיר', () => {
    const src = read('../js/warming.js');
    assert.ok(src.includes("import { subjectUid, isClientView } from './client-view.js';"));
    assert.ok(src.includes('warmingDraftKey(subjectUid(me))'));
    assert.ok(!/localStorage\.(get|set|remove)Item\(\s*(?:LEGACY_)?WARMING_DRAFT_KEY\s*,\s*JSON/.test(src));
    assert.ok(!src.includes('localStorage.getItem(WARMING_DRAFT_KEY)'));
    /* המפתח הישן עובר רק לחשבון שלה, אף פעם לא לתוך לקוחה */
    assert.ok(src.includes('legacy !== null && !isClientView()'));
  });

  test('טיוטת הוספה מהירה לא נשמרת ולא משוחזרת בתצוגה כלקוחה', () => {
    const src = read('../js/archive-view.js');
    assert.ok(src.includes("const QUICK_ADD_DRAFT_KEY = isClientView() ? null : 'quick-add-draft';"));
    assert.ok(src.includes('draftStore.set(quickAddInput.value);'));
    assert.ok(src.includes('if (QUICK_ADD_DRAFT_KEY) localStorage.setItem(QUICK_ADD_DRAFT_KEY, v);'));
  });
});

const JSDOM_PATH = 'C:/dev/portal-sales/node_modules/jsdom/lib/api.js';
const hasJsdom = existsSync(JSDOM_PATH);
const store = new Map();
const writes = [];
let releaseWrite = null;
const fetches = [];

function installFirebaseStub() {
  const path = (...parts) => parts.filter((p) => typeof p === 'string').join('/');
  globalThis.__fbStub = {
    initializeApp: () => ({}),
    getAuth: () => ({ currentUser: { uid: 'u1', email: 'client@example.com', getIdToken: async () => 'tok' } }),
    getFirestore: () => ({}),
    enableIndexedDbPersistence: () => Promise.resolve(),
    getFunctions: () => ({}),
    collection: (base, ...parts) => ({ path: base && base.path ? path(base.path, ...parts) : path(...parts) }),
    doc: (base, ...parts) => ({ path: base && base.path ? path(base.path, ...parts) : path(...parts) }),
    query: (col) => col,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    serverTimestamp: () => Date.now(),
    getDoc: async (ref) => ({ exists: () => store.has(ref.path), data: () => structuredClone(store.get(ref.path)) }),
    setDoc: async (ref, data) => { store.set(ref.path, structuredClone(data)); },
    /* כתיבה איטית: חוזרת רק כשהבדיקה משחררת אותה, כמו בחיבור חלש */
    addDoc: (col, data) => {
      writes.push({ col: col.path, data });
      return new Promise((resolve) => { releaseWrite = () => resolve({ id: `new${writes.length}` }); });
    },
    updateDoc: async () => {},
    getDocs: async () => ({ docs: [], forEach() {} }),
    onSnapshot: () => () => {},
    httpsCallable: () => async () => ({ data: {} }),
  };
}

function sseResponse(reply) {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(`data: ${JSON.stringify({ done: true, reply })}\n\n`));
      c.close();
    },
  });
  return new Response(body, { status: 200 });
}

async function until(fn, label, tries = 200) {
  for (let i = 0; i < tries; i += 1) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.fail(`לא קרה: ${label}`);
}

let form;
let chat;

describe('בדפדפן (jsdom)', { skip: hasJsdom ? false : 'jsdom לא מותקן במחשב הזה' }, () => {
  before(async () => {
    register('./helpers/cdn-stub-hooks.mjs', import.meta.url);
    installFirebaseStub();
    const require = createRequire(import.meta.url);
    const { JSDOM } = require(JSDOM_PATH);
    const dom = new JSDOM(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), { url: 'https://mayakislev-ux.github.io/maya-content-ideas/', pretendToBeVisual: true });
    const w = dom.window;
    w.scrollTo = () => {};
    w.HTMLElement.prototype.scrollIntoView = function () {};
    w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent',
      'KeyboardEvent', 'MouseEvent', 'sessionStorage', 'localStorage', 'getComputedStyle', 'requestAnimationFrame',
      'cancelAnimationFrame', 'history', 'location', 'DocumentFragment', 'HTMLTextAreaElement', 'HTMLInputElement']) {
      Object.defineProperty(globalThis, k, { value: k === 'window' ? w : w[k], configurable: true, writable: true });
    }
    globalThis.fetch = async (url, opts) => {
      fetches.push(JSON.parse(opts.body));
      return sseResponse('נשמע טוב. מה המסר?');
    };
    store.set('profiles/u1', { name: 'דנה', pronoun: 'את', business: 'שיווק', primaryAudience: 'בעלות עסקים', secondaryAudience: 'משני' });
    form = await import('../js/idea-form.js');
    chat = await import('../js/idea-chat.js');
    form.wireIdeaForm();
    chat.wireIdeaChat();
  });

  test('לחיצה כפולה (Enter ואז לחיצה) בחיבור איטי שומרת את הרעיון פעם אחת', async () => {
    form.openAddModal('רעיון לסרטון על תמחור');
    document.getElementById('field-category').value = 'בעל ערך';
    document.getElementById('field-rating').value = '3';
    document.getElementById('field-audience-scope').value = 'עיקרי';
    const formEl = document.getElementById('idea-form');
    const submitBtn = formEl.querySelector('button[type="submit"]');
    const submit = () => formEl.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    submit();
    await until(() => writes.length === 1, 'השמירה הראשונה לא יצאה');
    assert.equal(submitBtn.disabled, true, 'הכפתור לא הושבת בזמן השמירה');
    submit();
    submitBtn.click();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(writes.length, 1, 'הרעיון נשמר פעמיים');
    releaseWrite();
    await until(() => document.getElementById('idea-modal').hidden, 'החלון לא נסגר אחרי השמירה');
    assert.equal(submitBtn.disabled, false, 'הכפתור נשאר מושבת');
  });

  test('חזרה לעוזר לא נשארת תלויה כשנכנסים אחר כך לצ׳אט מרעיון במאגר', async () => {
    const back = () => document.getElementById('chat-back-to-assistant');
    chat.startIdeaChatFromAssistant({ topic: 'תמחור' }, { onBack() {} });
    await until(() => back() && !back().hidden, 'כפתור החזרה לעוזר לא הופיע');
    /* יוצאים בתפריט התחתון (לא בכפתור), ופותחים רעיון ישן מהמאגר */
    await chat.startIdeaChatWithExistingIdea({ id: 'i1', title: 'רעיון ישן על לקוחות', category: 'בעל ערך' });
    assert.equal(back().hidden, true, 'כפתור "חזרה לעוזר" נשאר מהשיחה הקודמת');

    chat.startIdeaChatFromAssistant({ topic: 'עוד' }, { onBack() {} });
    await until(() => !back().hidden, 'כפתור החזרה לעוזר לא הופיע');
    await chat.startIdeaChat();
    assert.equal(back().hidden, true, 'startIdeaChat לא ניקה את החזרה לעוזר');
  });
});

/* ---------- 11-18: מובייל ---------- */

describe('מובייל (CSS)', () => {
  const has = (s) => assert.ok(CSS_NO_COMMENTS.includes(s), `חסר: ${s}`);

  test('שדות בלי הגדלה אוטומטית באייפון', () => {
    has('.cosmic-modal-overlay .cosmic-textarea { font-size: 16px; }');
    has('.table-cell-select.table-cell-select { font-size: max(16px, 1rem); }');
  });

  test('התסריט להקראה: 16 פיקסל ותיבה של כמחצית מסך, גם במסך "מוכן!"', () => {
    has('#video-assistant-view .cosmic-prompt-box { font-size: 16px; }');
    has('.va-read-script.cosmic-prompt-box,\n#video-assistant-view .cosmic-summary-list ~ .cosmic-prompt-box { max-height: 46vh; max-height: 46svh; }');
  });

  test('פס המנוי לא מכסה את הכותרת ואת פס המצב באפליקציה המותקנת', () => {
    has('top: calc(var(--offline-banner-height, 0px) + var(--top-bar-h, 0px));');
    has('padding-top: calc(9px + env(safe-area-inset-top, 0px));');
    has('body:has(> .sub-countdown),\nbody:has(> .preview-bar) { --hdr-safe-top: 0px; }');
    assert.ok(APP.includes('syncTopBarHeight();'), 'גם הפס הסגול של תצוגה כלקוחה נמדד');
  });

  test('הטוסט מעל התפריט התחתון, ו"בטלו" בגודל אצבע', () => {
    has('--bottom-nav-h: calc(75px + env(safe-area-inset-bottom, 0px));');
    has('.toast { bottom: calc(var(--bottom-nav-h, 75px) + 12px); }');
    assert.match(CSS_NO_COMMENTS, /\.toast-action-btn \{[^}]*min-height: 44px;[^}]*padding: 0 12px;/);
  });

  test('שורת הקלט בצ׳אט והכפתור הצף גוברים על כללי הבסיס', () => {
    has('.chat-input-row.chat-input-row {\n    padding: 0.8rem 1.2rem;');
    has('.chat-input-row.chat-input-row textarea {');
    has('.fab.fab {');
  });

  test('חלון בניית התוכנית בטבלת הסטורי לא נחתך בספארי', () => {
    has('max-height: calc(100svh - 2.5rem);');
  });

  test('כפתורים קטנים הוגדלו', () => {
    assert.match(CSS_NO_COMMENTS, /\.cosmic-modal-close \{[^}]*width: 44px;\s*height: 44px;/);
    assert.match(CSS_NO_COMMENTS, /\.cosmic-modal \{[^}]*overscroll-behavior: contain;/);
    assert.match(CSS_NO_COMMENTS, /\.cosmic-mute-btn \{[^}]*width: 44px;\s*height: 44px;/);
    for (const sel of ['.feed-sub-toggle', '.feed-read__btn', '.feed-read__copy']) {
      assert.match(CSS_NO_COMMENTS, new RegExp(`\\${sel} \\{[^}]*min-height: 40px;`), sel);
    }
    assert.match(CSS_NO_COMMENTS, /\.feed-nav \{[^}]*width: 40px;/);
    has('.rating-chip.rating-chip { font-size: 1rem; padding: 0.6rem 1.1rem; min-height: 44px; }');
    has('.rating-chips.rating-chips { gap: 0.8rem; }');
  });

  test('טקסט קטן: לפחות 13 פיקסל', () => {
    has('.inspiration-card-angle { font-size: 13px;');
    has('.inspiration-card-accuracy-warning { font-size: 13px;');
    assert.match(CSS_NO_COMMENTS, /\.cosmic-context-box span \{[^}]*font-size: 13px;/);
    assert.match(CSS_NO_COMMENTS, /\.cosmic-hint \{\s*font-size: 13px;/);
    has('.cosmic-accordion-body { padding: 0 14px 14px; font-size: 14px;');
    assert.match(CSS_NO_COMMENTS, /\.bottom-nav-btn \{[^}]*font-size: 13px;/);
  });
});

describe('פס המנוי מודד את עצמו', () => {
  test('הגובה האמיתי של הפסים נכתב ל---top-bar-h', async () => {
    const src = read('../js/subscription-notice.js').replace(/^export /gm, '');
    const props = {};
    const bars = [{ offsetHeight: 40 }, { offsetHeight: 30 }];
    const doc = {
      documentElement: { style: { setProperty: (k, v) => { props[k] = v; } } },
      querySelectorAll: () => bars,
    };
    const sync = new Function('document', `${src}; return syncTopBarHeight;`)(doc);
    sync();
    assert.equal(props['--top-bar-h'], '70px');
  });
});

/* ---------- כניסה ללקוחה ---------- */

describe('כפתור "כניסה ללקוחה" למנהלת', () => {
  test('בתפריט, מוסתר כברירת מחדל, ונפתח רק דרך actsAsOwner (בלי השוואת מייל)', () => {
    assert.match(HTML, /<button type="button" id="enter-client-btn" class="tab-btn enter-client-btn" hidden>/);
    assert.ok(HTML.includes('כניסה ללקוחה'));
    const navAt = HTML.indexOf('id="view-tabs"');
    const btnAt = HTML.indexOf('id="enter-client-btn"');
    assert.ok(btnAt > navAt && btnAt < HTML.indexOf('</nav>', navAt), 'הכפתור בתוך התפריט');
    assert.ok(APP.includes('const isAdmin = actsAsOwner(user.email);'));
    assert.ok(APP.includes("document.getElementById('enter-client-btn').hidden = !isAdmin;"));
    const lines = APP.split('\n').filter((l) => l.includes('enter-client-btn'));
    for (const l of lines) assert.ok(!/ADMIN_EMAIL|OWNER_EMAIL|@gmail/.test(l), `השוואת מייל: ${l.trim()}`);
    assert.ok(/\.tab-btn\[hidden\],\n\.enter-client-btn\[hidden\] \{ display: none !important; \}/.test(CSS_NO_COMMENTS));
  });

  test('לחיצה פותחת ישר את חלון החיפוש, ובחירה נכנסת ללקוחה בצעד אחד', () => {
    assert.ok(APP.includes("wireClientPick(document.getElementById('enter-client-btn'), null, { enterView: true });"));
    const fn = APP.slice(APP.indexOf('function wireClientPick('), APP.indexOf("wireClientPick(document.getElementById('enter-client-btn')"));
    assert.ok(fn.includes('if (enterView && !chosen) return;'), '"החשבון שלי" לא טוען מחדש');
    assert.ok(fn.indexOf('if (enterView) setClientView(true);') < fn.indexOf('setViewedClient(chosen);'), 'קודם תצוגה כלקוחה, ואז הלקוחה');
    assert.ok(fn.includes('window.location.reload();'));
  });

  test('כל תוצר של לקוחה פתוח למאיה בכללי Firestore', () => {
    const RULES = read('../firestore.rules');
    const block = (name) => {
      const at = RULES.indexOf(`match /${name}/`);
      return at === -1 ? '' : RULES.slice(at, RULES.indexOf('match /', at + 10));
    };
    for (const name of ['ideas', 'profiles', 'warmingPlans', 'storyTables', 'videoAssistantSessions', 'videoAssistantScripts', 'contentPlans']) {
      assert.ok(block(name).includes('allow read, write: if isAdmin();'), name);
    }
  });
});
