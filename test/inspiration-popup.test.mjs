// 05/10/2026 (מאיה: "הפלטפורמה ממש לא נוחה, אני רוצה שתהיה קלה. יש אפשרות
// שהסרטונים של האינסטגרם ייפתחו בפופאפ נוח?").
//
// עד היום כל כרטיס היה <a target="_blank">: כל צפייה זרקה אותה מהאפליקציה.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { embedUrlFor, embedShape } from '../js/video-preview.js';

test('אינסטגרם: ריל ופוסט, שניהם מקבלים כתובת הטמעה', () => {
  assert.equal(embedUrlFor('https://www.instagram.com/reel/C8xYzAbCdEf/'),
    'https://www.instagram.com/p/C8xYzAbCdEf/embed/');
  assert.equal(embedUrlFor('https://www.instagram.com/p/C8xYzAbCdEf/'),
    'https://www.instagram.com/p/C8xYzAbCdEf/embed/');
  assert.equal(embedUrlFor('https://instagram.com/reels/C8xYzAbCdEf'),
    'https://www.instagram.com/p/C8xYzAbCdEf/embed/');
});

test('פרמטרים בכתובת לא שוברים את הזיהוי', () => {
  // כתובות אמיתיות מגיעות עם igsh/img_index אחרי השאלה
  assert.equal(embedUrlFor('https://www.instagram.com/reel/C8xYzAbCdEf/?igsh=abc123'),
    'https://www.instagram.com/p/C8xYzAbCdEf/embed/');
});

test('טיקטוק מלא מקבל הטמעה', () => {
  assert.equal(embedUrlFor('https://www.tiktok.com/@user.name/video/7312345678901234567'),
    'https://www.tiktok.com/embed/v2/7312345678901234567');
});

test('קישור טיקטוק מקוצר מחזיר null, כדי שייפתח בחוץ ולא יישבר', () => {
  // vm.tiktok.com לא מכיל את המזהה. עדיף לפתוח בחוץ מאשר חלון ריק
  assert.equal(embedUrlFor('https://vm.tiktok.com/ZSabc123/'), null);
  assert.equal(embedUrlFor(''), null);
  assert.equal(embedUrlFor(null), null);
  assert.equal(embedUrlFor('https://example.com/something'), null);
});

test('יוטיוב ממשיך לעבוד', () => {
  assert.equal(embedUrlFor('https://youtu.be/dQw4w9WgXcQ'), 'https://www.youtube.com/embed/dQw4w9WgXcQ');
});

test('רילים מקבלים חלון אנכי, יוטיוב אופקי', () => {
  const ig = embedShape('https://www.instagram.com/reel/C8xYzAbCdEf/');
  const tt = embedShape('https://www.tiktok.com/@u/video/7312345678901234567');
  const yt = embedShape('https://youtu.be/dQw4w9WgXcQ');
  assert.ok(ig.h > ig.w, 'אינסטגרם צריך להיות אנכי');
  assert.ok(tt.h > tt.w, 'טיקטוק צריך להיות אנכי');
  assert.ok(yt.w > yt.h, 'יוטיוב צריך להיות אופקי');
});

// הפעלה אמיתית של הפופאפ מול DOM מינימלי - לא רק בדיקה שהקוד קיים
function fakeDom() {
  const made = [];
  const mk = (tag) => {
    const el = {
      tagName: tag, children: [], style: {}, classList: { _s: new Set(),
        add(...c) { c.forEach((x) => this._s.add(x)); }, remove(...c) { c.forEach((x) => this._s.delete(x)); },
        contains(c) { return this._s.has(c); } },
      setAttribute() {}, focus() { el._focused = true; },
      // close() מסיר עכשיו את האלמנט מה-DOM ולא רק מסתיר אותו
      remove() { const p = el._parent; if (p) p.children = p.children.filter((c) => c !== el); },
      addEventListener(ev, fn) { (el._h ||= {})[ev] = fn; },
      append(...kids) { el.children.push(...kids); },
      appendChild(k) { k._parent = el; el.children.push(k); return k; },
      set innerHTML(v) { el._html = v; if (v === '') el.children = []; },
      get innerHTML() { return el._html || ''; },
      closest() { return null; },
    };
    made.push(el);
    return el;
  };
  const body = mk('body');
  globalThis.document = {
    createElement: mk,
    body,
    activeElement: null,
    addEventListener() {},
  };
  return { made, body };
}

test('פופאפ נפתח, מכיל iframe עם כתובת ההטמעה, ומשאיר קישור למקור', async () => {
  const { body } = fakeDom();
  const { openVideoPopup, closeVideoPopup } = await import('../js/inspiration-popup.js');

  const ok = openVideoPopup({ url: 'https://www.instagram.com/reel/C8xYzAbCdEf/', domain: 'יופי וקוסמטיקה' });
  assert.equal(ok, true, 'הפופאפ היה אמור להיפתח');
  assert.ok(body.classList.contains('ip-open'), 'הגוף היה אמור להינעל מגלילה');

  const flat = [];
  const walk = (n) => { flat.push(n); (n.children || []).forEach(walk); };
  body.children.forEach(walk);

  const frame = flat.find((e) => e.tagName === 'iframe');
  assert.ok(frame, 'לא נוצר iframe');
  assert.equal(frame.src, 'https://www.instagram.com/p/C8xYzAbCdEf/embed/');

  const out = flat.find((e) => e.tagName === 'a');
  assert.ok(out, 'חסר קישור למקור');
  assert.equal(out.href, 'https://www.instagram.com/reel/C8xYzAbCdEf/');

  closeVideoPopup();
  assert.ok(!body.classList.contains('ip-open'), 'סגירה לא שחררה את הגלילה');
});

