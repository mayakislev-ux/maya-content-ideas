import { db, auth } from './firebase-init.js';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

function warmingPlansCollection() {
  return collection(db, 'warmingPlans');
}

export async function saveWarmingPlan({ product, audience, extraContext, plan }) {
  return addDoc(warmingPlansCollection(), {
    product,
    audience,
    extraContext,
    plan,
    ownerUid: auth.currentUser.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateWarmingPlan(id, { plan }) {
  return updateDoc(doc(db, 'warmingPlans', id), { plan, updatedAt: serverTimestamp() });
}

export async function listWarmingPlans() {
  const uid = auth.currentUser?.uid;
  const q = query(warmingPlansCollection(), where('ownerUid', '==', uid));
  const snap = await getDocs(q);
  const plans = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  plans.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  return plans;
}
