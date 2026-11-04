/* 04/11/2026: עריכה של הסרטון שפתוח עכשיו בעוזר, דרך "התסריטים שלי", בעוזר
   האמיתי (video-assistant.js) ב-jsdom.

   התקלה שנמצאה בסקירה: במסך זיקוק התסריט התיבה מחזיקה טיוטה שהועתקה
   מהתסריט הישן (seedDraft). אחרי "נשמר ✓" וסגירה התיבה עדיין הציגה את
   הישן, ו"ממשיכים ←" דרס את העריכה גם בסשן וגם בפריט השמור. */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { register, createRequire } from 'node:module';
import { INITIAL_STATE } from '../js/video-assistant-flow.js';
import { withLiveEdit } from '../js/video-assistant-library.js';

const JSDOM_PATH = 'C:/dev/portal-sales/node_modules/jsdom/lib/api.js';
const hasJsdom = existsSync(JSDOM_PATH);

const store = new Map();
const SESSION = 'videoAssistantSessions/u1';
const ITEM = 'videoAssistantScripts/u1/items/x1';

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
    httpsCallable: () => async () => ({ data: {} }),
  };
}

async function until(fn, label, tries = 300) {
  for (let i = 0; i < tries; i += 1) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.fail(`לא קרה: ${label}`);
}

const LIVE = {
  ...INITIAL_STATE, branch: 'scratch', screen: 'scratch-distill', history: [],
  scriptId: 'x1', scriptCreatedAt: 1,
  ideaTopic: 'ממומן לא מציל', ideaPunchline: 'העמוד מוכר', ideaDescription: 'העמוד מוכר. נושא הסרטון: ממומן לא מציל',
  selectedFormat: 'דיבור למצלמה', rawDump: 'מגילה', hook: 'שרפת 5,000?', hookReinforcement: 'כן',
  transcript: 'תמלול ישן, עם המשך', openingHook: 'תמלול ישן',
  draftScript: 'תסריט ישן',
  drafts: { 'scratch-distill|va-scratch-script-input': 'תסריט ישן' },
};

let $;
let mods;

describe('עריכת הסרטון הפתוח בעוזר האמיתי (jsdom)', { skip: hasJsdom ? false : 'jsdom לא מותקן במחשב הזה' }, () => {
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
    w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent',
      'KeyboardEvent', 'MouseEvent', 'sessionStorage', 'localStorage', 'getComputedStyle', 'requestAnimationFrame',
      'cancelAnimationFrame', 'history', 'location', 'DocumentFragment', 'HTMLTextAreaElement', 'HTMLInputElement']) {
      Object.defineProperty(globalThis, k, { value: k === 'window' ? w : w[k], configurable: true, writable: true });
    }
    w.HTMLMediaElement && (w.HTMLMediaElement.prototype.play = () => Promise.resolve());
    store.set('profiles/u1', { name: 'מיכל', pronoun: 'את', business: 'שיווק', primaryAudience: 'בעלות עסקים' });
    store.set(SESSION, { ...structuredClone(LIVE), updatedAt: Date.now() });
    store.set(ITEM, { title: 'ממומן לא מציל', done: false, createdAt: 1, updatedAt: Date.now(), state: structuredClone(LIVE) });

    const va = await import('../js/video-assistant.js');
    const router = await import('../js/view-router.js');
    va.wireVideoAssistantView();
    mods = { va, router };
    $ = (sel) => document.querySelector(sel);
  });

  const type = (el, value) => { el.value = value; el.dispatchEvent(new window.Event('input', { bubbles: true })); };

  async function editOpenVideo(field, value) {
    $('#video-assistant-scripts-btn').click();
    await until(() => $('.va-lib-item[data-id="x1"]'), 'הרשימה לא נטענה');
    $('.va-lib-item[data-id="x1"]').click();
    assert.ok($('.va-lib-live'), 'לא מזוהה כסרטון הפתוח');
    $('#va-lib-edit').click();
    type($(`textarea[data-field="${field}"]`), value);
    $('#va-lib-save').click();
    await until(() => $('#va-lib-saved') && $('#va-lib-saved').textContent === 'נשמר ✓', 'לא נשמר');
    $('.cosmic-modal-close').click();
    await until(() => !$('.cosmic-modal-overlay'), 'החלון לא נסגר');
  }

  test('זיקוק התסריט: עריכה בחלון מופיעה בתיבה, ו"ממשיכים ←" שומר אותה', async () => {
    mods.router.showView('video-assistant');
    $('#hub-link-video-assistant').click();
    await until(() => $('#va-scratch-script-input'), 'מסך הזיקוק');
    assert.equal($('#va-scratch-script-input').value, 'תסריט ישן');

    await editOpenVideo('draftScript', 'תסריט חדש אחרי עריכה');
    await until(() => $('#va-scratch-script-input'), 'המסך לא צויר מחדש');
    assert.equal($('#va-scratch-script-input').value, 'תסריט חדש אחרי עריכה', 'התיבה מציגה את התסריט הישן');

    $('#va-scratch-script-done-btn').click();
    await until(() => store.get(SESSION).screen !== 'scratch-distill', 'לא עברנו מסך');
    await until(() => store.get(ITEM).state.screen !== 'scratch-distill', 'הפריט לא נשמר');
    assert.equal(store.get(SESSION).draftScript, 'תסריט חדש אחרי עריכה', 'העריכה נדרסה בסשן');
    assert.equal(store.get(ITEM).state.draftScript, 'תסריט חדש אחרי עריכה', 'העריכה נדרסה בפריט');
  });

  test('עריכת התמלול מאפסת את ההוק הפותח שזוהה מהנוסח הקודם', async () => {
    await editOpenVideo('transcript', 'תמלול חדש לגמרי');
    await until(() => store.get(SESSION).transcript === 'תמלול חדש לגמרי', 'הסשן לא נשמר');
    assert.equal(store.get(SESSION).openingHook, null);
    assert.equal(store.get(ITEM).state.openingHook, null);
  });
});

test('withLiveEdit: טיוטות של השדה שנערך מתחלפות, אחרות נשארות', () => {
  const s = {
    ...LIVE,
    sceneRewrite: 'גרסת סצנה ישנה',
    drafts: {
      'scratch-distill|va-scratch-script-input': 'ישן',
      'scratch-scene|va-scratch-scene-input': 'סצנה ישנה',
      'idea-sharpen|va-idea-sharp': 'נושא ישן',
      'scratch-hook|va-scratch-hook-input': 'הוק שמוקלד',
    },
  };
  const out = withLiveEdit(s, { draftScript: 'חדש' });
  assert.equal(out.draftScript, 'חדש');
  assert.equal(out.drafts['scratch-distill|va-scratch-script-input'], 'חדש');
  assert.equal(out.drafts['scratch-scene|va-scratch-scene-input'], undefined);
  assert.equal(out.sceneRewrite, null);
  assert.equal(out.drafts['scratch-hook|va-scratch-hook-input'], 'הוק שמוקלד', 'טיוטה של שדה אחר נגעה');
  const idea = withLiveEdit(s, { ideaTopic: 'נושא חדש', ideaDescription: 'מסר. נושא הסרטון: נושא חדש' });
  assert.equal(idea.drafts['idea-sharpen|va-idea-sharp'], 'נושא חדש', 'בתיבת הנושא נכנס המשפט המשולב');
  assert.equal(s.drafts['scratch-distill|va-scratch-script-input'], 'ישן', 'הסטייט המקורי השתנה');
});
