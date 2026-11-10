/* 10/11/2026 (מאיה, דרך הרנטגן בפורטל): "הקהל העיקרי נמצא במוח (בפרופיל), ובטבלת
   הקהל יעד זו לרוב העמודה הראשונה". הרנטגן צריך לדעת את הקהל העיקרי גם
   כשאין עדיין טבלה מאושרת (מחזור 7, ומאיה עצמה). קריאה בלבד.
   הרשאה: מאיה (owner) לכל מייל. לקוחה רק לעצמה. כל השאר: ריק. */

const EMPTY = Object.freeze({ primaryAudience: '', audiences: [], business: '' });
const OWNER_EMAIL = 'mayakislev@gmail.com';

function pickAudience(profile) {
  const p = profile || {};
  const clean = (v) => String(v || '').trim();
  const audiences = Array.isArray(p.audiences)
    ? p.audiences.filter((a) => a && clean(a.line)).map((a) => ({ name: clean(a.name), line: clean(a.line) })).slice(0, 6)
    : [];
  return {
    primaryAudience: clean(p.primaryAudience) || (audiences[0] ? audiences[0].line : ''),
    audiences,
    business: clean(p.business),
  };
}

/**
 * deps: { HttpsError, verifyPortalToken(idToken) -> decoded, uidByEmail(email) -> uid|null, getProfile(uid) }
 * data: { idToken, email }
 */
function createAudienceForPortalHandler(deps) {
  const { HttpsError } = deps;
  return async (request) => {
    const d = (request && request.data) || {};
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
    const caller = String(decoded.email || '').toLowerCase();
    const isOwner = decoded.role === 'owner' || caller === OWNER_EMAIL;
    if (!isOwner && caller !== email) return { ...EMPTY };
    const uid = await deps.uidByEmail(email);
    if (!uid) return { ...EMPTY };
    return pickAudience(await deps.getProfile(uid));
  };
}

module.exports = { createAudienceForPortalHandler, pickAudience };
