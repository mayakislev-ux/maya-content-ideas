/* 09/11/2026 (מאיה: "במוח השיווקי הן לא מזינות את הקהל יעד מפורט ומדויק כמו
   שכתבו בטבלת הקהל יעד אחרי שהמשימה אושרה ... את תזינו אוטומטית לכל אחת קהל
   יעד עיקרי ותחום").
   כשמאיה מאשרת בפורטל את משימת "ניתוח קהל יעד", הטבלה שאושרה נקראת מהקובץ
   של הלקוחה, ומזוקקת לשורה אחת: מי הקהל הראשי ומה מצבו. היא מחליפה את מה
   שהלקוחה כתבה בפרופיל (primaryAudience), כי זה מה שנכנס לכל פרומפט.
   הדוגמה של מאיה לשורה טובה (חן זכרוב): "נשים 16-30 שהן שכירות, מחפשות
   קריירה, אין להן כיוון, תקועות ומתוסכלות".
   כללים: רק מה שכתוב בטבלה (גיל רק אם כתוב), בשפה של הלקוחה, בלי שיווק.
   שורה שמאיה כתבה בעצמה (audienceSource: 'maya') לא נדרסת. */

const MAX_ROWS_PER_SECTION = 14;

function tableText(group) {
  const lines = [`שם הקבוצה בטבלה: ${group.header || group.label || ''}`];
  for (const s of group.sections || []) {
    lines.push(`${s.label}:`);
    for (const r of (s.rows || []).slice(0, MAX_ROWS_PER_SECTION)) lines.push(`- ${r}`);
  }
  return lines.join('\n');
}

function buildAudiencePrompt({ groups, business }) {
  const primary = groups[0];
  const secondary = groups[1];
  return `את עוזרת של מאיה קיסלב, יועצת שיווק לבעלות עסקים קטנים. הלקוחה מילאה טבלת "ניתוח קהל יעד" ומאיה אישרה אותה.
צריך לזקק מהטבלה שורה אחת שמתארת את קהל היעד הראשי שלה, ושורה שנייה לקהל המשני. השורות האלה נכנסות לכל פרומפט שכותב לה רעיונות ותסריטים, ולכן הן חייבות להיות מדויקות וחדות.

דוגמה לשורה טובה (מלקוחה אחרת): "נשים 16-30 שהן שכירות, מחפשות קריירה, אין להן כיוון, תקועות ומתוסכלות".
מה עושה אותה טובה: מי הן (מגדר, מצב בחיים), מה הן מחפשות, ומה הן מרגישות עכשיו. קצרה, בלי סיסמאות.
דוגמה לשורה גרועה: "מתחילות מאפס". זה שם של קבוצה, לא תיאור של אנשים.

כללים:
1. רק מה שכתוב בטבלה. גיל, מגדר, מצב משפחתי או עבודה נכנסים רק אם הם כתובים או משתמעים בבירור מהשורות. לא ממציאים גיל.
2. שורה אחת, עד 25 מילים, בגוף שלישי רבים ("נשים ש...", "שכירות ש...", "בעלות עסק ש..."), בלי מקף ארוך.
3. מבוסס בעיקר על הכאבים והמצב שלהן, לא על המוצר של הלקוחה.
4. התחום: אם התחום הנוכחי ("${business || ''}") ריק או לא ברור, לכתוב בכמה מילים מה הלקוחה עושה לפי הטבלה. אם הוא ברור, להחזיר אותו כמו שהוא.

הקבוצה הראשונה בטבלה (הקהל הראשי):
${tableText(primary)}
${secondary ? `\nהקבוצה השנייה בטבלה (הקהל המשני):\n${tableText(secondary)}` : ''}

השיבי רק ב-JSON תקין:
{"primary":"<שורה לקהל הראשי>","secondary":"<שורה לקהל המשני, או ריק אם אין קבוצה שנייה>","business":"<התחום>"}`;
}

