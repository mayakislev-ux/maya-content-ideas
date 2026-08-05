const CONCISENESS_RULE = `**קריטי - תמציתיות:** אל תוסיפי שום שדה או טקסט מעבר לפורמט המבוקש. שדה "note"/"seriesNote" (אם משתמשים בהם) - משפט אחד קצר בלבד.`;

const MUST_INCLUDE_TYPES = [
  'ניפוץ אמונות מגבילות',
  'שריפת גשרים לפתרונות אחרים',
  'סיפורי הצלחה ותוצאות',
  "אג'נדות עסקיות (ביקורות ודעות)",
  "אג'נדות אישיות",
  'סרטונים על מי שאת מעבר לעסק',
  'בעיות ותסכולים של הקהל',
  'תוכן על סלבס בהקשר לתחום',
];

function buildContentPlanPrompt({ pieceCount, ideas, primaryAudience, secondaryAudience, includeSecondaryAudience }) {
  const weeksCount = Math.ceil(pieceCount / 4);

  const ideasBlock = ideas
    .map(
      (idea, i) =>
        `${i + 1}. "${idea.title}" | קטגוריה: ${idea.category || 'לא מסווג'}${idea.persuasionStage ? ` | שלב שכנוע: ${idea.persuasionStage}` : ''}${idea.audienceScope ? ` | קהל: ${idea.audienceScope}` : ''}${idea.rating ? ` | דירוג: ${idea.rating}` : ''}`
    )
    .join('\n');

  const typesBlock = MUST_INCLUDE_TYPES.map((t, i) => `${i + 1}. ${t}`).join('\n');

  // תמציתי בכוונה, אחרי כמה תקריות חוזרות (2026-08-05) שבהן claude-sonnet-5
  // ניצל את כל תקציב max_tokens על "חשיבה" פנימית ולא הגיע בכלל לכתוב
  // JSON, ככל שהצטברו יותר הסברים/דוגמאות/הנמקות לכל כלל. כל תוספת מילים
  // כאן מגדילה סיכון לתשובה ריקה - שמרו על זה קצר גם בתוספות עתידיות.
  let audienceBlock = '';
  if (primaryAudience) {
    audienceBlock = `\nקהל יעד עיקרי: ${primaryAudience}. תוכן "עיקרי" חייב לפנות לקהל הזה עצמו, לא רק להיות קשור לתחום באופן כללי.\n`;
    if (secondaryAudience && includeSecondaryAudience) {
      audienceBlock += `קהל יעד משני (עד כ-20%, לא חובה): ${secondaryAudience}\n`;
    }
  }

  return `את/ה עוזר/ת תוכן שבונה תכנית תוכן חודשית לבעלת עסק (לקוחת "אקדמיית המהלך השיווקי"), אך ורק מתוך רשימת רעיונות שכבר קיימת אצלה במאגר - לא ממציאים רעיונות חדשים, רק משבצים ומתייגים.
${audienceBlock}
המשימה: תכנית ל-${weeksCount} שבועות, ${pieceCount} פריטי תוכן מתוך הרשימה למטה.

**כללים:**
- הרעיונות ברשימה למטה כבר נבחרו ביחס הנכון בין הקטגוריות (כ-40% בעל ערך / 30% אישי / 15% מכירתי / 15% בידורי) - שבצי את כולם בתכנית, לא רק חלק מהם.
- כל רעיון פעם אחת בלבד. כותרת מדויקת אות-באות מהרשימה. בעדיפות בתוך קטגוריה - דירוג "חייב לצלם" 🔥 קודם.
- לכל פריט, שדה "mustIncludeType" - סוג אחד מתוך 8 (בלי מספור), לפי מה שהרעיון עושה בפועל, עם שאיפה לגיוון בין הסוגים לאורך התכנית:
${typesBlock}
- זיהית סדרה/פורמט חוזר? "seriesNote" קצר, אחרת ריק.
- לא מספיק רעיונות למלא שבוע - השאירי ימים בלי item, ו-"note" קצר שמסביר שחסרים רעיונות.

הרעיונות (מסודרים לפי דירוג):
${ideasBlock}

${CONCISENESS_RULE}

JSON בלבד, בלי טקסט נוסף, בלי code fences:
{"weeks":[{"label":"שבוע 1","note":"","items":[{"day":"יום ראשון","type":"app","ideaTitle":"<מדויק מהרשימה>","mustIncludeType":"<אחד מ-8, בלי מספור>"}]}, ... בדיוק ${weeksCount} שבועות],"seriesNote":"<קצר או ריק>"}`;
}

module.exports = { buildContentPlanPrompt, MUST_INCLUDE_TYPES };
