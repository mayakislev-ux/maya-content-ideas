import { onAuthChange, signInWithGoogle, signOutUser } from './auth.js';
import { auth, db } from './firebase-init.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { subscribeToIdeas } from './ideas-store.js';
import { renderArchive, wireArchiveControls, getCurrentIdeas, wirePullToRefresh } from './archive-view.js';
import { openAddModal, openEditModal, wireIdeaForm } from './idea-form.js';
import { wireRandomIdeaModal } from './random-idea-modal.js';
import { wireIdeaChat, startIdeaChat } from './idea-chat.js';
import { wireFeedbackForm } from './feedback.js';
import { wireWarmingView } from './warming.js';
import { showView, getLastView } from './view-router.js';
import { showToast } from './toast.js';
import { hasCompletedTour, showWelcomeTour } from './welcome-tour.js';

if ('serviceWorker' in navigator) {
  let refreshedAlready = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshedAlready) return;
    refreshedAlready = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register('./sw.js')
    .then((registration) => {
      // Actively check for a new version instead of waiting for the browser's
      // own (infrequent) update heuristics - every 60s while the tab is open,
      // and immediately whenever the user comes back to this tab.
      setInterval(() => registration.update(), 60000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update();
      });

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showToast('מעדכן לגרסה חדשה...', { duration: 4000 });
          }
        });
      });
    })
    .catch((err) => console.error('SW registration failed:', err));
}

const ADMIN_EMAIL = 'mayakislev@gmail.com';
let unsubscribeIdeas = null;

const offlineBanner = document.getElementById('offline-banner');
function updateOnlineStatus() {
  offlineBanner.hidden = navigator.onLine;
  const height = offlineBanner.hidden ? 0 : offlineBanner.offsetHeight;
  document.documentElement.style.setProperty('--offline-banner-height', `${height}px`);
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById('install-app-btn').hidden = false;
});
document.getElementById('install-app-btn').addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.getElementById('install-app-btn').hidden = true;
});

function onIdeasChanged(ideas) {
  renderArchive(ideas, { onItemClick: openEditModal });
}

async function isEmailAllowed(email) {
  if (email === ADMIN_EMAIL) return true;
  const snap = await getDoc(doc(db, 'allowlist', email));
  return snap.exists();
}

document.getElementById('google-signin-btn').addEventListener('click', async () => {
  try {
    await signInWithGoogle();
  } catch (err) {
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = 'ההתחברות נכשלה, נסו שוב';
    errorEl.hidden = false;
  }
});

document.getElementById('signout-btn').addEventListener('click', () => signOutUser());

function openPolicyModal() {
  document.getElementById('policy-modal').hidden = false;
}
document.getElementById('open-policy-btn-login').addEventListener('click', openPolicyModal);
document.getElementById('open-policy-btn-app').addEventListener('click', openPolicyModal);
const policyModal = document.getElementById('policy-modal');
document.getElementById('policy-close-btn').addEventListener('click', () => {
  policyModal.hidden = true;
});
policyModal.addEventListener('click', (e) => {
  if (e.target === policyModal) policyModal.hidden = true;
});

document.getElementById('add-idea-fab').addEventListener('click', openAddModal);
document.getElementById('tab-archive').addEventListener('click', () => showView('archive'));
document.getElementById('tab-chat').addEventListener('click', () => {
  showView('chat');
  startIdeaChat();
});
document.getElementById('tab-guide').addEventListener('click', () => showView('guide'));
document.getElementById('tab-inspiration').addEventListener('click', () => showView('inspiration'));
document.getElementById('tab-feedback').addEventListener('click', () => showView('feedback'));
document.getElementById('tab-roadmap').addEventListener('click', () => showView('roadmap'));
document.getElementById('tab-content-plan').addEventListener('click', () => showView('content-plan'));
document.getElementById('tab-warming').addEventListener('click', () => showView('warming'));

const viewTabsNav = document.getElementById('view-tabs');
const menuOverlay = document.getElementById('menu-overlay');

function closeMobileMenu() {
  viewTabsNav.classList.remove('open');
  menuOverlay.hidden = true;
}

document.getElementById('mobile-menu-btn').addEventListener('click', () => {
  const isOpen = viewTabsNav.classList.toggle('open');
  menuOverlay.hidden = !isOpen;
});
document.getElementById('close-menu-btn').addEventListener('click', closeMobileMenu);
menuOverlay.addEventListener('click', closeMobileMenu);
viewTabsNav.querySelectorAll('.tab-btn').forEach((btn) => btn.addEventListener('click', closeMobileMenu));

