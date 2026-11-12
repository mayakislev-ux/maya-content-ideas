/* 06/11/2026, סבב 3 שמאיה אישרה:
   1. "שתעיפי לגמרי את שיטת השכפול ההפוך, סתם מבלבל": לא מוצעת יותר בעוזר
      ולא בפרומפטים, וסשן ישן שנשמר בה ממשיך בשכפול הרגיל בלי לקרוס.
   2. רעיונות ממיקרופון הבית / מההקלטה: לשון רבים ניטרלית לקהל, לא "שלכן".
   3. "בחירת רעיונות ספציפיים" בתכנית התוכן: בלי צ'יפי דירוג.
   4. "רעיונות שבוצעו": החלקה שמאלה שואלת לפני מחיקה, וביטול מחזיר את הכרטיס. */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { register, createRequire } from 'node:module';

import { INITIAL_STATE, nextStep, migrateLegacyState, keptOnBack } from '../js/video-assistant-flow.js';
import * as prompts from '../js/video-assistant-prompts.js';

const require = createRequire(import.meta.url);
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

/* ---------- 1. השכפול ההפוך ---------- */

describe('1. השכפול ההפוך ירד', () => {
  const VA_FILES = ['video-assistant.js', 'video-assistant-flow.js', 'video-assistant-prompts.js', 'video-assistant-content.js',
    'video-assistant-library.js', 'video-assistant-build.js', 'video-assistant-store.js'];
  /* בלי הערות: מה שנשאר הוא מה שהמשתמש/ת רואה או מה שנשלח למודל */
  const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

  test('אין יותר כפתור, מסך, פעולה או פרומפט של שכפול הפוך', () => {
    for (const f of VA_FILES) {
      const src = code(read(`../js/${f}`));
      assert.doesNotMatch(src, /שכפול הפוך|השכפול ההפוך|שכפול ההפוך/, f);
      assert.doesNotMatch(src, /CHOOSE_REVERSE_DUPLICATION|buildReverseDuplicationPrompt|va-reverse-btn|renderHasIdeaChoice|va-hook-ref/, f);
    }
    assert.equal(prompts.buildReverseDuplicationPrompt, undefined);
    assert.throws(() => nextStep({ ...INITIAL_STATE, screen: 'has-idea-choice' }, { type: 'CHOOSE_REVERSE_DUPLICATION' }));
  });

  test('הפרומפטים בשרת לא מציעים אותו', () => {
    const { buildSystemPrompt } = require('../functions/system-prompt.js');
    for (const profile of [null, { name: 'דנה', pronoun: 'את', business: 'ריסים', primaryAudience: 'נשים' }]) {
      assert.doesNotMatch(buildSystemPrompt(profile, null), /שכפול הפוך|השכפול ההפוך/);
    }
    assert.match(buildSystemPrompt(null, null), /ואם אין - אז לא בכוח כי זה רק יחליש את התסריט/, 'העיקרון "לא בכוח" נשאר');
    assert.doesNotMatch(code(read('../functions/draftScriptFeedback.js')), /שכפול הפוך/);
  });

  test('סשן ישן באמצע השכפול ההפוך ממשיך בשכפול הרגיל', () => {
    const old = {
      ...INITIAL_STATE, branch: 'idea-search', screen: 'her-words', transcript: 'ההוק. ועוד', openingHook: 'ההוק', herWords: 'מגילה',
      history: [{ ...INITIAL_STATE, screen: 'has-idea-choice', branch: 'idea' }, { ...INITIAL_STATE, screen: 'transcribe', branch: 'idea-search' }],
    };
    const s = migrateLegacyState(old);
    assert.equal(s.branch, 'reference');
    assert.equal(s.screen, 'prompt1', 'אין עדיין הוק, ולכן קודם מציאת הוק');
    assert.equal(s.herWords, 'מגילה', 'המגילה שכבר נכתבה נשמרת');
    /* מסך הבחירה הישן יוצא מההיסטוריה: חזרה אחורה לא מעבירה למסלול "מאפס" */
    assert.deepEqual(s.history.map((h) => [h.screen, h.branch]), [['transcribe', 'reference']]);
    assert.equal(nextStep(s, { type: 'BACK' }).screen, 'transcribe', 'לחיצת חזרה אחת זזה מסך');
    assert.equal(old.branch, 'idea-search', 'המקור לא שונה');
    /* וממשיכים ממנו בלי שגיאה */
    let n = nextStep(s, { type: 'HOOK_CHOSEN', hook: 'הוק חדש' });
    assert.equal(n.screen, 'format-choice');
    n = nextStep(n, { type: 'FORMAT_SELECTED', format: 'וויס אובר' });
    assert.equal(n.screen, 'her-words');
    n = nextStep(n, { type: 'HER_WORDS_SUBMITTED', text: 'מגילה' });
    assert.equal(n.screen, 'prompt2');
    assert.deepEqual(keptOnBack(n), ['finalScript']);
    /* BACK לתוך ההיסטוריה הישנה */
    assert.doesNotThrow(() => nextStep(nextStep(s, { type: 'BACK' }), { type: 'BACK' }));
  });

  test('מסך ההחלטה הישן הופך לכתיבה מאפס, ושאר הסשנים לא נגעים', () => {
    assert.deepEqual(
      (({ screen, branch }) => ({ screen, branch }))(migrateLegacyState({ ...INITIAL_STATE, screen: 'has-idea-choice', branch: 'idea', history: [] })),
      { screen: 'scratch-dump', branch: 'scratch' },
    );
    const withHook = migrateLegacyState({ ...INITIAL_STATE, branch: 'idea-search', screen: 'prompt2', hook: 'הוק', history: [] });
    assert.equal(withHook.screen, 'prompt2');
    const ref = { ...INITIAL_STATE, branch: 'reference', screen: 'prompt1', history: [] };
    assert.deepEqual(migrateLegacyState(ref), ref);
    assert.equal(migrateLegacyState(null), null);
  });

  test('העוזר מעביר כל סשן שנטען או נפתח מ"התסריטים שלי" דרך המעבר', () => {
    const src = read('../js/video-assistant.js');
    assert.match(src, /state = isResumable \? migrateLegacyState\(saved\) : INITIAL_STATE;/);
    assert.match(src, /state = migrateLegacyState\(\{ \.\.\.s, scriptId: item\.id/);
  });
});

/* ---------- 2. לשון הרעיונות מהמיקרופון ---------- */

describe('2. רעיונות מהמיקרופון בלשון ניטרלית', () => {
  const ifr = require('../functions/ideas-from-recording.js');
  const TAXONOMY = {
    categories: ['בעל ערך', 'אישי', 'מכירתי'], categoryDefinitions: {}, stages: ['שלב 1'], audienceScopes: ['עיקרי'],
    strongRating: 's', normalRating: 'n',
  };

  test('גם בהקלטה וגם בטקסט: לשון רבים ניטרלית, לא "שלכן"', () => {
    for (const p of [ifr.buildPrompt(TAXONOMY), ifr.buildPrompt(TAXONOMY, { source: 'text' })]) {
      assert.match(p, /המגדר של הקהל לא ידוע/);
      assert.match(p, /לשון רבים ניטרלית - "אתם", "שלכם", "אליכם", "הלקוחות שלכם"/);
      assert.match(p, /לא "אתן", לא "שלכן"/);
      assert.match(p, /לשון נקבה לקהל רק אם הדובר\/ת אמר\/ה במפורש שהקהל נשים/);
      assert.match(p, /דמות אחת שהוזכרה .* נשארת במגדר שלה/);
      assert.ok(!/[—–]/.test(p), 'מקף ארוך בפרומפט');
    }
  });

  test('קהל היעד מהפרופיל נכנס לכלל, וגם הוא לא קובע נקבה אם לא נאמר', () => {
    const p = ifr.buildPrompt(TAXONOMY, { source: 'text', audience: 'בעלי עסקים קטנים' });
    assert.match(p, /קהל היעד העיקרי לפי הפרופיל: "בעלי עסקים קטנים"/);
    assert.match(p, /לשון נקבה לקהל רק אם קהל היעד בפרופיל או הדובר\/ת אמר\/ה במפורש/);
  });

  function deps(over = {}) {
    const state = { prompts: [] };
    return {
      state,
      deps: {
        HttpsError: class extends Error { constructor(code, msg) { super(msg); this.code = code; } },
        enforceAllowlist: async () => {},
        checkRate: async () => ({ commit() {}, async release() {} }),
        getAccessToken: async () => 't',
        projectId: 'p',
        bucket: { name: 'b', file: () => ({ getMetadata: async () => [{ size: 10, contentType: 'audio/webm' }], delete: async () => {} }) },
        fetchImpl: async (_url, init) => {
          const body = JSON.parse(init.body);
          state.prompts.push(body.contents[0].parts.map((x) => x.text || '').join('\n'));
          return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"ideas":[]}' }] } }] }) };
        },
        taxonomy: TAXONOMY,
        ...over,
      },
    };
  }
  const req = (data) => ({ auth: { uid: 'u1', token: { email: 'a@b.c' } }, data });

  test('השרת שולח את קהל היעד בשני המסלולים, ותקלה בפרופיל לא עוצרת', async () => {
    const asked = [];
    const { deps: d, state } = deps({ getAudience: async (uid) => { asked.push(uid); return 'מאמני כושר'; } });
    const h = ifr.createIdeasFromRecordingHandler(d);
    await h(req({ text: 'היום לקוח שאל אותי משהו' }));
    await h(req({ path: 'transcribeUploads/u1/a.webm' }));
    assert.deepEqual(asked, ['u1', 'u1']);
    assert.ok(state.prompts.every((p) => p.includes('קהל היעד העיקרי לפי הפרופיל: "מאמני כושר"')));

    const broken = deps({ getAudience: async () => { throw new Error('down'); } });
    const out = await ifr.createIdeasFromRecordingHandler(broken.deps)(req({ text: 'רעיון' }));
    assert.deepEqual(out, { ideas: [] });
    assert.match(broken.state.prompts[0], /לא "אתן", לא "שלכן"/);
  });

  test('index.js מחבר את קהל היעד מהפרופיל', () => {
    assert.match(read('../functions/index.js'), /getAudience: async \(uid\) => \{\s*const snap = await db\.collection\('profiles'\)\.doc\(uid\)\.get\(\);/);
  });
});

/* ---------- 3 + 4: jsdom ---------- */

const JSDOM_PATH = 'C:/dev/portal-sales/node_modules/jsdom/lib/api.js';
const hasJsdom = existsSync(JSDOM_PATH);
const ts = (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
const tick = () => new Promise((r) => setTimeout(r, 0));
async function until(fn, label, tries = 300) {
  for (let i = 0; i < tries; i++) {
    if (fn()) return;
    await tick();
  }
  assert.fail(`לא קרה: ${label}`);
}

describe('3 + 4. המסכים (jsdom)', { skip: hasJsdom ? false : 'jsdom לא מותקן' }, () => {
  let archive;
  const updated = [];
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const now = Date.now();
  const IDEAS = [
    { id: 'a1', title: 'רעיון בלי דירוג', category: 'בעל ערך', createdAt: ts(now - 1000) },
    { id: 'a2', title: 'רעיון מדורג', category: 'אישי', rating: '🔥 חייב לצלם', createdAt: ts(now - 2000) },
    { id: 'done1', title: 'רעיון שכבר צולם', category: 'מכירתי', createdAt: ts(now - 4000), completedAt: ts(now) },
  ];

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
      orderBy: () => ({}),
      onSnapshot: () => () => {},
      getDocs: async () => ({ docs: [], forEach() {} }),
      getDoc: async () => ({ exists: () => false, data: () => null }),
      serverTimestamp: () => 'ts',
      getStorage: () => ({}),
      updateDoc: async (ref, data) => { updated.push({ path: ref.path, data }); },
      httpsCallable: () => async () => ({ data: {} }),
    };
    const { JSDOM } = require(JSDOM_PATH);
    const dom = new JSDOM(read('../index.html'), { url: 'https://mayakislev-ux.github.io/maya-content-ideas/', pretendToBeVisual: true });
    const w = dom.window;
    w.scrollTo = () => {};
    w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent',
      'KeyboardEvent', 'MouseEvent', 'sessionStorage', 'localStorage', 'getComputedStyle', 'requestAnimationFrame',
      'cancelAnimationFrame', 'history', 'location', 'DocumentFragment', 'HTMLTextAreaElement', 'HTMLInputElement',
      'MutationObserver', 'Blob']) {
      Object.defineProperty(globalThis, k, { value: k === 'window' ? w : w[k], configurable: true, writable: true });
    }
    (await import('../js/confirm-dialog.js')).wireConfirmDialog();
    archive = await import('../js/archive-view.js');
    document.getElementById('archive-view').hidden = false;
    document.getElementById('app-screen').hidden = false;
    archive.setIdeasRedesign(false);
    archive.wireArchiveControls(() => {});
    archive.renderArchive(IDEAS, { onItemClick: () => {} });
  });

  test('3. בחירת רעיונות: אין צ\'יפי דירוג, ורעיון בלי דירוג מופיע', async () => {
    assert.equal($('#content-plan-pick-ideas-rating-chips'), null);
    const cp = await import('../js/content-plan.js');
    cp.wireContentPlanView();
    $('#content-plan-pick-ideas-btn').click();
    const modal = $('#content-plan-pick-ideas-modal');
    assert.equal(modal.hidden, false);
    assert.equal(modal.querySelectorAll('.rating-chip').length, 0, 'צ\'יפ דירוג בפופאפ');
    assert.equal(modal.querySelectorAll('.category-chip').length, 3, 'צ\'יפי הסוג נשארו');
    assert.match(modal.textContent, /רעיון בלי דירוג/);
    assert.match(modal.textContent, /רעיון מדורג/);
    /* סוג וחיפוש עדיין מסננים */
    const personal = [...modal.querySelectorAll('.category-chip')].find((c) => c.textContent.includes('אישי'));
    personal.click();
    assert.doesNotMatch($('#content-plan-pick-ideas-list').textContent, /רעיון בלי דירוג/);
    personal.click();
    const search = $('#content-plan-pick-ideas-search');
    search.value = 'בלי דירוג';
    search.dispatchEvent(new window.Event('input'));
    assert.match($('#content-plan-pick-ideas-list').textContent, /רעיון בלי דירוג/);
    assert.doesNotMatch($('#content-plan-pick-ideas-list').textContent, /רעיון מדורג/);
  });

  function swipe(el, dx) {
    const fire = (type, x) => {
      const e = new window.Event(type, { bubbles: true, cancelable: true });
      const t = [{ clientX: x, clientY: 100 }];
      Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : t });
      Object.defineProperty(e, 'changedTouches', { value: t });
      el.dispatchEvent(e);
    };
    fire('touchstart', 200);
    fire('touchmove', 200 + dx);
    fire('touchend', 200 + dx);
  }

  test('4. "רעיונות שבוצעו": החלקה שמאלה שואלת, ביטול לא מוחק ומחזיר את הכרטיס', async () => {
    $('#completed-toggle-btn').click();
    const card = () => [...$$('#archive-list .archive-item')].find((c) => /רעיון שכבר צולם/.test(c.textContent));
    assert.ok(card(), 'הרעיון שבוצע לא ברשימה');
    swipe(card(), -120);
    await until(() => !$('#confirm-dialog').hidden, 'לא נשאלה לפני מחיקה');
    assert.equal($('#confirm-dialog-message').textContent, 'למחוק את הרעיון?');
    assert.equal($('#confirm-dialog-ok').textContent, 'מחיקה');
    assert.equal(card().style.transform, 'translateX(-90px)', 'הכרטיס לא נשאר מוסט בזמן השאלה');
    assert.equal(updated.length, 0, 'נמחק לפני אישור');

    $('#confirm-dialog-cancel').click();
    await until(() => card().style.transform === 'translateX(0)', 'הכרטיס לא חזר למקום אחרי ביטול');
    await tick();
    assert.equal(updated.length, 0, 'ביטול מחק');

    swipe(card(), -120);
    await until(() => !$('#confirm-dialog').hidden, 'לא נשאלה בפעם השנייה');
    $('#confirm-dialog-ok').click();
    await until(() => updated.length === 1, 'אישור לא מחק');
    assert.deepEqual(updated[0], { path: 'ideas/done1', data: { deletedAt: 'ts' } });
    assert.equal(card().style.transform, 'translateX(0)');
    await until(() => [...$$('.toast')].some((t) => /הרעיון נמחק/.test(t.textContent)), 'אין "בטלו" אחרי מחיקה');
  });

  test('4. גם כפתור הפח שמתגלה בהחלקה שואל קודם', async () => {
    const before = updated.length;
    const outer = [...$$('#archive-list .archive-item-outer')].find((li) => /רעיון שכבר צולם/.test(li.textContent));
    outer.querySelector('.swipe-action-delete').click();
    await until(() => !$('#confirm-dialog').hidden, 'הפח מחק בלי לשאול');
    $('#confirm-dialog-cancel').click();
    await tick();
    assert.equal(updated.length, before);
  });

  test('4. החלקה ימינה (סימון כבוצע) לא שואלת', async () => {
    const before = updated.length;
    const c = [...$$('#archive-list .archive-item')].find((x) => /רעיון שכבר צולם/.test(x.textContent));
    swipe(c, 120);
    await until(() => updated.length === before + 1, 'החלקה ימינה לא עבדה');
    assert.equal($('#confirm-dialog').hidden, true);
  });
});
