/* 04/11/2026 (מאיה), "התסריטים שלי":
   1. "אני רוצה שיהיה שם אפשרות לערוך במידת הצורך"
   2. "אפילו קליק הכי קטן במסך והחלונית כל שניה נסגרת"
   3. "שיופיע כל תהליך היצירה ושממש יופיע שם גם את שלב המגילת אסתר"

   החלון האמיתי (video-assistant-library.js + video-assistant-modal.js)
   נפתח ב-jsdom, ולוחצים בו כמו משתמשת. רק Firestore והדיאלוגים מזויפים. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const JSDOM_PKG = 'C:/dev/portal-sales/package.json';
const hasJsdom = existsSync('C:/dev/portal-sales/node_modules/jsdom/package.json');
const skip = hasJsdom ? false : 'jsdom לא מותקן ב-C:/dev/portal-sales';

const { openModal, closeModal, requestCloseModal } = await import('../js/video-assistant-modal.js');
const { createScriptsLibrary, scriptJourney } = await import('../js/video-assistant-library.js');
const { INITIAL_STATE } = await import('../js/video-assistant-flow.js');

const MEGILLAH = 'אני רוצה לספר על הלקוחה שהגיעה אליי אחרי שנה של ממומן ששרף לה את כל הכסף';

const REF_ITEM = {
  id: 'r1', title: 'שכפול של רפרנס', done: true, createdAt: 1, updatedAt: 2,
  state: {
    ...INITIAL_STATE, branch: 'reference', screen: 'summary',
    referenceLink: 'https://www.instagram.com/reel/abc/', transcript: 'התמלול של הסרטון המקורי',
    herWords: MEGILLAH, hook: 'שרפת 5,000 על ממומן?', finalScript: 'התסריט הסופי שלי',
  },
};
const SCRATCH_ITEM = {
  id: 's1', title: 'ממומן לא מציל', done: false, createdAt: 3, updatedAt: 4,
  state: {
    ...INITIAL_STATE, branch: 'scratch', screen: 'scratch-distill',
    ideaTopic: 'ממומן לא מציל שיווק חלש', ideaPunchline: 'העמוד הוא זה שמוכר',
    packaging: 'מכתב מהעמוד', startingPoint: 'סיפור לקוח', selectedFormat: 'דיבור למצלמה',
    rawDump: MEGILLAH, hook: 'שרפת 5,000?', hookReinforcement: 'כן, שרפת', draftScript: 'טיוטה מזוקקת',
  },
};

function setup({ liveId = null, saveFails = false, confirm = true } = {}) {
  const require = createRequire(JSDOM_PKG);
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html dir="rtl"><body><div id="video-assistant-screen"></div></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  const writes = [];
  const confirms = [];
  const applied = [];
  const items = [structuredClone(SCRATCH_ITEM), structuredClone(REF_ITEM)];
  let state = liveId ? { ...structuredClone(items.find((i) => i.id === liveId).state), scriptId: liveId } : { ...INITIAL_STATE };
  const lib = createScriptsLibrary({
    getState: () => state,
    saveAll: async () => {},
    store: {
      listScripts: async () => items,
      saveScript: async (id, data) => {
        if (saveFails) throw new Error('offline');
        writes.push({ id, data });
      },
      deleteScript: async () => {},
    },
    openModal, closeModal,
    copyBtn: (text, label) => `<button type="button" data-copy-text="${encodeURIComponent(text)}">${label}</button>`,
    wireCopyButtons: () => {},
    confirmDialog: async (msg) => { confirms.push(msg); return confirm; },
    showToast: () => {},
    resume: () => {},
    applyLive: (changes) => { applied.push(changes); state = { ...state, ...changes }; },
    liveDeleted: () => {},
  });
  const $ = (sel) => document.querySelector(sel);
  const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const openItem = async (id) => {
    await lib.open();
    click($(`.va-lib-item[data-id="${id}"]`));
  };
  return { dom, lib, $, click, tick, openItem, writes, confirms, applied, getState: () => state };
}

const isOpen = () => !!document.querySelector('.cosmic-modal-overlay');

test('לחיצה בתוך החלון, על הרקע, או סימון טקסט שנגמר בחוץ: החלון נשאר פתוח', { skip }, async () => {
  const t = setup();
  await t.openItem('r1');
  t.click(t.$('.va-lib-step__text'));
  t.click(t.$('.cosmic-modal'));
  assert.ok(isOpen(), 'נסגר בלחיצה בתוך החלון');
  /* סימון שמתחיל בתוך החלון ונגמר על הרקע: הדפדפן שולח click לרקע */
  t.click(t.$('.cosmic-modal-overlay'));
  assert.ok(isOpen(), 'נסגר בלחיצה על הרקע');
  t.click(t.$('#va-lib-back'));
  await t.tick();
  assert.ok(t.$('.va-lib-list'), 'החזרה לרשימה לא עבדה');
  assert.ok(isOpen());
});

