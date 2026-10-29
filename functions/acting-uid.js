/* 29/10/2026 (מאיה: "בתצוגה כלקוחה אני רוצה לבחור את הלקוחה ושיציג לי את
   הנתונים שלה", "גם לערוך אצלה"). asUid מכובד רק כשהמחוברת היא מאיה. אצל
   כל אחת אחרת הוא מתעלם בשקט, והנתונים הם תמיד שלה עצמה. */
const ADMIN_EMAIL = 'mayakislev@gmail.com';

function actingUid(authUid, email, asUid) {
  if (email !== ADMIN_EMAIL) return authUid;
  return typeof asUid === 'string' && /^[A-Za-z0-9]{10,128}$/.test(asUid) ? asUid : authUid;
}

module.exports = { actingUid };
