/* 09/11/2026 (מאיה: "ליד כל תסריט לסמן להן אם זה ערך אישי מכירתי ... ולעשות
   בדיעבד לכל התסריטים הקיימים של כולן").
   1. השרת (functions/script-type.js): מתי פריט מקבל סוג, ומה לא נדרס.
   2. "התסריטים שלי": תווית ליד כל תסריט, ובחירה ידנית בלחיצה.
   3. שמירה של העוזר לא מוחקת את הסוג (mergeFields). */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { decideKind } = require('../functions/script-type.js')._internal;

describe('1. מתי פריט מקבל סוג', () => {
  test('סוג שנבחר בעוזר עובר כמו שהוא, בלי AI', () => {
    assert.deepEqual(decideKind({ state: { contentType: 'מכירתי' } }), { type: 'מכירתי', by: 'flow' });
    assert.deepEqual(decideKind({ state: { contentType: 'ערכי' } }), { type: 'בעל ערך', by: 'flow' });
  });
  test('תסריט כתוב בלי סוג: מסווגים', () => {
    assert.deepEqual(decideKind({ state: { branch: 'reference', finalScript: 'א'.repeat(60) } }), { classify: true });
    assert.deepEqual(decideKind({ state: { branch: 'footage', herWords: 'ב'.repeat(60) } }), { classify: true });
  });
  test('בלי תסריט עדיין: מחכים', () => {
    assert.equal(decideKind({ state: { branch: 'scratch', ideaTopic: 'רעיון' } }), null);
  });
  test('יש כבר סוג (גם בחירה ידנית שלה): לא נוגעים', () => {
    assert.equal(decideKind({ contentKind: { type: 'אישי', by: 'user' }, state: { contentType: 'מכירתי', finalScript: 'x'.repeat(80) } }), null);
    assert.equal(decideKind({ contentKind: { type: 'בעל ערך', by: 'ai' }, state: { finalScript: 'x'.repeat(80) } }), null);
  });
  test('הפונקציות מחוברות לשרת', () => {
    const idx = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
    assert.equal((idx.match(/require\('\.\/script-type'\)/g) || []).length, 1);
  });
});

describe('3. שמירה של העוזר לא מוחקת את הסוג', () => {
  test('saveScript כותב עם mergeFields של השדות שלו בלבד', () => {
    const src = readFileSync(new URL('../js/video-assistant-store.js', import.meta.url), 'utf8');
    assert.match(src, /setDoc\(doc\(scriptsCol\(\), id\), data, \{ mergeFields: Object\.keys\(data\) \}\)/);
    assert.match(src, /updateDoc\(doc\(scriptsCol\(\), id\), \{ contentKind \}\)/);
  });
});

const hasJsdom = existsSync('C:/dev/portal-sales/node_modules/jsdom/package.json');
describe('2. "התסריטים שלי"', { skip: hasJsdom ? false : 'אין jsdom' }, () => {
  test('תווית ליד כל תסריט, ולחיצה משנה ונשמרת', async () => {
    const { JSDOM } = createRequire('C:/dev/portal-sales/package.json')('jsdom');
    const dom = new JSDOM('<!doctype html><html dir="rtl"><body></body></html>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    const { openModal, closeModal } = await import('../js/video-assistant-modal.js');
    const { createScriptsLibrary } = await import('../js/video-assistant-library.js');
    const items = [
      { id: 'a', title: 'סיפור לקוחה', done: true, updatedAt: 2, contentKind: { type: 'מכירתי', by: 'ai' }, state: { branch: 'reference', finalScript: 'תסריט' } },
      { id: 'b', title: 'הילדות שלי', done: true, updatedAt: 1, state: { branch: 'reference', finalScript: 'תסריט' } },
    ];
    const kinds = [];
    const lib = createScriptsLibrary({
      getState: () => ({}), saveAll: async () => {},
      store: { listScripts: async () => items, saveScript: async () => {}, deleteScript: async () => {},
        setScriptKind: async (id, type) => { kinds.push([id, type]); return { type, by: 'user', at: 1 }; } },
      openModal, closeModal, copyBtn: () => '', wireCopyButtons: () => {}, confirmDialog: async () => true,
      showToast: () => {}, resume: () => {}, applyLive: () => {}, liveDeleted: () => {},
    });
    const $ = (s) => document.querySelector(s);
    const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await lib.open();
    assert.equal($('.va-lib-item[data-id="a"] .va-kind').textContent, 'מכירתי');
    assert.ok($('.va-lib-item[data-id="a"] .va-kind--sale'));
    assert.equal($('.va-lib-item[data-id="b"] .va-kind'), null, 'בלי סוג אין תווית');

    click($('.va-lib-item[data-id="b"]'));
    assert.match($('.va-kind-row').textContent, /עוד לא סווג/);
    const btns = [...document.querySelectorAll('.va-kind-row [data-kind]')].map((b) => b.textContent);
    assert.deepEqual(btns, ['ערך', 'אישי', 'מכירתי']);
    click($('.va-kind-row [data-kind="אישי"]'));
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(kinds, [['b', 'אישי']]);
    assert.equal($('.va-kind-row .is-on').textContent, 'אישי');
    assert.equal($('#va-lib-saved').textContent, 'סוג התוכן נשמר ✓');

    click($('#va-lib-back'));
    await new Promise((r) => setTimeout(r, 0));
    assert.equal($('.va-lib-item[data-id="b"] .va-kind').textContent, 'אישי');
  });
  test('כל מחלקת va-kind קיימת ב-CSS', () => {
    const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
    for (const c of ['va-kind', 'va-kind--value', 'va-kind--personal', 'va-kind--sale', 'va-kind-row', 'va-kind-row__label', 'va-kind-row__hint']) assert.ok(css.includes(`.${c}`), c);
  });
});
