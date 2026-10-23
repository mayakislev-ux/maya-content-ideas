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
  const i = css.indexOf('@media (max-width: 600px)');
  assert.ok(i >= 0, 'אין breakpoint לטלפון');
  const mq = css.slice(i, i + 800);
  assert.match(mq, /\.cosmic-textarea[\s\S]*?font-size:\s*16px/, 'שדה הטקסט קטן מ-16 פיקסל');
});

test('בטלפון הכרטיס לא מבזבז 40 פיקסל בכל צד', () => {
  const i = css.indexOf('@media (max-width: 600px)');
  const mq = css.slice(i, i + 800);
  assert.match(mq, /\.cosmic-card\s*\{[^}]*margin:\s*12px/, 'השוליים בטלפון לא הוקטנו');
});
