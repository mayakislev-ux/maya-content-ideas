import { onAuthChange, signInWithGoogle, signOutUser } from './auth.js';
import { auth, db, functions } from './firebase-init.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { subscribeToIdeas } from './ideas-store.js';
import { renderArchive, wireArchiveControls, getCurrentIdeas, wirePullToRefresh, wireGoalEditModal } from './archive-view.js';
import { openAddModal, openEditModal, wireIdeaForm } from './idea-form.js';
import { wireRandomIdeaModal } from './random-idea-modal.js';
import { wireIdeaChat, startIdeaChat } from './idea-chat.js';
import { wireFeedbackForm } from './feedback.js';
import { wireContentPlanView } from './content-plan.js';
import { showView, getLastView } from './view-router.js';
import { showToast } from './toast.js';
import { hasCompletedTour, showWelcomeTour } from './welcome-tour.js';
import {
  enableNotifications,
  notificationsSupported,
  notificationPermission,
  showNotificationNudgeIfNeeded,
} from './push-notifications.js';
import { showIosInstallOverlayIfNeeded } from './ios-install-overlay.js';

// script-chat.js / warming.js / notification-admin.js are real code, not
// stubs - they were previously imported (and fetched over the network)
// unconditionally for every visitor, even though writeScript/generate-
// WarmingPlan/sendNotification are all admin-only (see ADMIN_EMAIL checks
// in these files and in functions/index.js). For the vast majority of
// real users (her clients, not her), that's dead weight on the critical
// path of every single app load. Loaded on demand instead, once we
// actually know the signed-in user is the admin (see onAuthChange below).
let adminModulesPromise = null;
function loadAdminModules() {
  if (!adminModulesPromise) {
    adminModulesPromise = Promise.all([
      import('./script-chat.js'),
      import('./warming.js'),
      import('./notification-admin.js'),
    ]);
  }
  return adminModulesPromise;
}

// Google blocks OAuth sign-in inside in-app webviews (WhatsApp/Instagram/
// Facebook/Messenger) for security reasons - it either shows its own "this
// browser may not be secure" block or silently fails, which from inside the
// app just looked like "click sign-in, nothing happens" / "bounces back."
// Links sent to clients are opened from WhatsApp constantly, so detect this
// up front and tell her exactly what to do instead of leaving the Google
// button there to fail mysteriously.
function isInAppBrowser() {
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|Instagram|WhatsApp|Line\/|Messenger/i.test(ua);
}

if (isInAppBrowser()) {
  document.getElementById('google-signin-btn').hidden = true;
  const warning = document.getElementById('inapp-browser-warning');
  warning.hidden = false;
  document.getElementById('copy-link-btn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
    } catch {
      // clipboard API unavailable/blocked - fall back to selecting nothing,
      // the confirm text still tells her the button was pressed
    }
    document.getElementById('copy-link-confirm').hidden = false;
  });
}

const THEME_KEY = 'theme-preference';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

const savedTheme = localStorage.getItem(THEME_KEY);
if (savedTheme === 'dark' || savedTheme === 'light') {
  applyTheme(savedTheme);
} else {
  const effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.textContent = effective === 'dark' ? '☀️' : '🌙';
}

document.getElementById('theme-toggle-btn').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme')
    || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

// A sticky header that never shrinks permanently eats a quarter of a
// small phone screen for pure branding on every scroll frame. Collapsing
// it to a slim bar once the page has actually scrolled gives that space
// back without losing the "hamburger always reachable" guarantee that
// stickiness exists for in the first place.
const appHeaderEl = document.querySelector('.app-header');
let headerScrollTicking = false;
window.addEventListener('scroll', () => {
  if (headerScrollTicking) return;
  headerScrollTicking = true;
  requestAnimationFrame(() => {
    appHeaderEl.classList.toggle('scrolled', window.scrollY > 24);
    headerScrollTicking = false;
  });
}, { passive: true });

