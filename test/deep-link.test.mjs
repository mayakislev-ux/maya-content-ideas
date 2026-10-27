/* 27/10/2026 (מור אדרי ב-SOS של הפורטל: "איפה נמצא העוזר ליצירת סירטון ?").
   היא לא קיבלה תשובה, והשאלה נרשמה כפנייה שמחכה למאיה.

   העוזר לא נמצא בפורטל אלא כאן, ולשונית משלו יש רק למנוית הרפרנסים, כך
   שהדרך אליו היא מרכז למידה ← כלי עבודה. לכן תשובת ה-SOS היא עכשיו כפתור
   שנוחת ישר על המסך. כאן נבדק הצד שמקבל את הקישור.

   הרשימה סגורה בכוונה: קישור לא פותח מסך שאין ללקוחה. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deepLinkView, DEEP_LINK_VIEWS } from '../js/deep-link.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const APP = readFileSync(join(ROOT, 'js', 'app.js'), 'utf8');
const HTML = readFileSync(join(ROOT, 'index.html'), 'utf8');

describe('קישור ישיר למסך', () => {
  test('הכפתור של ה-SOS נוחת על העוזר', () => {
    assert.equal(deepLinkView('?v=2026102708&view=video-assistant'), 'video-assistant');
  });

  test('גם המאגר ומרכז הלמידה', () => {
    assert.equal(deepLinkView('?view=inspiration'), 'inspiration');
    assert.equal(deepLinkView('?view=guide'), 'guide');
  });

  test('מסך שלא ברשימה לא נפתח מקישור', () => {
    for (const bad of ['?view=chat', '?view=content-plan', '?view=home', '?view=', '', null, '?action=add']) {
      assert.equal(deepLinkView(bad), null, String(bad));
    }
  });

  test('כל מסך ברשימה הוא מסך שקיים באמת', () => {
    for (const view of DEEP_LINK_VIEWS) {
      assert.ok(HTML.includes(`id="${view}-view"`), `אין מסך ${view}`);
    }
  });

  /* אם app.js יחזור לבדוק את הפרמטר בעצמו, הרשימה הסגורה תעקוף בשקט */
  test('app.js משתמש בפונקציה ולא בודק את הפרמטר לבד', () => {
    assert.ok(APP.includes('deepLinkView(window.location.search)'));
    assert.ok(!APP.includes("params.get('view') ==="));
  });
});
