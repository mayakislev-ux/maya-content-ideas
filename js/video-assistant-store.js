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

export async function guessDomain(personaText) {
  const result = await guessClientDomainFn({ personaText });
  return result.data.domain;
}

export async function saveDomain(domain, subCategory) {
  await saveProfile({ videoAssistantDomain: domain, videoAssistantSubCategory: subCategory || null });
}

/** הסשן הפעיל - מסמך יחיד לפי uid, לא היסטוריה (ראה firestore.rules) */
export async function loadSession() {
  const snap = await getDoc(doc(db, 'videoAssistantSessions', auth.currentUser.uid));
  return snap.exists() ? snap.data() : null;
}

export async function saveSession(state) {
  await setDoc(doc(db, 'videoAssistantSessions', auth.currentUser.uid), state);
}
