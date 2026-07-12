import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, enableIndexedDbPersistence } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getFunctions } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

const firebaseConfig = {
  apiKey: 'AIzaSyC7ctB2m4vRcf4BkVwCtp2s-KXcnPyrK4U',
  authDomain: 'content-ideas-becd7.firebaseapp.com',
  projectId: 'content-ideas-becd7',
  storageBucket: 'content-ideas-becd7.firebasestorage.app',
  messagingSenderId: '48872680367',
  appId: '1:48872680367:web:2fc7ca716707f459525d5a',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'us-central1');

enableIndexedDbPersistence(db).catch((err) => {
  console.warn('Offline persistence not enabled:', err.code);
});
