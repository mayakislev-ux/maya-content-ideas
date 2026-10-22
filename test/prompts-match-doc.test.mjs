/* 22/10/2026 (מאיה: "האם הפרומט של ההוק והכתיבה בטוח לקחת את הפרומטים
   המדויקים מכאן ולא שינית כלום? מרגיש שהוא לא עובד כמו מכאן, יש פער").

   ארבעת הפרומפטים בכלי הם העתק של המסמך שלה, "סיכום כתיבת תסריטים".
   בלי בדיקה אוטומטית, כל עריכה קטנה בקוד או במסמך מרחיקה אותם בשקט,
   והיא מגלה את זה רק מזה שהתוצאה מ-ChatGPT פחות טובה.

   הבדיקה משווה כל שורה משמעותית מהמסמך מול תבנית הפרומפט שבקוד, אחרי
   נרמול רווחים וסימני פיסוק בלבד. המסמך עצמו נשמר כאן כתמונת מצב
   (fixtures/script-doc.txt) כדי שהבדיקה תרוץ גם בלי רשת. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DOC = join(ROOT, 'test', 'fixtures', 'script-doc.txt');

/* רווח דק, רווח קשיח, מפריד השורה של גוגל דוקס ותווי כיווניות מגיעים
   מהמסמך ולא נכתבים בקוד ביד. הם לא הבדל אמיתי. */
function norm(s) {
  return String(s)
    .replace(/[\u000b ‎‏‪-‮﻿]/g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.:;?!])/g, '$1')
    .trim();
}

/* תבליטים ומספור הם עיצוב של גוגל דוקס, לא נוסח. הייצוא מחזיר אותם
   אחרת מאיך שהם נכתבים בקוד, ולכן ההשוואה היא על הטקסט עצמו.
   ❌ ו-✅ נשארים, כי הם נושאים משמעות בתוך הפרומפט. */
function stripMarker(line) {
  let out = String(line).trim();
  for (let i = 0; i < 3; i += 1) {
    out = out
      .replace(/^[-–—•●▪*·]+\s*/, '')
      .replace(/^\d+[.)]?\s*/, '')
      .replace(/^[1-9]️?⃣\s*/, '')
      .trim();
  }
  return out;
}

/** שורות שהן תוכן אמיתי, ולא כותרת, מספור או מציין מילוי */
function meaningful(lines) {
  return lines
    .map((l) => stripMarker(norm(l)))
    .filter((l) => l.length >= 25)
    .filter((l) => !/^\[.*\]$/.test(l))
    .filter((l) => !/^[-–—_=\s]+$/.test(l));
}

/* שלוש שורות שבהן הקוד שונה מהמסמך **בכוונה**, כי במסמך יש שגיאת כתיב
   והקוד שומר על האיות הנכון. נבדק מול המסמך ב-22/10/2026. כל הפרש אחר
   ייכשל, וזאת בדיוק המטרה: להבדיל בין תיקון מודע לבין סחיפה שקטה. */
const KNOWN_DOC_TYPOS = [
  'אתן לא תאמינו למה שיש ל ילספר לכן',                       // בקוד: לי לספר
  'החלקה שורפת את השיער תיזהרי, המשפט שאי שומעת הכי הרבה מהלקוחות שלי', // בקוד: שאני
  'אני לא מבינה איך יש מקצועיות בתחום המיקרולביידינג שעדיין עושות סקיצה עם שבלונות', // בקוד: מיקרובליידינג
];

function section(doc, startsWith, endsWith) {
  const from = doc.indexOf(startsWith);
  assert.ok(from >= 0, `לא נמצא במסמך: ${startsWith}`);
  const to = endsWith ? doc.indexOf(endsWith, from + startsWith.length) : doc.length;
  return doc.slice(from, to > from ? to : doc.length);
}

const SEPARATOR = '________________________________________________________________________';

test('תמונת המצב של המסמך קיימת בריפו', () => {
  assert.ok(existsSync(DOC), 'חסר test/fixtures/script-doc.txt - הורידו מחדש את המסמך');
});

if (existsSync(DOC)) {
  const doc = readFileSync(DOC, 'utf8');
  const code = readFileSync(join(ROOT, 'js', 'video-assistant-content.js'), 'utf8');
  const codeNorm = norm(code);

  const CASES = [
    {
      name: 'חילוץ תוכן',
      start: 'אתה מומחה ללהוציא תוכן מדויק מאנשים לרילסים',
      end: SEPARATOR,
    },
    {
      name: 'מציאת הוק',
      start: 'למי שתקוע בלמצוא משפט פתיחה חזק',
      end: 'רשימת התבניות :',
    },
    {
      name: 'חיזוק הוק',
      start: 'למי שתקוע בלמצוא את המשפט שמגיע אחרי ההוק',
      end: SEPARATOR,
    },
    {
      name: 'זיקוק תסריט',
      start: 'אתה מומחה בזיקוק ועריכת תסריטי רילס',
      end: 'שימוש בפועל:',
    },
  ];

  for (const c of CASES) {
    test(`הפרומפט "${c.name}" זהה למסמך, שורה אחר שורה`, () => {
      const lines = meaningful(section(doc, c.start, c.end).split('\n'));
      assert.ok(lines.length > 5, `נמצאו רק ${lines.length} שורות בקטע "${c.name}"`);
      const missing = lines.filter((l) => !codeNorm.includes(l) && !KNOWN_DOC_TYPOS.includes(l));
      assert.deepEqual(missing, [], `שורות מהמסמך שחסרות בכלי בפרומפט "${c.name}"`);
    });
  }

  test('בנק תבניות ההוקים בכלי מכיל את כל התבניות מהמסמך', () => {
    const list = section(doc, 'רשימת התבניות :', 'הרעיון של התוכן');
    const items = list
      .split('\n')
      .map((l) => stripMarker(norm(l)))
      .filter((l) => l.length >= 20);
    assert.ok(items.length > 100, `נמצאו רק ${items.length} תבניות במסמך`);
    /* מרכאות בתוך תבנית נכתבות בקוד עם לוכסן הברחה, ולכן ההשוואה
       מתעלמת מהלוכסן ולא מדווחת על הפרש שאינו קיים בפועל. */
    const codeUnescaped = codeNorm.replace(/\\"/g, '"');
    const missing = items.filter((t) => !codeUnescaped.includes(t) && !KNOWN_DOC_TYPOS.includes(t));
    assert.deepEqual(missing, [], 'תבניות הוקים מהמסמך שחסרות בכלי');
  });
}