test('✕ סוגר, וגם Escape', { skip }, async () => {
  const t = setup();
  await t.lib.open();
  t.click(t.$('.cosmic-modal-close'));
  await t.tick();
  assert.equal(isOpen(), false, '✕ לא סגר');
  await t.lib.open();
  requestCloseModal();
  await t.tick();
  assert.equal(isOpen(), false, 'Escape לא סגר');
});

test('בעריכה עם שינויים שלא נשמרו ✕ שואל לפני שסוגר', { skip }, async () => {
  const t = setup({ confirm: false });
  await t.openItem('r1');
  t.click(t.$('#va-lib-edit'));
  const ta = t.$('textarea[data-field="finalScript"]');
  ta.value = 'שיניתי';
  ta.dispatchEvent(new t.dom.window.Event('input', { bubbles: true }));
  t.click(t.$('.cosmic-modal-close'));
  await t.tick();
  assert.equal(t.confirms.length, 1, 'לא נשאלה');
  assert.ok(isOpen(), 'נסגר עם שינויים שלא נשמרו');
  requestCloseModal();
  await t.tick();
  assert.ok(isOpen(), 'Escape סגר עם שינויים שלא נשמרו');
  assert.equal(t.$('textarea[data-field="finalScript"]').value, 'שיניתי', 'הטקסט שנכתב נעלם');
});

test('כל תהליך היצירה מופיע לפי הסדר, כולל מגילת אסתר', { skip }, async () => {
  const t = setup();
  await t.openItem('s1');
  const labels = [...document.querySelectorAll('.va-lib-step__label')].map((el) => el.textContent);
  assert.deepEqual(labels, ['הרעיון', 'המסר', 'האריזה', 'הפורמט', 'מגילת אסתר', 'ההוק', 'חיזוק ההוק', 'התסריט הסופי']);
  const megillah = t.$('[data-step="megillah"]');
  assert.ok(megillah.textContent.includes(MEGILLAH), 'המגילה לא מוצגת');
  assert.match(t.$('[data-step="packaging"]').textContent, /נקודת היציאה: סיפור לקוח/);
  assert.match(t.$('[data-step="script"]').textContent, /טיוטה מזוקקת/);

  t.click(t.$('#va-lib-back'));
  await t.tick();
  t.click(t.$('.va-lib-item[data-id="r1"]'));
  const ref = [...document.querySelectorAll('.va-lib-step__label')].map((el) => el.textContent);
  assert.deepEqual(ref, ['הסרטון ששוכפל', 'התמלול של הרפרנס', 'מגילת אסתר', 'ההוק', 'התסריט הסופי']);
  assert.equal(t.$('[data-step="refLink"] a').getAttribute('href'), REF_ITEM.state.referenceLink);
});

test('סרטון ישן בלי מגילה: אין שלב ריק או ממולא בדמה', () => {
  const old = { ...INITIAL_STATE, branch: 'idea', ideaTopic: 'רעיון', selectedFormat: 'פורמט' };
  assert.deepEqual(scriptJourney(old).map((s) => s.key), ['idea', 'format']);
  const footage = { ...INITIAL_STATE, branch: 'footage', footageKind: 'speech', ideaDescription: 'מסר', herWords: 'הטקסט' };
  const j = scriptJourney(footage);
  assert.deepEqual(j.map((s) => s.label), ['המסר', 'הטקסט הסופי']);
});

