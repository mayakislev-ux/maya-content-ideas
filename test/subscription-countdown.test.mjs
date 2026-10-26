/* 22/10/2026: מנוי לחודש בודד נסגר בלי שום אזהרה מוקדמת, ולקוחה שרוצה
   להמשיך מגלה את זה רק כשהדלת כבר נעולה. השעון הזה הוא ההתראה שלה.
   הבדיקה מריצה את הפונקציה האמיתית מתוך app.js, ולא בודקת שהטקסט קיים
   בקוד. אין בריפו הזה תלויות npm, ולכן ה-DOM כאן הוא בדיוק מה שהפונקציה
   נוגעת בו ולא יותר. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(ROOT, 'js', 'app.js'), 'utf8');

const fnSrc = (src.match(/function showSubscriptionCountdown\(access\) \{[\s\S]*?\n\}/) || [])[0];
assert.ok(fnSrc, 'showSubscriptionCountdown לא נמצאה ב-app.js');

function makeDocument() {
  const nodes = [];
  const el = () => ({
    className: '',
    innerHTML: '',
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k] ?? null; },
    get classList() {
      const names = String(this.className).split(/\s+/).filter(Boolean);
      return { contains: (n) => names.includes(n) };
    },
    get textContent() { return String(this.innerHTML).replace(/<[^>]*>/g, ''); },
  });
  return {
    createElement: el,
    body: { prepend: (node) => nodes.unshift(node) },
    querySelector: (sel) => {
      const want = sel.replace(/^\./, '');
      return nodes.find((n) => String(n.className).split(/\s+/).includes(want)) || null;
    },
    querySelectorAll: (sel) => {
      const want = sel.replace(/^\./, '');
      return nodes.filter((n) => String(n.className).split(/\s+/).includes(want));
    },
  };
}

function load(doc) {
  return new Function('document', `${fnSrc}; return showSubscriptionCountdown;`)(doc);
}

function run(access) {
  const doc = makeDocument();
  load(doc)(access);
  return doc.querySelector('.sub-countdown');
}

const inDays = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

test('מנוי מתחדש לא מציג שום שעון', () => {
  assert.equal(run({ showCountdown: false, paidUntil: inDays(10) }), null);
});

test('בלי תאריך סיום אין שעון', () => {
  assert.equal(run({ showCountdown: true, paidUntil: null }), null);
});

test('מנוי לחודש בודד מציג כמה ימים נשארו', () => {
  const bar = run({ showCountdown: true, paidUntil: inDays(12) });
  assert.ok(bar, 'השעון לא הוצג');
  assert.match(bar.textContent, /12 ימים/);
  assert.match(bar.textContent, /המנוי שלך למאגר הרפרנסים/);
});

test('יום אחרון נקרא מחר ולא 1 ימים', () => {
  const bar = run({ showCountdown: true, paidUntil: inDays(0.9) });
  assert.match(bar.textContent, /מחר/);
  assert.doesNotMatch(bar.textContent, /1 ימים/);
});

test('שלושת הימים האחרונים מסומנים כדחופים', () => {
  assert.ok(run({ showCountdown: true, paidUntil: inDays(2.5) }).classList.contains('is-urgent'));
  assert.ok(!run({ showCountdown: true, paidUntil: inDays(9) }).classList.contains('is-urgent'));
});

test('מנוי שכבר פג לא מציג שעון, כי המסך חוסם אותה ממילא', () => {
  assert.equal(run({ showCountdown: true, paidUntil: inDays(-2) }), null);
});

test('התאריך עצמו מופיע, כדי שלא תצטרך לספור', () => {
  const until = inDays(5);
  const bar = run({ showCountdown: true, paidUntil: until });
  const expected = until.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
  assert.ok(bar.textContent.includes(expected), `חסר התאריך ${expected}`);
});

test('קריאה כפולה לא מכפילה את הפס', () => {
  const doc = makeDocument();
  const fn = load(doc);
  const access = { showCountdown: true, paidUntil: inDays(7) };
  fn(access); fn(access);
  assert.equal(doc.querySelectorAll('.sub-countdown').length, 1);
});

test('הפס מוכרז למקריא מסך', () => {
  assert.equal(run({ showCountdown: true, paidUntil: inDays(4) }).getAttribute('role'), 'status');
});

test('ה-CSS מגדיר את שני המצבים של הפס', () => {
  const css = readFileSync(join(ROOT, 'css', 'style.css'), 'utf8');
  assert.match(css, /\.sub-countdown \{/);
  assert.match(css, /\.sub-countdown\.is-urgent \{/);
});

test('loadAccess מחזירה את שני השדות שהשעון צריך, בכל מסלול יציאה', () => {
  const body = src.match(/async function loadAccess\(email\) \{[\s\S]*?\n\}/)[0];
  assert.match(body, /paidUntil: until/);
  assert.match(body, /showCountdown: data\.showCountdown === true/);
  const returns = body.match(/return \{[\s\S]*?\}/g) || [];
  assert.ok(returns.length >= 3, 'נמצאו פחות מסלולי יציאה מהצפוי');
  for (const r of returns) {
    assert.match(r, /showCountdown/, `מסלול יציאה בלי showCountdown: ${r.slice(0, 50)}`);
  }
});

test('השעון באמת נקרא אחרי ההתחברות', () => {
  assert.match(src, /showSubscriptionCountdown\(access\);/);
});

/* 22/10/2026: תצוגת "כמו שהלקוחה רואה" לפי הנתונים האמיתיים שלה.
   היא קריאה בלבד, ולכן הבדיקה מוודאת שאין שם שום כתיבה למסד. */
