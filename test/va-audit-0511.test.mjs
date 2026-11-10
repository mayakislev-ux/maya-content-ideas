/* 05/11/2026 (ביקורת על העוזר ליצירת סרטון, והחלטות של מאיה על המסלול מ-0):
   - מסך הרעיון המוגרל קרס אחרי רענון או המשך, ומסך הרפרנס הגריל רפרנס אחר
   - "✨ תמלול מדויק" שעוד רץ נחת בסרטון אחר
   - תיבות שמולאו מהסטייט איבדו עריכה ברענון
   - "מאשרים" ומסך הרפרנס שתקו כשהשרת נכשל
   - מסך שחיכה לשרת צייר את עצמו מעל מסך חדש יותר
   - הקריאייטיב שנבחר לא הגיע להוק, לחיזוק, ל-SOS ולתסריט
   כאן לוחצים בעוזר האמיתי ב-jsdom, ובודקים את בוני הפרומפטים ישירות. */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { register, createRequire } from 'node:module';
import { INITIAL_STATE, nextStep } from '../js/video-assistant-flow.js';
import {
  CREATIVE_FOCUS,
  creativeBlock, buildExtractionPrompt, buildHookFindingPrompt, buildHookReinforcementPrompt,
  buildScriptDistillationPrompt, buildSceneRewritePrompt,
} from '../js/video-assistant-content.js';

const SRC = readFileSync(new URL('../js/video-assistant.js', import.meta.url), 'utf8');
const between = (a, b) => SRC.slice(SRC.indexOf(a), SRC.indexOf(b, SRC.indexOf(a)));

/* ---------- הקריאייטיב בפרומפטים ---------- */

const CREATIVE = 'לקרוע את תלוש המשכורת מול המצלמה';
const ctx = { domain: 'שיווק', audience: 'שכירות' };
const BUILT = {
  extraction: (c) => buildExtractionPrompt({ ...ctx, idea: 'רעיון', creative: c }),
  hook: (c) => buildHookFindingPrompt({ ...ctx, idea: 'רעיון', script: 'מגילה', creative: c }),
  reinforcement: (c) => buildHookReinforcementPrompt({ ...ctx, idea: 'רעיון', hook: 'הוק', script: 'מגילה', creative: c }),
  script: (c) => buildScriptDistillationPrompt({ ...ctx, idea: 'רעיון', hook: 'הוק', hookReinforcement: 'חיזוק', rawScript: 'מגילה', creative: c }),
  scene: (c) => buildSceneRewritePrompt({ ...ctx, script: 'תסריט', creative: c }),
};

test('קריאייטיב: נכנס לכל פרומפט במסלול מ-0 חוץ מההוק, עם הוראה להיצמד אליו', () => {
  /* 10/11/2026 (מאיה): פרומפט ההוק בלי הקריאייטיב, "תמחקי את הקטע הזה" */
  assert.ok(!BUILT.hook(CREATIVE).includes(CREATIVE), 'הקריאייטיב חזר לפרומפט ההוק');
  for (const [name, build] of Object.entries(BUILT)) {
    if (name === 'hook') continue;
    const p = build(CREATIVE);
    assert.ok(p.includes(`הקריאייטיב שבחרתי לסרטון הזה (חובה להיצמד אליו): ${CREATIVE}`), name);
    assert.ok(p.includes('אסור להתעלם מהקריאייטיב'), name);
    assert.ok(p.includes('כל שאר ההנחיות כאן נשארות בדיוק כמו שהן'), name);
  }
  assert.match(BUILT.script(CREATIVE), /התסריט נפתח בקריאייטיב הזה/);
  assert.match(BUILT.scene(CREATIVE), /הפתיחה נשארת הפעולה או הוויזואל/);
});

test('קריאייטיב: התחום והקהל עדיין פותחים, והנוסח שלה נשאר מילה במילה אחריו', () => {
  for (const name of ['extraction', 'reinforcement', 'script']) {
    const withC = BUILT[name](CREATIVE);
    const without = BUILT[name]('');
    assert.match(withC, /^התחום שלי הוא: שיווק\nהקהל יעד שלי: שכירות\n\n/, name);
    const header = 'התחום שלי הוא: שיווק\nהקהל יעד שלי: שכירות\n\n';
    /* 09/11/2026: ההוראה של ההוק היא כמה שורות, ובסוף פרומפט ההוק יש תזכורת אחרונה */
    const body = header + creativeBlock(CREATIVE, CREATIVE_FOCUS[name]) + without.slice(header.length);
    assert.ok(withC.startsWith(body), name);
    const rest = withC.slice(body.length);
    assert.equal(rest, '', name);
  }
});

