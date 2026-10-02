import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/**
 * 02/10/2026 (מאיה): "לא הצלחנו לטעון את התמונות. (storage/unauthorized)...
 * וגם אם כבר יש תמונות שזה יראה לי מה קיים במאגר, ולמה זה לא נשמר, למה כל
 * פעם מחדש, קיצר מעצבן לא עובד".
 *
 * הסיבה: ה-service worker יירט כל בקשת GET ושלח אותה מחדש לפי הכתובת בלבד.
 * בקשה שנבנית מכתובת אינה נושאת את כותרת Authorization, ולכן כל קריאה
 * מאובטחת ל-Storage הגיעה לשרת בלי התחברות ונחסמה. ההעלאה עבדה כי היא POST.
 *
 * הטסט מריץ את ה-service worker האמיתי ובודק התנהגות, לא טקסט.
 */

function runServiceWorker() {
  const src = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const handlers = {};
  const calls = { fetchArgs: [] };

  const sandbox = {
    console,
    URL,
    Promise,
    setTimeout,
    self: {
      addEventListener: (name, fn) => { handlers[name] = fn; },
      skipWaiting: () => {},
      clients: { claim: () => {}, matchAll: async () => [], openWindow: () => {} },
      registration: { showNotification: () => {} },
      location: { origin: 'https://mayakislev-ux.github.io' },
    },
    caches: {
      open: async () => ({ put: async () => {}, add: async () => {}, addAll: async () => {} }),
      match: async () => undefined,
      keys: async () => [],
      delete: async () => {},
    },
    fetch: (...args) => {
      calls.fetchArgs.push(args);
      return Promise.resolve({ clone: () => ({}), ok: true });
    },
  };
  sandbox.self.caches = sandbox.caches;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return { handlers, calls, origin: sandbox.self.location.origin };
}

function fakeEvent(url, method = 'GET') {
  let responded = false;
  return {
    request: { url, method, headers: { Authorization: 'Firebase token' } },
    respondWith: () => { responded = true; },
    waitUntil: () => {},
    get responded() { return responded; },
  };
}

test('בקשה מאובטחת ל-Storage לא מיורטת, ולכן ההזדהות שורדת', () => {
  const { handlers } = runServiceWorker();
  const e = fakeEvent('https://firebasestorage.googleapis.com/v0/b/content-ideas-becd7-story-assets/o?prefix=storyAssets%2Fabc%2F');
  handlers.fetch(e);
  assert.equal(e.responded, false, 'ה-service worker חייב לתת לבקשה הזאת לעבור כמו שהיא');
});

test('גם קריאת מטא-דאטה של קובץ בודד עוברת', () => {
  const { handlers } = runServiceWorker();
  const e = fakeEvent('https://firebasestorage.googleapis.com/v0/b/content-ideas-becd7-story-assets/o/storyAssets%2Fabc%2Fx.jpg');
  handlers.fetch(e);
  assert.equal(e.responded, false);
});

test('גם קריאות לשאר ה-API של גוגל עוברות', () => {
  const { handlers } = runServiceWorker();
  for (const url of [
    'https://firestore.googleapis.com/v1/projects/content-ideas-becd7/databases/(default)/documents/storySettings/abc',
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup',
    'https://us-central1-content-ideas-becd7.cloudfunctions.net/breakdownStorySequence',
  ]) {
    const e = fakeEvent(url);
    handlers.fetch(e);
    assert.equal(e.responded, false, url);
  }
});

test('קבצי האפליקציה עצמה כן מיורטים, אחרת עדכונים לא מגיעים', () => {
  const { handlers, origin } = runServiceWorker();
  for (const path of ['/maya-content-ideas/index.html', '/maya-content-ideas/js/app.js', '/maya-content-ideas/css/style.css']) {
    const e = fakeEvent(`${origin}${path}`);
    handlers.fetch(e);
    assert.equal(e.responded, true, path);
  }
});

test('ה-SDK של פיירבייס עדיין נשמר במטמון, כי זה חוסך מאות קילובייט', () => {
  const { handlers } = runServiceWorker();
  const e = fakeEvent('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
  handlers.fetch(e);
  assert.equal(e.responded, true, 'קובץ עם גרסה בכתובת הוא בטוח למטמון');
});

test('העלאה אף פעם לא הייתה מיורטת, ולכן היא עבדה', () => {
  const { handlers } = runServiceWorker();
  const e = fakeEvent('https://firebasestorage.googleapis.com/v0/b/x/o?name=y', 'POST');
  handlers.fetch(e);
  assert.equal(e.responded, false);
});
