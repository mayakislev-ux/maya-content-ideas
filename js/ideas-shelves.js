/* 06/11/2026: מסך הרעיונות בשלושה מדפים, לפי מה שהסרטון עושה.
   מאיה בחרה בסבב העיצוב את וריאציה 02 "שלושה מדפים": מביא אנשים חדשים,
   בונה אמון, מזמין לקנות. בתוך כל מדף הרעיונות המסומנים 🔥 קודם.
   בלי שום סולם של ערך גבוה/בינוני/נמוך.

   על המיקרופון מווריאציה 10 היא אמרה: "לדעתי הוא צריך להיות פשוט במסך
   הראשי ולא במסך הרעיונות". לכן הוא יושב במסך הבית (js/home-mic.js).

   הקובץ הזה טהור: אין בו Firebase ואין בו DOM, כדי שאפשר יהיה לבדוק אותו
   ולשנות בו כללים בלי לגעת בשום מסך. */
import { RATINGS, STRONG_RATING } from './ideas-logic.js';
import { OWNER_EMAIL } from './client-view.js';

/* ---------- המתג ----------
   06/11/2026: המסך הזה פתוח לכל הלקוחות, ולכן המדפים ומיקרופון הבית
   מוצגים כרגע רק למאיה (לא בתצוגה כלקוחה). השאר רואים את המסך הקיים.
   כדי לפתוח לכולם: להחליף את השורה שבתוך הפונקציה ב-return true; */
/* 06/11/2026 ערב (מאיה: "המסך של הרעיונות והכל אני לא רואה"): גם בתצוגה
   כלקוחה מאיה רואה את המסך החדש, כדי שלא תפספס אותו בזמן שהוא רק אצלה. */
export function ideasRedesignFor(email) {
  return email === OWNER_EMAIL;
}

/* ---------- שלושת המדפים ---------- */
export const SHELVES = [
  {
    id: 'חשיפה',
    title: 'מביא אנשים חדשים',
    explain: 'סרטונים שמגיעים לקהל חדש שעוד לא מכיר אותך',
    tone: 'exposure',
    /* רמקול */
    icon: '<path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M17 8a5 5 0 0 1 0 8"/>',
  },
  {
    id: 'חימום',
    title: 'בונה אמון',
    explain: 'סרטונים שבונים אמון וחיבור עם הקהל שכבר מכיר אותך',
    tone: 'trust',
    /* לב */
    icon: '<path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z"/>',
  },
  {
    id: 'מכירה',
    title: 'מזמין לקנות',
    explain: 'סרטונים שמראים תוצאות ומזמינים לקנות, עם קריאה ברורה לפעולה',
    tone: 'sale',
    /* תווית מחיר */
    icon: '<path d="M20 12l-8 8-9-9V3h8z"/><path d="M7.5 7.5h.01"/>',
  },
];

/* ---------- איך רעיון נכנס למדף ----------
   06/11/2026: מאיה, כאן משנים. הכללים נבדקים מלמעלה למטה, והכלל הראשון
   שמתאים לרעיון קובע את המדף. אין שדה חדש ברעיון: הכל נגזר ממה שכבר
   ממולא בו (קטגוריה, למי הסרטון מדבר, שלב שכנוע).

   למה בסדר הזה (נבדק מול 1,509 הרעיונות במאגר ב-06/11):
   1. "מכירתי" תמיד מזמין לקנות. לפי ההגדרה שלו יש בו קריאה ברורה לפעולה.
   2. "קהל רחב" (ויראלי) נועד מלכתחילה להגיע לאנשים חדשים.
   3. "בידורי" (קטגוריה ישנה) הוגדר "להגדיל חשיפה".
   4. "אישי" הוגדר "ליצור אמון וחיבור רגשי". כמעט כל הרעיונות האישיים
      מסומנים שלב שכנוע 3, ובלי הכלל הזה כולם היו נופלים ל"מזמין לקנות".
   5-7. שלב השכנוע: מודעות לבעיה מביאה אנשים חדשים, מודעות לפתרון
      (ניפוץ אמונות, לשרוף גשרים) בונה אמון, "למה דווקא אני" מזמין לקנות.
   רעיון שאף כלל לא תפס (טיוטה בלי קטגוריה, רעיון בלי שלב) נכנס
   ל-DEFAULT_SHELF ולא הולך לאיבוד. */
export const SHELF_RULES = [
  { field: 'category', is: 'מכירתי', shelf: 'מכירה' },
  { field: 'audienceScope', is: 'רחב', shelf: 'חשיפה' },
  { field: 'category', is: 'בידורי', shelf: 'חשיפה' },
  { field: 'category', is: 'אישי', shelf: 'חימום' },
  { field: 'persuasionStage', is: 1, shelf: 'חשיפה' },
  { field: 'persuasionStage', is: 2, shelf: 'חימום' },
  { field: 'persuasionStage', is: 3, shelf: 'מכירה' },
];
export const DEFAULT_SHELF = 'חימום';

/* במאגר יש גם ניסוחים ישנים של שלב השכנוע ("מודעות לבעיה", "הבנת הפתרון
   (...)", "למה דווקא אני") ושל הקהל ("קהל רחב"), ולכן ההתאמה סלחנית. */
export function stageNumber(stage) {
  const s = String(stage || '');
  const m = s.match(/שלב שכנוע\s*([123])/);
  if (m) return Number(m[1]);
  if (s.includes('מודעות לבעיה')) return 1;
  if (s.includes('הבנת הפתרון') || s.includes('מודעות לפתרון')) return 2;
  if (s.includes('למה דווקא')) return 3;
  return 0;
}

function fieldMatches(idea, rule) {
  const value = idea ? idea[rule.field] : '';
  if (rule.field === 'persuasionStage') return stageNumber(value) === rule.is;
  if (rule.field === 'audienceScope') return String(value || '').includes(rule.is);
  /* "ערכי" הוא השם הישן של "בעל ערך" */
  const v = value === 'ערכי' ? 'בעל ערך' : value;
  return v === rule.is;
}

/** המדף (id) שהרעיון שייך אליו. תמיד מחזיר מדף קיים. */
export function shelfFor(idea) {
  const hit = SHELF_RULES.find((rule) => fieldMatches(idea, rule));
  return hit ? hit.shelf : DEFAULT_SHELF;
}

/** 🔥 קודם, אחר כך ⭐, ואז כל השאר (💭, בלי דירוג) */
export function ratingRank(idea) {
  if (idea && idea.rating === STRONG_RATING) return 0;
  const i = RATINGS.indexOf(idea && idea.rating);
  return i === -1 ? RATINGS.length : i;
}

/** שלושה מדפים בסדר הקבוע, כל אחד עם הרעיונות שלו. בתוך מדף: 🔥 קודם,
    ובין רעיונות באותו דירוג נשמר הסדר שהגיע (המיון שנבחר במסך). */
export function groupIntoShelves(ideas) {
  const groups = SHELVES.map((shelf) => ({ ...shelf, ideas: [] }));
  const byId = new Map(groups.map((g) => [g.id, g]));
  for (const idea of ideas || []) {
    (byId.get(shelfFor(idea)) || byId.get(DEFAULT_SHELF)).ideas.push(idea);
  }
  for (const g of groups) {
    g.ideas = g.ideas
      .map((idea, i) => ({ idea, i }))
      .sort((a, b) => ratingRank(a.idea) - ratingRank(b.idea) || a.i - b.i)
      .map((x) => x.idea);
  }
  return groups;
}
