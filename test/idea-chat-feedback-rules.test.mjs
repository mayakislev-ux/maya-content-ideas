/* 05/11/2026: הדגשים ברמת הרעיון מתוך 149 הפידבקים האמיתיים של מאיה
   (תפקיד שיווקי, שלב מודעות, מבחן ההחלפה, רעיון אחד = מסר אחד, סכנה
   אסטרטגית, שכפול לפני כתיבה מאפס, משפך). הבדיקות כאן מוודאות שהבלוק
   באמת נכנס לפרומפט, שהשלבים מפנים אליו, ושהשורה הטכנית שהאפליקציה
   קוראת לא השתנתה. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { extractIdeaSummary, labeledIdea } from '../js/idea-reply.js';

const require = createRequire(import.meta.url);
const { buildSystemPrompt, FEEDBACK_RULES } = require('../functions/system-prompt.js');

const profiles = [
  [{ name: 'נועה', pronoun: 'את', business: 'ציפורניים', primaryAudience: 'שכירות' }],
  [{ pronoun: 'אתה' }],
  [{}],
  [{ name: 'נועה', pronoun: 'את' }, { category: 'אישי', persuasionStage: 'שלב שכנוע 3 - למה דווקא אני', audienceScope: 'רחב' }],
];

test('בלוק הדגשים מהפידבקים נכנס לפרומפט בכל פרופיל', () => {
  assert.match(FEEDBACK_RULES, /^דגשים מהפידבקים האמיתיים של מאיה \(נובמבר 2026\):/);
  for (const args of profiles) {
    const p = buildSystemPrompt(...args);
    assert.ok(p.includes(FEEDBACK_RULES), 'הבלוק המלא בפנים');
    assert.ok(p.indexOf(FEEDBACK_RULES) < p.indexOf("שלב א' (מה הרעיון)"), 'הבלוק לפני שלבי השיחה');
  }
});

test('הדגשים מצטטים את מאיה עצמה', () => {
  for (const quote of [
    'בשלב של בחירת הרעיון עצמו וההבנה מה הסרטון צריך לעשות שיווקית',
    'והאם הרעיון שבחרתי באמת עושה את העבודה הזאת?',
    'היא כבר החליטה שהיא רוצה ללמוד ציפורניים',
    'רעיון אחד = מסר אחד',
    'כתיבה מאפס היא הרמה הכי מורכבת ביצירת תוכן',
    'אז לא בכוח כי זה רק יחליש את התסריט',
    'לחבר משפכים לרוב הסרטונים',
    'שימי לב שזה תוכן בעל ערך ולא מכירתי',
  ]) assert.ok(FEEDBACK_RULES.includes(quote), quote);
});

test('שלב א\' מפעיל את הדגשים, והתוצאה כוללת תפקיד שיווקי ורפרנס לשכפול', () => {
  const p = buildSystemPrompt({ name: 'נועה', pronoun: 'את' });
  const stageA = p.slice(p.indexOf("שלב א' (מה הרעיון)"), p.indexOf("שלב ב' (להרחיב"));
  assert.match(stageA, /הדגשים מהפידבקים האמיתיים של מאיה/);
  assert.match(stageA, /תפקיד שיווקי/);
  assert.match(stageA, /שלב מודעות/);
  assert.match(stageA, /נספר במכסת 4 השאלות/);
  const result = p.slice(p.indexOf("שלב ו' (התוצאה הסופית"));
  for (const label of ['**הרעיון:**', '**המסר האחד:**', '**הזווית:**', '**לקהל:**', '**התפקיד השיווקי:**', '**הנעה לפעולה:**', '**רפרנס לשכפול:**']) {
    assert.ok(result.includes(label), label);
  }
});

test('כללי השיחה נשארו כמו שהם', () => {
  const p = buildSystemPrompt({ name: 'נועה', pronoun: 'את' });
  assert.match(p, /שאלה אחת בלבד בכל הודעה/);
  assert.match(p, /לא יותר מ-4 שאלות/);
  assert.match(p, /אסור לכפות חיבור לעסק/);
});

test('השורה הטכנית [[IDEA_SUMMARY]] לא השתנתה', () => {
  const p = buildSystemPrompt({ name: 'נועה', pronoun: 'את' });
  assert.ok(p.includes('[[IDEA_SUMMARY]]<הרעיון - אותו משפט מסעיף "הרעיון">||<שם הזווית שנבחרה בדיוק כפי שהיא מופיעה בבנק ה-31 זוויות>||<תמצית הסיפור במשפט אחד אם שולב, אחרת מחרוזת ריקה>||<המסר האחד - אותו משפט מסעיף "המסר האחד">'));
  assert.equal((p.match(/\[\[IDEA_SUMMARY\]\]/g) || []).length, 3, 'הפורמט ושתי הדוגמאות בלבד');
});

test('הסעיפים החדשים בתוצאה לא מבלבלים את הקורא של האפליקציה', () => {
  const reply = '**הרעיון:** א\n**המסר האחד:** ב\n**הזווית:** טעות נפוצה - כך\n**לקהל:** שכירות\n**התפקיד השיווקי:** סמכות - מנפץ אמונה\n**הנעה לפעולה:** להגיב "ציפורניים"\n**רפרנס לשכפול:** ניפוץ מיתוס דרך סיפור לקוחה\n\nיאללה.\n[[IDEA_SUMMARY]]א||טעות נפוצה||||ב';
  const r = extractIdeaSummary(reply);
  assert.equal(r.idea, 'א');
  assert.equal(r.angle, 'טעות נפוצה');
  assert.equal(r.message, 'ב');
  assert.doesNotMatch(r.visibleReply, /IDEA_SUMMARY/);
  assert.deepEqual(labeledIdea(reply), { idea: 'א', message: 'ב', angle: 'טעות נפוצה - כך', audience: 'שכירות' });
});

test('בלי מקף ארוך בטקסט החדש', () => {
  assert.doesNotMatch(FEEDBACK_RULES, /—/);
});