test('בלי קריאייטיב הפרומפטים זהים בדיוק למה שהיו', () => {
  for (const [name, build] of Object.entries(BUILT)) {
    assert.equal(build(''), build(undefined), name);
    assert.equal(build('   '), build(null), name);
    assert.ok(!build(null).includes('הקריאייטיב שבחרתי'), name);
  }
  assert.equal(creativeBlock('', 'x'), '');
});

/* ---------- בקוד של המסכים ---------- */

test('כל המסכים במסלול מ-0 שולחים את הקריאייטיב ומראים אותו', () => {
  for (const [a, b] of [
    ['function renderScratchDump', 'async function renderScratchHook'],
    ['async function renderScratchHook', 'async function renderScratchHookReinforce'],
    ['async function renderScratchHookReinforce', 'const CTA_TYPES'],
    ['async function renderScratchDistill', 'async function renderScratchScene'],
    ['async function renderScratchScene', '// ===== מסך הסיכום הסופי'],
  ]) {
    assert.match(between(a, b), /creativeReminderHtml\(\)/, a);
  }
  assert.match(between('async function openExtractionHelperModal', 'function renderScratchDump'), /buildExtractionPrompt\(\{[^}]*creative \}\)/);
  assert.match(between('async function renderScratchHook', 'async function renderScratchHookReinforce'), /buildHookFindingPrompt\(\{[^}]*creative, suggestedHook: detected \}\)/);
  assert.match(between('async function renderScratchHookReinforce', 'const CTA_TYPES'), /buildHookReinforcementPrompt\(\{[^}]*creative \}\)/);
  assert.match(between('async function renderScratchDistill', 'async function renderScratchScene'), /carousel: isCarousel\(state\), dynamicText: isDynamicText\(state\), creative,/);
  assert.match(between('async function renderScratchScene', '// ===== מסך הסיכום הסופי'), /buildSceneRewritePrompt\(\{[^}]*creative \}\)/);
  /* בשכפול אין קריאייטיב, והמסכים שלו לא נגעו בו */
  assert.ok(!between('async function renderPrompt1', 'async function renderPrompt2').includes('creative'));
});

test('כל מסך שמחכה לשרת בודק שהוא עדיין המסך האחרון לפני שהוא מצייר', () => {
  for (const fn of ['renderOpening', 'renderProfileSetup', 'renderPulledIdea', 'renderPulledReference', 'renderPrompt1',
    'renderPrompt2', 'renderCreativePackaging', 'renderScratchHook', 'renderScratchHookReinforce',
    'renderScratchDistill', 'renderScratchScene']) {
    const start = SRC.indexOf(`async function ${fn}(`);
    assert.ok(start > 0, fn);
    const rest = SRC.slice(start + 10);
    const next = rest.search(/\r?\n(async )?function /);
    const body = SRC.slice(start, next > 0 ? start + 10 + next : undefined);
    assert.match(body, /const t = \+\+renderSeq;/, fn);
    assert.match(body, /if \(t !== renderSeq/, fn);
  }
  assert.match(between('function render()', 'function renderScreen()'), /renderSeq \+= 1;[\s\S]*out\.catch\(renderFailed\)/);
});

/* ---------- לחיצות אמיתיות ב-jsdom ---------- */

const JSDOM_PATH = 'C:/dev/portal-sales/node_modules/jsdom/lib/api.js';
const hasJsdom = existsSync(JSDOM_PATH);

const store = new Map();
const SESSION = 'videoAssistantSessions/u1';
const gates = { transcribe: null, hook: null, failProfileSave: false };
let transcribeCalls = 0;

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
      if (gates.failProfileSave && ref.path.startsWith('profiles/')) throw new Error('permission-denied');
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
    httpsCallable: (_f, name) => async (data) => {
      if (name === 'transcribeReference') {
        transcribeCalls += 1;
        return new Promise((resolve) => { gates.transcribe = (d) => resolve({ data: d }); });
      }
      if (name === 'extractOpeningHook') {
        if (gates.hook === 'hold') return new Promise((resolve) => { gates.hook = () => resolve({ data: { hook: 'הוק שזוהה' } }); });
        return { data: { hook: String(data.transcript).split('\n')[0] } };
      }
      if (name === 'guessClientDomain') return { data: null };
      return { data: {} };
    },
  };
}

async function until(fn, label, tries = 400) {
  for (let i = 0; i < tries; i += 1) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.fail(`לא קרה: ${label}`);
}

