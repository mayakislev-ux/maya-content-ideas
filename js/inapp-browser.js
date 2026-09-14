// Google blocks OAuth sign-in inside in-app webviews (WhatsApp/Instagram/
// Facebook/Messenger) for security reasons. Two independent ways this gets
// detected, both needed:
// 1. Proactive: user-agent sniffing, checked on page load (app.js) - catches
//    most Android in-app browsers, which do embed the host app's name.
// 2. Reactive: iOS in-app browsers frequently do NOT add any app-identifying
//    token to navigator.userAgent (confirmed by a real incident, 2026-09-14
//    - a client's WhatsApp Business in-app browser on iOS wasn't caught by
//    #1, so the app proceeded normally, Google's own signInWithPopup then
//    failed with auth/operation-not-supported-in-this-environment - Firebase
//    itself recognizing the embedded environment - and the OLD fallback
//    (signInWithRedirect) sent her to a raw, unrecoverable Firebase-hosted
//    error page ("missing initial state") that the app's own JS never runs
//    on. auth.js now treats that specific error code as an in-app-browser
//    signal too and calls showInAppBrowserWarning() instead of redirecting.
export function isInAppBrowser() {
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|Instagram|WhatsApp|Line\/|Messenger|TikTok|musical_ly|Twitter|LinkedInApp|GSA\/|Gmail/i.test(ua);
}

export function showInAppBrowserWarning() {
  const signInBtn = document.getElementById('google-signin-btn');
  if (signInBtn) signInBtn.hidden = true;
  const warning = document.getElementById('inapp-browser-warning');
  if (!warning) return;
  warning.hidden = false;

  const copyBtn = document.getElementById('copy-link-btn');
  if (copyBtn && !copyBtn.dataset.wired) {
    copyBtn.dataset.wired = '1';
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(location.href);
      } catch {
        // clipboard API unavailable/blocked - fall back to selecting nothing,
        // the confirm text still tells her the button was pressed
      }
      document.getElementById('copy-link-confirm').hidden = false;
    });
  }
}
