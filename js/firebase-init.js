import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, enableIndexedDbPersistence } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'REPLACE_WITH_REAL_VALUE',
  authDomain: 'maya-content-ideas.firebaseapp.com',
  projectId: 'maya-content-ideas',
  storageBucket: 'maya-content-ideas.appspot.com',
  messagingSenderId: 'REPLACE_WITH_REAL_VALUE',
  appId: 'REPLACE_WITH_REAL_VALUE',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

enableIndexedDbPersistence(db).catch((err) => {
  console.warn('Offline persistence not enabled:', err.code);
});
