import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 01/10/2026 (מאיה): "אף אחת לא יכולה לצפות בטבלה אחת של השנייה נכון?
// אני מקווה שרק אצלי, כי אני המנהלת".
//
// נבדק באותו יום מול השרת החי, בהתחזות ללקוחה אמיתית דרך Firestore REST,
// בעקיפת המסך לגמרי: קריאה של טבלה אחרת החזירה 403, רישום כל האוסף החזיר
// 403, ולמאיה קריאה בלבד - ניסיון כתיבה לטבלה של לקוחה החזיר 403 גם לה.
//
// הטסט הזה שומר על הניסוח בקובץ החוקים, כדי שאף שינוי עתידי לא יפתח את זה
// בשקט. השוואת מחרוזות ולא ביטויים רגולריים, בכוונה: הכלל שנבדק כאן הוא
// טקסט מדויק.
const RULES = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

function block(name) {
  const at = RULES.indexOf('match /' + name + '/');
  if (at === -1) return '';
  const next = RULES.indexOf('match /', at + 10);
  return RULES.slice(at, next === -1 ? RULES.length : next);
}

test('לקוחה קוראת וכותבת רק את הטבלה של עצמה', () => {
  const b = block('storyTables');
  assert.ok(b.length > 0, 'הכלל קיים');
  assert.ok(
    b.includes('allow read, write: if isFull() && request.auth.uid == uid;'),
    'הכלל שמגביל לקוחה למסמך שלה עצמה'
  );
});

// 29/10/2026 (מאיה: "גם לערוך אצלה"): ההחלטה מ-30/09 ("קריאה בלבד") השתנתה
// לבקשתה. מאיה, ורק היא, קוראת וכותבת את הנתונים של כל לקוחה.
test('מאיה קוראת וכותבת את הנתונים של לקוחה, מתצוגה כלקוחה', () => {
  for (const name of ['ideas', 'profiles', 'warmingPlans', 'storyTables', 'videoAssistantSessions', 'contentPlans']) {
    assert.ok(block(name).includes('allow read, write: if isAdmin();'), name);
  }
});

test('isAdmin הוא המייל של מאיה, ונבדק בשרת ולא במסך', () => {
  assert.ok(RULES.includes('function isAdmin()'));
  assert.ok(RULES.includes("request.auth.token.email == 'mayakislev@gmail.com'"));
});

test('אף אוסף אינו פתוח לכל מי שמחוברת', () => {
  const loose = RULES.split(String.fromCharCode(10))
    .map((l) => l.trim())
    .filter((l) => l.startsWith('allow'))
    .filter(
      (l) =>
        l.endsWith('if true;') ||
        l.endsWith('if request.auth != null;') ||
        l.endsWith('if isAllowed();')
    );
  // שני מצבים פתוחים בכוונה ושניהם אינם דליפה:
  // קריאת מאגר ההשראה, שהוא משותף לכולן, וכתיבה לתיבת הפידבק, שאיש
  // אינו יכול לקרוא ממנה (allow read, update, delete: if false).
  const onPurpose = [
    'allow read: if isAllowed();',
    'allow create: if isAllowed();',
  ];
  const unexpected = loose.filter((l) => !onPurpose.includes(l));
  assert.deepEqual(unexpected, [], 'כלל פתוח מדי: ' + unexpected.join(' | '));
});


/* 08/10/2026: מנוי "רפרנסים בלבד", 79 ש"ח לחודש. הלקוחה רשומה
   ב-allowlist כמו כולן, ולכן isAllowed() מחזיר לה אמת. מה שמגן על שאר
   התוכן הוא isFull(). הטסטים האלה נועלים את ההפרדה הזאת: אם מישהו יחזיר
   אוסף תוכן ל-isAllowed(), הוא ייפתח בשקט למנוי שלא שילם עליו. */
test('מנוי רפרנסים מזוהה לפי plan ולא לפי עצם הקיום ברשימה', () => {
  assert.ok(RULES.includes("planOf()"), 'יש פונקציה שקוראת את סוג המנוי');
  assert.ok(RULES.includes("planOf() != 'refs'"), 'isFull שולל במפורש את מנוי הרפרנסים');
});

test('מאגר ההשראה פתוח לכל מי שברשימה, כולל מנוי רפרנסים', () => {
  /* 15/10/2026: נוספה גם בדיקת תוקף המנוי (notExpired), והבדיקה לא עודכנה */
  assert.ok(block('inspirationBank').includes('allow read: if isAllowed() && notExpired();'));
});

test('העוזר ליצירת סרטון פתוח גם למנוי רפרנסים בתוקף (20/10)', () => {
  assert.ok(block('videoAssistantSessions').includes('(isFull() || (isAllowed() && notExpired())) && request.auth.uid == uid'));
});

