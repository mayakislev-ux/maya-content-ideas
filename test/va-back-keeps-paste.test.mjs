/* 04/11/2026 (סקירה): כפתור החזרה בעוזר מחק עבודה שהודבקה.
   - שכפול: חזרה מ"להקריא בקול" מחקה את התסריט שהודבק (finalScript חזר
     ל-null), והשמירה שאחריה דרסה אותו גם בפריט ב"התסריטים שלי".
   - מאפס: חזרה מחיזוק ההוק רוקנה את ההוק, ותיבות ההדבקה (הוק, תסריט, "מה
     יש לך להוסיף") תמיד צוירו ריקות במקום מהסטייט.
   כאן לוחצים בעוזר האמיתי (video-assistant.js) ב-jsdom: מדביקים, ממשיכים,
   חוזרים, ובודקים את התיבה, את הסשן ואת הפריט השמור. */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { register, createRequire } from 'node:module';
import { INITIAL_STATE, nextStep } from '../js/video-assistant-flow.js';

const JSDOM_PATH = 'C:/dev/portal-sales/node_modules/jsdom/lib/api.js';
const hasJsdom = existsSync(JSDOM_PATH);

const store = new Map();
const SESSION = 'videoAssistantSessions/u1';

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
    httpsCallable: () => async () => ({ data: { hook: 'ההוק המקורי' } }),
  };
}

async function until(fn, label, tries = 400) {
  for (let i = 0; i < tries; i += 1) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.fail(`לא קרה: ${label}`);
}

function walk(start, actions) {
  return actions.reduce((s, a) => nextStep(s, a), start);
}

const item = (id) => store.get(`videoAssistantScripts/u1/items/${id}`);

let $;

