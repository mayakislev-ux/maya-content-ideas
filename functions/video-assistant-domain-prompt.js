// 13/10/2026: ניחוש חד-פעמי של תחום הלקוחה בכלי "העוזר ליצירת סרטון" -
// אין שדה "תחום" מובנה באף גיליון (זה טקסט חופשי בתוך הסיפור האישי), אז
// שולחים את הטקסט הזה ל-AI פעם אחת ושומרים את התשובה לצמיתות
// (profiles/{uid}.videoAssistantDomain). ראה docs/superpowers/specs/2026-10-13-video-creation-assistant-design.md

const DOMAINS = [
  'יופי וקוסמטיקה',
  'בריאות נפשית, טיפול ורוח',
  'עסקים ויזמות',
  'עיצוב, נדל"ן ואדריכלות',
  'כושר ותזונה',
  'תוכן אישי וחיבור',
];

function buildDomainGuessPrompt({ personaText }) {
  return `הטקסט הבא הוא הסיפור האישי/העסקי שכתבה לקוחה בגיליון העבודה שלה:

"${personaText}"

על סמך הטקסט הזה בלבד, באיזה תחום מתוך הרשימה הבאה היא עוסקת? בחר/י בדיוק אחד לפי המספר שלו:
${DOMAINS.map((d, i) => `${i + 1}. ${d}`).join('\n')}

השב/י אך ורק ב-JSON תקין, בלי שום טקסט נוסף לפני או אחרי:
{"domainIndex": <מספר בין 1 ל-${DOMAINS.length}>}`;
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
  return DOMAINS[index - 1] || null;
}

module.exports = { DOMAINS, buildDomainGuessPrompt, parseDomainGuess };
