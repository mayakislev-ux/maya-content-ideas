// 26/10/2026 (מאיה, בשם הבנות): "התסריטים לא נשמרים אוטומטית".
// נבדק גם בלוגיקה הטהורה וגם בהרכבה אמיתית של כרטיס ב-DOM, כי הבאג
// המקורי לא היה בלוגיקה אלא בזה שאף אחד לא קרא לה.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  draftKey, isDraftField, valueFor, withDraft, clearScreenDrafts, savedLabel, mountDrafts,
} from '../js/video-assistant-drafts.js';

describe('המפתח של טיוטה', () => {
  test('כולל את המסך, כדי ששתי תיבות באותו שם לא ידרסו זו את זו', () => {
    assert.notEqual(draftKey('prompt2', 'va-x'), draftKey('her-words', 'va-x'));
  });
});

describe('אילו תיבות נשמרות', () => {
  const el = (tag, type) => ({ tagName: tag, id: 'x', type });
  test('textarea ושדות טקסט', () => {
    assert.ok(isDraftField(el('TEXTAREA')));
    assert.ok(isDraftField(el('INPUT', 'text')));
    assert.ok(isDraftField(el('INPUT', 'url')));
  });
  test('לא כפתורים, לא תיבות סימון, ולא שדה בלי מזהה', () => {
    assert.ok(!isDraftField(el('BUTTON')));
    assert.ok(!isDraftField(el('INPUT', 'checkbox')));
    assert.ok(!isDraftField({ tagName: 'TEXTAREA' }));
    assert.ok(!isDraftField(null));
  });
});

describe('מה נכנס לתיבה', () => {
  const drafts = { 'prompt2|a': 'טיוטה', 'prompt2|b': '' };
  test('מה שהגיע מהסטייט גובר על הטיוטה', () => {
    assert.equal(valueFor(drafts, 'prompt2', 'a', 'מהסטייט'), 'מהסטייט');
  });
  test('תיבה ריקה מתמלאת מהטיוטה', () => {
    assert.equal(valueFor(drafts, 'prompt2', 'a', ''), 'טיוטה');
  });
  /* זה מה שמונע את התקלה ההפוכה: תיבה שנוקתה בכוונה לא מתמלאת שוב. */
  test('ריק ששמור הוא תשובה, ולא היעדר תשובה', () => {
    assert.equal(valueFor(drafts, 'prompt2', 'b', ''), '');
  });
  test('מסך אחר לא מושך את הטיוטה הזאת', () => {
    assert.equal(valueFor(drafts, 'her-words', 'a', ''), '');
  });
});

describe('כתיבה וניקוי', () => {
  test('withDraft לא משנה את הקיים', () => {
    const before = { 'x|a': '1' };
    const after = withDraft(before, 'x', 'b', '2');
    assert.deepEqual(before, { 'x|a': '1' });
    assert.deepEqual(after, { 'x|a': '1', 'x|b': '2' });
  });
  test('יציאה ממסך מנקה רק אותו', () => {
    const d = { 'prompt2|a': '1', 'her-words|b': '2' };
    assert.deepEqual(clearScreenDrafts(d, 'prompt2'), { 'her-words|b': '2' });
  });
  test('ניקוי של ריק לא קורס', () => {
    assert.deepEqual(clearScreenDrafts(null, 'x'), {});
  });
});

describe('השורה שאומרת מה קרה', () => {
  test('לפני שמירה ראשונה היא מסבירה מה הולך לקרות', () => {
    assert.match(savedLabel(0), /נשמר אוטומטית/);
  });
  test('מיד אחרי שמירה', () => {
    const now = Date.now();
    assert.equal(savedLabel(now, now + 100), 'נשמר ✓');
  });
  test('אחר כך עם שעה', () => {
    const now = Date.now();
    assert.match(savedLabel(now, now + 60000), /נשמר ב-\d\d:\d\d ✓/);
  });
});

/* אין תלויות בריפו הזה, ולכן אין jsdom. ה-DOM המזויף כאן מממש
   בדיוק את מה ש-mountDrafts נוגע בו, ולא יותר. זה מספיק כדי להריץ
   את הזרימה האמיתית: הקלדה, המתנה, שמירה, ומה כתוב על המסך. */