test('לערוך ולשמור: המסמך נכתב, ורואים "נשמר ✓"', { skip }, async () => {
  const t = setup();
  await t.openItem('s1');
  t.click(t.$('#va-lib-edit'));
  const script = t.$('textarea[data-field="draftScript"]');
  const megillah = t.$('textarea[data-field="rawDump"]');
  const topic = t.$('textarea[data-field="ideaTopic"]');
  assert.ok(script && megillah && topic, 'אין תיבות עריכה');
  script.value = 'התסריט אחרי עריכה';
  megillah.value = 'מגילה חדשה';
  topic.value = 'נושא חדש';
  for (const ta of [script, megillah, topic]) ta.dispatchEvent(new t.dom.window.Event('input', { bubbles: true }));
  t.click(t.$('#va-lib-save'));
  await t.tick();
  assert.equal(t.writes.length, 1, 'לא נכתב');
  const { id, data } = t.writes[0];
  assert.equal(id, 's1');
  assert.equal(data.state.draftScript, 'התסריט אחרי עריכה');
  assert.equal(data.state.rawDump, 'מגילה חדשה');
  assert.equal(data.title, 'נושא חדש');
  assert.equal(data.createdAt, 3);
  assert.match(data.state.ideaDescription, /נושא חדש/, 'המשפט שהפרומפטים קוראים לא התעדכן');
  assert.equal(t.$('#va-lib-saved').textContent, 'נשמר ✓');
  assert.equal(t.$('textarea'), null, 'נשאר במצב עריכה');
  assert.match(t.$('[data-step="script"]').textContent, /התסריט אחרי עריכה/);
  t.click(t.$('.cosmic-modal-close'));
  await t.tick();
  assert.equal(t.confirms.length, 0, 'שאלה על שינויים שכבר נשמרו');
  assert.equal(isOpen(), false);
});

test('שמירה שנכשלה: נשארים בעריכה, הטקסט לא נעלם, ונאמר שלא עבר', { skip }, async () => {
  const t = setup({ saveFails: true });
  await t.openItem('r1');
  t.click(t.$('#va-lib-edit'));
  const ta = t.$('textarea[data-field="herWords"]');
  ta.value = 'מגילה ששיניתי';
  ta.dispatchEvent(new t.dom.window.Event('input', { bubbles: true }));
  t.click(t.$('#va-lib-save'));
  await t.tick();
  assert.match(t.$('#va-lib-saved').textContent, /לא עברה/);
  assert.equal(t.$('textarea[data-field="herWords"]').value, 'מגילה ששיניתי');
  assert.equal(t.$('#va-lib-save').disabled, false);
});

test('הסרטון שפתוח עכשיו בעוזר נערך גם הוא, והשינוי עובר לעוזר', { skip }, async () => {
  const t = setup({ liveId: 'r1' });
  await t.openItem('r1');
  assert.ok(t.$('.va-lib-live'));
  t.click(t.$('#va-lib-edit'));
  const ta = t.$('textarea[data-field="hook"]');
  assert.equal(ta.readOnly, false);
  ta.value = 'הוק חדש';
  ta.dispatchEvent(new t.dom.window.Event('input', { bubbles: true }));
  t.click(t.$('#va-lib-save'));
  await t.tick();
  assert.equal(t.writes[0].data.state.hook, 'הוק חדש');
  assert.deepEqual(t.applied, [{ hook: 'הוק חדש' }]);
  assert.equal(t.getState().hook, 'הוק חדש');
});

test('העוזר מחבר את החלון: בלי סגירה ברקע, Escape דרך השאלה', () => {
  return import('node:fs').then(({ readFileSync }) => {
    const va = readFileSync(new URL('../js/video-assistant.js', import.meta.url), 'utf8');
    const lib = readFileSync(new URL('../js/video-assistant-library.js', import.meta.url), 'utf8');
    assert.match(va, /if \(e\.key === 'Escape'\) requestCloseModal\(\)/);
    assert.match(lib, /openModal\([^)]*\{ backdropClose: false, beforeClose: leaveOk \}\)/);
  });
});
