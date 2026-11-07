/* 07/11/2026 (מאיה: "לתקן את כל מה שהביקורת המלאה מצאה").
   הבדיקה מעלה את כל האפליקציה (app.js האמיתי) ב-jsdom, כמנהלת בתצוגת
   לקוחה, ולוחצת על הכפתורים האמיתיים. בדיקות טקסט וקוד בסוף הקובץ. */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { register, createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const JSDOM_PATH = 'C:/dev/portal-sales/node_modules/jsdom/lib/api.js';
const hasJsdom = existsSync(JSDOM_PATH);
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await sleep(10);
  }
  assert.fail(`לא קרה: ${label}`);
}

describe('האפליקציה המלאה (jsdom)', { skip: hasJsdom ? false : 'jsdom לא מותקן' }, () => {
  let w;
  let d;
  const saved = [];
  const profile = { business: 'מאמנת כושר', primaryAudience: 'נשים', tourCompletedAt: 1 };
  const $ = (s) => d.querySelector(s);

  before(async () => {
    register('./helpers/cdn-stub-hooks.mjs', import.meta.url);
    const EMAIL = 'mayakislev@gmail.com';
    const ts = (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms), seconds: Math.floor(ms / 1000) });
    const path = (...parts) => parts.filter((p) => typeof p === 'string').join('/');
    globalThis.__fbStub = {
      initializeApp: () => ({}),
      getAuth: () => ({ currentUser: { uid: 'u1', email: EMAIL, getIdToken: async () => 't' }, authStateReady: async () => {} }),
      GoogleAuthProvider: function () {},
      getRedirectResult: async () => null,
      onAuthStateChanged: (_a, cb) => { setTimeout(() => cb({ uid: 'u1', email: EMAIL, displayName: 'מאיה' }), 5); return () => {}; },
      signOut: async () => {},
      getFirestore: () => ({}),
      enableIndexedDbPersistence: () => Promise.resolve(),
      getFunctions: () => ({}),
      collection: (base, ...parts) => ({ path: base && base.path ? path(base.path, ...parts) : path(...parts) }),
      doc: (base, ...parts) => ({ path: base && base.path ? path(base.path, ...parts) : path(...parts) }),
      query: (c) => c, where: () => ({}), orderBy: () => ({}), limit: () => ({}),
      serverTimestamp: () => ts(Date.now()),
      getDoc: async (ref) => ({
        exists: () => ref.path === 'profiles/u1',
        data: () => (ref.path === 'profiles/u1' ? profile : undefined),
        id: ref.path.split('/').pop(),
      }),
      getDocs: async () => ({ docs: [], empty: true, size: 0, forEach() {} }),
      setDoc: async (ref, data) => { saved.push({ path: ref.path, data }); if (ref.path === 'profiles/u1') Object.assign(profile, data); },
      addDoc: async () => ({ id: 'n1' }),
      updateDoc: async () => {},
      deleteDoc: async () => {},
      writeBatch: () => ({ update() {}, delete() {}, set() {}, commit: async () => {} }),
      onSnapshot: (_q, next) => { setTimeout(() => next({ docs: [], exists: () => false, data: () => ({}), forEach() {} }), 10); return () => {}; },
      httpsCallable: () => async () => ({ data: {} }),
      getStorage: () => ({}),
    };
    const { JSDOM, VirtualConsole } = require(JSDOM_PATH);
    const html = read('../index.html').replace(/<script type="module"[^>]*><\/script>/, '');
    const dom = new JSDOM(html, {
      url: 'https://mayakislev-ux.github.io/maya-content-ideas/',
      pretendToBeVisual: true,
      runScripts: 'outside-only',
      virtualConsole: new VirtualConsole(),
    });
    w = dom.window;
    d = w.document;
    w.scrollTo = () => {};
    w.Element.prototype.scrollIntoView = function () {};
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} });
    w.alert = () => {};
    w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
    w.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
    for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent',
      'KeyboardEvent', 'MouseEvent', 'sessionStorage', 'localStorage', 'getComputedStyle', 'requestAnimationFrame',
      'cancelAnimationFrame', 'history', 'location', 'DocumentFragment', 'HTMLTextAreaElement', 'HTMLInputElement',
      'HTMLButtonElement', 'HTMLSelectElement', 'MutationObserver', 'Blob', 'ResizeObserver', 'IntersectionObserver',
      'alert', 'confirm', 'FormData', 'DOMParser', 'Image']) {
      Object.defineProperty(globalThis, k, { value: k === 'window' ? w : w[k], configurable: true, writable: true });
    }
    globalThis.fetch = async () => ({ ok: true, json: async () => ({}), text: async () => '' });
    w.fetch = globalThis.fetch;
    w.sessionStorage.setItem('clientView', '1');
    /* האפליקציה מפעילה טיימרים ארוכים (בדיקת עדכון כל דקה, תזכורות אחרי
       דקות). בלי unref הבדיקה לא מסתיימת אף פעם. */
    const realInterval = globalThis.setInterval;
    const realTimeout = globalThis.setTimeout;
    globalThis.setInterval = (...a) => { const t = realInterval(...a); if (t && t.unref) t.unref(); return t; };
    globalThis.setTimeout = (fn, ms, ...a) => { const t = realTimeout(fn, ms, ...a); if (ms > 5000 && t && t.unref) t.unref(); return t; };
    const quiet = console.error;
    console.error = () => {};
    try {
      await import('../js/app.js');
      await until(() => !$('#app-screen').hidden, 'האפליקציה עלתה');
      await sleep(50);
    } finally {
      console.error = quiet;
    }
  });

  test('חלון שנבנה בזמן ריצה ("אין לי רעיון?") נועל גלילה ומעביר פוקוס, והמונה לא נשבר', async () => {
    $('#home-mic-card').click();
    await sleep(20);
    const modal = $('#no-idea-modal');
    assert.ok(modal && !modal.hidden, 'הדלתות לא נפתחו');
    assert.equal(d.body.style.overflow, 'hidden');
    assert.ok(modal.contains(d.activeElement), 'הפוקוס לא בתוך החלון');
    $('#no-idea-close-btn').click();
    await sleep(10);
    assert.equal(d.body.style.overflow, '');
    /* hidden=true פעמיים ברצף לא מוריד את המונה מתחת לאפס */
    modal.hidden = true;
    await sleep(10);
    modal.hidden = true;
    await sleep(10);
    $('#home-mic-card').click();
    await sleep(20);
    assert.equal(d.body.style.overflow, 'hidden', 'פתיחה שנייה לא נעלה');
    $('#no-idea-close-btn').click();
    await sleep(10);
    assert.equal(d.body.style.overflow, '', 'הגלילה נשארה נעולה');
  });

  test('פס תצוגת הלקוחה: המסכים החדשים פתוחים לכולן, אז אין הסתייגות', () => {
    const bar = $('.preview-bar');
    assert.ok(bar, 'אין פס תצוגת לקוחה');
    assert.ok(!/מוצגים כרגע רק לך/.test(bar.textContent));
  });

  test('"חזרה לאפליקציה" מהמדריך חוזרת למסך שממנו נכנסו', async () => {
    const router = await import('../js/view-router.js');
    router.showView('inspiration');
    router.showView('roadmap');
    assert.equal($('#embed-back-btn').hidden, false);
    $('#embed-back-btn').click();
    assert.equal($('#inspiration-view').hidden, false, 'לא חזר למאגר ההשראה');
    router.showView('home');
    router.showView('content-plan');
    $('#embed-back-btn').click();
    assert.equal($('#home-view').hidden, false, 'לא חזר לבית');
  });

  test('"הפרטים שלי" בתפריט: פותח את הפרטים השמורים, שומר תחום וקהל', async () => {
    const entry = $('#tab-my-details');
    assert.ok(entry, 'אין "הפרטים שלי" בתפריט');
    assert.ok(entry.closest('#view-tabs'));
    entry.click();
    await until(() => !$('#my-details-modal').hidden && !$('#my-details-save-btn').disabled, 'החלון נפתח');
    assert.equal($('#my-details-business').value, 'מאמנת כושר');
    assert.equal($('#my-details-primary').value, 'נשים');
    assert.equal(d.body.style.overflow, 'hidden');
    const domain = $('#my-details-domain');
    domain.value = 'כושר ותזונה';
    domain.dispatchEvent(new w.Event('change'));
    assert.equal($('#my-details-sub-wrap').hidden, false);
    $('#my-details-sub').value = 'פילאטיס';
    $('#my-details-primary').value = 'נשים אחרי לידה';
    $('#my-details-form').dispatchEvent(new w.Event('submit', { cancelable: true }));
    await until(() => $('#my-details-modal').hidden, 'נסגר אחרי שמירה');
    const last = saved.filter((s) => s.path === 'profiles/u1').at(-1);
    assert.equal(last.data.primaryAudience, 'נשים אחרי לידה');
    assert.equal(last.data.videoAssistantDomain, 'כושר ותזונה');
    assert.equal(last.data.videoAssistantSubCategory, 'פילאטיס');
    assert.equal(last.data.business, 'מאמנת כושר');
  });

  test('בלי בחירת תחום, השמירה לא מוחקת תחום שכבר שמור', async () => {
    delete profile.videoAssistantDomain;
    $('#tab-my-details').click();
    await until(() => !$('#my-details-save-btn').disabled, 'נטען');
    assert.equal($('#my-details-domain').value, '');
    $('#my-details-form').dispatchEvent(new w.Event('submit', { cancelable: true }));
    await until(() => $('#my-details-modal').hidden, 'נסגר');
    const last = saved.filter((s) => s.path === 'profiles/u1').at(-1);
    assert.equal('videoAssistantDomain' in last.data, false);
  });

  test('חוות דעת: רק רווחים מקבלים הודעה, ולחיצה כפולה שולחת פעם אחת', async () => {
    const input = $('#feedback-input');
    input.value = '   ';
    $('#feedback-form').dispatchEvent(new w.Event('submit', { cancelable: true }));
    assert.match([...d.querySelectorAll('.toast')].at(-1).textContent, /ההודעה ריקה/);
    let sent = 0;
    let release;
    globalThis.__fbStub.addDoc = (col) => {
      if (col.path === 'feedback') sent += 1;
      return new Promise((r) => { release = () => r({ id: 'f1' }); });
    };
    input.value = 'אחלה אפליקציה';
    $('#feedback-form').dispatchEvent(new w.Event('submit', { cancelable: true }));
    $('#feedback-form').dispatchEvent(new w.Event('submit', { cancelable: true }));
    await sleep(10);
    assert.equal(sent, 1, 'נשלח פעמיים');
    assert.equal($('#feedback-form button[type="submit"]').disabled, true);
    release();
    await until(() => !$('#feedback-success').hidden, 'הודעת תודה');
    assert.equal(input.value, '');
    globalThis.__fbStub.addDoc = async () => ({ id: 'n1' });
  });
});