function setGreeting(displayName) {
  const hour = new Date().getHours();
  const firstName = displayName ? displayName.split(' ')[0] : '';
  let greeting;
  if (hour < 5) greeting = 'לילה טוב';
  else if (hour < 12) greeting = 'בוקר טוב';
  else if (hour < 18) greeting = 'צהריים טובים';
  else greeting = 'ערב טוב';
  const text = firstName ? `${greeting}, ${firstName}` : greeting;
  const el = document.getElementById('greeting-line');
  if (el) el.textContent = text;
  const heroEl = document.getElementById('hero-greet');
  if (heroEl) heroEl.textContent = text;
}

// iOS Safari doesn't reliably resize a position:fixed element (like our
// modals) when the on-screen keyboard opens - the layout viewport stays
// full-height while the visible area shrinks, so content can end up
// unreachable even with overflow-y:auto. Track the *real* visible area via
// visualViewport and drive the modal's actual size/position from it instead
// of trusting 100vh/inset:0 to react on their own.
if (window.visualViewport) {
  const vv = window.visualViewport;
  const updateViewportVars = () => {
    document.documentElement.style.setProperty('--vv-height', `${vv.height}px`);
    document.documentElement.style.setProperty('--vv-top', `${vv.offsetTop}px`);
  };
  vv.addEventListener('resize', updateViewportVars);
  vv.addEventListener('scroll', updateViewportVars);
  updateViewportVars();
}

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
let adminModulesWired = false;

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

const IGNORABLE_LOGIN_ERROR_CODES = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request']);

document.getElementById('google-signin-btn').addEventListener('click', async () => {
  try {
    await signInWithGoogle();
  } catch (err) {
    if (IGNORABLE_LOGIN_ERROR_CODES.has(err.code)) return;
    console.error('signInWithGoogle failed:', err);
    const errorEl = document.getElementById('login-error');
    // Show the real code, not a generic message - a generic "try again" is
    // exactly what made an earlier real failure look like "nothing happens."
    errorEl.textContent = `ההתחברות נכשלה: ${err.code || err.message || err}`;
    errorEl.hidden = false;
  }
});

document.getElementById('signout-btn').addEventListener('click', () => signOutUser());
document.getElementById('drawer-signout-btn').addEventListener('click', () => signOutUser());

const getTokenUsage = httpsCallable(functions, 'getTokenUsage');
document.getElementById('token-usage-btn').addEventListener('click', async () => {
  const btn = document.getElementById('token-usage-btn');
  btn.disabled = true;
  try {
    const { data } = await getTokenUsage();
    const lines = Object.entries(data.byFunction).map(
      ([fn, u]) =>
        `${fn}: ${u.calls} קריאות, ${u.inputTokens.toLocaleString()} קלט, ${u.outputTokens.toLocaleString()} פלט, ${(u.cacheReadTokens || 0).toLocaleString()} קריאות-מטמון`
    );
    alert(
      `סה"כ מאז שהתחלנו למדוד:\n\nקלט: ${data.totalInput.toLocaleString()} טוקנים\nפלט: ${data.totalOutput.toLocaleString()} טוקנים\nכתיבות מטמון: ${data.totalCacheWrite.toLocaleString()}\nקריאות ממטמון (זול פי 10): ${data.totalCacheRead.toLocaleString()}\n\nעלות משוערת: כ-₪${data.estimatedCostIls.toFixed(2)} (כ-$${data.estimatedCostUsd.toFixed(2)}, שער משוער 1$≈₪3)\nחיסכון בזכות Prompt Caching: כ-₪${data.savedByCachingIls.toFixed(2)}\n\nלפי פונקציה:\n${lines.join('\n')}\n\n⚠️ זה סופר רק מהיום שהוספתי את המדידה - לא כולל שימוש היסטורי מלפני כן. להיסטוריה המלאה: console.anthropic.com`
    );
  } catch (err) {
    console.error('getTokenUsage failed:', err);
    alert('משהו השתבש בשליפת נתוני השימוש.');
  } finally {
    btn.disabled = false;
  }
});

