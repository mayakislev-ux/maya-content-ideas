import { auth, functions } from './firebase-init.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { loginErrorText } from './login-error-text.js';
import { showInAppBrowserWarning } from './inapp-browser.js';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  signInWithCustomToken,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

// 19/09/2026 (מאיה: "שהמעבר ישאר חלק ולא ידרוש מהן להתחבר"): הפורטל
// ("המהלך השיווקי") פותח את האפליקציה עם #portal=<אסימון> בכתובת. מוחקים
// אותו מהכתובת מיד, מחליפים אותו בשרת (portalSso) באסימון כניסה לאותו
// חשבון לפי המייל, ונכנסים - בלי מסך התחברות ובלי לבחור חשבון גוגל.
const portalHandoffToken = (() => {
  const m = /^#portal=([\w.-]+)$/.exec(window.location.hash);
  if (!m) return null;
  history.replaceState(null, '', window.location.pathname + window.location.search);
  return m[1];
})();

export const portalHandoff = portalHandoffToken
  ? httpsCallable(functions, 'portalSso')({ idToken: portalHandoffToken })
      // כבר מחוברת לאותו חשבון? לא מתחברים שוב (זה היה מריץ את כל הטעינה פעמיים)
      .then(async (res) => {
        await auth.authStateReady();
        if (auth.currentUser?.uid === res.data.uid) return null;
        return signInWithCustomToken(auth, res.data.token);
      })
      .then(() => ({ ok: true }))
      .catch((err) => {
        console.error('portal handoff failed:', err);
        return { ok: false, message: err?.message || 'המעבר מהפורטל לא הצליח' };
      })
  : null;

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
//
// auth/operation-not-supported-in-this-environment used to also fall back to
// redirect - REMOVED after a real incident (2026-09-14): this exact error is
// Firebase's own signal that the popup failed because it's running inside an
// embedded webview (most commonly an in-app browser like WhatsApp's, which
// app.js's user-agent sniff doesn't always catch - iOS in-app browsers often
// don't add any app-identifying token to navigator.userAgent at all). In
// that environment, redirect doesn't just fail cleanly - it sends the user
// to a RAW, unrecoverable Firebase-hosted error page ("missing initial
// state"), because the embedded browser can't reliably carry storage across
// the full external round-trip to accounts.google.com and back. The app's
// own JS never runs again on that page, so there's no way to catch or
// explain that failure after the fact - the only real fix is to never
// attempt redirect for this specific error, and show the same "open this in
// a real browser" warning the proactive check already has ready.
export async function signInWithGoogle() {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    if (err.code === 'auth/operation-not-supported-in-this-environment') {
      showInAppBrowserWarning();
      return;
    }
    if (err.code === 'auth/popup-blocked') {
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
    errorEl.textContent = loginErrorText(err);
    errorEl.hidden = false;
  }
});

export function signOutUser() {
  return signOut(auth);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}
