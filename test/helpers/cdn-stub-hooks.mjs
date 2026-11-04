/* 04/11/2026: מודולי האפליקציה מייבאים את Firebase מ-CDN, ולכן אי אפשר
   לטעון אותם ב-node כמו שהם. ה-hook הזה מחליף כל ייבוא מ-gstatic במודול
   שמעביר כל קריאה ל-globalThis.__fbStub, שהבדיקה ממלאת בזיכרון. כך
   הבדיקה מריצה את הקוד האמיתי, ולוחצת על הכפתורים האמיתיים, ב-jsdom. */
const NAMES = {
  'firebase-app.js': ['initializeApp'],
  'firebase-auth.js': ['getAuth', 'GoogleAuthProvider', 'signInWithPopup', 'signInWithRedirect', 'getRedirectResult', 'signOut', 'onAuthStateChanged', 'signInWithCustomToken'],
  'firebase-firestore.js': ['getFirestore', 'enableIndexedDbPersistence', 'doc', 'getDoc', 'getDocs', 'setDoc', 'addDoc', 'updateDoc', 'deleteDoc', 'collection', 'query', 'where', 'orderBy', 'limit', 'onSnapshot', 'serverTimestamp'],
  'firebase-functions.js': ['getFunctions', 'httpsCallable'],
  'firebase-storage.js': ['getStorage', 'ref', 'uploadBytes', 'uploadBytesResumable', 'getDownloadURL', 'deleteObject', 'listAll', 'getMetadata', 'updateMetadata'],
};

export async function load(url, context, nextLoad) {
  if (url.startsWith('https://www.gstatic.com/firebasejs/')) {
    const file = url.split('/').pop();
    const names = NAMES[file] || [];
    const source = names.map((n) => `export function ${n}(...a) {
  const f = globalThis.__fbStub && globalThis.__fbStub.${n};
  return f ? f(...a) : {};
}`).join('\n');
    return { format: 'module', source, shortCircuit: true };
  }
  return nextLoad(url, context);
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('https://www.gstatic.com/firebasejs/')) {
    return { url: specifier, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
