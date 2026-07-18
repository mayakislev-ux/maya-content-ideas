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

// This used to force signInWithRedirect on every mobile browser - but
// redirect requires Firebase to persist auth state across a full navigation
// away to accounts.google.com and back, reading it back from storage under
// the Firebase authDomain (a different origin than this GitHub Pages app).
// iOS Safari's Intelligent Tracking Prevention is specifically designed to
// restrict exactly that kind of cross-origin storage, and real usage data
// confirms it: zero successful redirect-based logins in days despite real
// attempts. Try popup first instead (same pattern already working in her
// other two apps) and only fall back to redirect if a popup is genuinely
// blocked - don't force redirect by device type.
export async function signInWithGoogle() {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw err;
  }
}

// This used to only log to the console, invisible on a real phone - a
// redirect-flow failure (very possible on iOS Safari, where Intelligent
// Tracking Prevention can block the storage used to carry auth state across
// the redirect to Google and back) looked identical to "nothing happened."
// Surface it on-screen so a real error code is visible instead of guessed at.
getRedirectResult(auth).catch((err) => {
  console.error('getRedirectResult failed:', err);
  const errorEl = document.getElementById('login-error');
  if (errorEl) {
    errorEl.textContent = `ההתחברות נכשלה: ${err.code || err.message || err}`;
    errorEl.hidden = false;
  }
});

export function signOutUser() {
  return signOut(auth);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}
