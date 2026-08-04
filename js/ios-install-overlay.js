const DISMISS_KEY = 'ios-install-overlay-dismissed-until';
const DISMISS_DAYS = 3;

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function isChromeOnIos() {
  return /CriOS/.test(navigator.userAgent);
}

function buildSteps() {
  if (isChromeOnIos()) {
    return [
      'לחצו על כפתור שלוש הנקודות <strong>⋯</strong> למטה (או למעלה, תלוי במכשיר)',
      'לחצו על <strong>"שיתוף" (Share)</strong>',
      'בתפריט שנפתח, לחצו על <strong>"הוספה למסך הבית"</strong> (ייתכן שצריך לגלול או ללחוץ קודם על "הצגת עוד")',
      'לחצו <strong>"הוספה"</strong> באישור הסופי',
    ];
  }
  return [
    'לחצו על כפתור השיתוף <strong>⬆️</strong> (ריבוע עם חץ למעלה) בסרגל התחתון של ספארי',
    'גללו למטה ולחצו על <strong>"הוספה למסך הבית"</strong>',
    'לחצו <strong>"הוספה"</strong> בפינה העליונה',
  ];
}

export function showIosInstallOverlayIfNeeded() {
  if (!isIos() || isStandalone()) return;
  const dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) || '0');
  if (Date.now() < dismissedUntil) return;
  // This fires immediately on login and again at 2 and 5 minutes - without
  // this guard, if she hadn't dismissed it yet, each of those three calls
  // stacked another full-screen overlay on top of the last one instead of
  // replacing it. Dismissing the topmost card would still leave 1-2 more
  // identical blocking overlays sitting underneath, which would look like
  // the app got stuck/broken.
  if (document.querySelector('.ios-install-overlay')) return;

  const overlay = document.createElement('div');
  overlay.className = 'ios-install-overlay';
  const stepsHtml = buildSteps()
    .map((step) => `<li>${step}</li>`)
    .join('');
  overlay.innerHTML = `
    <div class="ios-install-card">
      <div class="ios-install-emoji">📲</div>
      <h2>מומלץ להתקין את האפליקציה!</h2>
      <p>ככה אפשר לקבל גישה מהירה מהמסך הראשי, וגם לקבל התראות ותזכורות.</p>
      <ol class="ios-install-steps">${stepsHtml}</ol>
      <button type="button" class="btn-primary ios-install-dismiss-btn">הבנתי, נמשיך בדפדפן</button>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('.ios-install-dismiss-btn').addEventListener('click', () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000));
    overlay.remove();
  });
}
