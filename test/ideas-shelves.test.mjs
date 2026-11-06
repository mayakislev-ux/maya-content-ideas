/* 06/11/2026 לילה: מסך הרעיונות בשלושה כפתורי סוג, טופס רעיון קצר שמסווג
   לבד, ומחיקה מרובה של רעיונות שבוצעו. מאיה: "תעיפי את הקטגוריה בידורי.
   זה רק 3 ערך + אישי + מכירתי. ברעיונות שלי צריך לעשות 3 כפתורים בולטים
   בצבעים שונים... ואז רק שלוחצים נפתחים הרעיונות תחת אותה קטגוריה ושיהיה
   אפשר גם לסגור בקלות". (מחליף את בדיקות "שלושת המדפים" מאותו יום.)
   1. המיפוי מרעיון לכפתור, כולל "ערכי" ו"בידורי" הישנים.
   2. המתג: רק מאיה, גם בתצוגה כלקוחה. app.js מדליק הכל מאותו מתג.
   3. jsdom: המסך האמיתי עם ובלי המתג, פתיחה וסגירה, חיפוש, סינון,
      הטופס הקצר (רק טקסט, סיווג אוטומטי, בלי דירוג), עריכה שמראה את הסוג,
      מחיקת נבחרים ומחיקת כל מה שבוצע, ומיקרופון הבית. */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { register, createRequire } from 'node:module';

import {
  CATEGORY_GROUPS, UNSORTED_GROUP, groupKeyFor, groupByCategory, ideasCountLabel, ideasRedesignFor,
} from '../js/ideas-shelves.js';
import { CATEGORIES, PERSUASION_STAGES, validateIdea } from '../js/ideas-logic.js';
import { OWNER_EMAIL } from '../js/client-view.js';

const require = createRequire(import.meta.url);

describe('שלושת הכפתורים: המיפוי', () => {
  test('בדיוק שלושה, בסדר של מאיה, בלי בידורי ובלי מקף ארוך', () => {
    assert.deepEqual(CATEGORY_GROUPS.map((g) => g.id), ['בעל ערך', 'אישי', 'מכירתי']);
    assert.deepEqual(CATEGORY_GROUPS.map((g) => g.id), CATEGORIES);
    for (const g of CATEGORY_GROUPS) {
      assert.ok(!/[—–]/.test(g.explain + g.id));
      assert.ok(g.icon.includes('<path'));
    }
    assert.ok(!CATEGORY_GROUPS.some((g) => g.id === 'בידורי'));
  });

  test('ערכי נספר כבעל ערך, בידורי וטיוטות נכנסים לכניסה השקטה', () => {
    assert.equal(groupKeyFor({ category: 'בעל ערך' }), 'בעל ערך');
    assert.equal(groupKeyFor({ category: 'ערכי' }), 'בעל ערך');
    assert.equal(groupKeyFor({ category: 'אישי' }), 'אישי');
    assert.equal(groupKeyFor({ category: 'מכירתי' }), 'מכירתי');
    assert.equal(groupKeyFor({ category: 'בידורי' }), UNSORTED_GROUP);
    assert.equal(groupKeyFor({ category: '' }), UNSORTED_GROUP);
    assert.equal(groupKeyFor({}), UNSORTED_GROUP);
    assert.equal(groupKeyFor(null), UNSORTED_GROUP);
  });

  test('שום רעיון לא הולך לאיבוד, והסדר נשמר בתוך כל קבוצה', () => {
    const ideas = Array.from({ length: 30 }, (_, i) => ({
      id: `i${i}`, category: ['בעל ערך', 'אישי', 'מכירתי', '', 'ערכי', 'בידורי'][i % 6],
    }));
    const groups = groupByCategory(ideas);
    assert.deepEqual(Object.keys(groups).sort(), [...CATEGORIES, UNSORTED_GROUP].sort());
    assert.equal(Object.values(groups).reduce((n, g) => n + g.length, 0), ideas.length);
    assert.deepEqual(groups['בעל ערך'].map((i) => i.id), ['i0', 'i4', 'i6', 'i10', 'i12', 'i16', 'i18', 'i22', 'i24', 'i28']);
    assert.equal(ideasCountLabel(1), 'רעיון אחד');
    assert.equal(ideasCountLabel(4), '4 רעיונות');
  });

  test('בטופס הקצר רק הרעיון חובה, ובטופס הרגיל כלום לא השתנה', () => {
    assert.deepEqual(validateIdea({ title: 'רעיון' }, { simple: true }), []);
    assert.deepEqual(validateIdea({ title: 'רעיון', category: '', rating: '', audienceScope: '' }, { simple: true }), []);
    assert.equal(validateIdea({ title: '  ' }, { simple: true }).length, 1);
    assert.equal(validateIdea({ title: 'x', category: 'משהו' }, { simple: true }).length, 1);
    const full = validateIdea({ title: 'רעיון', category: 'אישי' });
    assert.ok(full.includes('שדה "דירוג" חובה'));
    assert.ok(full.includes('שדה "למי הסרטון מדבר" חובה'));
  });
});

