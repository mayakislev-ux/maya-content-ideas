/* 06/11/2026: צ'אט "דיוק רעיון ומסר" - השפה של המשתמש/ת, מגדר הקהל, ומסר חזק.
   מאיה: "בצ'אט לדיוק רעיון ומסר הוא כותב הכל ממש בשפה מוזרה ולא בשפה שלי,
   נגיד דיברתי על בעלת עסק שעושה 6 ספרות בחודש אבל לידים קפואים מלא ממומן
   והוא כתב לי במסר 'מחזור מדמם' מה זאת השפה הזאת", "הוא גם הסיק שהקהל שלי
   זה נשים וכתב בגוף נקבה", ו"בכלל הוא לא הגיע למסר האמיתי הרצוי והחזק".
   ההערכה מול המודל האמיתי: scripts/eval-refine-chat.mjs. הבדיקות כאן
   מוודאות שהכללים באמת נכנסים לפרומפט בכל פרופיל, בסדר הנכון, ושהשורה
   הטכנית שהאפליקציה קוראת לא השתנתה. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildSystemPrompt, LANGUAGE_RULES, AUDIENCE_GENDER_RULES, MESSAGE_METHOD, ADMIN_OPEN_MODE,
} = require('../functions/system-prompt.js');
const SERVER = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');

const profiles = [
  [{ name: 'נועה', pronoun: 'את', business: 'ציפורניים', primaryAudience: 'שכירות' }],
  [{ name: 'אורי', pronoun: 'אתה', business: 'אימון כושר', primaryAudience: 'גברים' }],
  [{}],
  [{ name: 'מאיה', pronoun: 'את' }, { category: 'בעל ערך', persuasionStage: '', audienceScope: '' }],
];

test('שלושת הבלוקים החדשים נכנסים לכל פרופיל, אחרי הדגשים ולפני שלבי השיחה', () => {
  for (const args of profiles) {
    const p = buildSystemPrompt(...args);
    for (const block of [LANGUAGE_RULES, AUDIENCE_GENDER_RULES, MESSAGE_METHOD]) {
      assert.ok(p.includes(block));
      assert.ok(p.indexOf(block) > p.indexOf('דגשים מהפידבקים האמיתיים של מאיה'));
      assert.ok(p.indexOf(block) < p.indexOf("שלב א' (מה הרעיון)"));
    }
  }
});

test('השפה של המשתמש/ת: הציטוט שלה, הביטויים שלה נשמרים, בדיקה עצמית', () => {
  assert.ok(LANGUAGE_RULES.includes("'מחזור מדמם' מה זאת השפה הזאת"));
  for (const phrase of ['"6 ספרות בחודש"', '"לידים קפואים"', '"ממומן"']) assert.ok(LANGUAGE_RULES.includes(phrase), phrase);
  assert.match(LANGUAGE_RULES, /אסור להמציא דימויים, מטאפורות, השוואות/);
  assert.match(LANGUAGE_RULES, /אסור ז'רגון שיווקי מתורגם/);
  assert.match(LANGUAGE_RULES, /האם המשתמש\/ת אמר\/ה אותו בשיחה\? ואם לא, האם זה ביטוי יומיומי/);
  assert.match(LANGUAGE_RULES, /להקריא את המשפט למצלמה בלי לשנות בו מילה/);
});

test('האיסור על דימויים כבר לא מוגבל לתגובות הפתיחה', () => {
  const p = buildSystemPrompt({ name: 'נועה', pronoun: 'את' });
  assert.match(p, /האיסור על דימויים ומטאפורות חל עליהם עוד יותר מאשר על תגובות הפתיחה/);
  assert.match(p, /הקונקרטיות באה מהפרטים שהמשתמש\/ת נתן\/ה, לא מדימוי/);
});

test('מגדר הקהל לא נגזר מלשון הפנייה ולא מדמות אחת', () => {
  assert.ok(AUDIENCE_GENDER_RULES.includes('הוא גם הסיק שהקהל שלי זה נשים וכתב בגוף נקבה'));
  assert.match(AUDIENCE_GENDER_RULES, /לשון הפנייה בפרופיל היא של מי שמדבר\/ת איתך בצ'אט/);
  assert.match(AUDIENCE_GENDER_RULES, /הקהל של הסרטון הוא "בעלי עסקים", לא "בעלות עסקים"/);
  const p = buildSystemPrompt({ name: 'נועה', pronoun: 'את' });
  assert.match(p, /לשון הפנייה הזו היא רק של מי שמדבר\/ת איתך, לא של הקהל/);
});

test('הדוגמאות של השורה הטכנית כבר לא בלשון נקבה', () => {
  const p = buildSystemPrompt({ pronoun: 'אתה' });
  assert.doesNotMatch(p, /הרגע שאת מספרת/);
  assert.doesNotMatch(p, /כשאת מאמינה בעצמך/);
  assert.match(p, /הרגע שאתם מספרים/);
});

test('מצב הבעלים מסיק קהל אבל לא מגדר, ו-index.js משתמש בו', () => {
  assert.match(ADMIN_OPEN_MODE, /^\*\*מצב פתוח - כל רעיון מכל תחום:\*\*/);
  assert.match(ADMIN_OPEN_MODE, /אבל לא את המגדר של הקהל/);
  assert.ok(SERVER.includes("const { buildSystemPrompt, ADMIN_OPEN_MODE } = require('./system-prompt');"));
  assert.ok(SERVER.includes('systemPrompt += `\\n\\n${ADMIN_OPEN_MODE}`;'));
  assert.ok(!SERVER.includes("systemPrompt += '\\n\\n**מצב פתוח"), 'הטקסט הישן לא נשאר כפול ב-index.js');
});

