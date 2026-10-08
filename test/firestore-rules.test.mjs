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

test('מאיה קוראת הכל, ולעולם לא כותבת ללקוחה', () => {
  const b = block('storyTables');
  assert.ok(b.includes('allow read: if isAdmin();'), 'למאיה קריאה');
  assert.ok(!b.includes('allow write: if isAdmin()'), 'ולעולם לא כתיבה');
  assert.ok(!b.includes('allow read, write: if isAdmin()'), 'ולא קריאה וכתיבה יחד');
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
  assert.ok(block('inspirationBank').includes('allow read: if isAllowed();'));
});

test('אוספי התוכן דורשים מנוי מלא', () => {
  for (const name of ['ideas', 'warmingPlans', 'contentPlans', 'storyTables']) {
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