function parseAudienceAnswer(text) {
  let p;
  try {
    const m = String(text || '').match(/\{[\s\S]*\}/);
    p = JSON.parse(m ? m[0] : text);
  } catch (e) {
    return null;
  }
  const clean = (v) => String(v || '').replace(/\s*[—–]\s*/g, ', ').replace(/\s+/g, ' ').trim().slice(0, 300);
  const out = { primary: clean(p && p.primary), secondary: clean(p && p.secondary), business: clean(p && p.business) };
  return out.primary ? out : null;
}

/** מה נשמר בפרופיל. לא דורס שורה שמאיה כתבה, ולא תחום קיים. */
function profileUpdate(profile, answer, now = new Date().toISOString()) {
  const p = profile || {};
  if (p.audienceSource === 'maya') return null;
  const update = {
    primaryAudience: answer.primary,
    audienceSource: 'table',
    audienceFromTableAt: now,
  };
  if (p.primaryAudience && p.primaryAudience !== answer.primary) update.primaryAudienceBeforeTable = p.primaryAudience;
  if (answer.secondary) {
    update.secondaryAudience = answer.secondary;
    if (p.secondaryAudience && p.secondaryAudience !== answer.secondary) update.secondaryAudienceBeforeTable = p.secondaryAudience;
  }
  if (!String(p.business || '').trim() && answer.business) update.business = answer.business;
  return update;
}

module.exports = { buildAudiencePrompt, parseAudienceAnswer, profileUpdate, tableText };

/**
 * הקריאה מהפורטל, מיד אחרי שמאיה אישרה את "ניתוח קהל יעד".
 * data: { idToken (של הפורטל), email (של הלקוחה) }.
 * deps: { HttpsError, verifyPortalToken(idToken) -> decoded, uidByEmail(email) -> uid|null,
 *   getProfile(uid), saveProfile(uid, update), readTab(sheetId), sections, callModel(prompt) -> text }
 */
function createAudienceFromTableHandler(deps) {
  const { HttpsError } = deps;
  return async (request) => {
    const d = request.data || {};
    const idToken = typeof d.idToken === 'string' ? d.idToken : '';
    const email = String(d.email || '').trim().toLowerCase();
    if (idToken.length < 100 || idToken.length > 5000 || !/^[^@\s]+@[^@\s]+$/.test(email)) {
      throw new HttpsError('invalid-argument', 'בקשה לא תקינה');
    }
    let decoded;
    try {
      decoded = await deps.verifyPortalToken(idToken);
    } catch (err) {
      throw new HttpsError('unauthenticated', 'האימות מהפורטל נכשל');
    }
    if (decoded.role !== 'owner' && String(decoded.email || '').toLowerCase() !== 'mayakislev@gmail.com') {
      throw new HttpsError('permission-denied', 'רק מאיה');
    }
    const uid = await deps.uidByEmail(email);
    if (!uid) return { updated: false, reason: 'no-brain-user' };
    const profile = (await deps.getProfile(uid)) || {};
    if (profile.audienceSource === 'maya') return { updated: false, reason: 'maya-wrote-it' };
    const sheetId = String(profile.sheetId || '').trim();
    if (!sheetId) return { updated: false, reason: 'no-sheet' };
    const tab = await deps.readTab(sheetId);
    if (!tab || tab.error || !tab.title) return { updated: false, reason: (tab && tab.error) || 'no-tab' };
    const { groups } = deps.sections.parseAudienceTab(tab.rows);
    if (!groups.length) return { updated: false, reason: 'empty-tab' };
    const answer = parseAudienceAnswer(await deps.callModel(buildAudiencePrompt({ groups, business: profile.business })));
    if (!answer) return { updated: false, reason: 'model' };
    const update = profileUpdate(profile, answer);
    if (!update) return { updated: false, reason: 'maya-wrote-it' };
    await deps.saveProfile(uid, update);
    return { updated: true, primaryAudience: update.primaryAudience };
  };
}

module.exports.createAudienceFromTableHandler = createAudienceFromTableHandler;
