// js/video-assistant-store.js
// 13/10/2026: כל הגישה ל-Firestore/Functions עבור "העוזר שלך ליצירת
// סרטון", במקום אחד - שימוש חוזר ב-getProfile/saveProfile הקיימים
// (user-profile.js) בלי לשכפל אותם.
import { db, auth, functions } from './firebase-init.js';
import {
  collection, query, where, getDocs, doc, getDoc, setDoc,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { getProfile, saveProfile } from './user-profile.js';

const guessClientDomainFn = httpsCallable(functions, 'guessClientDomain');
const suggestSearchKeywordsFn = httpsCallable(functions, 'suggestSearchKeywords');
const extractOpeningHookFn = httpsCallable(functions, 'extractOpeningHook');

/** רעיונות פעילים של הלקוחה הנוכחית - קריאה חד-פעמית, לא listener */
export async function fetchIdeas() {
  const q = query(collection(db, 'ideas'), where('ownerUid', '==', auth.currentUser.uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** כל מאגר ההשראה - קריאה חד-פעמית, בלי cache משותף עם inspiration-view.js
   בכוונה (זה מסך נפרד, לא חייב לשתף promise עם המסך האחר). */
export async function fetchInspirationBank() {
  const snap = await getDocs(collection(db, 'inspirationBank'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** ניחוש/שמירה חד-פעמית של התחום - ראה profiles/{uid}.videoAssistantDomain */
export async function getSavedDomain() {
  const profile = await getProfile();
  return profile && profile.videoAssistantDomain ? { domain: profile.videoAssistantDomain, subCategory: profile.videoAssistantSubCategory || null } : null;
}

// 14/10/2026: הפונקציה בשרת קוראת בעצמה את sheetId ואת לשונית הפרסונה -
// שום פרמטר לא נדרש כאן יותר (ראה functions/index.js, guessClientDomain).
// מחזירה { domain, subCategory }.
export async function guessDomain() {
  const result = await guessClientDomainFn({});
  return result.data;
}

export async function saveDomain(domain, subCategory) {
  await saveProfile({ videoAssistantDomain: domain, videoAssistantSubCategory: subCategory || null });
}

// 14/10/2026 (מאיה: "את לא מקשיבה! אני רוצה שהיא תמצא רפרנס לבד - את
// תביאי לה כותרות"): לא מחפשים וידאו בשבילה (matchInspirationQuery נשאר
// רק במסך "מאגר להשראה" הרגיל) - רק מציעים מילות חיפוש, והיא מחפשת בעצמה.
export async function suggestSearchKeywords(idea) {
  const result = await suggestSearchKeywordsFn({ idea });
  return result.data.keywords;
}

// 19/10/2026 (מאיה, אחרי בדיקה אמיתית מול ChatGPT: "הוא כתב את כל
// התסריט" - שכפול הפוך העביר את כל התמלול המודבק כ"ההוק הזה", אז
// ChatGPT פשוט שכפל חזרה את כל הפסקה במקום לייצר 30 הוקים חדשים).
// מזהה רק את המשפט/ים הפותחים (עד שמגיעים לנימוק/הרחבה) - ראה
// renderPrompt1 ב-video-assistant.js.
export async function extractOpeningHook(transcript) {
  const result = await extractOpeningHookFn({ transcript });
  return result.data.hook;
}

/** הסשן הפעיל - מסמך יחיד לפי uid, לא היסטוריה (ראה firestore.rules) */
export async function loadSession() {
  const snap = await getDoc(doc(db, 'videoAssistantSessions', auth.currentUser.uid));
  return snap.exists() ? snap.data() : null;
}

// 18/10/2026 (לקוחה, דרך מאיה: "עניתי בצ'אט על השאלות... זה ריפרש לי
// והייתי צריכה להתחיל מחדש, כאילו זה לא שמר") - updatedAt הוא מה שמאפשר
// להבחין בין סשן פעיל שהתרענן בטעות (לשחזר) לבין סשן ישן שהיא כבר לא
// רוצה לחזור אליו (להתחיל ממנו מחדש) - ראה video-assistant.js, wireVideoAssistantView.
export async function saveSession(state) {
  await setDoc(doc(db, 'videoAssistantSessions', auth.currentUser.uid), { ...state, updatedAt: Date.now() });
}