test('קישור בלי הטמעה לא פותח פופאפ ריק', async () => {
  fakeDom();
  const { openVideoPopup } = await import('../js/inspiration-popup.js');
  assert.equal(openVideoPopup({ url: 'https://vm.tiktok.com/ZSabc123/' }), false);
});

// 06/10/2026 (מאיה: "סרטון ראשון שמופיע במובייל לא נפתח בכלל").
//
// מדידה על כל 453 הסרטונים: כל 175 סרטוני הטיקטוק שמורים ככתובת מקוצרת
// vt.tiktok.com שאין בה מזהה. כלומר אף טיקטוק לא נפתח בחלון, 39% מהמאגר,
// בעוד שכל 278 סרטוני האינסטגרם עבדו. 174 מהם פוענחו דרך ה-oEmbed הרשמי
// ונשמרו, ואחד מחזיר שגיאה מטיקטוק, כנראה סרטון שנמחק.
test('טיקטוק מקוצר נפתח כשיש מזהה שמור', () => {
  assert.equal(
    embedUrlFor('https://vt.tiktok.com/ZSqhxjNJ7/', { tiktokVideoId: '7238688201412578565' }),
    'https://www.tiktok.com/embed/v2/7238688201412578565'
  );
});

test('בלי מזהה שמור הוא עדיין נפתח בחוץ ולא בחלון ריק', () => {
  assert.equal(embedUrlFor('https://vt.tiktok.com/ZSqhxjNJ7/', {}), null);
  assert.equal(embedUrlFor('https://vt.tiktok.com/ZSqhxjNJ7/'), null);
});

test('מזהה פגום לא מיוצר לכתובת שבורה', () => {
  // מזהה שאינו ספרות בלבד היה מייצר כתובת הטמעה שלא קיימת
  assert.equal(embedUrlFor('https://vt.tiktok.com/ZS/', { tiktokVideoId: 'abc' }), null);
  assert.equal(embedUrlFor('https://vt.tiktok.com/ZS/', { tiktokVideoId: '' }), null);
});

test('המזהה השמור גובר, גם על כתובת מלאה', () => {
  assert.equal(
    embedUrlFor('https://www.tiktok.com/@u/video/111', { tiktokVideoId: '222' }),
    'https://www.tiktok.com/embed/v2/222'
  );
});

test('טיקטוק עם מזהה שמור מקבל חלון אנכי', () => {
  const sh = embedShape('https://vt.tiktok.com/ZS/', { tiktokVideoId: '1' });
  assert.ok(sh.h > sh.w, 'טיקטוק צריך להיות אנכי');
});

test('אינסטגרם לא נפגע מהשינוי', () => {
  assert.equal(embedUrlFor('https://www.instagram.com/reel/C8xYzAbCdEf/'),
    'https://www.instagram.com/p/C8xYzAbCdEf/embed/');
});

// 06/10/2026 (מאיה: "הפופאפ פשוט לא עובד ולא פותח אף סרטון"). הקוד תקין,
// אבל ההטמעה עצמה יכולה להיחסם: היא נכנסת למוח השיווקי מתוך הפורטל, כלומר
// בתוך חלון של אפליקציה מותקנת, ושם דפדפנים חוסמים הטמעות של אינסטגרם
// וטיקטוק. התוצאה היא חלון שנפתח וריק, וזה נראה בדיוק כמו "לא עובד".
import { readFileSync as readPop } from 'node:fs';
const POPSRC = readPop(new URL('../js/inspiration-popup.js', import.meta.url), 'utf8');

test('יש רשת ביטחון כשההטמעה נחסמת', () => {
  assert.ok(POPSRC.includes("addEventListener('load'"), 'לא נמדד אם המסגרת נטענה');
  assert.ok(/setTimeout\([\s\S]{0,400}?ip-frame--blocked/.test(POPSRC), 'אין מסך חלופי');
  assert.ok(POPSRC.includes('ip-blocked__btn'), 'אין כפתור לפתיחה במקור');
});

test('ההמתנה מבוטלת בסגירה, אחרת היא רצה על חלון שנסגר', () => {
  assert.ok(POPSRC.includes('clearTimeout(fallbackTimer)'), 'הטיימר לא מבוטל');
});

test('ההודעה אומרת שזאת הגבלה של הפלטפורמה ולא תקלה אצלנו', () => {
  assert.ok(/הגבלה של אינסטגרם וטיקטוק/.test(POPSRC), 'הניסוח מאשים את המערכת במקום להסביר');
});
