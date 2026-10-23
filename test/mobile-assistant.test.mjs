/* 23/10/2026 (מאיה: "במובייל המסך של העוזר ליצירת סרטון לא נוח, כל הזמן
   המסך יורד למטה באוטומט וכל פעם צריך להקטין אותו עם האצבעות", "ה-UI UX
   באייפון ממש לא נוח", "יש מלא שטח מת במסך").

   שתי סיבות אמיתיות, ושתיהן נמדדות: 100vh שמשתנה כשסרגל הדפדפן נעלם,
   וגופן קטן מ-16 פיקסל בשדות, שגורם לאייפון להגדיל ולא לחזור. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const css = readFileSync(join(ROOT, 'css', 'style.css'), 'utf8');

function block(selector) {
  const i = css.indexOf(selector + ' {');
  assert.ok(i >= 0, `לא נמצא ${selector}`);
  return css.slice(i, css.indexOf('}', i));
}

/* 23/10/2026: קודם כאן ישב css.slice(i, i + 800). הוספתי הערה אחת
   למדיה-קוורי, וכלל שלא זז בכלל "נעלם" ושתי בדיקות נפלו. חלון בתווים
   לא מתאר מדיה-קוורי - סוף הבלוק מתאר. */
function phoneBlock() {
  const i = css.indexOf('@media (max-width: 600px)');
  assert.ok(i >= 0, 'אין breakpoint לטלפון');
  const end = css.indexOf('@keyframes cosmic-fade-in', i);
  assert.ok(end > i, 'לא נמצא סוף הבלוק של הטלפון');
  return css.slice(i, end);
}

/** כלל בודד בתוך המדיה-קוורי של הטלפון, לפי הסלקטור שלו */
function phoneRule(selector) {
  const b = phoneBlock();
  const i = b.indexOf(selector + ' {');
  assert.ok(i >= 0, `לא נמצא ${selector} בטלפון`);
  return b.slice(i, b.indexOf('}', i));
}

test('מסך העוזר נמדד ב-svh ולא רק ב-vh', () => {
  const b = block('.cosmic-theme');
  assert.match(b, /min-height:\s*100svh/, 'חסר svh, המסך יקפוץ באייפון');
  assert.match(b, /min-height:\s*100vh/, 'חסר fallback לדפדפן ישן');
  assert.ok(b.indexOf('100vh') < b.indexOf('100svh'), 'ה-fallback חייב לבוא לפני svh');
});

test('אין overflow hidden שחוסם גלילה אנכית', () => {
  const b = block('.cosmic-theme');
  assert.ok(!/overflow:\s*hidden/.test(b), 'overflow hidden חוסם גלילה');
  assert.match(b, /overflow-x:\s*hidden/, 'צריך למנוע גלילה אופקית בלבד');
});

test('בטלפון שדות הטקסט הם 16 פיקסל, אחרת אייפון מזים', () => {
  assert.match(phoneBlock(), /\.cosmic-textarea[\s\S]*?font-size:\s*16px/, 'שדה הטקסט קטן מ-16 פיקסל');
});

test('בטלפון הכרטיס לא מבזבז 40 פיקסל בכל צד', () => {
  assert.match(phoneRule('.cosmic-card'), /margin:\s*12px/, 'השוליים בטלפון לא הוקטנו');
});

/* 23/10/2026, הסבב השני (מאיה: "למה העוזר ליצירת סרטון לא מעודכן לפי כל
   הרשימה הענקית ששלחתי לך פעמיים"). שלושת הסעיפים שעוד לא טופלו. */

test('מעבר מסך מחזיר את הגלילה למעלה', () => {
  /* סעיפים 3 ו-14: הכפתור שמעביר מסך יושב בתחתית הכרטיס, ולכן בזמן
     הלחיצה הדף גלול למטה. בלי החזרה הזאת המסך החדש נפתח באמצעו, וזה
     נראה בדיוק כמו "המסך ירד למטה מעצמו". */
  const js = readFileSync(join(ROOT, 'js', 'video-assistant.js'), 'utf8');
  assert.match(js, /function scrollToCardTop\(\)/, 'אין פונקציה שמחזירה את הגלילה');

  const card = js.slice(js.indexOf('function cosmicCard('));
  const body = card.slice(0, card.indexOf('\n}'));
  assert.match(body, /scrollToCardTop\(\)/, 'cosmicCard לא מחזיר את הגלילה למעלה');

  const fn = js.slice(js.indexOf('function scrollToCardTop()'));
  assert.match(fn.slice(0, 500), /behavior: 'instant'/, 'גלילה מונפשת היא בעצמה הקפיצה שהיא מתארת');
});

test('בטלפון הכרטיס ממורכז ולא משאיר חצי מסך ריק מתחתיו', () => {
  /* סעיף 15. margin: auto ולא justify-content: center, כי auto בולע רק
     שטח פנוי חיובי ולכן כרטיס ארוך מהמסך לא נחתך. */
  const mq = phoneBlock();
  assert.match(mq, /#video-assistant-screen\s*\{[^}]*flex:\s*1/, 'אזור המסך לא גדל למלא את הגובה');
  assert.match(mq, /#video-assistant-screen\s*>\s*\.cosmic-card\s*\{[^}]*margin:\s*auto/, 'הכרטיס לא ממורכז אנכית');
  /* ה-flex יושב על כלל .cosmic-theme נפרד בתוך המדיה-קוורי, ולכן נבדק
     על הכלל עצמו ולא על כל הבלוק. */
  const themeRules = mq.split('.cosmic-theme {').slice(1).map((part) => part.slice(0, part.indexOf('}')));
  assert.ok(themeRules.some((r) => /display:\s*flex/.test(r)), 'מסך העוזר אינו flex בטלפון');
  assert.ok(!themeRules.some((r) => /justify-content:\s*center/.test(r)),
    'justify-content: center חותך כרטיס ארוך מהמסך');
});

test('חלונית הצ\'אט במסך הזווית נמדדת ב-svh', () => {
  /* סעיף 13, "הוא קופץ חלקית לא ברור יש שם באג טכני": vh משתנה באייפון
     ברגע שסרגל הדפדפן נעלם או שהמקלדת נפתחת. */
  const i = css.indexOf('.va-angle-chat .chat-messages');
  assert.ok(i >= 0, 'לא נמצאה חלונית הצ\'אט');
  const b = css.slice(i, css.indexOf('}', i));
  assert.match(b, /max-height:\s*40svh/, 'החלונית עדיין נמדדת ב-vh בלבד');
  assert.ok(b.indexOf('40vh') < b.indexOf('40svh'), 'ה-fallback חייב לבוא לפני svh');
  assert.match(b, /overflow-y:\s*auto/, 'בלי גלילה פנימית הצ\'אט דוחף את כל הדף');
});