const getFeedback = httpsCallable(functions, 'getFeedback');
document.getElementById('view-feedback-btn').addEventListener('click', async () => {
  const btn = document.getElementById('view-feedback-btn');
  btn.disabled = true;
  try {
    const { data } = await getFeedback();
    if (!data.items.length) {
      alert('עדיין לא התקבלו חוות דעת.');
      return;
    }
    const lines = data.items.map((item) => {
      const dateText = item.createdAt ? new Date(item.createdAt).toLocaleDateString('he-IL') : '';
      return `[${dateText}]\n${item.text}`;
    });
    alert(`${data.items.length} חוות דעת (מהחדש לישן):\n\n${lines.join('\n\n---\n\n')}`);
  } catch (err) {
    console.error('getFeedback failed:', err);
    alert('משהו השתבש בשליפת חוות הדעת.');
  } finally {
    btn.disabled = false;
  }
});

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

// Wrapped in arrow functions - passing openAddModal directly to
// addEventListener means the browser invokes it with the click/pointer
// event as the first argument, which becomes the modal's "prefillTitle"
// parameter and gets written into the title field as "[object
// PointerEvent]" once stringified. openAddModal() with no arguments avoids
// that entirely.
document.getElementById('add-idea-fab').addEventListener('click', () => openAddModal());
document.getElementById('add-idea-top-btn').addEventListener('click', () => openAddModal());
document.getElementById('tab-home').addEventListener('click', () => showView('home'));
document.getElementById('tab-archive').addEventListener('click', () => showView('archive'));
document.getElementById('home-progress-widget').addEventListener('click', () => showView('progress'));
document.getElementById('progress-back-btn').addEventListener('click', () => showView('home'));
document.getElementById('tab-chat').addEventListener('click', () => {
  showView('chat');
  startIdeaChat();
});
document.getElementById('tab-guide').addEventListener('click', () => showView('guide'));
document.getElementById('tab-inspiration').addEventListener('click', () => showView('inspiration'));
document.getElementById('home-see-all-btn').addEventListener('click', () => showView('archive'));
// Reference-only guides and secondary tools, reached from inside "מרכז
// למידה" instead of being top-level nav tabs - they were competing for
// attention with the real daily-use tools (בית/רעיונות/בדיקת רעיון), and
// "תכנית תוכן" collided in name with the separate AI content-plan-builder FAB.
document.getElementById('open-roadmap-link-btn').addEventListener('click', () => showView('roadmap'));
document.getElementById('open-content-plan-link-btn').addEventListener('click', () => showView('content-plan'));
document.getElementById('hub-link-chat').addEventListener('click', () => {
  showView('chat');
  startIdeaChat();
});
document.getElementById('tab-feedback').addEventListener('click', () => showView('feedback'));
// hub-link-script/hub-link-warming click handlers are wired inside
// onAuthChange, once we've confirmed the signed-in user is the admin and
// the lazy-loaded modules are ready - see loadAdminModules() above.
document.getElementById('hub-link-ideas-guide').addEventListener('click', () => showView('ideas-guide'));
document.getElementById('ideas-guide-back-btn').addEventListener('click', () => showView('guide'));
// Reuses the existing gate-check + modal-open logic wired in
// wireContentPlanView() instead of duplicating it - the button itself
// stays hidden (its own visibility is tied to the now-secondary embedded
// guide view), this just fires the same click handler directly from the
// hub's tools section.
document.getElementById('hub-link-content-plan').addEventListener('click', () => {
  document.getElementById('content-plan-open-builder-btn').click();
});

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

document.getElementById('bottomnav-home').addEventListener('click', () => showView('home'));
document.getElementById('bottomnav-archive').addEventListener('click', () => showView('archive'));
document.getElementById('bottomnav-chat').addEventListener('click', () => {
  showView('chat');
  startIdeaChat();
});
document.getElementById('bottomnav-more').addEventListener('click', () => {
  const isOpen = viewTabsNav.classList.toggle('open');
  menuOverlay.hidden = !isOpen;
});

document.getElementById('focus-mode-btn').addEventListener('click', (e) => {
  const isFocused = document.body.classList.toggle('focus-mode');
  e.target.textContent = isFocused ? '✕ יציאה ממיקוד' : '🎯 מצב מיקוד';
});