describe('חזרה אחורה לא מוחקת מה שהודבק (jsdom)', { skip: hasJsdom ? false : 'jsdom לא מותקן במחשב הזה' }, () => {
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
    /* ב-jsdom אין AudioContext. בלי צליל, הצלחה (celebrate) לא נוגעת בו. */
    w.localStorage.setItem('video-assistant-muted', '1');
    store.set('profiles/u1', { name: 'מיכל', pronoun: 'את', business: 'שיווק', primaryAudience: 'בעלות עסקים' });
    const va = await import('../js/video-assistant.js');
    const router = await import('../js/view-router.js');
    va.wireVideoAssistantView();
    router.showView('video-assistant');
    $ = (sel) => document.querySelector(sel);
  });

  const type = (el, value) => { el.value = value; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
  const back = () => $('#va-back-btn').click();

  async function open(state, firstBox) {
    store.set(SESSION, { ...structuredClone(state), updatedAt: Date.now() });
    $('#hub-link-video-assistant').click();
    await until(() => $(firstBox), `המסך עם ${firstBox}`);
  }

  test('שכפול: תסריט שהודבק שורד חזרה מ"להקריא בקול", בתיבה, בסשן ובפריט השמור', async () => {
    const start = walk({ ...INITIAL_STATE, history: [] }, [
      { type: 'CHOOSE_REFERENCE' }, { type: 'CHOOSE_HAS_REFERENCE' },
    ]);
    await open({ ...start, transcript: 'ההוק המקורי. ועוד תמלול', openingHook: 'ההוק המקורי' }, '#va-transcript-input');
    $('#va-transcribe-done-btn').click();

    /* הוק → חזרה: ההוק בתיבה */
    await until(() => $('#va-hook-input'), 'מסך ההוק');
    type($('#va-hook-input'), 'הוק שהודבק');
    $('#va-hook-chosen-btn').click();
    await until(() => $('#va-dupadd-input'), 'מסך מה להוסיף');
    back();
    await until(() => $('#va-hook-input'), 'חזרה למסך ההוק');
    assert.equal($('#va-hook-input').value, 'הוק שהודבק', 'ההוק נמחק בחזרה');
    $('#va-hook-chosen-btn').click();

    /* מה להוסיף → תסריט → להקריא → חזרה */
    await until(() => $('#va-dupadd-input'), 'מסך מה להוסיף');
    type($('#va-dupadd-input'), 'הסיפור שלי');
    $('#va-dupadd-done-btn').click();
    await until(() => $('#va-prompt2-script-input'), 'מסך כתיבת התסריט');
    type($('#va-prompt2-script-input'), 'התסריט הסופי שהודבק');
    $('#va-script-ready-btn').click();
    await until(() => $('#va-read-done-btn'), 'מסך להקריא בקול');
    const id = store.get(SESSION).scriptId;
    assert.ok(id, 'לא נוצר פריט');

    back();
    await until(() => $('#va-prompt2-script-input'), 'חזרה למסך התסריט');
    assert.equal($('#va-prompt2-script-input').value, 'התסריט הסופי שהודבק', 'התיבה ריקה אחרי חזרה');
    await until(() => store.get(SESSION).screen === 'prompt2', 'הסשן לא נשמר');
    assert.equal(store.get(SESSION).finalScript, 'התסריט הסופי שהודבק', 'התסריט נמחק מהסשן');
    await until(() => item(id).state.screen === 'prompt2', 'הפריט לא נשמר');
    assert.equal(item(id).state.finalScript, 'התסריט הסופי שהודבק', 'התסריט נדרס ב"התסריטים שלי"');

    /* עוד חזרה: "מה להוסיף" מוצג מהסטייט */
    back();
    await until(() => $('#va-dupadd-input'), 'חזרה למה להוסיף');
    assert.equal($('#va-dupadd-input').value, 'הסיפור שלי');
    $('#va-dupadd-done-btn').click();
    await until(() => $('#va-prompt2-script-input'), 'שוב מסך התסריט');
    assert.equal($('#va-prompt2-script-input').value, 'התסריט הסופי שהודבק');

    /* קדימה: להקריא מציג אותו */
    $('#va-script-ready-btn').click();
    await until(() => $('.va-read-script'), 'התסריט במסך להקריא');
    assert.equal($('.va-read-script').textContent, 'התסריט הסופי שהודבק');
  });

  test('מאפס: הוק שהודבק שורד חזרה מחיזוק ההוק, וגם החיזוק עצמו', async () => {
    /* 10/11/2026: סדר חדש. רעיון ומסר ← מגילה ← אריזה ← פורמט ← הוק */
    const start = walk({ ...INITIAL_STATE, history: [], branch: 'idea', screen: 'idea-sharpen', ideaDescription: 'גבות' }, [
      { type: 'IDEA_SHARPENED', idea: 'גבות דקות מזקינות', startingPoint: 'סיפור אישי' },
      { type: 'SCRATCH_DUMP_READY', text: 'כל מה שיש לי להגיד על גבות' },
      { type: 'PACKAGING_CHOSEN', packaging: 'לפני ואחרי' },
      { type: 'FORMAT_SELECTED', format: 'דיבור למצלמה' },
      { type: 'NEEDS_SCRIPT_YES' },
    ]);
    assert.equal(start.screen, 'scratch-hook');
    await open(start, '#va-scratch-hook-input');
    type($('#va-scratch-hook-input'), 'ההוק מאפס');
    $('#va-scratch-hook-done-btn').click();
    await until(() => $('#va-scratch-reinforce-input'), 'מסך חיזוק ההוק');
    const id = store.get(SESSION).scriptId;

    back();
    await until(() => $('#va-scratch-hook-input'), 'חזרה למסך ההוק');
    assert.equal($('#va-scratch-hook-input').value, 'ההוק מאפס', 'ההוק נמחק בחזרה');
    await until(() => store.get(SESSION).screen === 'scratch-hook', 'הסשן לא נשמר');
    assert.equal(store.get(SESSION).hook, 'ההוק מאפס');
    assert.equal(item(id).state.hook, 'ההוק מאפס', 'ההוק נדרס ב"התסריטים שלי"');

    $('#va-scratch-hook-done-btn').click();
    await until(() => $('#va-scratch-reinforce-input'), 'שוב חיזוק');
    type($('#va-scratch-reinforce-input'), 'החיזוק');
    $('#va-scratch-reinforce-done-btn').click();
    await until(() => $('#va-scratch-script-input'), 'מסך הזיקוק');
    back();
    await until(() => $('#va-scratch-reinforce-input'), 'חזרה לחיזוק');
    assert.equal($('#va-scratch-reinforce-input').value, 'החיזוק');
  });

  test('תיבה שנוקתה בכוונה לא מתמלאת מחדש מהסטייט', async () => {
    const start = walk({ ...INITIAL_STATE, history: [], branch: 'idea', screen: 'idea-sharpen', ideaDescription: 'גבות' }, [
      { type: 'IDEA_SHARPENED', idea: 'גבות', startingPoint: 'כללי' },
      { type: 'SCRATCH_DUMP_READY', text: 'שפיכה' },
      { type: 'PACKAGING_CHOSEN', packaging: 'אריזה' },
      { type: 'FORMAT_SELECTED', format: 'דיבור למצלמה' },
      { type: 'NEEDS_SCRIPT_YES' },
      { type: 'SCRATCH_HOOK_CHOSEN', hook: 'הוק ישן' },
      { type: 'BACK' },
    ]);
    assert.equal(start.hook, 'הוק ישן');
    await open(start, '#va-scratch-hook-input');
    assert.equal($('#va-scratch-hook-input').value, 'הוק ישן');
    type($('#va-scratch-hook-input'), '');
    await until(() => (store.get(SESSION).drafts || {})['scratch-hook|va-scratch-hook-input'] === '', 'הטיוטה הריקה לא נשמרה');
    $('#hub-link-video-assistant').click();
    await until(() => $('#va-scratch-hook-input') && $('.cosmic-resume-bar'), 'ציור מחדש');
    assert.equal($('#va-scratch-hook-input').value, '', 'הטיוטה הריקה נדרסה בהוק הישן');
  });
});

