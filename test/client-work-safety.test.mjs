/* 04/11/2026: ביקורת על עבודה של לקוחות שהולכת לאיבוד בלי מילה. כל בדיקה
   כאן מריצה את הקוד האמיתי ב-jsdom ולוחצת על הכפתורים האמיתיים:

   1. תוכנית חימום נשמרת לבד כשהיא מוכנה, ו"חזרה לטבלה" שואלת רק כשלא נשמרה.
   2. עריכת טקסט בתוכנית שמורה נשמרת מיד, כמו סימון.
   4. הוספה מהירה מנקה את התיבה רק אחרי שהשמירה הצליחה.
   5. טופס "רעיון חדש" לא נסגר בנגיעה ברקע כשכתוב בו משהו, בלי לשאול.
   6. בחירת רעיון בעוזר רואה רעיונות חדשים, ולא מגרילה רעיון שנמחק.
   7. שמירת משבצת בטבלת הסטורי לא סוגרת את השדה שעברו אליו. */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { register, createRequire } from 'node:module';

const JSDOM_PATH = 'C:/dev/portal-sales/node_modules/jsdom/lib/api.js';
const hasJsdom = existsSync(JSDOM_PATH);

const store = new Map();
const calls = { addDoc: [], updateDoc: [], setDoc: [] };
const fail = { addDoc: null, updateDoc: null };
const gate = { addDoc: null };
let nextId = 1;

const USER = { uid: 'u1', email: 'client@example.com', getIdToken: async () => 'tok' };