class El {
  constructor(tag, attrs = {}) {
    this.tagName = tag.toUpperCase();
    Object.assign(this, attrs);
    this.children = [];
    this.listeners = {};
    if (this.value === undefined && (this.tagName === 'TEXTAREA' || this.tagName === 'INPUT')) this.value = '';
    if (this.textContent === undefined) this.textContent = '';
  }

  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }

  fire(name, target = this) {
    let node = this;
    for (const fn of node.listeners[name] || []) fn({ target });
  }

  all() { return this.children.flatMap((c) => [c, ...c.all()]); }

  querySelectorAll(sel) {
    const want = sel.split(',').map((x) => x.trim().toUpperCase());
    return this.all().filter((c) => want.includes(c.tagName));
  }

  querySelector(sel) {
    const id = sel.replace('#', '');
    return this.all().find((c) => c.id === id) || null;
  }

}

function harness(kids, screen = 'prompt2', drafts = {}) {
  const card = new El('div', { id: 'va-card' });
  card.children.push(...kids);
  let state = { drafts };
  const saves = [];
  let queued = null;
  const api = mountDrafts(card, {
    screen,
    getDrafts: () => state.drafts,
    setDrafts: (d) => { state.drafts = d; },
    save: async () => { saves.push(JSON.parse(JSON.stringify(state.drafts))); },
    setTimer: (fn) => { queued = fn; return 1; },
    clearTimer: () => { queued = null; },
  });
  return { card, api, saves, state: () => state, run: () => queued && queued() };
}

const textarea = (id) => new El('textarea', { id });

describe('הכרטיס האמיתי', () => {
  test('מסך בלי תיבות לא מתחבר לשמירה', () => {
    const h = harness([new El('button', { id: 'go' })]);
    assert.equal(h.api, null);
  });

  /* 29/10/2026 (מאיה): "תעיפי את הכפתור לשמור עכשיו, שלא יהיה את הפס". */
  test('אין יותר שורת שמירה וכפתור', () => {
    const h = harness([textarea('va-prompt2-script-input')]);
    assert.equal(h.card.querySelector('#va-save-bar'), null);
    assert.equal(h.card.querySelector('#va-save-now'), null);
  });

  test('הקלדה נכנסת לטיוטה, ונשמרת לבד אחרי רגע שקט', async () => {
    const ta = textarea('va-prompt2-script-input');
    const h = harness([ta]);
    ta.value = 'התסריט שקיבלתי';
    h.card.fire('input', ta);

    assert.deepEqual(h.state().drafts, { 'prompt2|va-prompt2-script-input': 'התסריט שקיבלתי' });
    assert.equal(h.saves.length, 0, 'עוד לא נשמר');

    await h.run();
    assert.equal(h.saves.length, 1);
    assert.deepEqual(h.saves[0], { 'prompt2|va-prompt2-script-input': 'התסריט שקיבלתי' });
  });

  test('ציור מחדש מחזיר את מה שהוקלד', () => {
    const h = harness([textarea('va-prompt2-script-input')], 'prompt2', {
      'prompt2|va-prompt2-script-input': 'מה שהודבק',
    });
    assert.equal(h.card.querySelector('#va-prompt2-script-input').value, 'מה שהודבק');
  });

  /* תיבה שנראית שמורה ואינה שמורה היא בדיוק התקלה שדווחה. */
  test('כישלון שמירה נאמר ולא נבלע', async () => {
    const card = new El('div', { id: 'va-card' });
    card.children.push(textarea('va-x'));
    let drafts = {};
    let told = 0;
    const api = mountDrafts(card, {
      screen: 's',
      getDrafts: () => drafts,
      setDrafts: (d) => { drafts = d; },
      save: async () => { throw new Error('offline'); },
      onError: () => { told += 1; },
      setTimer: () => 1,
      clearTimer: () => {},
    });
    await api.flush();
    assert.equal(told, 1);
  });
});
