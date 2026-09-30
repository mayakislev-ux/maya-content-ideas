import { db, auth, functions } from './firebase-init.js';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

// 30/09/2026: מסמך אחד ללקוחה.
// audiences נשלף מהגיליון ונדרס בכל סנכרון. answers ו-overrides הם מה שהיא
// כתבה בעצמה ולכן הם בשדות נפרדים, ואף סנכרון לא נוגע בהם.
//
//   storyTables/{uid} = {
//     audiences: [...],                              // מהגיליון
//     answers:   { a2: { demand: 'טקסט' } },          // שורות שהגיליון לא יכול למלא
//     overrides: { a2: { 'gap-direct': 'טקסט' } },    // עריכה שלה לשורה שנשלפה
//   }

function tableRef() {
  return doc(db, 'storyTables', auth.currentUser.uid);
}

export async function loadStoryTable() {
  const snap = await getDoc(tableRef());
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    audiences: Array.isArray(data.audiences) ? data.audiences : [],
    answers: data.answers || {},
    overrides: data.overrides || {},
    sheetId: data.sheetId || '',
    syncedAt: data.syncedAt || null,
  };
}

export async function syncStoryTable(sheetUrl) {
  const call = httpsCallable(functions, 'syncStoryTable');
  const res = await call(sheetUrl ? { sheetUrl } : {});
  return res.data;
}

/** שומרת עריכה שלה לשורה שנשלפה מהגיליון */
export async function saveOverride(audienceId, rowKey, text) {
  await setDoc(
    tableRef(),
    {
      ownerUid: auth.currentUser.uid,
      overrides: { [audienceId]: { [rowKey]: text } },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

// ההיגיון הטהור (מה מוצג, מה חסר, מה נכנס לתוכנית) יושב ב-story-table-render.js
// כדי שאפשר יהיה לבדוק אותו בלי דפדפן. כאן נשארה רק הגישה ל-Firestore.

// 30/09/2026 (מאיה: "אבל למה לא מפורט?"): היא הסתכלה על החשבון שלה, שהקובץ
// שלו ריק, וחשבה שהמסך שבור. שתי הפונקציות האלה נותנות לה לראות את הטבלה
// של לקוחה אמיתית. חוקי Firestore מרשים למאיה קריאה בלבד, אף פעם לא כתיבה.
export async function listStoryTables() {
  const snap = await getDocs(collection(db, 'storyTables'));
  return snap.docs
    .map((d) => ({ uid: d.id, name: d.data().clientName || d.id, count: (d.data().audiences || []).length }))
    .filter((r) => r.count > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

export async function loadStoryTableFor(uid) {
  const snap = await getDoc(doc(db, 'storyTables', uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    audiences: Array.isArray(data.audiences) ? data.audiences : [],
    answers: data.answers || {},
    overrides: data.overrides || {},
  };
}
