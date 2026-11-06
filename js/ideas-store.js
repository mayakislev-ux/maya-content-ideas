import { db, auth } from './firebase-init.js';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { subjectUid } from './client-view.js';

function ideasCollection() {
  return collection(db, 'ideas');
}

/**
 * @param {function} callback מקבל את הרעיונות
 * @param {function} [onError] מקבל שגיאה כשהמאזין נדחה
 *
 * 12/10/2026: המאזין נרשם בלי טיפול בשגיאה, ולכן דחיית הרשאה או כשל
 * רשת פשוט השתיקו אותו לנצח. המסכים שנשענים עליו נשארו עם הערך
 * ההתחלתי: רשימת הרעיונות ריקה בלי אפילו מצב "עדיין שקט כאן", ומסך
 * תוכנית התוכן הצהיר "יש לך כרגע 0 מתוך 6 הדרושים". כלומר האפליקציה
 * אמרה ללקוחה במפורש שאין לה רעיונות, בזמן שהם פשוט לא נקראו.
 *
 * זאת אותה משפחה שגרמה ללקוחות לחשוב שנמחקו להן נתונים ב-11/10.
 */
export function subscribeToIdeas(callback, onError) {
  const uid = subjectUid(auth.currentUser?.uid);
  const q = query(ideasCollection(), where('ownerUid', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const ideas = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(ideas);
    },
    (err) => {
      console.error('subscribeToIdeas failed:', err);
      if (typeof onError === 'function') onError(err);
    },
  );
}

export async function addIdea({
  title,
  category,
  hookText = '',
  sourceLink = '',
  persuasionStage = '',
  audienceScope = '',
  source = '',
  rating = '',
  format = '',
  series = '',
  seriesOrder = null,
}) {
  return addDoc(ideasCollection(), {
    title,
    category,
    hookText,
    sourceLink,
    persuasionStage,
    audienceScope,
    source,
    rating,
    format,
    series,
    seriesOrder,
    ownerUid: subjectUid(auth.currentUser.uid),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateIdea(id, fields) {
  return updateDoc(doc(db, 'ideas', id), { ...fields, updatedAt: serverTimestamp() });
}

export async function deleteIdea(id) {
  return updateDoc(doc(db, 'ideas', id), { deletedAt: serverTimestamp() });
}

export async function restoreIdea(id) {
  return updateDoc(doc(db, 'ideas', id), { deletedAt: null });
}

export async function addQuickIdea(title) {
  return addDoc(ideasCollection(), {
    title,
    category: '',
    hookText: '',
    sourceLink: '',
    persuasionStage: '',
    audienceScope: '',
    source: '',
    rating: '',
    ownerUid: subjectUid(auth.currentUser.uid),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function markIdeaCompleted(id) {
  return updateDoc(doc(db, 'ideas', id), { completedAt: serverTimestamp() });
}

export async function uncompleteIdea(id) {
  return updateDoc(doc(db, 'ideas', id), { completedAt: null });
}

/* 06/11/2026 (מאיה: "מעצבן שיש מלא רעיונות שביצעתי ובשביל למחוק כל רעיון
   זה ממש להיכנס למחוק לוקח מלא זמן"): מחיקה של הרבה רעיונות שבוצעו בבת
   אחת. זאת אותה מחיקה בדיוק כמו deleteIdea (deletedAt, ולכן אפשר לבטל),
   רק בכתיבה מרוכזת. ב-Firestore כתיבה מרוכזת מוגבלת ל-500 מסמכים, ולכן
   מחלקים לחבילות. חבילה שנכשלה לא עוצרת את האחרות, והתוצאה אומרת בדיוק
   מה נמחק ומה לא, כדי שהמסך יגיד את האמת. */
export const BULK_CHUNK = 500;
const BULK_TIMEOUT_MS = 20000;

async function bulkUpdate(ids, fields) {
  const done = [];
  const failed = [];
  let error = null;
  const list = [...new Set((ids || []).filter(Boolean))];
  for (let i = 0; i < list.length; i += BULK_CHUNK) {
    const part = list.slice(i, i + BULK_CHUNK);
    const batch = writeBatch(db);
    for (const id of part) batch.update(doc(db, 'ideas', id), fields());
    let timer = null;
    try {
      await Promise.race([
        batch.commit(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('bulk timeout')), BULK_TIMEOUT_MS); }),
      ]);
      done.push(...part);
    } catch (err) {
      console.error('bulk ideas update failed:', err);
      error = err;
      failed.push(...part);
    } finally {
      clearTimeout(timer);
    }
  }
  return { done, failed, error };
}

/** @returns {Promise<{done: string[], failed: string[], error: any}>} */
export function deleteIdeasBulk(ids) {
  return bulkUpdate(ids, () => ({ deletedAt: serverTimestamp() }));
}

export function restoreIdeasBulk(ids) {
  return bulkUpdate(ids, () => ({ deletedAt: null }));
}
