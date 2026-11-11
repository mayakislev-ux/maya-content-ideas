import { db, auth } from './firebase-init.js';
import {
  doc,
  getDoc,
  setDoc,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { subjectUid } from './client-view.js';

export async function getProfile() {
  const snap = await getDoc(doc(db, 'profiles', subjectUid(auth.currentUser.uid)));
  return snap.exists() ? snap.data() : null;
}

/* 11/11/2026: המחזור של הלקוחה (מרשימת הגישה, שהיא יכולה לקרוא רק לעצמה) */
export async function getMyCohort() {
  const email = String((auth.currentUser && auth.currentUser.email) || '').toLowerCase();
  if (!email) return '';
  const snap = await getDoc(doc(db, 'allowlist', email));
  return snap.exists() ? String((snap.data() || {}).cohort || '') : '';
}

export async function saveProfile(profile) {
  await setDoc(doc(db, 'profiles', subjectUid(auth.currentUser.uid)), profile, { merge: true });
}
