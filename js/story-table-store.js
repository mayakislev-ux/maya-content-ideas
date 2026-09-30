import { db, auth, functions } from './firebase-init.js';
import {
  doc,
  getDoc,
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