let drawerTouchStartX = null;
viewTabsNav.addEventListener('touchstart', (e) => {
  drawerTouchStartX = e.touches[0].clientX;
});
viewTabsNav.addEventListener('touchend', (e) => {
  if (drawerTouchStartX === null) return;
  const deltaX = e.changedTouches[0].clientX - drawerTouchStartX;
  drawerTouchStartX = null;
  if (deltaX > 60) closeMobileMenu();
});

document.getElementById('embed-back-btn').addEventListener('click', () => showView('archive'));

const scrollTopBtn = document.getElementById('scroll-top-btn');
window.addEventListener('scroll', () => {
  const archiveView = document.getElementById('archive-view');
  scrollTopBtn.hidden = archiveView.hidden || window.scrollY < 400;
});
scrollTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

document.addEventListener(
  'focusin',
  (e) => {
    const field = e.target.closest('input, select, textarea');
    if (!field || !field.closest('.modal')) return;
    setTimeout(() => field.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250);
  },
  true
);

const appHeader = document.querySelector('.app-header');
function updateHeaderHeight() {
  document.documentElement.style.setProperty('--header-height', `${appHeader.offsetHeight}px`);
}
updateHeaderHeight();
new ResizeObserver(updateHeaderHeight).observe(appHeader);

wireIdeaForm();
wireArchiveControls((idea) => openEditModal(idea));
wirePullToRefresh();
wireRandomIdeaModal({ getIdeas: getCurrentIdeas, onOpenIdea: openEditModal });
wireIdeaChat();
wireFeedbackForm();
wireWarmingView();

onAuthChange(async (user) => {
  if (unsubscribeIdeas) {
    unsubscribeIdeas();
    unsubscribeIdeas = null;
  }

  if (!user) {
    document.getElementById('login-screen').hidden = false;
    document.getElementById('app-screen').hidden = true;
    return;
  }

  const allowed = await isEmailAllowed(user.email);
  if (!allowed) {
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = 'מייל לא קיים במערכת, אנא פנה למאיה';
    errorEl.hidden = false;
    await signOutUser();
    return;
  }

  document.getElementById('login-screen').hidden = true;
  document.getElementById('app-screen').hidden = false;
  document.getElementById('tab-warming').hidden = user.email !== ADMIN_EMAIL;

  const params = new URLSearchParams(window.location.search);
  if (params.get('action') === 'add') {
    showView('archive');
    openAddModal();
  } else if (params.get('view') === 'chat') {
    showView('chat');
    startIdeaChat();
  } else {
    const restorableViews = ['guide', 'inspiration', 'feedback', 'roadmap', 'content-plan'];
    const lastView = getLastView();
    showView(restorableViews.includes(lastView) ? lastView : 'archive');
  }
  if (params.has('action') || params.has('view')) {
    window.history.replaceState({}, '', window.location.pathname);
  }

  unsubscribeIdeas = subscribeToIdeas(onIdeasChanged);

  const tourDone = await hasCompletedTour();
  if (!tourDone) showWelcomeTour();
});

const isPreciseInput = window.matchMedia('(pointer: fine)').matches;
const TEXT_INPUT_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'];

function trapFocus(modal) {
  const focusable = modal.querySelectorAll(
    'button:not([hidden]), [href], input:not([hidden]), select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  // Force-focusing a text field pops the mobile on-screen keyboard
  // immediately, which can shove the modal's own close button off
  // screen - only auto-focus on devices with a real keyboard/mouse,
  // or when the first element isn't a text field anyway.
  if (isPreciseInput || !TEXT_INPUT_TAGS.includes(first.tagName)) {
    first.focus();
  }

  modal._focusTrapHandler = (e) => {
    if (e.key !== 'Tab') return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  modal.addEventListener('keydown', modal._focusTrapHandler);
}

function releaseFocusTrap(modal) {
  if (modal._focusTrapHandler) {
    modal.removeEventListener('keydown', modal._focusTrapHandler);
    modal._focusTrapHandler = null;
  }
}

document.querySelectorAll('.modal').forEach((modal) => {
  const observer = new MutationObserver(() => {
    if (modal.hidden) {
      releaseFocusTrap(modal);
    } else {
      trapFocus(modal);
    }
  });
  observer.observe(modal, { attributes: true, attributeFilter: ['hidden'] });
});
