import { db, auth } from './firebase-init.js';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

function contentPlansCollection() {
  return collection(db, 'contentPlans');
}

export async function saveContentPlan({ weeksCount, postsPerWeek, liveContentNote, plan }) {
  return addDoc(contentPlansCollection(), {
    weeksCount,
    postsPerWeek,
    liveContentNote,
    plan,
    ownerUid: auth.currentUser.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateContentPlan(id, { plan }) {
  return updateDoc(doc(db, 'contentPlans', id), { plan, updatedAt: serverTimestamp() });
}

export async function deleteContentPlan(id) {
  return deleteDoc(doc(db, 'contentPlans', id));
}

export async function listContentPlans() {
  const uid = auth.currentUser?.uid;
  const q = query(contentPlansCollection(), where('ownerUid', '==', uid));
  const snap = await getDocs(q);
  const plans = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  plans.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  return plans;
}
