/* 08/11/2026 (מאיה, על צ'אט דיוק זווית הנגשה): "איך בוחרים איפה ללמוד
   ציפורניים" נפסל כ"עוד נושא", ואחרי תשובה ארוכה הוצעו מסרים סיסמתיים
   ומסר שאי אפשר לבדוק ("אם המדריכה למדה מיוטיוב"). הבדיקות מוודאות
   שהכללים נכנסו לפרומפט בכל פרופיל. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildSystemPrompt, MESSAGE_METHOD } = require('../functions/system-prompt.js');

const profiles = [
  [{ name: 'נועה', pronoun: 'את', business: 'ציפורניים', primaryAudience: 'שכירות' }],
  [{ pronoun: 'אתה' }],
  [{}],
];

test('שאלה נפוצה של הקהל היא רעיון, לא "עוד נושא"', () => {
  assert.ok(MESSAGE_METHOD.includes('שאלה שהקהל באמת שואל היא כבר רעיון טוב'));
  assert.ok(MESSAGE_METHOD.includes('3 דגלים אדומים בקורס ציפורניים'));
  assert.ok(MESSAGE_METHOD.includes('לא הייתי מוותרת על הרעיון'));
});

test('מתשובה ארוכה שולפים רק את הקונקרטי, ומסר בחירה חייב להיות בר בדיקה', () => {
  assert.ok(MESSAGE_METHOD.includes('את הסיסמאות מתעלמים מהן'));
  assert.ok(MESSAGE_METHOD.includes('לצופה אין שום דרך לדעת איפה המדריכה למדה'));
  assert.ok(MESSAGE_METHOD.includes('"הבעיה היא לא X, הבעיה היא Y"'));
});

test('הכללים נכנסים לפרומפט המלא, והשלב הראשון מפנה אליהם', () => {
  for (const args of profiles) {
    const p = buildSystemPrompt(...args);
    assert.ok(p.includes(MESSAGE_METHOD));
    assert.match(p, /איננה "רק נושא"/);
    assert.ok(p.indexOf('איננה "רק נושא"') < p.indexOf("שלב ב' (להרחיב"));
  }
});

test('הבדיקה האחרונה לפני שליחה פוסלת סיסמה, מסר שאי אפשר לבדוק ופרט ששונה', () => {
  const p = buildSystemPrompt({});
  assert.ok(p.includes('(5) אין ניסוח במבנה "הבעיה היא לא X, הבעיה היא Y"'));
  assert.ok(p.includes('(6) כל פרט ששלפת מהמשתמש/ת'));
  assert.ok(p.includes('ניסוח שמסביר "למה המצב בתחום גרוע"'));
});
