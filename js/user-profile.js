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

export async function saveProfile(profile) {
  await setDoc(doc(db, 'profiles', subjectUid(auth.currentUser.uid)), profile, { merge: true });
}
