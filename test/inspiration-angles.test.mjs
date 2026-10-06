// 05/10/2026 (מאיה: "נגיד אם אני רושמת מפורסמות/סלבס אז שיקפוץ כל הסרטונים
// שמדברים על סלבס... שארשום ביקורת או אג'נדה שימצא לי את כל הסרטונים מאותה
// משפחה... כרגע זה לא עושה את זה מדויק").
//
// המדידה על 453 הסרטונים מצאה שהזווית מעולם לא נשמרה כנתון, ולכן החיפוש
// ניחש. כאן נבדק הצד הדטרמיניסטי: שהמילים שמאיה באמת מקלידה מתורגמות
// לזווית הנכונה, תמיד, בלי AI באמצע.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import pkg from '../functions/inspiration-constants.js';

const { anglesFromQuery, ANGLE_TAGS, ANGLE_TAG_DEFINITIONS } = pkg;

test('שמונה המושגים שמאיה נתנה, כולם נפתרים', () => {
  const cases = {
    'סלבס': 'הייפ על סלב',
    'מפורסמות': 'הייפ על סלב',
    'ביקורת': "אג'נדה, ביקורת או דעה",
    "אג'נדה": "אג'נדה, ביקורת או דעה",
    'בעיה או תסכול מאוד ספציפיים של הקהל': 'בעיה או תסכול ספציפיים של הקהל',
    'אמונה מגבילה': 'ניפוץ אמונה מגבילה',
    'סיפור הצלחה של לקוח': 'סיפור הצלחה או תוצאה של לקוח',
    'טעות נפוצה בתחום שלכם': 'טעות נפוצה בתחום',
    'ניפוץ מיתוס': 'ניפוץ מיתוס מקצועי',
  };
  for (const [query, expected] of Object.entries(cases)) {
    assert.ok(anglesFromQuery(query).includes(expected), `"${query}" לא זוהה כ-"${expected}"`);
  }
});

test('"ביקורת" היא דעה ואגנדה, לא ביקורת על מוצר', () => {
  // זאת בדיוק השגיאה שמאיה ראתה: חיפוש "ביקורת" החזיר עדויות על מוצרי קוסמטיקה
  const angles = anglesFromQuery('ביקורת');
  assert.ok(angles.includes("אג'נדה, ביקורת או דעה"));
  assert.ok(!angles.includes('סיפור הצלחה או תוצאה של לקוח'));
});

test('שאילתה רגילה לא ממציאה זווית', () => {
  // סרטון תוכן רגיל חייב להמשיך להתנהג כמו קודם, על כל המאגר
  assert.deepEqual(anglesFromQuery('איך לעשות לק גל בבית'), []);
  assert.deepEqual(anglesFromQuery('פילאטיס מכשירים'), []);
  assert.deepEqual(anglesFromQuery(''), []);
  assert.deepEqual(anglesFromQuery(null), []);
});

test('שאילתה יכולה לבקש שתי זוויות', () => {
  const angles = anglesFromQuery('ביקורת או ניפוץ מיתוס');
  assert.ok(angles.includes("אג'נדה, ביקורת או דעה"));
  assert.ok(angles.includes('ניפוץ מיתוס מקצועי'));
});

test('כל זווית שמוחזרת היא זווית חוקית מהרשימה', () => {
  const queries = ['סלבס', 'ביקורת', 'אמונה מגבילה', 'שריפת גשר', 'בידול', 'סמכות', 'סיפור אישי'];
  for (const q of queries) {
    for (const a of anglesFromQuery(q)) {
      assert.ok(ANGLE_TAGS.includes(a), `${a} אינה ברשימת הזוויות`);
    }
  }
});

test('לכל זווית יש הגדרה, אחרת המסווג לא יודע מה לעשות איתה', () => {
  for (const t of ANGLE_TAGS) {
    assert.ok(ANGLE_TAG_DEFINITIONS[t], `חסרה הגדרה ל-${t}`);
    assert.ok(ANGLE_TAG_DEFINITIONS[t].length > 20, `ההגדרה של ${t} קצרה מדי`);
  }
});