/* 23/10/2026: בנק הרעיונות נפתח במכוון גם למנוי רפרנסים (מאיה: "אולי
   הייתי מוסיפה גם לשונית של רעיונות לתוכן שיוכלו להוסיף לשם"). שאר
   אוספי התוכן נשארים למנוי המלא בלבד, וזאת עדיין הבדיקה שמגנה עליהם. */
test('אוספי התוכן דורשים מנוי מלא', () => {
  for (const name of ['warmingPlans', 'contentPlans', 'storyTables']) {
    const b = block(name);
    assert.ok(b.length > 0, name + ' קיים');
    assert.ok(b.includes('isFull()'), name + ' דורש מנוי מלא');
    const allowLines = b.split(String.fromCharCode(10)).filter((l) => l.includes('allow '));
    assert.ok(
      allowLines.every((l) => !l.includes('isAllowed()')),
      name + ' לא נשען על isAllowed לבדו'
    );
  }
});

test('מה שלא תוכן נשאר פתוח, אחרת האפליקציה לא תעבוד לה', () => {
  for (const name of ['profiles', 'pushSubscriptions']) {
    assert.ok(block(name).includes('isAllowed()'), name + ' פתוח לכל מי שברשימה');
  }
});

/* 11/10/2026. לקוחות דיווחו ש"כל תוכניות הסטורי הקודמות נמחקו" ושאי
   אפשר לבנות חדשה. שום דבר לא נמחק: ב-08/10 נכנס מנוי "רפרנסים בלבד",
   ו-planOf() קרא `.data.plan` ישירות. השדה הזה נכתב רק ללקוחות המנוי
   החדש, ומיגרציה לכל השאר לא נכתבה מעולם. שדה חסר בכללי Firestore הוא
   שגיאת הערכה, ושגיאה היא חסימה, ולכן כל הלקוחות הוותיקות נחסמו משלושה
   אוספים בבת אחת ולא ראו את התוכן של עצמן. */

test('קריאת שדה מה-allowlist היא תמיד עם ברירת מחדל', () => {
  const fn = RULES.slice(RULES.indexOf('function planOf()'));
  const body = fn.slice(0, fn.indexOf('}'));
  assert.ok(
    body.includes(".data.get('plan'"),
    'planOf קורא שדה ישירות. לקוחה בלי השדה תיחסם בשקט מכל מה שמוגן ב-isFull',
  );
  assert.ok(!/\.data\.plan\b/.test(body), 'נשארה קריאה ישירה ל-data.plan');
});

test('וברירת המחדל היא מנוי מלא, לא refs', () => {
  /* ההפך היה נועל את כולן במקום לשחרר אותן */
  const fn = RULES.slice(RULES.indexOf('function planOf()'));
  const body = fn.slice(0, fn.indexOf('}'));
  assert.match(body, /\.data\.get\('plan',\s*'full'\)/);
});

test('ו-refs עדיין חסום', () => {
  const fn = RULES.slice(RULES.indexOf('function isFull()'));
  assert.match(fn.slice(0, fn.indexOf('}')), /planOf\(\) != 'refs'/);
});

test('האוספים שנחסמו מוגנים ב-isFull ולא נפתחו בטעות', () => {
  ['warmingPlans', 'storyTables'].forEach((name) => {
    assert.match(block(name), /isFull\(\)/, `${name} כבר לא מוגן ב-isFull`);
  });
});

/* הרעיונות הם של הלקוחה עצמה, ולכן התנאי הוא גישה בתוקף ובעלות, ולא
   סוג המנוי. בלי ownerUid כל מנויה הייתה רואה את הרעיונות של כולן. */
test('בנק הרעיונות פתוח למנוי בתוקף, ותמיד מוגבל לבעלים', () => {
  const b = block('ideas');
  assert.match(b, /isAllowed\(\)/, 'הרעיונות לא דורשים גישה תקפה');
  assert.match(b, /notExpired\(\)/, 'הרעיונות לא נסגרים כשהמנוי נגמר');
  const allowLines = b.split(String.fromCharCode(10)).filter((l) => l.includes('allow '));
  assert.ok(allowLines.length > 0, 'אין שורות allow באוסף הרעיונות');
  assert.ok(
    // 29/10/2026: חוץ מהשורה של מאיה (תצוגה כלקוחה), שנבדקת בשרת לפי המייל שלה
    allowLines.every((l) => l.includes('ownerUid') || l.trim() === 'allow read, write: if isAdmin();'),
    'יש שורת allow בלי הגבלת בעלות'
  );
});