const previewBlock = () => {
  const from = src.indexOf('if (previewRefs) {');
  const to = src.indexOf("document.getElementById('login-screen')", from);
  return src.slice(from, to);
};

test('תצוגת לקוחה קוראת את הרשומה של המייל שב-as', () => {
  const block = previewBlock();
  assert.ok(block.includes("get('as')"), 'לא נקרא הפרמטר as');
  assert.ok(block.includes("getDoc(doc(db, 'allowlist', asEmail))"), 'לא נקראת הרשומה של הלקוחה');
  assert.ok(block.includes('showSubscriptionCountdown('), 'השעון לא מדומה בתצוגה');
});

test('תצוגת לקוחה לא כותבת כלום למסד', () => {
  const block = previewBlock();
  for (const write of ['setDoc(', 'updateDoc(', 'deleteDoc(', 'addDoc(']) {
    assert.ok(!block.includes(write), `תצוגה בלבד מכילה כתיבה: ${write}`);
  }
});

test('תצוגת לקוחה פתוחה רק למאיה', () => {
  assert.ok(src.includes('user.email === ADMIN_EMAIL'), 'התצוגה לא מוגבלת למנהלת');
});

/* 22/10/2026: העוזר ליצירת סרטון כלול במנוי הרפרנסים, הצ'אט לא.
   כפתור שמוביל לכלי שהמנוי לא כולל הוא כפתור שבור.
   26/10/2026: המסך שינה שם מ-renderAngleCheck ל-renderIdeaSharpen. */
test("מנוית רפרנסים לא מקבלת כפתור לצ'אט שהמנוי שלה לא כולל", () => {
  const va = readFileSync(join(ROOT, 'js', 'video-assistant.js'), 'utf8');
  const from = va.indexOf('function renderIdeaSharpen()');
  const to = va.indexOf('function renderContentBasics()', from);
  const block = va.slice(from, to);
  assert.ok(from > 0 && to > from, 'מסך חידוד הרעיון לא נמצא');
  assert.ok(block.includes("document.body.dataset.plan === 'refs'"), 'אין בדיקת סוג מנוי');
  assert.ok(block.includes('${refsOnly ?'), "הצ'אט לא מותנה בסוג המנוי");
  assert.ok(block.includes('if (refsOnly) return;'), "הקוד של הצ'אט רץ גם למנוי שלא כולל אותו");
  assert.ok(block.includes('streamCheckIdea('), "הצ'אט לא מריץ את המנוע האמיתי");
  assert.ok(!block.includes('showView('), "הצ'אט עדיין מקפיץ ללשונית אחרת במקום לרוץ במקום");
});

test("הצ'אט אכן חסום למנוי רפרנסים, ולכן התנאי הזה נחוץ", () => {
  const css = readFileSync(join(ROOT, 'css', 'style.css'), 'utf8');
  assert.match(css, /body\[data-plan="refs"\] #tab-chat/);
});

/* 23/10/2026: אחרי שישה דחיפות ברצף שכחתי להעלות את CACHE_NAME ב-sw.js,
   ומאיה דיווחה "לא נכנס בכלל" - מכשיר שהחזיק app.js ישן מהמטמון מול
   מודולים חדשים מהרשת. השורה הראשונה בקובץ אומרת את זה במפורש. */
test('גרסת המטמון של ה-service worker עלתה מעל v82', () => {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const m = sw.match(/CACHE_NAME = 'moach-hashiveki-v(\d+)'/);
  assert.ok(m, 'לא נמצאה גרסת מטמון ב-sw.js');
  assert.ok(Number(m[1]) >= 83, `גרסת המטמון היא v${m[1]}, לא עלתה אחרי השינויים`);
});
