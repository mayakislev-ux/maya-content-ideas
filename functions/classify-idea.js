/* 07/11/2026: המסווג של classifyIdea, במקום אחד.

   עד היום הפרומפט והפענוח ישבו בתוך classifyIdea ב-index.js. השלמת
   הסיווג לכל הרעיונות שלא סווגו (classifyUnsortedIdeas, ראו
   classify-unsorted.js) חייבת לתת בדיוק את מה שהאפליקציה נותנת, ולכן
   שתיהן בונות את הפרומפט ומפענחות את התשובה מכאן. */
const {
  CATEGORIES, PERSUASION_STAGES, CATEGORY_DEFINITIONS, PERSUASION_STAGE_DEFINITIONS,
} = require('./ideas-constants');

const CLASSIFY_MODEL = 'claude-haiku-4-5-20251001';

const AUDIENCE_SCOPES = ['עיקרי', 'משני', 'רחב'];
/* אותו הסבר שהמקליט (ideas-from-recording.js) נותן לג'מיני */
const AUDIENCE_SCOPE_DEFINITIONS = {
  'עיקרי': 'הלקוחות האידיאליים של העסק, מי שהעסק באמת מוכר להם',
  'משני': 'קהל קרוב לקהל העיקרי, שיכול להתעניין אבל הוא לא הלקוח האידיאלי',
  'רחב': 'כל אחד, תוכן לחשיפה רחבה (ויראלי) שלא דורש להיות בתחום',
};

function buildClassifyPrompt(title, hookText = '') {
  return `הרעיון לתוכן: "${title}"
פירוט נוסף: "${hookText}"

סווג/י את הרעיון הזה לפי שתי המערכות הבאות (המבוססות על המתודולוגיה המדויקת של מאיה קיסלב - אקדמיית המהלך השיווקי):

מערכת 1 - סוג תוכן, בחר/י בדיוק אחד לפי המספר שלו:
${CATEGORIES.map((c, i) => `${i + 1}. ${c}: ${CATEGORY_DEFINITIONS[c]}`).join('\n')}

**הבחנה קריטית שגורמת לטעויות סיווג בפועל - סיפור לקוח מול סיפור אישי:** "אישי" הוא **רק** על החיים/הסיפור/החוויות של **בעל/ת העסק עצמו/ה** - לא על לקוחות. סיפור שמתאר מה **קרה ללקוח/ה** (למשל "לקוחה הגיעה אליי מ...", "מטופל סיפר לי ש...", כל תיאור של תהליך/תוצאה/מקרה של מישהו אחר שפנה לעסק) הוא **לעולם לא "אישי"**, גם אם הוא מנוסח בגוף ראשון ("אליי", "אצלי") - הגוף הראשון כאן מתאר את הקשר בין הלקוח/ה לבעל/ת העסק, לא את החיים האישיים של בעל/ת העסק. סיפור לקוח כזה הוא "מכירתי" אם הוא מציג תוצאה/הוכחה/עדות שמטרתה לשכנע לרכוש, או "בעל ערך" אם הוא משמש כדוגמה להמחשת תובנה/טעות/עיקרון מקצועי בלי דגש מכירתי ישיר. דוגמה קונקרטית: "לא תאמינו שחר הגיעה אליי מבאר שבע עם [בעיה] ותוך [X זמן] הגיעה ל[תוצאה]" - זה **מכירתי** (סיפור הצלחה של לקוחה עם הוכחת תוצאה), **לא אישי**, למרות ה"אליי".

מערכת 2 - שלב שכנוע, בחר/י בדיוק אחד לפי המספר שלו. לשים לב: לכל תוכן יש בדרך כלל שלב שכנוע דומיננטי אחד, גם אם הוא נוגע קצת גם באחרים - תבחר/י את זה שהכי מתאר את המטרה המרכזית של הרעיון הספציפי הזה:
${PERSUASION_STAGES.map((s, i) => `${i + 1}. ${s}: ${PERSUASION_STAGE_DEFINITIONS[s]}`).join('\n')}

מערכת 3 - למי הסרטון מדבר, בחר/י בדיוק אחד לפי המספר שלו:
${AUDIENCE_SCOPES.map((s, i) => `${i + 1}. ${s}: ${AUDIENCE_SCOPE_DEFINITIONS[s]}`).join('\n')}

השב/י אך ורק ב-JSON תקין בפורמט הבא, בלי שום טקסט נוסף לפני או אחרי - רק שלושה מספרים שלמים, לא את הטקסט של הקטגוריה/השלב/הקהל עצמם:
{"categoryIndex": <מספר בין 1 ל-${CATEGORIES.length}>, "persuasionStageIndex": <מספר בין 1 ל-${PERSUASION_STAGES.length}>, "audienceScopeIndex": <מספר בין 1 ל-${AUDIENCE_SCOPES.length}>}`;
}

/* בעבר הותאמו מחרוזות תיאוריות ארוכות בהתאמה מדויקת (.includes) עם ברירת
   מחדל שקטה לאפשרות הראשונה בכל אי-התאמה - זה יצר הטיה שיטתית ל"שלב
   שכנוע 1" בכל פעם שה-AI סטה ולו במעט מהמחרוזת המדויקת. מספר שלם קצר
   הרבה יותר יציב להתאמה, ואי-התאמה נכשלת בגלוי (null) במקום לתייג בשקט
   תווית שגויה.

   06/11/2026: קהל לא תקין לא מפיל את הסיווג (הסוג והשלב חשובים יותר):
   הוא פשוט נשאר ריק. */
function parseClassification(text) {
  let parsed;
  try {
    const raw = String(text || '{}');
    const match = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const category = CATEGORIES[Number(parsed.categoryIndex) - 1];
  const persuasionStage = PERSUASION_STAGES[Number(parsed.persuasionStageIndex) - 1];
  if (!category || !persuasionStage) return null;
  const audienceScope = AUDIENCE_SCOPES[Number(parsed.audienceScopeIndex) - 1] || '';
  return { category, persuasionStage, audienceScope };
}

module.exports = {
  CLASSIFY_MODEL,
  AUDIENCE_SCOPES,
  AUDIENCE_SCOPE_DEFINITIONS,
  buildClassifyPrompt,
  parseClassification,
};