const walk = (start, actions) => actions.reduce((s, a) => nextStep(s, a), start);
const PROFILE = { name: 'מיכל', pronoun: 'את', business: 'שיווק', primaryAudience: 'בעלות עסקים' };

let $;

describe('ביקורת 05/11 בעוזר (jsdom)', { skip: hasJsdom ? false : 'jsdom לא מותקן במחשב הזה' }, () => {
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
    w.localStorage.setItem('video-assistant-muted', '1');
    store.set('profiles/u1', { ...PROFILE });
    const va = await import('../js/video-assistant.js');
    const router = await import('../js/view-router.js');
    va.wireVideoAssistantView();
    router.showView('video-assistant');
    $ = (sel) => document.querySelector(sel);
  });

  const type = (el, value) => { el.value = value; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
  const toasts = () => [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | ');

  async function open(state, ready, label) {
    store.set(SESSION, { ...structuredClone(state), updatedAt: Date.now() });
    $('#hub-link-video-assistant').click();
    await until(ready, label);
  }

  test('רעיון מוגרל: אחרי רענון (המאגר עוד לא נטען) מוצג אותו רעיון, בלי קריסה', async () => {
    for (let i = 1; i <= 6; i += 1) store.set(`ideas/i${i}`, { ownerUid: 'u1', title: `רעיון ${i}` });
    const pulled = { ...walk({ ...INITIAL_STATE, history: [] }, [{ type: 'CHOOSE_IDEA' }, { type: 'CHOOSE_PULL_IDEA' }]), pickedIdeaId: 'i5' };
    await open(pulled, () => $('#va-idea-title'), 'מסך הרעיון');
    assert.equal($('#va-idea-title').textContent, 'רעיון 5');
    /* ושוב, כדי שזה לא יהיה מזל של הגרלה */
    await open(pulled, () => $('#va-idea-title') && $('.cosmic-resume-bar'), 'שוב מסך הרעיון');
    assert.equal($('#va-idea-title').textContent, 'רעיון 5');
  });

  test('רעיון מוגרל שנמחק מהבנק: מוגרל רעיון אחר ונשמר בסטייט', async () => {
    const pulled = { ...walk({ ...INITIAL_STATE, history: [] }, [{ type: 'CHOOSE_IDEA' }, { type: 'CHOOSE_PULL_IDEA' }]), pickedIdeaId: 'gone' };
    await open(pulled, () => $('#va-idea-title') && /רעיון \d/.test($('#va-idea-title').textContent), 'רעיון אחר');
    const shown = $('#va-idea-title').textContent;
    await until(() => store.get(SESSION).pickedIdeaId && store.get(SESSION).pickedIdeaId !== 'gone', 'הבחירה לא נשמרה');
    assert.equal(`רעיון ${store.get(SESSION).pickedIdeaId.slice(1)}`, shown);
  });

  test('חזרה מהרעיון שנבחר אל מסך ההגרלה אחרי רענון: אותו רעיון', async () => {
    let s = { ...walk({ ...INITIAL_STATE, history: [] }, [{ type: 'CHOOSE_IDEA' }, { type: 'CHOOSE_PULL_IDEA' }]), pickedIdeaId: 'i3' };
    s = nextStep(s, { type: 'ACCEPT_PICK' });
    await open(s, () => $('#va-back-btn') && $('.cosmic-resume-bar'), 'מסך הרעיון אחרי ההגרלה');
    $('#va-back-btn').click();
    await until(() => $('#va-idea-title'), 'חזרה למסך ההגרלה');
    assert.equal($('#va-idea-title').textContent, 'רעיון 3');
  });

  test('"מאשרים" בתחום: שמירה שנכשלה נאמרת, והכפתור חוזר לעבוד', async () => {
    store.set('profiles/u1', { ...PROFILE });
    for (let i = 1; i <= 6; i += 1) {
      store.set(`inspirationBank/r${i}`, { domain: 'תוכן אישי וחיבור', url: `https://www.tiktok.com/@a/video/${i}`, thumbnailUrl: `https://img/${i}.jpg` });
    }
    const ref = walk({ ...INITIAL_STATE, history: [] }, [{ type: 'CHOOSE_REFERENCE' }, { type: 'CHOOSE_PULL_REFERENCE' }]);
    await open(ref, () => $('#va-domain-confirm-btn'), 'מסך אישור התחום');
    const select = $('#va-domain-select');
    select.value = 'תוכן אישי וחיבור';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
    gates.failProfileSave = true;
    $('#va-domain-confirm-btn').click();
    await until(() => /משהו השתבש|השרת לא זמין|אין חיבור/.test(toasts()), 'אין הודעה על הכישלון');
    assert.equal($('#va-domain-confirm-btn').disabled, false, 'הכפתור נשאר נעול');
    gates.failProfileSave = false;
  });

  test('רפרנס מוגרל: אחרי רענון מוצג אותו רפרנס, ולא מוגרל אחר', async () => {
    $('#va-domain-confirm-btn').click();
    await until(() => $('#va-accept-ref-btn'), 'מסך הרפרנס אחרי אישור התחום');
    const picked = store.get(SESSION).pickedReferenceId;
    assert.ok(picked, 'הרפרנס שהוגרל לא נשמר בסטייט');
    /* השמירה של ההגרלה הראשונה רצה ברקע, ולא דורסת את הסשן שנפתח כאן */
    await new Promise((r) => setTimeout(r, 60));
    const ref = { ...structuredClone(store.get(SESSION)), pickedReferenceId: 'r4' };
    for (let round = 0; round < 3; round += 1) {
      document.getElementById('video-assistant-screen').innerHTML = '';
      await open(ref, () => $('#va-ref-preview-btn img'), 'מסך הרפרנס');
      assert.equal($('#va-ref-preview-btn img').getAttribute('src'), 'https://img/4.jpg', `סבב ${round}`);
      assert.equal(store.get(SESSION).pickedReferenceId, 'r4');
    }
  });

  test('תיבות שמולאו מהסטייט שומרות עריכה ברענון: לינק, תמלול, אריזה, מגילה ותמלול בהוק', async () => {
    const transcribe = { ...walk({ ...INITIAL_STATE, history: [] }, [{ type: 'CHOOSE_REFERENCE' }, { type: 'CHOOSE_HAS_REFERENCE' }, { type: 'RELEVANCE_CONFIRMED' }]),
      transcript: 'תמלול מהמאגר', referenceLink: 'https://www.tiktok.com/@a/video/1' };
    await open(transcribe, () => $('#va-transcript-input') && $('#va-transcript-input').value === 'תמלול מהמאגר', 'מסך התמלול');
    assert.equal($('#va-reference-link').value, 'https://www.tiktok.com/@a/video/1');
    type($('#va-transcript-input'), 'תמלול שתוקן');
    type($('#va-reference-link'), 'https://www.tiktok.com/@a/video/2');
    await until(() => (store.get(SESSION).drafts || {})['transcribe|va-transcript-input'] === 'תמלול שתוקן', 'הטיוטה לא נשמרה');
    $('#hub-link-video-assistant').click();
    await until(() => $('#va-transcript-input') && $('.cosmic-resume-bar'), 'ציור מחדש');
    assert.equal($('#va-transcript-input').value, 'תמלול שתוקן', 'התיקון בתמלול נעלם ברענון');
    assert.equal($('#va-reference-link').value, 'https://www.tiktok.com/@a/video/2', 'הלינק שתוקן נעלם ברענון');

    const scratch = walk({ ...INITIAL_STATE, history: [], branch: 'idea', screen: 'idea-sharpen', ideaDescription: 'גבות' }, [
      { type: 'IDEA_SHARPENED', idea: 'גבות' },
      { type: 'PACKAGING_CHOSEN', packaging: 'כיוון ישן', startingPoint: 'כללי' },
      { type: 'FORMAT_SELECTED', format: 'דיבור למצלמה' },
      { type: 'NEEDS_SCRIPT_YES' },
    ]);
    const packagingScreen = { ...walk(scratch, [{ type: 'BACK' }, { type: 'BACK' }, { type: 'BACK' }]), packaging: 'כיוון ישן' };
    assert.equal(packagingScreen.screen, 'creative-packaging');
    const cases = [
      [packagingScreen, '#va-packaging-input', 'כיוון ישן', 'כיוון חדש'],
      [{ ...scratch, rawDump: 'מגילה ישנה' }, '#va-scratch-dump-input', 'מגילה ישנה', 'מגילה חדשה'],
    ];
    for (const [s, sel, before, after] of cases) {
      await open(s, () => $(sel) && $(sel).value === before, `התיבה ${sel}`);

      type($(sel), after);
      const key = `${s.screen}|${sel.slice(1)}`;
      await until(() => (store.get(SESSION).drafts || {})[key] === after, `הטיוטה של ${sel} לא נשמרה`);
      $('#hub-link-video-assistant').click();
      await until(() => $(sel) && $('.cosmic-resume-bar'), 'ציור מחדש');
      assert.equal($(sel).value, after, `העריכה ב-${sel} נעלמה ברענון`);
    }
  });

  test('מסך ההוק שחיכה לשרת לא מצייר את עצמו מעל המסך שחזרו אליו', async () => {
    const start = { ...walk({ ...INITIAL_STATE, history: [] }, [{ type: 'CHOOSE_REFERENCE' }, { type: 'CHOOSE_HAS_REFERENCE' }, { type: 'RELEVANCE_CONFIRMED' }]),
      transcript: 'שורה ראשונה\nועוד' };
    await open(start, () => $('#va-transcribe-done-btn'), 'מסך התמלול');
    gates.hook = 'hold';
    $('#va-transcribe-done-btn').click();
    await until(() => typeof gates.hook === 'function', 'זיהוי ההוק לא התחיל');
    $('#va-back-btn').click();
    await until(() => $('#va-transcript-input'), 'חזרה למסך התמלול');
    gates.hook();
    gates.hook = null;
    await new Promise((r) => setTimeout(r, 60));
    assert.ok($('#va-transcript-input'), 'מסך התמלול נדרס');
    assert.ok(!$('#va-hook-input'), 'מסך ההוק צויר מעל מסך התמלול');
  });

  test('"✨ תמלול מדויק" שעוד רץ לא נוחת בסרטון אחר שנפתח בינתיים', async () => {
    const base = walk({ ...INITIAL_STATE, history: [] }, [{ type: 'CHOOSE_REFERENCE' }, { type: 'CHOOSE_HAS_REFERENCE' }, { type: 'RELEVANCE_CONFIRMED' }]);
    const a = { ...base, scriptId: 'sA', scriptCreatedAt: 1, referenceLink: 'https://www.tiktok.com/@a/video/1', transcript: null };
    await open(a, () => $('#va-accurate-btn') && $('#va-reference-link').value.includes('/1'), 'מסך התמלול של א');
    transcribeCalls = 0;
    $('#va-accurate-btn').click();
    await until(() => transcribeCalls === 1 && typeof gates.transcribe === 'function', 'התמלול לא נשלח');
    const b = { ...base, scriptId: 'sB', scriptCreatedAt: 2, referenceLink: 'https://www.tiktok.com/@b/video/2', transcript: null };
    await open(b, () => $('#va-reference-link') && $('#va-reference-link').value.includes('/2'), 'מסך התמלול של ב');
    assert.equal($('#va-accurate-btn').disabled, false, 'הסרטון החדש נעול בגלל הריצה של הקודם');
    gates.transcribe({ language: 'he', kind: 'speech', spoken: 'של הסרטון הקודם', spokenHe: 'של הסרטון הקודם', onScreenText: [], scenes: [] });
    await new Promise((r) => setTimeout(r, 60));
    assert.equal($('#va-transcript-input').value, '', 'התמלול של א נכנס ל-ב');
    assert.ok(!store.get(SESSION).transcript, 'התמלול של א נשמר בסשן של ב');
  });

  test('מ-0: הקריאייטיב שנבחר מוצג במסך ההוק ונמצא בפרומפט שמועתק', async () => {
    const s = walk({ ...INITIAL_STATE, history: [], branch: 'idea', screen: 'idea-sharpen', ideaDescription: 'משכורת' }, [
      { type: 'IDEA_SHARPENED', idea: 'משכורת' },
      { type: 'PACKAGING_CHOSEN', packaging: CREATIVE, startingPoint: 'סיפור אישי' },
      { type: 'FORMAT_SELECTED', format: 'דיבור למצלמה' },
      { type: 'NEEDS_SCRIPT_YES' },
      { type: 'SCRATCH_DUMP_READY', text: 'מגילה על המשכורת' },
    ]);
    await open(s, () => $('#va-scratch-hook-input'), 'מסך ההוק');
    assert.match($('.va-creative-reminder').textContent, /הקריאייטיב שבחרת:/);
    assert.ok($('.va-creative-reminder').textContent.includes(CREATIVE));
    const copied = decodeURIComponent($('.va-copy-btn').getAttribute('data-copy-text'));
    /* 10/11/2026: מוצג במסך כתזכורת, אבל לא נכנס לפרומפט ההוק */
    assert.ok(!copied.includes(CREATIVE));
    assert.match($('.va-copy-btn').textContent, /ChatGPT/);
    assert.ok(!$('.va-copy-btn').textContent.includes("ג'מיני"));
  });
});
