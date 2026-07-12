import { db, auth } from './firebase-init.js';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

function ideasCollection() {
  return collection(db, 'ideas');
}

export function subscribeToIdeas(callback) {
  const uid = auth.currentUser?.uid;
  const q = query(ideasCollection(), where('ownerUid', '==', uid));
  return onSnapshot(q, (snapshot) => {
    const ideas = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(ideas);
  });
}

export async function addIdea({
  title,
  category,
  hookText = '',
  sourceLink = '',
  persuasionStage = '',
  viralPotential = false,
  source = '',
  rating = '',
}) {
  return addDoc(ideasCollection(), {
    title,
    category,
    hookText,
    sourceLink,
    persuasionStage,
    viralPotential,
    source,
    rating,
    status: 'רעיון',
    ownerUid: auth.currentUser.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateIdea(id, fields) {
  return updateDoc(doc(db, 'ideas', id), { ...fields, updatedAt: serverTimestamp() });
}

export async function deleteIdea(id) {
  return deleteDoc(doc(db, 'ideas', id));
}
