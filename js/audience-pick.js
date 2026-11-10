/* 10/11/2026 (מאיה): "כפתור כזה בצד שאפשר תמיד לשנות, וזה יהיה בדיפולט
   על העיקרי, ושאר הקהלים לפי טבלת הקהל יעד שלכם, שתמיד העמודה הראשונה
   זה העיקרי".

   הקהלים מגיעים מהפרופיל: profile.audiences (כל קבוצה בטבלה שאושרה, לפי
   הסדר), ואם אין טבלה, הקהל העיקרי והמשני שנכתבו בפרופיל. הבחירה נשמרת
   בסשן של הסרטון (state.audiencePick), ולכן היא תקפה לסרטון הזה בלבד. */

/** רשימת הקהלים לבחירה. הראשון תמיד העיקרי. */
export function audienceOptions(profile) {
  const p = profile || {};
  const clean = (v) => String(v || '').trim();
  const fromTable = Array.isArray(p.audiences)
    ? p.audiences.filter((a) => a && clean(a.line)).map((a) => ({ name: clean(a.name), line: clean(a.line) }))
    : [];
  let list;
  if (fromTable.length) {
    list = fromTable;
  } else {
    list = [];
    if (clean(p.primaryAudience)) list.push({ name: '', line: clean(p.primaryAudience) });
    if (clean(p.secondaryAudience)) list.push({ name: '', line: clean(p.secondaryAudience) });
  }
  /* העיקרי בפרופיל גובר על השורה הראשונה בטבלה: מאיה יכולה לכתוב אותו
     ביד (audienceSource 'maya'), ואז זה מה שנכנס עד היום לכל פרומפט. */
  if (list.length && clean(p.primaryAudience)) list[0] = { ...list[0], line: clean(p.primaryAudience) };
  /* וכך גם המשני: מה שנערך ביד ב"הפרטים שלי" גובר על השורה מהטבלה */
  if (list.length > 1 && clean(p.secondaryAudience)) list[1] = { ...list[1], line: clean(p.secondaryAudience) };
  return list.map((a, i) => ({
    key: `a${i}`,
    role: i === 0 ? 'primary' : i === 1 ? 'secondary' : 'other',
    tag: i === 0 ? 'עיקרי' : i === 1 ? 'משני' : 'נוסף',
    name: a.name || (i === 0 ? 'הקהל העיקרי' : i === 1 ? 'הקהל המשני' : `קהל ${i + 1}`),
    line: a.line,
  }));
}

/** הקהל שנכנס לפרומפטים של הסרטון הזה. בלי בחירה: העיקרי. */
export function pickedAudience(pick, profile) {
  const options = audienceOptions(profile);
  if (pick && pick.custom && String(pick.line || '').trim()) {
    return { key: 'custom', role: 'custom', tag: 'אחר', name: 'קהל אחר', line: String(pick.line).trim() };
  }
  if (pick && pick.key) {
    const found = options.find((o) => o.key === pick.key && o.line === pick.line)
      || options.find((o) => o.line === pick.line);
    if (found) return found;
  }
  return options[0] || null;
}

/** הכיתוב על הכפתור */
export function audienceChipLabel(picked) {
  if (!picked) return 'לאיזה קהל?';
  if (picked.role === 'primary') return picked.name === 'הקהל העיקרי' ? 'קהל: עיקרי' : `קהל: ${picked.name} (עיקרי)`;
  if (picked.role === 'custom') return 'קהל: אחר';
  return `קהל: ${picked.name}`;
}

/* 10/11/2026 (מאיה, צילום מסך של החלון): "שיהיה אופציה מיידית לערוך את זה
   כאן". עריכה, הוספה ומחיקה של קהל מתוך החלון נשמרות בפרופיל: הרשימה כולה
   ב-audiences, והשורה הראשונה והשנייה גם ב-primaryAudience ו-secondaryAudience,
   כי משם כל שאר המוח השיווקי קורא. */
function baseList(profile) {
  return audienceOptions(profile).map((o) => ({ name: o.name, line: o.line }));
}
function withMirrors(list) {
  return {
    audiences: list,
    primaryAudience: list[0] ? list[0].line : '',
    secondaryAudience: list[1] ? list[1].line : '',
  };
}
const clip = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);

/** עריכת קהל קיים (key כמו ב-audienceOptions). null אם אין מה לשמור. */
export function audienceEditUpdate(profile, key, { name, line }) {
  const list = baseList(profile);
  const i = Number(String(key || '').replace(/^a/, ''));
  if (!Number.isInteger(i) || !list[i] || !clip(line, 300)) return null;
  list[i] = { name: clip(name, 60) || list[i].name, line: clip(line, 300) };
  return withMirrors(list);
}

/** קהל חדש בסוף הרשימה */
export function audienceAddUpdate(profile, { name, line }) {
  const list = baseList(profile);
  if (!clip(line, 300) || list.length >= 6) return null;
  list.push({ name: clip(name, 60) || `קהל ${list.length + 1}`, line: clip(line, 300) });
  return withMirrors(list);
}

/** מחיקת קהל. את העיקרי לא מוחקים, רק עורכים. */
export function audienceDeleteUpdate(profile, key) {
  const list = baseList(profile);
  const i = Number(String(key || '').replace(/^a/, ''));
  if (!Number.isInteger(i) || i < 1 || !list[i]) return null;
  list.splice(i, 1);
  return withMirrors(list);
}