test('מסר חזק: הגדרה, 2-3 ניסוחים עם כוכב, מקסימום 2 שאלות, ורק אז זוויות', () => {
  assert.match(MESSAGE_METHOD, /טענה, לא נושא/);
  assert.match(MESSAGE_METHOD, /איזו אמונה\/בעיה\/מסר אני רוצה לשנות\?/);
  assert.match(MESSAGE_METHOD, /מציעים 2-3 ניסוחים של המסר, ממוספרים 1 עד 3/);
  assert.match(MESSAGE_METHOD, /⭐/);
  assert.match(MESSAGE_METHOD, /לכל היותר 2 שאלות בדרך למסר/);
  assert.match(MESSAGE_METHOD, /רק אחרי שנבחר מסר עוברים לזוויות/);
  /* הניסוחים ממוספרים 1-3 בלבד: מונה שאלות ההבהרה בשרת מזהה את שלב הזוויות
     לפי 4 פריטים ממוספרים ומעלה כולל 5, ולכן הודעת ניסוחים לא תיספר בטעות כזוויות */
  assert.doesNotMatch(MESSAGE_METHOD, /1 עד 5/);
  const p = buildSystemPrompt({ name: 'נועה', pronoun: 'את' });
  const stageC = p.slice(p.indexOf("שלב ג' (המסר"), p.indexOf("שלב ד' (זוויות"));
  assert.match(stageC, /מה זה מסר חזק, ואיך מגיעים אליו/);
  assert.match(stageC, /2-3 ניסוחים ממוספרים/);
});

test('מכסת השאלות והשורה הטכנית נשארו כמו שהם', () => {
  assert.ok(SERVER.includes('const CHECK_IDEA_MAX_QUESTIONS = 4;'));
  const p = buildSystemPrompt({ name: 'נועה', pronoun: 'את' });
  assert.match(p, /לא יותר מ-4 שאלות/);
  assert.equal((p.match(/\[\[IDEA_SUMMARY\]\]/g) || []).length, 3);
  assert.ok(p.includes('**המסר האחד:**'));
});

test('בלי מקף ארוך בטקסט החדש', () => {
  for (const block of [LANGUAGE_RULES, AUDIENCE_GENDER_RULES, MESSAGE_METHOD, ADMIN_OPEN_MODE]) assert.doesNotMatch(block, /—/);
});
