const DISMISS_KEY = 'ios-install-overlay-dismissed';

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

export function showIosInstallOverlayIfNeeded() {
  if (!isIos() || isStandalone()) return;
  if (sessionStorage.getItem(DISMISS_KEY)) return;

  const overlay = document.createElement('div');
  overlay.className = 'ios-install-overlay';
  overlay.innerHTML = `
    <div class="ios-install-card">
      <div class="ios-install-emoji">📲</div>
      <h2>מומלץ להתקין את האפליקציה!</h2>
      <p>ככה תקבלי גישה מהירה מהמסך הראשי, וגם תוכלי לקבל התראות ותזכורות.</p>
      <ol class="ios-install-steps">
        <li>לחצי על כפתור השיתוף <strong>⬆️</strong> למטה בספארי</li>
        <li>גללי ולחצי על <strong>"הוספה למסך הבית"</strong></li>
        <li>לחצי <strong>"הוספה"</strong> בפינה</li>
      </ol>
      <button type="button" class="btn-primary ios-install-dismiss-btn">הבנתי, אמשיך בדפדפן</button>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('.ios-install-dismiss-btn').addEventListener('click', () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    overlay.remove();
  });
}
