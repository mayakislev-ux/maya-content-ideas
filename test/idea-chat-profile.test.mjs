/* 04/11/2026 (מאיה): "אגב, כדאי למלא את הפרופיל במסך ההגדרות" - "לא הבנתי מה
   זה. אולי במקום זה שבצ'אט עצמו ישאל אותי ואמלא לו אם חסר, ושלא יהיה ככה כל
   פעם". קובץ נפרד מ-angle-chat-and-bank-dup, כי כאן הצ'אט צריך להיטען פעם
   ראשונה מול פרופיל חסר (מצב המודול נשמר בין בדיקות באותו קובץ). */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { register, createRequire } from 'node:module';

const JSDOM_PATH = 'C:/dev/portal-sales/node_modules/jsdom/lib/api.js';
const hasJsdom = existsSync(JSDOM_PATH);

const store = new Map();
const sent = [];

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
    getDoc: async (ref) => ({ exists: () => store.has(ref.path), data: () => structuredClone(store.get(ref.path)) }),
    setDoc: async (ref, data, opts) => {
      const prev = opts && opts.merge ? (store.get(ref.path) || {}) : {};
      store.set(ref.path, structuredClone({ ...prev, ...data }));
    },
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

describe('הפרופיל החסר נשאל בתוך הצ׳אט', () => {
  test('השרת לא מפנה יותר למסך הגדרות', () => {
    const prompt = readFileSync(new URL('../functions/system-prompt.js', import.meta.url), 'utf8');
    assert.doesNotMatch(prompt, /כדאי למלא את הפרופיל במסך ההגדרות/);
    assert.match(prompt, /אל תפנה\/י למסך הגדרות/);
  });
});

let $;
let chat;

describe('בדפדפן (jsdom)', { skip: hasJsdom ? false : 'jsdom לא מותקן במחשב הזה' }, () => {
  before(async () => {
    register('./helpers/cdn-stub-hooks.mjs', import.meta.url);
    installFirebaseStub();
    const require = createRequire(import.meta.url);
    const { JSDOM } = require(JSDOM_PATH);
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const dom = new JSDOM(html, { url: 'https://mayakislev-ux.github.io/maya-content-ideas/', pretendToBeVisual: true });
    const w = dom.window;
    w.scrollTo = () => {};
    w.HTMLElement.prototype.scrollIntoView = function () {};
    for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent',
      'KeyboardEvent', 'MouseEvent', 'sessionStorage', 'localStorage', 'getComputedStyle', 'requestAnimationFrame',
      'cancelAnimationFrame', 'history', 'location', 'DocumentFragment', 'HTMLTextAreaElement', 'HTMLInputElement']) {
      Object.defineProperty(globalThis, k, { value: k === 'window' ? w : w[k], configurable: true, writable: true });
    }
    globalThis.fetch = async (url, opts) => {
      sent.push(JSON.parse(opts.body));
      return sseResponse('נשמע טוב. מה המסר?');
    };
    /* פרופיל קיים בלי תחום ובלי קהל: המצב של 28-36 מתוך 74 פרופילים אמיתיים */
    store.set('profiles/u1', { name: 'דנה', pronoun: 'את', secondaryAudience: 'משני' });
    chat = await import('../js/idea-chat.js');
    chat.wireIdeaChat();
    document.body.dataset.plan = 'full';
    $ = (sel) => document.querySelector(sel);
  });

  const bubbles = () => [...document.querySelectorAll('#chat-messages .chat-bubble')].map((b) => b.textContent.trim());
  const answer = (text) => {
    $('#chat-input').value = text;
    $('#chat-form').requestSubmit();
  };

  test('הלוגיקה: מה חסר, ומתי לא שואלים', () => {
    const { missingProfileSteps, missingStepQuestion } = chat;
    assert.deepEqual(missingProfileSteps({ business: 'x', primaryAudience: 'y' }), []);
    assert.deepEqual(missingProfileSteps({ business: ' ', name: 'a' }), ['business', 'primaryAudience']);
    assert.deepEqual(missingProfileSteps({ business: 'x' }), ['primaryAudience']);
    assert.equal(missingProfileSteps(null).length, 5, 'בלי פרופיל בכלל: ההיכרות המלאה');
    assert.deepEqual(missingProfileSteps({}, { owner: true }), [], 'אצל מאיה השרת לא משתמש בתחום ובקהל');
    assert.deepEqual(missingProfileSteps({}, { viewing: true }), [], 'בתצוגה של לקוחה לא כותבים לפרופיל שלה');
    assert.equal(missingStepQuestion('business', { first: true }), 'רגע לפני שנתחיל: מה התחום שלך?');
    assert.equal(missingStepQuestion('primaryAudience', { pronoun: 'את' }), 'ומי קהל היעד העיקרי שלך? (למי את רוצה למכור)');
    assert.equal(missingStepQuestion('primaryAudience', { first: true, pronoun: 'אתה' }), 'רגע לפני שנתחיל: מי קהל היעד העיקרי שלך? (למי אתה רוצה למכור)');
  });

  test('מהעוזר עם רעיון: קודם השאלות, נשמר בפרופיל, ורק אז הרעיון נשלח', async () => {
    chat.startIdeaChatFromAssistant({ topic: 'מחיר ראשון', punchline: 'הלקוחה משלמת על תוצאה' }, { onBack: () => {} });
    await until(() => bubbles().includes('רגע לפני שנתחיל: מה התחום שלך?'), 'לא נשאל על התחום');
    assert.equal(sent.length, 0, 'משהו נשלח לשרת לפני שענתה');
    answer('הלחמת ריסים');
    await until(() => bubbles().includes('ומי קהל היעד העיקרי שלך? (למי את רוצה למכור)'), 'לא נשאל על הקהל');
    answer('נשים שכירות שרוצות מקצוע');
    await until(() => sent.length === 1, 'הרעיון לא נשלח אחרי השאלות');
    assert.equal(sent[0].messages.length, 1, 'התשובות על הפרופיל נשלחו כחלק מהשיחה');
    assert.match(sent[0].messages[0].content, /מחיר ראשון/);
    assert.doesNotMatch(sent[0].messages[0].content, /הלחמת ריסים/);
    assert.equal(sent[0].profile.business, 'הלחמת ריסים', 'השרת לא קיבל את התחום החדש');
    await until(() => (store.get('profiles/u1') || {}).primaryAudience, 'לא נשמר');
    assert.deepEqual(store.get('profiles/u1'), {
      name: 'דנה', pronoun: 'את', secondaryAudience: 'משני', business: 'הלחמת ריסים', primaryAudience: 'נשים שכירות שרוצות מקצוע',
    });
  });

  test('בפעם הבאה: ישר לפתיחה, בלי לשאול שוב', async () => {
    await until(() => !$('#chat-input').disabled, 'התשובה לא נגמרה');
    chat.startIdeaChatFromHub();
    await until(() => bubbles().length === 1, 'אין פתיחה');
    assert.deepEqual(bubbles(), ['דנה, רשמי לי מה הרעיון שלך ואדייק אותך.']);
    assert.deepEqual(chat.missingProfileSteps(store.get('profiles/u1')), [], 'גם אחרי טעינה מחדש לא יחסר כלום');
  });
});
