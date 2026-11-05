/* 05/11/2026: העוזר לסרטון האמיתי (video-assistant.js) ב-jsdom, כמו ב-
   va-back-keeps-paste.test.mjs, למבחנים של הכלים החדשים. Firestore בזיכרון,
   קריאות לשרת לפי שם (calls ו-handlers), ואופציה לזיהוי דיבור מדומה.
   זיהוי הדיבור נקבע פעם אחת בטעינת המודול, ולכן מבחן בלי תמיכה יושב
   בקובץ משלו (כל קובץ רץ בתהליך נפרד). */
import { readFileSync, existsSync } from 'node:fs';
import { register, createRequire } from 'node:module';
import assert from 'node:assert/strict';

export const JSDOM_PATH = 'C:/dev/portal-sales/node_modules/jsdom/lib/api.js';
export const hasJsdom = existsSync(JSDOM_PATH);
export const SESSION = 'videoAssistantSessions/u1';

export const store = new Map();
export const calls = [];
export const handlers = {
  extractOpeningHook: async () => ({ data: { hook: 'ההוק המקורי' } }),
  classifyIdea: async () => ({ data: { category: '' } }),
};
export const speech = { instances: [] };

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
    deleteDoc: async (ref) => { store.delete(ref.path); },
    getDocs: async (col) => {
      const prefix = `${col.path}/`;
      const docs = [...store.entries()]
        .filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
        .map(([k, v]) => ({ id: k.slice(prefix.length), data: () => structuredClone(v) }));
      return { docs, forEach: (f) => docs.forEach(f) };
    },
    onSnapshot: () => () => {},
    httpsCallable: (_fns, name) => async (payload) => {
      calls.push({ name, payload });
      const h = handlers[name];
      if (!h) throw new Error(`no handler for ${name}`);
      return h(payload);
    },
  };
}

/** זיהוי דיבור מדומה: כל מופע נשמר, והמבחן "מדבר" דרך say(). */
class FakeRecognition {
  constructor() { speech.instances.push(this); this.started = false; }
  start() { this.started = true; }
  stop() { this.started = false; if (this.onend) this.onend(); }
  say(text) {
    const result = [{ transcript: text }];
    result.isFinal = true;
    this.onresult({ results: [result] });
  }
}

export async function until(fn, label, tries = 400) {
  for (let i = 0; i < tries; i += 1) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.fail(`לא קרה: ${label}`);
}

/** טוען את העוזר ב-jsdom. withSpeech: האם הדפדפן "תומך" בזיהוי דיבור. */
export async function setupAssistant({ withSpeech = false } = {}) {
  register('./cdn-stub-hooks.mjs', import.meta.url);
  installFirebaseStub();
  const require = createRequire(import.meta.url);
  const { JSDOM } = require(JSDOM_PATH);
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, { url: 'https://mayakislev-ux.github.io/maya-content-ideas/', pretendToBeVisual: true });
  const w = dom.window;
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  if (withSpeech) w.SpeechRecognition = FakeRecognition;
  for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent',
    'KeyboardEvent', 'MouseEvent', 'sessionStorage', 'localStorage', 'getComputedStyle', 'requestAnimationFrame',
    'cancelAnimationFrame', 'history', 'location', 'DocumentFragment', 'HTMLTextAreaElement', 'HTMLInputElement',
    'MutationObserver']) {
    Object.defineProperty(globalThis, k, { value: k === 'window' ? w : w[k], configurable: true, writable: true });
  }
  w.HTMLMediaElement && (w.HTMLMediaElement.prototype.play = () => Promise.resolve());
  /* ב-jsdom אין AudioContext. בלי צליל, הצלחה (celebrate) לא נוגעת בו. */
  w.localStorage.setItem('video-assistant-muted', '1');
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async () => {} }, configurable: true });
  store.set('profiles/u1', { name: 'מיכל', pronoun: 'את', business: 'שיווק', primaryAudience: 'בעלות עסקים' });
  const va = await import('../../js/video-assistant.js');
  const router = await import('../../js/view-router.js');
  va.wireVideoAssistantView();
  router.showView('video-assistant');
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  /** פותח את העוזר על סשן שמור (כמו רענון באמצע עבודה) */
  async function open(state, firstSel) {
    store.set(SESSION, { history: [], ...structuredClone(state), updatedAt: Date.now() });
    $('#hub-link-video-assistant').click();
    await until(() => $(firstSel), `המסך עם ${firstSel}`);
  }
  const type = (el, value) => { el.value = value; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const paste = (el, value) => { el.value = value; el.dispatchEvent(new w.Event('paste', { bubbles: true })); };
  const check = (el, on = true) => { el.checked = on; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  return { w, $, $$, open, type, paste, check };
}
