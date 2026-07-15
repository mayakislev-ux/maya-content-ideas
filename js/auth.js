import { auth } from './firebase-init.js';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const provider = new GoogleAuthProvider();

function isMobileBrowser() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

export function signInWithGoogle() {
  // Popup sign-in is unreliable on mobile Safari/Chrome (popup blockers,
  // WebKit's storage-access restrictions) - redirect is the standard fix.
  if (isMobileBrowser()) {
    return signInWithRedirect(auth, provider);
  }
  return signInWithPopup(auth, provider);
}

getRedirectResult(auth).catch((err) => console.error('getRedirectResult failed:', err));

export function signOutUser() {
  return signOut(auth);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}