describe('טקסט וקוד', () => {
  test('רק חלון העדכון: אין יותר הודעת "גרסה חדשה מוכנה"', () => {
    const app = read('../js/app.js').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/גרסה חדשה מוכנה/.test(app));
    assert.ok(!/updatefound/.test(app));
  });

  test('שמות הקוביות: אין עוד "אין לי רעיון" על כפתורי הגרלה', () => {
    const html = read('../index.html');
    assert.match(html, /id="random-idea-btn"[^>]*>🎲 להגריל רעיון מהמאגר</);
    const va = read('../js/video-assistant.js');
    assert.match(va, />🎲 להגריל רעיון מהבנק שלי</);
    assert.ok(!/אין לי רעיון\? להגריל/.test(va));
  });

  test('ניסוח: יחיד/רבים, הקלדה, פנייה לכולם', () => {
    const av = read('../js/archive-view.js');
    assert.ok(!/בתחלת/.test(av));
    assert.match(av, /בתחילת הדרך/);
    assert.ok(!/פני למאיה/.test(read('../js/subscription-notice.js')));
    const va = read('../js/video-assistant.js');
    assert.ok(!/אתן פונות/.test(va));
    assert.ok(!/שתי שורות שנמלא/.test(va));
  });

  test('אין alert() של הדפדפן בטופס הרעיון', () => {
    const src = read('../js/idea-form.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/(^|[^\w.])alert\(/.test(src));
  });

  test('מפת הדרכים: הכתובת הסופית עם מספר גרסה', () => {
    const html = read('../index.html');
    assert.ok(!/mayakislev-ux\.github\.io\/lehiyot-brand/.test(html));
    assert.match(html, /src="https:\/\/mayakislev\.co\.il\/מפת-דרכים-ליצירת-תוכן\.html\?v=\d+"/);
  });

  test('קוד מת ירד: אין כניסה נסתרת להתקדמות ואין רענון לבונה שלא נגיש', () => {
    const app = read('../js/app.js');
    assert.ok(!/tab-progress/.test(app));
    assert.ok(!/tab-progress/.test(read('../index.html')));
    assert.ok(!/refreshContentPlanGate/.test(app));
  });

  test('שטחי לחיצה של 44px לפחות', () => {
    const shelves = read('../css/ideas-shelves.css');
    const tool = shelves.match(/\.calm-card__tool \{([^}]*)\}/)[1];
    assert.match(tool, /width: 44px;/);
    assert.match(tool, /height: 44px;/);
    assert.match(shelves.match(/\.cat-panel__close \{([^}]*)\}/)[1], /min-height: 44px;/);
    assert.match(shelves.match(/\.done-toolbar__btn \{([^}]*)\}/)[1], /min-height: 44px;/);
    const css = read('../css/style.css');
    assert.match(css, /\.app-header\.scrolled \.mobile-menu-btn::after,\s*\.app-header\.scrolled \.theme-toggle-btn::after \{[^}]*inset: -6px;/);
  });

  test('בלי מקף ארוך בטקסטים החדשים', () => {
    for (const f of ['../js/my-details.js', '../js/feedback.js']) {
      const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
      assert.ok(!/[—–]/.test(src), f);
    }
  });
});
