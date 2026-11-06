/* 06/11/2026: מסך הרעיונות בשלושה מדפים (וריאציה 02) ומיקרופון גדול במסך
   הבית (מאיה: "לדעתי הוא צריך להיות פשוט במסך הראשי ולא במסך הרעיונות").
   1. המיפוי מרעיון למדף, וסדר 🔥 בתוך מדף.
   2. המתג: רק מאיה, לא בתצוגה כלקוחה.
   3. jsdom: המסך האמיתי עם ובלי המדפים, כל הפקדים הישנים עדיין שם,
      והמיקרופון בבית פותח את המקליט הקיים. */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { register, createRequire } from 'node:module';

import {
  SHELVES, SHELF_RULES, DEFAULT_SHELF, shelfFor, groupIntoShelves, stageNumber, ideasRedesignFor,
} from '../js/ideas-shelves.js';
import { PERSUASION_STAGES } from '../js/ideas-logic.js';
import { OWNER_EMAIL } from '../js/client-view.js';

const require = createRequire(import.meta.url);

describe('המיפוי לשלושת המדפים', () => {
  test('שלושה מדפים בסדר הקבוע, עם כותרת והסבר, בלי מקף ארוך', () => {
    assert.deepEqual(SHELVES.map((s) => s.id), ['חשיפה', 'חימום', 'מכירה']);
    assert.deepEqual(SHELVES.map((s) => s.title), ['מביא אנשים חדשים', 'בונה אמון', 'מזמין לקנות']);
    for (const s of SHELVES) {
      assert.ok(s.explain.length > 10);
      assert.ok(!/[—–]/.test(s.explain + s.title), `מקף ארוך ב-${s.title}`);
      assert.ok(!/[א-ת]{2,}\/[א-ת]/.test(s.explain), `פנייה ממוגדרת ב-${s.title}`);
    }
    for (const r of SHELF_RULES) assert.ok(SHELVES.some((s) => s.id === r.shelf), `כלל למדף שלא קיים: ${r.shelf}`);
    assert.ok(SHELVES.some((s) => s.id === DEFAULT_SHELF));
  });

  test('שלב השכנוע, כולל הניסוחים הישנים שבמאגר', () => {
    assert.equal(stageNumber(PERSUASION_STAGES[0]), 1);
    assert.equal(stageNumber(PERSUASION_STAGES[1]), 2);
    assert.equal(stageNumber(PERSUASION_STAGES[2]), 3);
    assert.equal(stageNumber('מודעות לבעיה'), 1);
    assert.equal(stageNumber('הבנת הפתרון (השיטה)'), 2);
    assert.equal(stageNumber('למה דווקא אני'), 3);
    assert.equal(stageNumber('__ai__'), 0);
    assert.equal(stageNumber(undefined), 0);
  });

  test('כל כלל במקומו', () => {
    const [s1, s2, s3] = PERSUASION_STAGES;
    /* מכירתי תמיד מזמין לקנות, גם בקהל רחב ובשלב 1 */
    assert.equal(shelfFor({ category: 'מכירתי', persuasionStage: s1, audienceScope: 'רחב' }), 'מכירה');
    /* קהל רחב מביא אנשים חדשים, גם כשהוא אישי או בשלב 2 */
    assert.equal(shelfFor({ category: 'אישי', persuasionStage: s3, audienceScope: 'רחב' }), 'חשיפה');
    assert.equal(shelfFor({ category: 'בעל ערך', persuasionStage: s2, audienceScope: 'רחב' }), 'חשיפה');
    assert.equal(shelfFor({ category: 'בעל ערך', audienceScope: 'קהל רחב' }), 'חשיפה');
    assert.equal(shelfFor({ category: 'בידורי', persuasionStage: s3, audienceScope: 'עיקרי' }), 'חשיפה');
    /* אישי בונה אמון גם בשלב 3, אחרת כל האישיים היו "מזמין לקנות" */
    assert.equal(shelfFor({ category: 'אישי', persuasionStage: s3, audienceScope: 'עיקרי' }), 'חימום');
    assert.equal(shelfFor({ category: 'בעל ערך', persuasionStage: s1, audienceScope: 'עיקרי' }), 'חשיפה');
    assert.equal(shelfFor({ category: 'בעל ערך', persuasionStage: s2, audienceScope: 'משני' }), 'חימום');
    assert.equal(shelfFor({ category: 'בעל ערך', persuasionStage: s3, audienceScope: 'עיקרי' }), 'מכירה');
    assert.equal(shelfFor({ category: 'ערכי', persuasionStage: 'מודעות לבעיה', audienceScope: 'קהל עיקרי' }), 'חשיפה');
  });

  test('רעיון בלי שום דבר שאפשר לגזור ממנו לא הולך לאיבוד', () => {
    assert.equal(shelfFor({ title: 'טיוטה' }), DEFAULT_SHELF);
    assert.equal(shelfFor({ category: 'בעל ערך', audienceScope: 'עיקרי' }), DEFAULT_SHELF);
    assert.equal(shelfFor({ category: 'בעל ערך', persuasionStage: '__ai__' }), DEFAULT_SHELF);
    assert.equal(shelfFor(null), DEFAULT_SHELF);
    const ideas = Array.from({ length: 40 }, (_, i) => ({
      id: `i${i}`,
      category: ['בעל ערך', 'אישי', 'מכירתי', '', 'ערכי', 'בידורי'][i % 6],
      persuasionStage: [...PERSUASION_STAGES, '', 'משהו אחר'][i % 5],
      audienceScope: ['עיקרי', 'משני', 'רחב', ''][i % 4],
    }));
    const total = groupIntoShelves(ideas).reduce((n, g) => n + g.ideas.length, 0);
    assert.equal(total, ideas.length);
  });

  test('בתוך מדף: 🔥 קודם, אחר כך ⭐, ואז השאר, ובאותו דירוג הסדר נשמר', () => {
    const s2 = PERSUASION_STAGES[1];
    const ideas = [
      { id: 'a', category: 'בעל ערך', persuasionStage: s2, rating: '💭 רעיון לעתיד' },
      { id: 'b', category: 'בעל ערך', persuasionStage: s2, rating: '⭐ שווה לצלם' },
      { id: 'c', category: 'בעל ערך', persuasionStage: s2 },
      { id: 'd', category: 'בעל ערך', persuasionStage: s2, rating: '🔥 חייב לצלם' },
      { id: 'e', category: 'אישי', rating: '⭐ שווה לצלם' },
      { id: 'f', category: 'אישי', rating: '🔥 חייב לצלם' },
      { id: 'g', category: 'מכירתי', rating: '🔥 חייב לצלם' },
    ];
    const groups = groupIntoShelves(ideas);
    assert.deepEqual(groups.map((g) => g.id), ['חשיפה', 'חימום', 'מכירה']);
    assert.deepEqual(groups[0].ideas, []);
    assert.deepEqual(groups[1].ideas.map((i) => i.id), ['d', 'f', 'b', 'e', 'a', 'c']);
    assert.deepEqual(groups[2].ideas.map((i) => i.id), ['g']);
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

  test('app.js מדליק את המדפים ואת המיקרופון מאותו מתג אחד', () => {
    const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
    assert.match(app, /const ideasRedesign = ideasRedesignFor\(user\.email\);/);
    assert.match(app, /setShelvesLayout\(ideasRedesign\);/);
    assert.match(app, /setHomeMicVisible\(ideasRedesign\);/);
    assert.match(app, /\nwireHomeMic\(\);/);
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    assert.match(html, /<link rel="stylesheet" href="css\/ideas-shelves\.css">/);
    assert.match(html, /id="home-mic-card" class="home-mic-card" hidden/);
    const css = readFileSync(new URL('../css/ideas-shelves.css', import.meta.url), 'utf8');
    assert.match(css, /\.home-mic-card\[hidden\] \{ display: none; \}/);
  });

  test('ה-CSS החדש משתמש רק בטוקנים שקיימים ב-style.css', () => {
    const base = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../css/ideas-shelves.css', import.meta.url), 'utf8');
    const defined = new Set([...base.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    for (const [, name] of css.matchAll(/var\((--[\w-]+)/g)) assert.ok(defined.has(name), `טוקן לא קיים: ${name}`);
    assert.ok(!/(^|[;{\s])--[\w-]+\s*:/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'ה-CSS החדש מגדיר טוקן משלו');
  });
});

/* ---------------- המסך האמיתי ב-jsdom ---------------- */

const JSDOM_PATH = 'C:/dev/portal-sales/node_modules/jsdom/lib/api.js';
const hasJsdom = existsSync(JSDOM_PATH);

function ts(ms) {
  return { toMillis: () => ms, toDate: () => new Date(ms) };
}

describe('המסך (jsdom)', { skip: hasJsdom ? false : 'jsdom לא מותקן' }, () => {
  let w;
  let archive;
  let homeMic;
  const clicked = [];
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const [s1, s2, s3] = PERSUASION_STAGES;
  const now = Date.now();
  const IDEAS = [
    { id: 'x1', title: 'מה הסלבס לא מספרים', category: 'בעל ערך', persuasionStage: s1, audienceScope: 'עיקרי', rating: '⭐ שווה לצלם', createdAt: ts(now - 1000) },
    { id: 'x2', title: 'הטעות שכולם עושים', category: 'בעל ערך', persuasionStage: s1, audienceScope: 'עיקרי', rating: '🔥 חייב לצלם', createdAt: ts(now - 9000) },
    { id: 't1', title: 'למה פילינג ביתי מזיק', category: 'בעל ערך', persuasionStage: s2, audienceScope: 'עיקרי', rating: '💭 רעיון לעתיד', createdAt: ts(now - 2000) },
    { id: 't2', title: 'איך עזבתי את ההייטק', category: 'אישי', persuasionStage: s3, audienceScope: 'עיקרי', rating: '🔥 חייב לצלם', createdAt: ts(now - 8000) },
    { id: 't3', title: 'רעיון שעוד לא סווג', createdAt: ts(now - 500) },
    { id: 's1', title: 'הלפני ואחרי של נועה', category: 'מכירתי', persuasionStage: s3, audienceScope: 'עיקרי', rating: '⭐ שווה לצלם', createdAt: ts(now - 3000) },
    { id: 'done', title: 'רעיון שכבר צולם', category: 'מכירתי', rating: '🔥 חייב לצלם', createdAt: ts(now - 4000), completedAt: ts(now) },
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
      httpsCallable: () => async () => ({ data: {} }),
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
    (await import('../js/confirm-dialog.js')).wireConfirmDialog();
    archive = await import('../js/archive-view.js');
    homeMic = await import('../js/home-mic.js');
    archive.wireArchiveControls((idea) => clicked.push(idea.id));
    archive.renderArchive(IDEAS, { onItemClick: (idea) => clicked.push(idea.id) });
  });

  test('בלי המתג (כל הלקוחות): הרשימה הישנה בדיוק, בלי מדפים', () => {
    archive.setShelvesLayout(false);
    assert.equal($$('.ideas-shelf').length, 0);
    assert.equal($('#archive-list').classList.contains('archive-list--shelves'), false);
    assert.equal($$('#archive-list > .archive-item-outer').length, 6);
    /* הטיוטה קודם, ואז הכי חדש קודם, כמו היום */
    assert.equal($('#archive-list > .archive-item-outer strong').textContent, 'רעיון שעוד לא סווג');
  });

  test('עם המתג (מאיה): שלושה מדפים, הסבר בכל אחד, ו-🔥 ראשון בכל מדף', () => {
    archive.setShelvesLayout(true);
    const shelves = $$('#archive-list > .ideas-shelf');
    assert.deepEqual(shelves.map((s) => s.dataset.shelf), ['חשיפה', 'חימום', 'מכירה']);
    assert.deepEqual(shelves.map((s) => s.querySelector('.ideas-shelf__title').textContent),
      ['מביא אנשים חדשים', 'בונה אמון', 'מזמין לקנות']);
    for (const s of shelves) assert.ok(s.querySelector('.ideas-shelf__explain').textContent.length > 10);
    const titles = (s) => [...s.querySelectorAll('.archive-item strong')].map((t) => t.textContent);
    assert.deepEqual(titles(shelves[0]), ['הטעות שכולם עושים', 'מה הסלבס לא מספרים']);
    assert.deepEqual(titles(shelves[1]), ['איך עזבתי את ההייטק', 'למה פילינג ביתי מזיק', 'רעיון שעוד לא סווג']);
    assert.deepEqual(titles(shelves[2]), ['הלפני ואחרי של נועה']);
    assert.equal(shelves[1].querySelector('.ideas-shelf__count').textContent, '3 רעיונות');
    assert.equal(shelves[2].querySelector('.ideas-shelf__count').textContent, 'רעיון אחד');
    /* שום רעיון פעיל לא נעלם */
    assert.equal($$('#archive-list .archive-item-outer').length, 6);
    /* אין סולם ערך גבוה/בינוני/נמוך */
    assert.ok(!/ערך גבוה|ערך בינוני|ערך נמוך/.test($('#archive-view').textContent));
  });

  test('הכרטיס במדף הוא אותו כרטיס: לחיצה פותחת עריכה, והעתקה ובוצע במקומם', () => {
    archive.setShelvesLayout(true);
    const card = $('.ideas-shelf[data-shelf="מכירה"] .archive-item');
    card.click();
    assert.equal(clicked.at(-1), 's1');
    assert.ok(card.querySelector('.copy-idea-btn'));
    assert.match(card.querySelector('.complete-idea-btn').textContent, /בוצע/);
    assert.ok(card.parentElement.querySelector('.swipe-action-delete'));
    assert.ok(card.querySelector('.rating-tag'));
  });

  test('כל הפקדים הישנים של המסך עדיין קיימים ועובדים עם המדפים', () => {
    archive.setShelvesLayout(true);
    for (const id of ['search-input', 'filter-category', 'filter-audience-scope', 'filter-persuasion', 'filter-rating',
      'sort-order', 'quick-chip-viral', 'completed-toggle-btn', 'add-idea-top-btn', 'random-idea-btn', 'idea-count',
      'archive-title-label', 'quick-add-input', 'quick-add-btn']) {
      assert.ok(document.getElementById(id), `חסר: #${id}`);
    }
    assert.equal($$('.quick-chip[data-category]').length, 4);

    /* צ'יפ קטגוריה מסנן בתוך המדפים, ומדף ריק נעלם בזמן סינון */
    $('.quick-chip[data-category="מכירתי"]').click();
    assert.deepEqual($$('.ideas-shelf').map((s) => s.dataset.shelf), ['מכירה']);
    $('.quick-chip[data-category=""]').click();
    assert.equal($$('.ideas-shelf').length, 3);

    /* דירוג */
    const rating = $('#filter-rating');
    rating.value = '🔥 חייב לצלם';
    rating.dispatchEvent(new w.Event('change'));
    assert.deepEqual($$('.ideas-shelf').map((s) => s.dataset.shelf), ['חשיפה', 'חימום']);
    rating.value = '';
    rating.dispatchEvent(new w.Event('change'));

    /* "רעיונות שבוצעו" נשארים רשימה אחת */
    $('#completed-toggle-btn').click();
    assert.equal($$('.ideas-shelf').length, 0);
    assert.equal($('#archive-list').classList.contains('archive-list--shelves'), false);
    assert.deepEqual($$('#archive-list .archive-item strong').map((t) => t.textContent), ['רעיון שכבר צולם']);
    $('#completed-toggle-btn').click();
    assert.equal($$('.ideas-shelf').length, 3);
  });

  test('מדף ריק בלי סינון נשאר עם שורה שקטה, ולא נעלם', () => {
    archive.setShelvesLayout(true);
    archive.renderArchive(IDEAS.filter((i) => i.category !== 'מכירתי'), { onItemClick: () => {} });
    const sale = $('.ideas-shelf[data-shelf="מכירה"]');
    assert.ok(sale);
    assert.equal(sale.querySelector('.ideas-shelf__empty').textContent, 'עדיין אין כאן רעיונות');
    archive.renderArchive(IDEAS, { onItemClick: (idea) => clicked.push(idea.id) });
  });

  test('מיקרופון הבית: מוסתר בלי המתג, ובלחיצה פותח את המקליט הקיים', () => {
    homeMic.wireHomeMic();
    const card = $('#home-mic-card');
    assert.ok(card.closest('#home-view'), 'המיקרופון חייב להיות במסך הבית');
    assert.equal($('#archive-view #home-mic-card'), null);
    assert.equal(card.hidden, true);

    /* בדפדפן בלי הקלטה הוא לא מופיע גם עם המתג */
    homeMic.setHomeMicVisible(true);
    assert.equal(card.hidden, true);

    class FakeRecorder { static isTypeSupported() { return true; } }
    globalThis.MediaRecorder = FakeRecorder;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: async () => ({ getTracks: () => [] }) },
      configurable: true,
    });
    homeMic.setHomeMicVisible(false);
    assert.equal(card.hidden, true);
    homeMic.setHomeMicVisible(true);
    assert.equal(card.hidden, false);
    assert.match(card.textContent, /מה היה היום\?/);

    assert.equal($('#recorder-modal'), null, 'המקליט נבנה רק כשפותחים אותו');
    card.click();
    assert.equal($('#recorder-modal').hidden, false);
    assert.equal($('#idea-modal').hidden, true, 'מהבית נפתח המקליט ולא טופס רעיון');
    assert.equal($$('#recorder-modal').length, 1);
    delete globalThis.MediaRecorder;
  });
});