// Keyboard accessibility: Escape closes whatever overlay is currently open,
// same as clicking outside it - previously only the mouse/touch path worked.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (viewTabsNav.classList.contains('open')) {
    closeMobileMenu();
    return;
  }
  const openModal = document.querySelector('.modal:not([hidden])');
  if (openModal) {
    const closeBtn = openModal.querySelector('[id$="-close-btn"], [id$="-cancel-btn"], #cancel-idea-btn');
    if (closeBtn) closeBtn.click();
    else openModal.hidden = true;
  }
});

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
wireGoalEditModal();
wirePullToRefresh();
wireRandomIdeaModal({ getIdeas: getCurrentIdeas, onOpenIdea: openEditModal });
wireIdeaChat();
wireFeedbackForm();
wireContentPlanView();

document.getElementById('enable-notifications-btn').addEventListener('click', async () => {
  const ok = await enableNotifications();
  if (ok) document.getElementById('enable-notifications-btn').hidden = true;
});

onAuthChange(async (user) => {
  document.getElementById('launch-splash').hidden = true;

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
  setGreeting(user.displayName);
  if (user.photoURL) {
    const logo = document.querySelector('.app-logo');
    if (logo) {
      logo.hidden = true;
      const avatar = document.createElement('img');
      avatar.className = 'app-avatar';
      avatar.src = user.photoURL;
      avatar.alt = '';
      avatar.referrerPolicy = 'no-referrer';
      logo.insertAdjacentElement('afterend', avatar);
    }
  }
  const isAdmin = user.email === ADMIN_EMAIL;
  document.getElementById('hub-link-warming').hidden = !isAdmin;
  document.getElementById('hub-link-script').hidden = !isAdmin;
  document.getElementById('send-notification-btn').hidden = !isAdmin;
  document.getElementById('token-usage-btn').hidden = !isAdmin;
  document.getElementById('view-feedback-btn').hidden = !isAdmin;

  // onAuthChange can in principle fire more than once for the same
  // signed-in session - the adminModulesWired guard keeps this a true
  // one-time wire-up instead of risking duplicate event listeners on a
  // second firing. Deliberately not awaited - this runs in the background
  // so loading these admin-only modules never delays the view-restoration
  // logic below, even for the admin's own account.
  if (isAdmin && !adminModulesWired) {
    adminModulesWired = true;
    loadAdminModules().then(([scriptChatModule, warmingModule, notificationAdminModule]) => {
      scriptChatModule.wireScriptChat();
      warmingModule.wireWarmingView();
      notificationAdminModule.wireNotificationAdmin();
      document.getElementById('hub-link-script').addEventListener('click', () => {
        showView('script');
        scriptChatModule.startScriptChat();
      });
      document.getElementById('hub-link-warming').addEventListener('click', () => showView('warming'));
    });
  }

  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (isIos && !isStandalone) {
    document.getElementById('ios-install-hint').hidden = false;
    document.getElementById('enable-notifications-btn').hidden = true;
  } else {
    document.getElementById('ios-install-hint').hidden = true;
    document.getElementById('enable-notifications-btn').hidden =
      !notificationsSupported() || notificationPermission() === 'granted';
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('action') === 'add') {
    showView('archive');
    openAddModal();
  } else if (params.get('view') === 'chat') {
    showView('chat');
    startIdeaChat();
  } else {
    const restorableViews = ['guide', 'inspiration', 'feedback', 'roadmap', 'content-plan', 'archive'];
    const lastView = getLastView();
    showView(restorableViews.includes(lastView) ? lastView : 'home');
  }
  if (params.has('action') || params.has('view')) {
    window.history.replaceState({}, '', window.location.pathname);
  }

  unsubscribeIdeas = subscribeToIdeas(onIdeasChanged);

  const tourDone = await hasCompletedTour();
  if (!tourDone) showWelcomeTour();

  // Nudge to install to the home screen right at login, then again at 2
  // and 5 minutes in case she dismissed or missed it the first time.
  // showIosInstallOverlayIfNeeded already no-ops if she dismissed it
  // (sessionStorage flag) or already installed (standalone mode) by the
  // time any of these fires.
  showIosInstallOverlayIfNeeded();
  setTimeout(showIosInstallOverlayIfNeeded, 2 * 60 * 1000);
  setTimeout(showIosInstallOverlayIfNeeded, 5 * 60 * 1000);
  setTimeout(showNotificationNudgeIfNeeded, 3000);
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