test('BACK במכונת המצבים: שומר מה שהודבק, מחליף בנוסח החדש, ולא סוחב לפתיחה', () => {
  let s = walk({ ...INITIAL_STATE, history: [] }, [
    { type: 'CHOOSE_REFERENCE' }, { type: 'CHOOSE_HAS_REFERENCE' },
    { type: 'CONFIRM_DONE' }, { type: 'HOOK_CHOSEN', hook: 'הוק' }, { type: 'HER_WORDS_SUBMITTED', text: 'שלי' },
    { type: 'SCRIPT_READY', text: 'א' },
  ]);
  s = nextStep(s, { type: 'BACK' });
  assert.equal(s.screen, 'prompt2');
  assert.equal(s.finalScript, 'א');
  s = nextStep(s, { type: 'SCRIPT_READY', text: 'ב' });
  s = nextStep(s, { type: 'BACK' });
  assert.equal(s.finalScript, 'ב', 'הנוסח הישן חזר במקום החדש');
  s = walk(s, [{ type: 'BACK' }, { type: 'BACK' }]);
  assert.equal(s.screen, 'prompt1');
  assert.equal(s.hook, 'הוק');
  s = walk(s, [{ type: 'BACK' }, { type: 'BACK' }, { type: 'BACK' }, { type: 'BACK' }]);
  assert.equal(s.screen, 'opening');
  assert.equal(s.hook, null, 'חזרה עד הפתיחה סחבה את ההוק לסרטון הבא');
  assert.equal(s.finalScript, null);
});

test('BACK מהסיכום לשכתוב הסצנה: התסריט המקורי נשאר, והשכתוב חוזר לתיבה שלו', () => {
  let s = walk({ ...INITIAL_STATE, history: [], branch: 'scratch', screen: 'scratch-distill', ideaDescription: 'x' }, [
    { type: 'SCRATCH_SCRIPT_READY', text: 'מקורי' }, { type: 'SCRATCH_SCENE_DONE', text: 'משוכתב' },
  ]);
  s = nextStep(s, { type: 'BACK' });
  assert.equal(s.screen, 'scratch-scene');
  assert.equal(s.draftScript, 'מקורי');
  assert.equal(s.sceneRewrite, 'משוכתב');
});