function installFirebaseStub() {
  const path = (...parts) => parts.filter((p) => typeof p === 'string').join('/');
  globalThis.__fbStub = {
    initializeApp: () => ({}),
    getAuth: () => ({ currentUser: USER, authStateReady: async () => {} }),
    getRedirectResult: () => Promise.resolve(null),
    onAuthStateChanged: (a, cb) => { setTimeout(() => cb(USER), 0); return () => {}; },
    getFirestore: () => ({ __db: true }),
    enableIndexedDbPersistence: () => Promise.resolve(),
    getFunctions: () => ({}),
    getStorage: () => ({}),
    collection: (base, ...parts) => ({ path: base && base.path ? path(base.path, ...parts) : path(...parts) }),
    doc: (base, ...parts) => ({ path: base && base.path ? path(base.path, ...parts) : path(...parts) }),
    query: (col) => col,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    serverTimestamp: () => Date.now(),
    getDoc: async (ref) => ({ exists: () => store.has(ref.path), data: () => structuredClone(store.get(ref.path)), id: ref.path.split('/').pop() }),
    setDoc: async (ref, data, opts) => {
      calls.setDoc.push({ path: ref.path, data: structuredClone(data) });
      const prev = opts && opts.merge ? (store.get(ref.path) || {}) : {};
      store.set(ref.path, structuredClone({ ...prev, ...data }));
    },
    addDoc: async (col, data) => {
      calls.addDoc.push({ path: col.path, data: structuredClone(data) });
      if (gate.addDoc) await gate.addDoc;
      if (fail.addDoc) throw fail.addDoc;
      const id = `d${nextId++}`;
      store.set(`${col.path}/${id}`, structuredClone(data));
      return { id };
    },
    updateDoc: async (ref, data) => {
      calls.updateDoc.push({ path: ref.path, data: structuredClone(data) });
      if (fail.updateDoc) throw fail.updateDoc;
      store.set(ref.path, structuredClone({ ...(store.get(ref.path) || {}), ...data }));
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
    httpsCallable: () => async () => ({ data: {} }),
  };
}

async function until(fn, label, tries = 400) {
  for (let i = 0; i < tries; i += 1) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.fail(`לא קרה: ${label}`);
}
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

const PLAN = {
  week1: [{ day: 'יום א', law: 'חוק הראי', idea: 'רעיון ראשון' }],
  week3: [{ label: 'בלוק', stage: 'הכנה', stories: [{ format: 'סקר', idea: 'סטורי ראשון' }] }],
};

function sse(plan) {
  return new Response(`data: ${JSON.stringify({ done: true, plan, missingInfo: [] })}\n\n`, { status: 200 });
}

const SLOT_AUD = {
  id: 'a1',
  name: 'קהל',
  primary: true,
  ongoing: [{
    key: 'r1', tool: 'כלי', source: '', topic: 'נושא', bullets: [], fromSheet: false,
    slots: [{ key: 's1', label: 'משבצת אחת' }, { key: 's2', label: 'משבצת שתיים' }],
  }],
  sale: [],
};

let $;
let mods;

describe('עבודה של לקוחה לא הולכת לאיבוד (jsdom)', { skip: hasJsdom ? false : 'jsdom לא מותקן במחשב הזה' }, () => {
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
      'KeyboardEvent', 'MouseEvent', 'FocusEvent', 'sessionStorage', 'localStorage', 'getComputedStyle', 'requestAnimationFrame',
      'cancelAnimationFrame', 'history', 'location', 'DocumentFragment', 'HTMLTextAreaElement', 'HTMLInputElement']) {
      Object.defineProperty(globalThis, k, { value: k === 'window' ? w : w[k], configurable: true, writable: true });
    }
    w.HTMLMediaElement && (w.HTMLMediaElement.prototype.play = () => Promise.resolve());
    store.set('profiles/u1', { name: 'מיכל', pronoun: 'את', business: 'שיווק', primaryAudience: 'בעלות עסקים' });
    store.set('storyTables/u1', { audiences: [SLOT_AUD], answers: {}, overrides: {} });

    const confirm = await import('../js/confirm-dialog.js');
    confirm.wireConfirmDialog();
    const warming = await import('../js/warming.js');
    warming.wireWarmingView();
    const storyTable = await import('../js/story-table.js');
    await storyTable.wireStoryTableView();
    const archive = await import('../js/archive-view.js');
    archive.wireArchiveControls(() => {});
    const ideaForm = await import('../js/idea-form.js');
    ideaForm.wireIdeaForm();
    const va = await import('../js/video-assistant.js');
    va.wireVideoAssistantView();
    const router = await import('../js/view-router.js');
    const update = await import('../js/update-check.js');
    mods = { ideaForm, router, update };
    $ = (sel) => document.querySelector(sel);
    await until(() => $('#story-table .st-slot'), 'טבלת הסטורי לא נטענה');
  });

  const confirmOpen = () => !$('#confirm-dialog').hidden;
  const lastToast = () => {
    const all = document.querySelectorAll('.toast');
    return all.length ? all[all.length - 1].textContent : '';
  };

  async function buildPlan() {
    globalThis.fetch = async () => sse(structuredClone(PLAN));
    $('#warming-product').value = 'קורס';
    $('#warming-audience').value = 'מתחילות';
    $('#warming-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
    await until(() => $('.warming-day-row'), 'התוכנית לא הוצגה');
  }

  test('1. תוכנית שנבנתה נשמרת לבד, ו"חזרה לטבלה" לא שואלת', async () => {
    const before = calls.addDoc.length;
    await buildPlan();
    await until(() => calls.addDoc.length === before + 1, 'התוכנית לא נשמרה אוטומטית');
    assert.equal(calls.addDoc.at(-1).path, 'warmingPlans');
    assert.deepEqual(calls.addDoc.at(-1).data.plan, PLAN);
    await until(() => !$('#warming-result').dataset.unsaved, 'נשאר סימון "לא נשמר"');
    assert.equal(mods.update.hasUnsavedWork(), false);

    $('#st-back-to-table').click();
    await tick();
    assert.equal(confirmOpen(), false, 'שאלה מיותרת על תוכנית שכבר נשמרה');
    assert.equal($('#warming-result').innerHTML, '');
    assert.equal($('#story-table-panel').hidden, false);
  });

  test('1. כשהשמירה האוטומטית נכשלה, החזרה שואלת, ו"ביטול" משאיר את התוכנית', async () => {
    fail.addDoc = Object.assign(new Error('offline'), { code: 'unavailable' });
    try {
      await buildPlan();
      await until(() => lastToast().includes('לא נשמרה אוטומטית'), 'אין הודעה על כישלון השמירה');
      assert.equal($('#warming-result').dataset.unsaved, '1');
      assert.equal(mods.update.hasUnsavedWork(), true, 'בדיקת העדכון לא יודעת שיש עבודה פתוחה');

      $('#st-back-to-table').click();
      await until(confirmOpen, 'אין שאלה לפני מחיקת תוכנית שלא נשמרה');
      $('#confirm-dialog-cancel').click();
      await tick();
      assert.ok($('.warming-day-row'), 'התוכנית נמחקה למרות "ביטול"');

      $('#st-back-to-table').click();
      await until(confirmOpen, 'השאלה לא חזרה');
      $('#confirm-dialog-ok').click();
      await until(() => $('#warming-result').innerHTML === '', 'החזרה לא בוצעה אחרי אישור');
      assert.equal(mods.update.hasUnsavedWork(), false);
    } finally {
      fail.addDoc = null;
    }
  });

  test('1. חזרה בזמן שהשמירה האוטומטית באוויר מחכה לה, ולא שואלת "לא נשמרה"', async () => {
    let release;
    gate.addDoc = new Promise((r) => { release = r; });
    try {
      const before = calls.addDoc.length;
      await buildPlan();
      await until(() => calls.addDoc.length === before + 1, 'השמירה לא התחילה');
      $('#st-back-to-table').click();
      await tick();
      assert.equal(confirmOpen(), false, 'שאלה "לא נשמרה" על תוכנית שבאמצע שמירה');
      assert.ok($('.warming-day-row'), 'המסך נזרק לפני שהשמירה הסתיימה');
      release();
      await until(() => $('#warming-result').innerHTML === '', 'החזרה לא בוצעה אחרי השמירה');
      assert.equal(confirmOpen(), false);
    } finally {
      gate.addDoc = null;
    }
  });

  test('2. עריכת טקסט בתוכנית שמורה נשמרת מיד, ו-blur בלי שינוי לא כותב', async () => {
    await buildPlan();
    await until(() => !$('#warming-result').dataset.unsaved, 'לא נשמרה');
    const id = calls.addDoc.length && [...store.keys()].filter((k) => k.startsWith('warmingPlans/')).at(-1);
    const before = calls.updateDoc.length;

    const idea = $('.warming-day-idea');
    idea.dispatchEvent(new window.FocusEvent('blur'));
    await tick();
    assert.equal(calls.updateDoc.length, before, 'blur בלי שינוי כתב לשרת');

    idea.textContent = 'רעיון אחרי עריכה';
    idea.dispatchEvent(new window.FocusEvent('blur'));
    await until(() => calls.updateDoc.length === before + 1, 'העריכה לא נשמרה');
    assert.equal(calls.updateDoc.at(-1).path, id);
    assert.equal(store.get(id).plan.week1[0].idea, 'רעיון אחרי עריכה');

    const story = $('.warming-story-idea');
    story.textContent = 'סטורי אחרי עריכה';
    story.dispatchEvent(new window.FocusEvent('blur'));
    await until(() => calls.updateDoc.length === before + 2, 'עריכת הסטורי לא נשמרה');
    assert.equal(store.get(id).plan.week3[0].stories[0].idea, 'סטורי אחרי עריכה');
  });

  test('7. שמירת משבצת לא סוגרת את המשבצת שעברו אליה', async () => {
    const slots = document.querySelectorAll('#story-table .st-slot');
    assert.equal(slots.length, 2);
    const [s1, s2] = slots;
    s1.querySelector('.st-slot__add').click();
    const t1 = s1.querySelector('textarea');
    t1.value = 'שורה ראשונה';
    s2.querySelector('.st-slot__add').click();
    const t2 = s2.querySelector('textarea');
    t2.value = 'באמצע הקלדה';
    t1.dispatchEvent(new window.FocusEvent('blur'));
    await until(() => (store.get('storyTables/u1').overrides || {}).a1, 'המשבצת לא נשמרה');
    await tick();
    assert.ok(t2.isConnected, 'הטבלה צוירה מחדש והשדה השני נזרק');
    assert.equal(t2.closest('.st-field').hidden, false, 'השדה שעברו אליו נסגר');
    assert.equal(t2.value, 'באמצע הקלדה');
    assert.match(s1.querySelector('.st-slot__body').textContent, /שורה ראשונה/);
    assert.equal(s1.querySelector('.st-slot__add').textContent, 'לערוך');
  });

  test('4. הוספה מהירה שנדחתה משאירה את הטקסט ואת הטיוטה, ומסבירה', async () => {
    const input = $('#quick-add-input');
    input.value = 'רעיון שלא יאבד';
    input.dispatchEvent(new window.Event('input'));
    fail.addDoc = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    try {
      $('#quick-add-btn').click();
      await until(() => lastToast().includes('הרעיון לא נשמר'), 'אין הודעה על כישלון');
      assert.equal(input.value, 'רעיון שלא יאבד', 'התיבה התרוקנה למרות שהשמירה נכשלה');
      assert.equal(localStorage.getItem('quick-add-draft'), 'רעיון שלא יאבד', 'הטיוטה נמחקה');
      assert.equal($('#quick-add-btn').disabled, false, 'הכפתור נשאר נעול');
    } finally {
      fail.addDoc = null;
    }
    const before = calls.addDoc.length;
    $('#quick-add-btn').click();
    await until(() => input.value === '', 'אחרי שמירה מוצלחת התיבה לא התרוקנה');
    assert.equal(calls.addDoc.length, before + 1);
    assert.equal(calls.addDoc.at(-1).data.title, 'רעיון שלא יאבד');
    assert.equal(localStorage.getItem('quick-add-draft'), null);
  });

  test('5. נגיעה ברקע של טופס עם תוכן שואלת קודם, וטופס ריק נסגר מיד', async () => {
    const modal = $('#idea-modal');
    mods.ideaForm.openAddModal();
    modal.click();
    await tick();
    assert.equal(modal.hidden, true, 'טופס ריק לא נסגר');
    assert.equal(confirmOpen(), false);

    mods.ideaForm.openAddModal();
    $('#field-title').value = 'רעיון ארוך שכתבתי בטלפון';
    modal.click();
    await until(confirmOpen, 'אין שאלה לפני מחיקת מה שנכתב');
    assert.equal(modal.hidden, false, 'הטופס נסגר לפני שענו');
    $('#confirm-dialog-cancel').click();
    await tick();
    assert.equal(modal.hidden, false, '"להמשיך לכתוב" סגר את הטופס');
    assert.equal($('#field-title').value, 'רעיון ארוך שכתבתי בטלפון');

    $('#idea-modal-close-x').click();
    await until(confirmOpen, 'ה-X לא שואל');
    $('#confirm-dialog-ok').click();
    await until(() => modal.hidden, 'אישור לא סגר');
  });

  test('6. "תמצאו לי רעיון" טוען את הבנק מחדש בכל פתיחה', async () => {
    for (const k of [...store.keys()]) if (k.startsWith('ideas/')) store.delete(k);
    store.set('ideas/old', { title: 'רעיון ישן', hookText: '', ownerUid: 'u1' });
    const enterAtChoice = async () => {
      store.set('videoAssistantSessions/u1', {
        screen: 'idea-source-choice', branch: 'idea', history: [], updatedAt: Date.now(),
      });
      mods.router.showView('video-assistant');
      $('#hub-link-video-assistant').click();
      await until(() => $('#va-pull-idea-btn'), 'מסך מאיפה הרעיון');
    };

    await enterAtChoice();
    $('#va-pull-idea-btn').click();
    await until(() => $('#va-idea-title'), 'הרעיון לא הוגרל');
    assert.equal($('#va-idea-title').textContent, 'רעיון ישן');

    // נמחק אחרי הטעינה הראשונה, ורעיון חדש נוסף
    store.set('ideas/old', { title: 'רעיון ישן', hookText: '', ownerUid: 'u1', deletedAt: Date.now() });
    store.set('ideas/new', { title: 'רעיון חדש', hookText: '', ownerUid: 'u1' });

    await enterAtChoice();
    $('#va-pull-idea-btn').click();
    await until(() => $('#va-idea-title'), 'הרעיון לא הוגרל בפעם השנייה');
    assert.equal($('#va-idea-title').textContent, 'רעיון חדש', 'הוגרל רעיון שנמחק / החדש לא נראה');
  });
});