test('"חינוך והסבר מקצועי" הוא ברירת מחדל ולא נבחר ממילת חיפוש', () => {
  // אם הוא היה נתפס ממילה, כל שאילתה מקצועית הייתה נחתכת אליו
  assert.ok(ANGLE_TAGS.includes('חינוך והסבר מקצועי'));
  assert.deepEqual(anglesFromQuery('חינוך'), []);
});

// 05/10/2026, מתוך הריצה האמיתית על 453 הסרטונים: 13 סרטונים נכשלו שוב
// ושוב כי המודל החזיר "אג'נדה" עם תו גרש אחר מזה שברשימה.
test('גרש בכל צורה מתקבל, זווית מומצאת נזרקת', () => {
  const { canonicalAngle } = pkg;
  const want = "אג'נדה, ביקורת או דעה";
  for (const variant of ["אג'נדה, ביקורת או דעה", 'אג׳נדה, ביקורת או דעה', 'אג’נדה, ביקורת או דעה', 'אגנדה, ביקורת או דעה']) {
    assert.equal(canonicalAngle(variant), want, `הגרסה ${JSON.stringify(variant)} לא זוהתה`);
  }
  assert.equal(canonicalAngle('זווית שהמצאתי'), null);
  assert.equal(canonicalAngle('ביקורת'), null, 'שם חלקי אינו זווית חוקית');
  assert.equal(canonicalAngle(''), null);
});

test('רווחים מיותרים לא שוברים התאמה', () => {
  assert.equal(pkg.canonicalAngle('  הייפ   על  סלב '), 'הייפ על סלב');
});

/* 06/10/2026, מהביקורת. שלוש תקלות באותה פונקציה, וכל אחת מהן מיוצגת כאן
   בהתנהגות ולא בניסוח הקוד: 'דעה' נתפסה בתוך "מודעה" ו"הודעה"; הגרש של
   אייפון הפך את "אג'נדה" לבלתי מזוהה; והתיקון הראשון איבד צירופי אותיות
   יחס נפוצים כמו "שהמיתוס" ו"מהביקורת". */
const OPINION = "אג'נדה, ביקורת או דעה";

test('"דעה" לא נתפסת בתוך מודעה או הודעה', () => {
  for (const q of [
    'רוצה לעשות מודעה חדשה', 'מודעות ממומנות', 'קיבלתי הודעה',
    'ההודעה שקיבלתי', 'במודעה שלי', 'מהודעה של לקוחה',
  ]) {
    assert.deepEqual(anglesFromQuery(q), [], `${q} נדחף לדלי של דעה`);
  }
});

test('"דעה" כן נתפסת כשהיא מילה', () => {
  assert.deepEqual(anglesFromQuery('דעה'), [OPINION]);
  assert.deepEqual(anglesFromQuery('הדעה שלי על זה'), [OPINION]);
  assert.deepEqual(anglesFromQuery('ביקורת על קורס'), [OPINION]);
});

test('הגרש שאייפון מקליד לא מפיל את הזיהוי', () => {
  for (const q of ["אג'נדה", 'אג׳נדה', 'אג’נדה', 'אגנדה']) {
    assert.deepEqual(anglesFromQuery(q), [OPINION], `${q} לא זוהתה`);
  }
});

test('צירוף של שתי אותיות יחס עוד נתפס', () => {
  assert.deepEqual(anglesFromQuery('להוכיח שהמיתוס הזה לא נכון'), ['ניפוץ מיתוס מקצועי']);
  assert.deepEqual(anglesFromQuery('מהביקורת של לקוחות'), [OPINION]);
  assert.deepEqual(anglesFromQuery('שהבעיה של הקהל'), ['בעיה או תסכול ספציפיים של הקהל']);
  assert.deepEqual(anglesFromQuery('לדבר מההייפ'), ['הייפ על סלב']);
});

test('פיסוק שמדביק שתי מילים לא מאבד את השנייה', () => {
  assert.deepEqual(anglesFromQuery('שיווק,מיתוס'), ['ניפוץ מיתוס מקצועי']);
});
