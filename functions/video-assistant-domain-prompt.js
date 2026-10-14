// 13/10/2026: ניחוש חד-פעמי של תחום הלקוחה בכלי "העוזר ליצירת סרטון" -
// אין שדה "תחום" מובנה באף גיליון (זה טקסט חופשי בתוך הסיפור האישי), אז
// שולחים את הטקסט הזה ל-AI פעם אחת ושומרים את התשובה לצמיתות
// (profiles/{uid}.videoAssistantDomain). ראה docs/superpowers/specs/2026-10-13-video-creation-assistant-design.md
//
// 14/10/2026 (מאיה, אחרי בדיקה אמיתית): "הוא חייב לדעת תחום מדויק שלי,
// לא כללי" - לכן הניחוש כולל גם תת-קטגוריה (מתוך אותה רשימה שכבר קיימת
// במאגר ההשראה, SUBCATEGORIES_BY_DOMAIN), לא רק את התחום הרחב.
const { SUBCATEGORIES_BY_DOMAIN } = require('./inspiration-constants');

const DOMAINS = [
  'יופי וקוסמטיקה',
  'בריאות נפשית, טיפול ורוח',
  'עסקים ויזמות',
  'עיצוב, נדל"ן ואדריכלות',
  'כושר ותזונה',
  'תוכן אישי וחיבור',
];

function subCategoriesOf(domain) {
  return Object.keys(SUBCATEGORIES_BY_DOMAIN[domain] || {});
}

function buildDomainGuessPrompt({ personaText, business }) {
  const domainsBlock = DOMAINS.map((d, i) => {
    const subs = subCategoriesOf(d);
    const subsText = subs.length ? ` (תתי-קטגוריה אפשריים: ${subs.join(', ')})` : ' (אין לתחום הזה תתי-קטגוריה)';
    return `${i + 1}. ${d}${subsText}`;
  }).join('\n');
  const businessLine = business && business.trim() ? `\n\nתיאור העסק שהיא עצמה כתבה על עצמה: "${business.trim()}"` : '';
  return `הטקסט הבא הוא הסיפור האישי/העסקי שכתבה לקוחה בגיליון העבודה שלה:

"${personaText}"${businessLine}

על סמך הטקסט הזה, זהי במדויק באיזה תחום ותת-קטגוריה מתוך הרשימה הבאה היא עוסקת. בחרי תחום אחד, ואם יש לתחום שבחרת תתי-קטגוריה ברשימה - בחרי גם את התת-קטגוריה הספציפית ביותר שמתאימה, לא רק את התחום הכללי:
${domainsBlock}

השיבי אך ורק ב-JSON תקין, בלי שום טקסט נוסף לפני או אחרי:
{"domainIndex": <מספר בין 1 ל-${DOMAINS.length}>, "subCategory": "<שם תת-הקטגוריה המדויק מהרשימה שמעל, בדיוק כפי שכתוב, או null אם אין תתי-קטגוריה לתחום או שלא ברור>"}`;
}

function parseDomainGuess(text) {
  let parsed;
  try {
    const match = String(text || '').match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : text);
  } catch {
    return null;
  }
  const index = Number(parsed.domainIndex);
  const domain = DOMAINS[index - 1];
  if (!domain) return null;
  const validSubs = subCategoriesOf(domain);
  const subCategory = validSubs.includes(parsed.subCategory) ? parsed.subCategory : null;
  return { domain, subCategory };
}

module.exports = { DOMAINS, SUBCATEGORIES_BY_DOMAIN, subCategoriesOf, buildDomainGuessPrompt, parseDomainGuess };