/* סקירה: חזרה אל מחוץ לשלב הכתיבה היא בסיס חדש. הוק ותסריט שנכתבו על
   הרפרנס או הרעיון הקודם לא נסחבים אליו. */
test('BACK אל מחוץ לשלב הכתיבה לא סוחב הוק ותסריט', () => {
  let s = walk({ ...INITIAL_STATE, history: [] }, [
    { type: 'CHOOSE_REFERENCE' }, { type: 'CHOOSE_HAS_REFERENCE' },
    { type: 'CONFIRM_DONE' }, { type: 'HOOK_CHOSEN', hook: 'הוק' }, { type: 'HER_WORDS_SUBMITTED', text: 'שלי' },
    { type: 'SCRIPT_READY', text: 'תסריט' },
  ]);
  s = walk(s, [{ type: 'BACK' }, { type: 'BACK' }, { type: 'BACK' }, { type: 'BACK' }]);
  assert.equal(s.screen, 'transcribe');
  assert.equal(s.finalScript, 'תסריט', 'בדיקת התמלול באמצע מחקה את התסריט');
  s = nextStep(s, { type: 'BACK' });
  assert.equal(s.screen, 'reference-source-choice');
  assert.equal(s.hook, null);
  assert.equal(s.finalScript, null);

  /* 10/11/2026: המגילה נכתבת עכשיו לפני הקריאייטיב, ולכן היא שייכת לשלב
     שלפני "צריך תסריט?" ונשארת שם. ההוק נכתב אחריו, ולא נסחב אליו. */
  let r = walk({ ...INITIAL_STATE, history: [], branch: 'idea', screen: 'idea-sharpen', ideaDescription: 'x' }, [
    { type: 'IDEA_SHARPENED', idea: 'x', startingPoint: 'כללי' }, { type: 'SCRATCH_DUMP_READY', text: 'שפיכה' },
    { type: 'PACKAGING_CHOSEN', packaging: 'אריזה' }, { type: 'FORMAT_SELECTED', format: 'דיבור למצלמה' },
    { type: 'SCRATCH_HOOK_CHOSEN', hook: 'הוק' },
  ]);
  r = nextStep(r, { type: 'BACK' });
  assert.equal(r.screen, 'scratch-hook');
  assert.equal(r.hook, 'הוק');
  assert.equal(r.rawDump, 'שפיכה');
  /* 11/11/2026: הפורמט, הקריאייטיב והמגילה הם עכשיו חלק משלב הכתיבה, ולכן
     חזרה עד מסך הרעיון שומרת את כל מה שנכתב (סוכני הבדיקה מצאו שזה נמחק) */
  r = nextStep(r, { type: 'BACK' });
  assert.equal(r.screen, 'format-choice');
  assert.equal(r.hook, 'הוק');
  r = nextStep(r, { type: 'BACK' });
  assert.equal(r.screen, 'creative-packaging');
  assert.equal(r.packaging, 'אריזה', 'הקריאייטיב שהודבק נמחק בחזרה מהפורמט');
  r = nextStep(nextStep(r, { type: 'BACK' }), { type: 'BACK' });
  assert.equal(r.screen, 'idea-sharpen');
  assert.equal(r.rawDump, 'שפיכה', 'המגילה נמחקה בחזרה עד מסך הרעיון');
});

test('BACK: בשכפול, ריק שנשלח בכוונה נשאר ריק', () => {
  let r = walk({ ...INITIAL_STATE, history: [] }, [
    { type: 'CHOOSE_REFERENCE' }, { type: 'CHOOSE_HAS_REFERENCE' },
    { type: 'CONFIRM_DONE' }, { type: 'HOOK_CHOSEN', hook: 'הוק' }, { type: 'HER_WORDS_SUBMITTED', text: 'A' },
    { type: 'BACK' }, { type: 'HER_WORDS_SUBMITTED', text: '' }, { type: 'BACK' },
  ]);
  assert.equal(r.screen, 'her-words');
  assert.equal(r.herWords, '', 'מה שנמחק בכוונה חזר');
});