/* בלי jsdom: הנוסח שתלוי במנוי, והסיור שמדלג על לשוניות שאין לה */
test('8. סיור ההיכרות של מנוי רפרנסים לא מצביע על לשוניות מוסתרות', async () => {
  const src = readFileSync(new URL('../js/welcome-tour.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  const hiddenForRefs = [...css.matchAll(/body\[data-plan="refs"\] (#tab-[\w-]+)/g)].map((m) => m[1]);
  assert.ok(hiddenForRefs.includes('#tab-home') && hiddenForRefs.includes('#tab-guide'));
  // כל שלב שמצביע על לשונית מוסתרת למנוי רפרנסים מסומן hideFor: 'refs'
  for (const t of hiddenForRefs) {
    const i = src.indexOf(`target: '${t}'`);
    if (i === -1) continue;
    assert.match(src.slice(i, i + 80), /hideFor: 'refs'/, `${t} לא מדולג אצל מנוי רפרנסים`);
  }
  assert.doesNotMatch(src, /את\/ה|מכיר\/ה/, 'נוסח לא כוללני');
});

test('8. אין יותר הפניה לכרטיס הכלי שהוסר ב-26/10', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /כרטיס נפרד ב"כלי עבודה"/);
  assert.match(html, /class="va-back-refs">חזרה<span class="va-back-tail"> למאגר ההשראה</);
});
