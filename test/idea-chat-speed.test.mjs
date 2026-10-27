/* 27/10/2026 (מאיה): "הצ'אט של דיוק זווית ההגשה לרעיון קצת איטי, יש דרך
   למהר אותו?"

   הלוגים של אותה שיחה עצמה (checkIdea: stream complete) אומרים לאן הזמן
   הלך, ולא צריך לנחש:

     הודעה קצרה:  outputTokens 161  | firstThinkingMs null | firstTextMs 717
     5 זוויות:    outputTokens 2384 | firstThinkingMs 692  | firstTextMs 22294

   כלומר בהודעת הזוויות החשיבה נפתחה אחרי 0.7 שניות והאות הראשונה על המסך
   הגיעה רק אחרי 22, ומתוך 2384 טוקנים רק כ-350 היו טקסט שמאיה ראתה.

   לכן תקציב חשיבה, ולא ביטול: ב-breakdownStorySequence כבר נמדד שביטול
   החשיבה מקצר אבל פוגע באיכות (ראו story-sequence.test.mjs), ומאיה התלוננה
   באותה נשימה גם על דיוק. */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const server = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
const prompt = readFileSync(new URL('../functions/system-prompt.js', import.meta.url), 'utf8');

const checkIdea = (() => {
  const from = server.indexOf('exports.checkIdea');
  return server.slice(from, server.indexOf('exports.classifyIdea', from));
})();

test('לצ\'אט הרעיונות יש תקציב חשיבה, ולא חשיבה פתוחה', () => {
  assert.match(server, /const CHECK_IDEA_THINKING_BUDGET = 1024;/);
  assert.match(checkIdea, /thinking: \{ type: 'enabled', budget_tokens: thinkingBudget \}/);
  assert.match(checkIdea, /requestBody\(CHECK_IDEA_THINKING_BUDGET\)/);
  assert.match(checkIdea, /firstTextMs 22294|firstTextMs 22294/, 'המדידה האמיתית תועדה בקוד');
});

/* אי אפשר היה לבדוק את הקריאה מול ה-API מהמחשב של מאיה (המפתח הוא secret
   של Firebase), ולכן השדה החדש חייב נפילה לאחור: אם הוא לא מתקבל, הצ'אט
   חוזר להתנהגות של היום במקום להישבר מול לקוחה. */
test('אם הפרמטר לא מתקבל, הבקשה נשלחת שוב בלעדיו', () => {
  assert.match(checkIdea, /anthropicResponse\.status === 400/);
  assert.match(checkIdea, /requestBody\(null\)/);
  const retryAt = checkIdea.indexOf('requestBody(null)');
  const errorAt = checkIdea.indexOf('!anthropicResponse.ok');
  assert.ok(retryAt > -1 && retryAt < errorAt, 'הניסיון השני קודם להצגת שגיאה למשתמשת');
});

/* 27/10/2026 (מאיה): "הוא גם לא דייק מה הקשר בין הרעיון שרשמתי לזווית
   טעות חמורה". שם של זווית בלי להגיד מה הטעות בתוך הרעיון שלה הוא כותרת,
   לא הנגשה. */
test('כל זווית חייבת להגיד מה הקשר שלה לרעיון שנכתב', () => {
  assert.match(prompt, /חובה להגיד במפורש מה הקשר בין הזווית לרעיון/);
  assert.match(prompt, /טעות חמורה/, 'הדוגמה שמאיה נתקלה בה נמצאת בהנחיה');
  assert.match(prompt, /זו הוכחה שהזווית לא מתאימה לרעיון הזה/, 'אין קשר אמיתי - מחליפים זווית');
});

/* 27/10/2026 (מאיה): "הוא בכלל לא זיהה את הרעיון שלי וזה היה חמור". היא
   כתבה "יש דבר כזה פרסום שלילי", כלומר פרסום שפוגע לעסק, והתשובה שאלה אם
   היא מתכוונת שפרסום שלילי דווקא מועיל - ההפך הגמור. המשפט דומה לאמרה
   "אין דבר כזה פרסום רע", והתשובה נצמדה לאמרה במקום למשפט שלה. */
test('פרשנות לא הופכת את הכיוון של מה שנכתב', () => {
  assert.match(prompt, /אסור להפוך את מה שנכתב/);
  assert.match(prompt, /יש דבר כזה פרסום שלילי/, 'הרעיון האמיתי של מאיה הוא הדוגמה');
  assert.match(prompt, /מה שנכתב מנצח את האמרה/);
  assert.match(prompt, /השאלה היא על מה שחסר/, 'שואלים על החסר, לא על הכיוון');
});

/* ובאותה שיחה גם: "אני שומעת שאת חוזרת על אותו משפט". היא חזרה כי הקריאה
   הראשונה הייתה שגויה, וזו הערה עליה במקום תיקון עצמי. */
test('חזרה של המשתמשת נקראת כטעות קריאה, לא כהיתקעות שלה', () => {
  assert.match(prompt, /אל תגידי לה את זה/);
  assert.match(prompt, /סימן שהקריאה הראשונה שלך הייתה שגויה/);
});
