// 13/10/2026: שני הפרומפטים ל-ChatGPT מתוך "העוזר שלך ליצירת סרטון",
// מילה במילה מהניסוח של מאיה (docs/superpowers/specs/2026-10-13-video-creation-assistant-design.md)
// - אסור לשנות את הניסוח, רק למלא את המשתנים.

export function buildDuplicationPrompt({ audience, domain, hook }) {
  const audienceText = audience && audience.trim() ? audience.trim() : '[הקהל שלי]';
  const domainText = domain && domain.trim() ? domain.trim() : '[התחום שלי]';
  return `הקהל יעד העיקרי שלי הוא: ${audienceText}
התחום שלי הוא: ${domainText}
אני רוצה שתקח את ההוק הזה: ${hook}
ובעצם תשכפל אותו בול 1:1, אותו מנגנון 1:1, אותו אורך, אותו מבנה רק מותאם
לעולם ולקהל שלי ותביא לי עוד 30 רעיונות חזקים אבל תזכור בול לשכפל מגנון
1:1 ואותו אורך! שים לב מדויק לכל הדגשים שכתבתי ומותאם לקהל יעד שלי בול`;
}

export function buildScriptPrompt({ hook, herWords }) {
  return `זה ההוק שבחרתי: ${hook}
זה מה שיש לי להגיד: ${herWords}
אני רוצה עכשיו שתקח את ההוק שלי תלביש אותו בתסריט המקורי יחד עם כל מה
שיש לי להגיד אבל הכי חשוב? תשמור על מנגנון התסריט 1:1, את האורך אותו
אורך, אל תעשה יותר ארוך, אותו מבנה, אותו מנגנון רק הכל מותאם לקהל שלי
ולהוק שלי!!`;
}