describe('המתג', () => {
  test('רק מאיה רואה את העיצוב החדש, גם בתצוגה כלקוחה', () => {
    const store = new Map();
    const prev = globalThis.sessionStorage;
    globalThis.sessionStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    };
    try {
      assert.equal(ideasRedesignFor(OWNER_EMAIL), true);
      assert.equal(ideasRedesignFor('client@gmail.com'), false);
      assert.equal(ideasRedesignFor(undefined), false);
      store.set('clientView', '1');
      assert.equal(ideasRedesignFor(OWNER_EMAIL), true);
    } finally {
      globalThis.sessionStorage = prev;
    }
  });

  test('app.js מדליק את המסך, הטופס, הקובייה והמיקרופון מאותו מתג אחד', () => {
    const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
    assert.match(app, /const ideasRedesign = ideasRedesignFor\(user\.email\);/);
    assert.match(app, /setIdeasRedesign\(ideasRedesign\);/);
    assert.match(app, /setSimpleIdeaForm\(ideasRedesign\);/);
    assert.match(app, /setRandomIdeaFromAll\(ideasRedesign\);/);
    assert.match(app, /setHomeMicVisible\(ideasRedesign\);/);
    assert.match(app, /\nwireHomeMic\(\);/);
    assert.doesNotMatch(app, /setShelvesLayout/);
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    assert.match(html, /<link rel="stylesheet" href="css\/ideas-shelves\.css">/);
    assert.match(html, /id="home-mic-card" class="home-mic-card" hidden/);
  });

  test('ה-CSS משתמש רק בטוקנים שקיימים ב-style.css, ואין זכר למדפים', () => {
    const base = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../css/ideas-shelves.css', import.meta.url), 'utf8');
    const defined = new Set([...base.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    /* --c הוא צבע הקטגוריה שהכפתור/הכרטיס מקבל inline מ-categoryColorVar, לא טוקן */
    defined.add('--c');
    for (const [, name] of css.matchAll(/var\((--[\w-]+)/g)) assert.ok(defined.has(name), `טוקן לא קיים: ${name}`);
    assert.ok(!/(^|[;{\s])--[\w-]+\s*:/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'ה-CSS החדש מגדיר טוקן משלו');
    assert.doesNotMatch(css, /ideas-shelf/);
    /* ירוק, ורוד, אדום: טוקני הקטגוריה הקיימים */
    assert.equal(CATEGORY_GROUPS.length, 3);
    for (const t of ['--cat-baal-erech', '--cat-ishi', '--cat-mechirti']) assert.ok(defined.has(t));
  });
});

describe('הסיווג האוטומטי והדירוג שירד', () => {
  test('classifyIdea מסווג גם קהל, וקהל לא תקין לא מפיל את הסיווג', () => {
    const server = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
    const from = server.indexOf('exports.classifyIdea');
    const fn = server.slice(from, server.indexOf('exports.guessClientDomain', from));
    assert.match(fn, /"audienceScopeIndex"/);
    assert.match(fn, /AUDIENCE_SCOPE_DEFINITIONS\[s\]/);
    assert.match(fn, /const audienceScope = AUDIENCE_SCOPES\[Number\(parsed\.audienceScopeIndex\) - 1\] \|\| '';/);
    assert.match(fn, /return \{ category, persuasionStage, audienceScope \};/);
  });

  test('תכנית תוכן לא פוסלת רעיון בלי דירוג: רק בלי סוג', () => {
    const plan = readFileSync(new URL('../js/content-plan.js', import.meta.url), 'utf8');
    assert.match(plan, /function getReadyIdeas\(\) \{\r?\n  return getCurrentIdeas\(\)\.filter\(\(idea\) => Boolean\(idea\.category\)\);/);
    /* בלי דירוג = אחרי המדורגים, ובאותו דירוג החדש קודם */
    assert.match(plan, /return i === -1 \? RATINGS\.length : i;/);
    assert.match(plan, /return time\(b\) - time\(a\);\r?\n\}/);
  });
});

/* ---------------- המסך האמיתי ב-jsdom ---------------- */

const JSDOM_PATH = 'C:/dev/portal-sales/node_modules/jsdom/lib/api.js';
const hasJsdom = existsSync(JSDOM_PATH);

function ts(ms) {
  return { toMillis: () => ms, toDate: () => new Date(ms) };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
async function until(fn, label) {
  for (let i = 0; i < 200; i++) {
    if (fn()) return;
    await tick();
  }
  assert.fail(`לא קרה: ${label}`);
}

describe('המסך (jsdom)', { skip: hasJsdom ? false : 'jsdom לא מותקן' }, () => {
  let w;
  let archive;
  let form;
  let homeMic;
  const clicked = [];
  const calls = { classify: [], added: [], updated: [], batches: [] };
  let classifyReply = null;
  let batchFails = false;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const [s1, s2, s3] = PERSUASION_STAGES;
  const now = Date.now();
  const IDEAS = [
    { id: 'v1', title: 'מה הסלבס לא מספרים', category: 'בעל ערך', persuasionStage: s1, audienceScope: 'עיקרי', rating: '⭐ שווה לצלם', createdAt: ts(now - 1000) },
    { id: 'v2', title: 'הטעות שכולם עושים', category: 'בעל ערך', persuasionStage: s2, audienceScope: 'רחב', createdAt: ts(now - 9000) },
    { id: 'v3', title: 'רעיון ישן בשם הישן', category: 'ערכי', createdAt: ts(now - 9500) },
    { id: 'p1', title: 'איך עזבתי את ההייטק', category: 'אישי', persuasionStage: s3, audienceScope: 'עיקרי', rating: '🔥 חייב לצלם', createdAt: ts(now - 8000) },
    { id: 'd1', title: 'רעיון שעוד לא סווג', category: '', createdAt: ts(now - 500) },
    { id: 'b1', title: 'סרטון מצחיק מהקליניקה', category: 'בידורי', createdAt: ts(now - 700) },
    { id: 's1', title: 'הלפני ואחרי של נועה', category: 'מכירתי', persuasionStage: s3, audienceScope: 'עיקרי', createdAt: ts(now - 3000), sourceLink: 'https://instagram.com/reel/x' },
    { id: 'done1', title: 'רעיון שכבר צולם', category: 'מכירתי', createdAt: ts(now - 4000), completedAt: ts(now) },
    { id: 'done2', title: 'עוד אחד שצולם', category: 'אישי', createdAt: ts(now - 5000), completedAt: ts(now) },
    { id: 'done3', title: 'ושלישי שצולם', category: 'בעל ערך', createdAt: ts(now - 6000), completedAt: ts(now) },
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
      onSnapshot: () => () => {},
      serverTimestamp: () => 'ts',
      getStorage: () => ({}),
      addDoc: async (_col, data) => { calls.added.push(data); return { id: 'new1' }; },
      updateDoc: async (ref, data) => { calls.updated.push({ path: ref.path, data }); },
      writeBatch: () => {
        const ops = [];
        return {
          update: (ref, data) => ops.push({ path: ref.path, data }),
          commit: async () => {
            if (batchFails) throw new Error('boom');
            calls.batches.push(ops);
          },
        };
      },
      httpsCallable: (_f, name) => async (data) => {
        if (name === 'classifyIdea') {
          calls.classify.push(data);
          if (classifyReply instanceof Error) throw classifyReply;
          return { data: classifyReply || {} };
        }
        return { data: {} };
      },
    };
    const { JSDOM } = require(JSDOM_PATH);
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const dom = new JSDOM(html, { url: 'https://mayakislev-ux.github.io/maya-content-ideas/', pretendToBeVisual: true });
    w = dom.window;
    w.scrollTo = () => {};
    w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent',
      'KeyboardEvent', 'MouseEvent', 'sessionStorage', 'localStorage', 'getComputedStyle', 'requestAnimationFrame',
      'cancelAnimationFrame', 'history', 'location', 'DocumentFragment', 'HTMLTextAreaElement', 'HTMLInputElement',
      'MutationObserver', 'Blob']) {
      Object.defineProperty(globalThis, k, { value: k === 'window' ? w : w[k], configurable: true, writable: true });
    }
    /* כדי שכפתור "🎙️ לספר בקול" ייבנה בטופס, כמו בדפדפן שתומך בהקלטה */
    class FakeRecorder { static isTypeSupported() { return true; } }
    globalThis.MediaRecorder = FakeRecorder;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: async () => ({ getTracks: () => [] }) },
      configurable: true,
    });
    (await import('../js/confirm-dialog.js')).wireConfirmDialog();
    archive = await import('../js/archive-view.js');
    form = await import('../js/idea-form.js');
    homeMic = await import('../js/home-mic.js');
    form.wireIdeaForm();
    /* כמו כשהמסך פתוח: jsdom לא נותן פוקוס לאלמנט בתוך מסך מוסתר */
    document.getElementById('archive-view').hidden = false;
    document.getElementById('app-screen').hidden = false;
    archive.wireArchiveControls((idea) => clicked.push(idea.id));
    archive.renderArchive(IDEAS, { onItemClick: (idea) => clicked.push(idea.id) });
  });

  const groupBtn = (id) => $(`.cat-btn[data-group="${id}"]`);
  const panelTitles = () => $$('#cat-panel .calm-card__title').map((t) => t.textContent);
  const lastToast = () => { const all = $$('.toast'); return all.length ? all.at(-1).textContent : ''; };

  test('בלי המתג (כל הלקוחות): הרשימה הישנה בדיוק, בלי כפתורים', () => {
    archive.setIdeasRedesign(false);
    assert.equal($$('.cat-btn').length, 0);
    assert.equal($('#archive-list').classList.contains('archive-list--cats'), false);
    assert.equal($$('#archive-list > .archive-item-outer').length, 7);
    assert.equal($('#filter-rating').hidden, false);
    assert.ok($('#sort-order option[value="rating"]'));
  });

  test('עם המתג: שלושה כפתורים צבעוניים עם מספר, הכל סגור, ובלי בידורי', () => {
    archive.setIdeasRedesign(true);
    const btns = $$('#archive-list .cat-btn');
    assert.deepEqual(btns.map((b) => b.dataset.group), ['בעל ערך', 'אישי', 'מכירתי']);
    assert.deepEqual(btns.map((b) => b.querySelector('.cat-btn__count').textContent), ['3', '1', '1']);
    assert.deepEqual(btns.map((b) => b.style.getPropertyValue('--c')),
      ['var(--cat-baal-erech)', 'var(--cat-ishi)', 'var(--cat-mechirti)']);
    assert.ok(btns.every((b) => b.getAttribute('aria-expanded') === 'false'));
    assert.equal($('#cat-panel'), null);
    assert.equal($$('.calm-card').length, 0);
    assert.ok(!/בידורי/.test($('#archive-list').textContent));
    /* טיוטה + בידורי שנשאר: כניסה רביעית שקטה */
    assert.match($('.cat-unsorted').textContent, /עוד לא סווגו · 2/);
    /* צ'יפי הקטגוריה הישנים והדירוג לא על המסך */
    assert.ok($('#archive-view').classList.contains('ideas-cats'));
    assert.equal($('#filter-rating').hidden, true);
    assert.equal($('#sort-order option[value="rating"]'), null);
    assert.ok($('#random-idea-btn').closest('.more-filters-details'));
    assert.ok(!/מביא אנשים חדשים|בונה אמון|מזמין לקנות/.test($('#archive-view').textContent));
  });

  test('לחיצה פותחת את הרעיונות של הסוג, לחיצה נוספת סוגרת, וכפתור סגירה סוגר', () => {
    archive.setIdeasRedesign(true);
    groupBtn('בעל ערך').click();
    assert.equal(groupBtn('בעל ערך').getAttribute('aria-expanded'), 'true');
    assert.equal(groupBtn('בעל ערך').getAttribute('aria-controls'), 'cat-panel');
    /* הכי חדש קודם, ו"ערכי" הישן בפנים */
    assert.deepEqual(panelTitles(), ['מה הסלבס לא מספרים', 'הטעות שכולם עושים', 'רעיון ישן בשם הישן']);
    assert.match($('#cat-panel .cat-panel__title').textContent, /בעל ערך · 3 רעיונות/);
    /* הפאנל ממש אחרי הכפתור שנלחץ (אקורדיון בטלפון) */
    assert.equal(groupBtn('בעל ערך').nextElementSibling.id, 'cat-panel');
    /* בלי 🔥 ובלי שורת התגיות הישנה */
    assert.ok(!/🔥|חייב לצלם/.test($('#cat-panel').textContent));

    /* מעבר לסוג אחר: רק אחד פתוח */
    groupBtn('מכירתי').click();
    assert.equal($$('.cat-btn[aria-expanded="true"]').length, 1);
    assert.deepEqual(panelTitles(), ['הלפני ואחרי של נועה']);
    assert.match($('#cat-panel').textContent, /יש לינק להשראה/);

    /* לחיצה נוספת על אותו כפתור סוגרת */
    groupBtn('מכירתי').click();
    assert.equal($('#cat-panel'), null);
    assert.equal(document.activeElement, groupBtn('מכירתי'), 'הפוקוס נשאר על הכפתור');

    /* וגם כפתור "סגירה" בתוך הפאנל */
    groupBtn('אישי').click();
    $('#cat-panel .cat-panel__close').click();
    assert.equal($('#cat-panel'), null);
    assert.ok($$('.cat-btn').every((b) => b.getAttribute('aria-expanded') === 'false'));
  });

  test('כרטיס בפאנל: לחיצה פותחת את הרעיון, העתקה ובוצע נשארים', () => {
    archive.setIdeasRedesign(true);
    groupBtn('אישי').click();
    const card = $('#cat-panel .calm-card');
    card.querySelector('.calm-card__open').click();
    assert.equal(clicked.at(-1), 'p1');
    assert.ok(card.querySelector('[aria-label="העתקת הרעיון"]'));
    assert.ok(card.querySelector('[aria-label="סימון שהרעיון בוצע"]'));
    groupBtn('אישי').click();
  });

  test('הכניסה השקטה פותחת טיוטות ובידורי שנשאר, כשכל אחד מסומן "עוד לא סווג"', () => {
    archive.setIdeasRedesign(true);
    $('.cat-unsorted').click();
    assert.deepEqual(panelTitles(), ['רעיון שעוד לא סווג', 'סרטון מצחיק מהקליניקה']);
    assert.deepEqual($$('#cat-panel .calm-card__cat').map((c) => c.textContent), ['עוד לא סווג', 'עוד לא סווג']);
    $('.cat-unsorted').click();
    assert.equal($('#cat-panel'), null);
  });

  test('"טיוטות ממתינות לסיווג" מהבית פותח את הכניסה השקטה', () => {
    archive.setIdeasRedesign(true);
    const sel = $('#filter-category');
    sel.value = '__none__';
    sel.dispatchEvent(new w.Event('change'));
    assert.equal($('.cat-unsorted').getAttribute('aria-expanded'), 'true');
    assert.equal(sel.value, '');
    $('.cat-unsorted').click();
  });

  test('חיפוש עובר על כל הסוגים, והמספרים מתעדכנים', async () => {
    archive.setIdeasRedesign(true);
    groupBtn('אישי').click();
    const input = $('#search-input');
    input.value = 'ה';
    input.dispatchEvent(new w.Event('input'));
    await new Promise((r) => setTimeout(r, 260));
    const results = $('.cat-panel--search');
    assert.ok(results, 'אין פאנל תוצאות');
    const titles = [...results.querySelectorAll('.calm-card__title')].map((t) => t.textContent);
    assert.ok(titles.includes('הטעות שכולם עושים'));
    assert.ok(titles.includes('איך עזבתי את ההייטק'));
    assert.ok(titles.includes('הלפני ואחרי של נועה'));
    /* בתוצאות רואים לאיזה סוג כל רעיון שייך */
    assert.ok([...results.querySelectorAll('.calm-card__cat')].some((c) => c.textContent === 'מכירתי'));
    input.value = 'נועה';
    input.dispatchEvent(new w.Event('input'));
    await new Promise((r) => setTimeout(r, 260));
    assert.deepEqual($$('.cat-btn__count').map((c) => c.textContent), ['0', '0', '1']);
    assert.match($('.cat-panel--search .cat-panel__title').textContent, /רעיון אחד/);
    input.value = '';
    input.dispatchEvent(new w.Event('input'));
    await new Promise((r) => setTimeout(r, 260));
    assert.equal($('.cat-panel--search'), null);
    /* הכפתור שהיה פתוח לפני החיפוש חוזר להיות פתוח */
    assert.equal(groupBtn('אישי').getAttribute('aria-expanded'), 'true');
    groupBtn('אישי').click();
  });

  test('סינון קהל ושלב שכנוע עדיין עובד, בתוך המספרים ובפאנל', () => {
    archive.setIdeasRedesign(true);
    $('#quick-chip-viral').click();
    assert.deepEqual($$('.cat-btn__count').map((c) => c.textContent), ['1', '0', '0']);
    groupBtn('אישי').click();
    assert.match($('#cat-panel').textContent, /אין כאן רעיונות שמתאימים לסינון/);
    groupBtn('אישי').click();
    $('#quick-chip-viral').click();
    const stage = $('#filter-persuasion');
    stage.value = s3;
    stage.dispatchEvent(new w.Event('change'));
    assert.deepEqual($$('.cat-btn__count').map((c) => c.textContent), ['0', '1', '1']);
    stage.value = '';
    stage.dispatchEvent(new w.Event('change'));
  });

  test('דירוג שנשאר בתפריט מהעבר לא מסנן במסך החדש, וחוזר כשהמתג כבוי', () => {
    const rating = $('#filter-rating');
    archive.setIdeasRedesign(false);
    const sort = $('#sort-order');
    sort.value = 'rating';
    rating.value = '🔥 חייב לצלם';
    rating.dispatchEvent(new w.Event('change'));
    assert.equal($$('#archive-list > .archive-item-outer').length, 1);
    archive.setIdeasRedesign(true);
    assert.equal(rating.value, '');
    assert.equal(sort.value, 'newest');
    assert.deepEqual($$('.cat-btn__count').map((c) => c.textContent), ['3', '1', '1']);
    archive.setIdeasRedesign(false);
    assert.ok($('#sort-order option[value="rating"]'));
    archive.setIdeasRedesign(true);
  });

  test('רעיונות שבוצעו: בחירה, מחיקת הנבחרים עם אישור ומספר, ואפשר לבטל', async () => {
    archive.setIdeasRedesign(true);
    $('#completed-toggle-btn').click();
    assert.equal($$('.cat-btn').length, 0);
    const bar = $('.done-toolbar');
    assert.ok(bar);
    assert.match(bar.textContent, /3 רעיונות שבוצעו/);
    assert.match(bar.textContent, /מחיקת כל מה שבוצע \(3\)/);
    assert.equal($$('#archive-list .archive-item-outer').length, 3);

    [...bar.querySelectorAll('button')].find((b) => b.textContent === 'בחירה').click();
    assert.ok(document.body.classList.contains('ideas-selecting'));
    const rows = $$('.select-row');
    assert.equal(rows.length, 3);
    /* הסרגל בסוף ונדבק לתחתית */
    assert.ok($('#archive-list').lastElementChild.classList.contains('done-toolbar--selecting'));
    const del = () => $('.done-toolbar__btn--danger');
    assert.equal(del().disabled, true, 'בלי בחירה אי אפשר למחוק');

    const box = (id) => $(`.select-row[data-id="${id}"] input`);
    box('done1').click();
    box('done3').click();
    assert.equal(del().textContent, 'מחיקת הנבחרים (2)');
    assert.equal(del().disabled, false);
    assert.match($('.done-toolbar__hint').textContent, /נבחרו 2/);

    /* ביטול באישור: שום דבר לא נמחק */
    del().click();
    await until(() => !$('#confirm-dialog').hidden, 'האישור נפתח');
    assert.match($('#confirm-dialog-message').textContent, /למחוק 2 רעיונות שבוצעו\?/);
    $('#confirm-dialog-cancel').click();
    await tick();
    assert.equal(calls.batches.length, 0);

    del().click();
    await until(() => !$('#confirm-dialog').hidden, 'האישור נפתח שוב');
    $('#confirm-dialog-ok').click();
    await until(() => calls.batches.length === 1, 'נשלחה כתיבה מרוכזת');
    assert.deepEqual(calls.batches[0].map((op) => op.path).sort(), ['ideas/done1', 'ideas/done3']);
    assert.ok(calls.batches[0].every((op) => op.data.deletedAt === 'ts'), 'מחיקה רכה, כמו מחיקה של רעיון אחד');
    await until(() => /2 רעיונות נמחקו/.test(lastToast()), 'הודעה עם התוצאה');
    assert.equal(document.body.classList.contains('ideas-selecting'), false, 'יוצאים ממצב בחירה');

    /* "בטלו" מחזיר את שניהם */
    [...$$('.toast-action-btn')].at(-1).click();
    await until(() => calls.batches.length === 2, 'ביטול');
    assert.ok(calls.batches[1].every((op) => op.data.deletedAt === null));
  });

  test('מחיקת כל מה שבוצע, ושגיאה נראית ולא שקטה', async () => {
    archive.setIdeasRedesign(true);
    const allBtn = () => [...$$('.done-toolbar__btn')].find((b) => /מחיקת כל מה שבוצע/.test(b.textContent));
    allBtn().click();
    await until(() => !$('#confirm-dialog').hidden, 'האישור נפתח');
    assert.match($('#confirm-dialog-message').textContent, /למחוק 3 רעיונות שבוצעו\?/);
    assert.equal($('#confirm-dialog-ok').textContent, 'מחיקת 3');
    $('#confirm-dialog-ok').click();
    await until(() => calls.batches.length === 3, 'נמחקו');
    assert.deepEqual(calls.batches[2].map((op) => op.path).sort(), ['ideas/done1', 'ideas/done2', 'ideas/done3']);

    batchFails = true;
    allBtn().click();
    await until(() => !$('#confirm-dialog').hidden, 'האישור נפתח');
    $('#confirm-dialog-ok').click();
    await until(() => /שום רעיון לא נמחק/.test(lastToast()), 'הודעת שגיאה');
    batchFails = false;
    $('#completed-toggle-btn').click();
    assert.equal($$('.cat-btn').length, 3);
  });

  test('מחיקה מרובה מחלקת ל-500 בכל כתיבה', async () => {
    const store = await import('../js/ideas-store.js');
    const before = calls.batches.length;
    const ids = Array.from({ length: 1203 }, (_, i) => `x${i}`);
    const res = await store.deleteIdeasBulk(ids);
    assert.equal(res.done.length, 1203);
    assert.deepEqual(calls.batches.slice(before).map((b) => b.length), [500, 500, 203]);
  });

  test('הטופס הקצר: רק הרעיון והלינק, בלי דירוג, פורמט, סדרה ומקליט', () => {
    form.setSimpleIdeaForm(false);
    form.openAddModal();
    assert.equal($('#rec-entry').hidden, false, 'ללקוחות המקליט נשאר');
    form.closeModal();

    form.setSimpleIdeaForm(true);
    form.openAddModal();
    const f = $('#idea-form');
    assert.ok(f.classList.contains('idea-form--simple'));
    /* בדפדפן אמיתי שדה חובה מוסתר חוסם את השמירה בשקט */
    $('#field-title').value = 'רעיון';
    assert.ok(f.checkValidity(), 'הטופס הקצר חייב לעבור את בדיקת הדפדפן עם טקסט בלבד');
    $('#field-title').value = '';
    assert.equal(form.withScheme('instagram.com/p/x'), 'https://instagram.com/p/x');
    assert.equal(form.withScheme('https://a.co'), 'https://a.co');
    assert.equal(form.withScheme('  '), '');
    for (const id of ['rating-chips', 'field-audience-scope', 'field-persuasion', 'field-format', 'field-is-series']) {
      assert.ok($(`#${id}`).closest('[data-simple-hide]'), `#${id} לא מוסתר בטופס הקצר`);
    }
    assert.ok(!$('#field-link').closest('[data-simple-hide]'));
    assert.equal($('#field-link-label').textContent, 'לינק להשראה (אופציונלי)');
    assert.equal($('#category-section').hidden, true, 'בהוספה הסוג נבחר לבד');
    assert.equal($('#rec-entry').hidden, true, 'המיקרופון כבר במסך הבית');
    const css = readFileSync(new URL('../css/ideas-shelves.css', import.meta.url), 'utf8');
    assert.match(css, /\.idea-form--simple \[data-simple-hide\] \{ display: none; \}/);
    form.closeModal();
  });

  test('הוספה עם טקסט בלבד: מסווג לבד ונשמר בלי דירוג', async () => {
    form.setSimpleIdeaForm(true);
    calls.added.length = 0;
    calls.classify.length = 0;
    classifyReply = { category: 'אישי', persuasionStage: s3, audienceScope: 'רחב' };
    form.openAddModal();
    $('#field-title').value = 'הסיפור של היום הראשון בקליניקה';
    $('#field-link').value = 'https://instagram.com/reel/abc';
    $('#idea-form').dispatchEvent(new w.Event('submit', { cancelable: true }));
    await until(() => calls.added.length === 1, 'נשמר');
    assert.deepEqual(calls.classify, [{ title: 'הסיפור של היום הראשון בקליניקה' }]);
    const saved = calls.added[0];
    assert.equal(saved.title, 'הסיפור של היום הראשון בקליניקה');
    assert.equal(saved.sourceLink, 'https://instagram.com/reel/abc');
    assert.equal(saved.category, 'אישי');
    assert.equal(saved.persuasionStage, s3);
    assert.equal(saved.audienceScope, 'רחב');
    assert.equal(saved.rating, '');
    assert.equal(saved.format, '');
    assert.equal(saved.series, '');
    await until(() => $('#idea-modal').hidden, 'הטופס נסגר');
    assert.match(lastToast(), /נשמר תחת "אישי"/);
  });

  test('כשהסיווג נכשל הרעיון לא הולך לאיבוד: נשמר כטיוטה עם הסבר', async () => {
    form.setSimpleIdeaForm(true);
    calls.added.length = 0;
    classifyReply = new Error('down');
    form.openAddModal();
    $('#field-title').value = 'רעיון כשאין שרת';
    $('#idea-form').dispatchEvent(new w.Event('submit', { cancelable: true }));
    await until(() => calls.added.length === 1, 'נשמר');
    assert.equal(calls.added[0].category, '');
    assert.equal(calls.added[0].rating, '');
    await until(() => /עוד לא סווגו/.test(lastToast()), 'הסבר');
    classifyReply = null;
  });

  test('עריכה מראה את הסוג שזוהה, אפשר לתקן, ושדות ישנים לא נדרסים', async () => {
    form.setSimpleIdeaForm(true);
    calls.updated.length = 0;
    calls.classify.length = 0;
    const idea = IDEAS.find((i) => i.id === 'p1');
    form.openEditModal(idea);
    assert.equal($('#category-section').hidden, false);
    const active = $$('#category-chips .category-chip.active').map((c) => c.dataset.value);
    assert.deepEqual(active, ['אישי']);
    const chips = $$('#category-chips .category-chip').filter((c) => !c.classList.contains('category-chip-ai'));
    assert.deepEqual(chips.map((c) => c.dataset.value), ['בעל ערך', 'אישי', 'מכירתי']);
    assert.match($('#category-subhint').textContent, /זוהה לבד/);

    $('#category-chips .category-chip[data-value="מכירתי"]').click();
    $('#idea-form').dispatchEvent(new w.Event('submit', { cancelable: true }));
    await until(() => calls.updated.length === 1, 'עודכן');
    const { path, data } = calls.updated[0];
    assert.equal(path, 'ideas/p1');
    assert.equal(data.category, 'מכירתי');
    assert.equal(data.title, idea.title);
    for (const k of ['rating', 'format', 'series', 'seriesOrder', 'persuasionStage', 'audienceScope']) {
      assert.ok(!(k in data), `השדה ${k} נדרס בעריכה`);
    }
    assert.equal(calls.classify.length, 0, 'יש כבר הכל, אין צורך לסווג');
  });

  test('עריכת רעיון בידורי ישן בלי לבחור סוג: מסווג לאחד משלושת הסוגים', async () => {
    form.setSimpleIdeaForm(true);
    calls.updated.length = 0;
    classifyReply = { category: 'בעל ערך', persuasionStage: s2, audienceScope: 'עיקרי' };
    form.openEditModal(IDEAS.find((i) => i.id === 'b1'));
    assert.equal($$('#category-chips .category-chip.active').length, 0);
    $('#idea-form').dispatchEvent(new w.Event('submit', { cancelable: true }));
    await until(() => calls.updated.length === 1, 'עודכן');
    assert.equal(calls.updated[0].data.category, 'בעל ערך');
    assert.equal(calls.updated[0].data.audienceScope, 'עיקרי');
    classifyReply = null;
  });

  test('מיקרופון הבית: מוסתר בלי המתג, ובלחיצה מקליט במקום, בלי מסך נפרד', () => {
    form.setSimpleIdeaForm(false);
    homeMic.wireHomeMic();
    const card = $('#home-mic-card');
    assert.ok(card.closest('#home-view'), 'המיקרופון חייב להיות במסך הבית');
    assert.equal($('#archive-view #home-mic-card'), null);
    homeMic.setHomeMicVisible(false);
    assert.equal(card.hidden, true);
    homeMic.setHomeMicVisible(true);
    assert.equal(card.hidden, false);
    assert.match(card.textContent, /מה היה היום\?/);
    /* 06/11/2026 ערב: מהבית לא נפתח יותר מסך הקלטה נפרד. מקליטים במקום,
       והטקסט נכתב בתיבה (הזרימה המלאה ב-home-mic-live.test.mjs). */
    card.click();
    const rec = $('#recorder-modal');
    assert.ok(!rec || rec.hidden, 'מהבית נפתח מסך הקלטה נפרד');
    assert.equal($('#idea-modal').hidden, true, 'מהבית נפתח טופס רעיון');
    homeMic.setHomeMicVisible(false);
  });
});
