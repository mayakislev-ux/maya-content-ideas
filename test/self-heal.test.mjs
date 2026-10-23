/* 23/10/2026 (מאיה: "כל הלקוחות לא יכולות לעשות את זה, את חייבת לסדר").

   דף איפוס ידני הוא לא פתרון כשהאפליקציה מותקנת אצל כולן. האפליקציה
   חייבת לזהות שהיא תקועה ולתקן את עצמה. הבדיקה מריצה את המלכודת
   האמיתית מתוך index.html מול דפדפן מדומה, ולא בודקת שהטקסט קיים. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');

const src = (html.match(/<script>\s*\(function \(\) \{[\s\S]*?moach-self-heal[\s\S]*?\}\)\(\);\s*<\/script>/) || [])[0];
assert.ok(src, 'מלכודת הריפוי העצמי לא נמצאה ב-index.html');
const body = src.replace(/^<script>/, '').replace(/<\/script>$/, '');

/** דפדפן מדומה: רק מה שהמלכודת באמת נוגעת בו */
function makeWorld({ healed = false, splashHidden = false } = {}) {
  const store = healed ? { 'moach-self-heal': '1' } : {};
  const w = {
    unregistered: 0, cachesDeleted: 0, reloadedTo: null, listeners: {}, timers: [],
    box: { textContent: '', hidden: true },
    splash: { hidden: splashHidden },
  };
  const env = {
    sessionStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    navigator: {
      serviceWorker: {
        getRegistrations: () => Promise.resolve([{ unregister: () => { w.unregistered += 1; return Promise.resolve(true); } }]),
      },
    },
    caches: {
      keys: () => Promise.resolve(['a', 'b']),
      delete: () => { w.cachesDeleted += 1; return Promise.resolve(true); },
    },
    location: { pathname: '/app/', replace: (u) => { w.reloadedTo = u; } },
    addEventListener: (name, fn) => { w.listeners[name] = fn; },
    setTimeout: (fn, ms) => { w.timers.push({ fn, ms }); return w.timers.length; },
    document: {
      getElementById: (id) => (id === 'launch-splash-error' ? w.box : id === 'launch-splash' ? w.splash : null),
    },
    Promise,
  };
  env.window = env;
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'sessionStorage', 'navigator', 'caches', 'setTimeout', body)(
    env, env.document, env.sessionStorage, env.navigator, env.caches, env.setTimeout
  );
  return w;
}

test('שגיאה בטעינה מפעילה ריפוי עצמי ולא משאירה מסך ריק', async () => {
  const w = makeWorld();
  w.listeners.error({ message: 'boom' });
  assert.match(w.box.textContent, /מרעננים/, 'לא הוצגה הודעה בזמן הריפוי');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(w.unregistered, 1, 'הרכיב ברקע לא נותק');
  assert.equal(w.cachesDeleted, 2, 'המטמונים לא נמחקו');
  assert.match(String(w.reloadedTo), /\?fresh=/, 'הדף לא נטען מחדש');
});

test('בקשה שנכשלה מפעילה את אותו מסלול', async () => {
  const w = makeWorld();
  w.listeners.unhandledrejection({ reason: { code: 'unavailable' } });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(w.unregistered, 1);
  assert.match(String(w.reloadedTo), /\?fresh=/);
});

test('מסך פתיחה שתקוע עשר שניות מרפא את עצמו', async () => {
  const w = makeWorld();
  const stuck = w.timers.find((t) => t.ms === 10000);
  assert.ok(stuck, 'אין בדיקה אחרי עשר שניות');
  stuck.fn();
  await new Promise((r) => setTimeout(r, 10));
  assert.match(String(w.reloadedTo), /\?fresh=/);
});

test('מסך פתיחה שכבר נעלם לא מרפא כלום', async () => {
  const w = makeWorld({ splashHidden: true });
  w.timers.find((t) => t.ms === 10000).fn();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(w.reloadedTo, null, 'רוענן בלי סיבה');
});

test('ריפוי קורה פעם אחת בלבד, ואז מוצגת השגיאה במקום לולאה', async () => {
  const w = makeWorld({ healed: true });
  w.listeners.error({ message: 'boom again' });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(w.reloadedTo, null, 'נוצרה לולאת רענון');
  assert.match(w.box.textContent, /boom again/, 'השגיאה לא הוצגה');
  assert.equal(w.box.hidden, false);
});
