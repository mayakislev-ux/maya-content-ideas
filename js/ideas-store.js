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
