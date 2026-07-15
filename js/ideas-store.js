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
  audienceScope = '',
  source = '',
  rating = '',
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
    ownerUid: auth.currentUser.uid,
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
    ownerUid: auth.currentUser.uid,
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
