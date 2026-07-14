import { onAuthChange, signInWithGoogle, signOutUser } from './auth.js';
import { auth, db } from './firebase-init.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { subscribeToIdeas } from './ideas-store.js';
import { renderArchive, wireArchiveControls, getCurrentIdeas } from './archive-view.js';
import { openAddModal, openEditModal, wireIdeaForm } from './idea-form.js';
import { wireRandomIdeaModal } from './random-idea-modal.js';
import { wireIdeaChat, startIdeaChat } from './idea-chat.js';
import { wireFeedbackForm } from './feedback.js';
import { showView } from './view-router.js';

const ADMIN_EMAIL = 'mayakislev@gmail.com';
let unsubscribeIdeas = null;

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
    errorEl.textContent = 'ההתחברות נכשלה, נסי שוב';
    errorEl.hidden = false;
  }
});

document.getElementById('signout-btn').addEventListener('click', () => signOutUser());

function openPolicyModal() {
  document.getElementById('policy-modal').hidden = false;
}
document.getElementById('open-policy-btn-login').addEventListener('click', openPolicyModal);
document.getElementById('open-policy-btn-app').addEventListener('click', openPolicyModal);
document.getElementById('policy-close-btn').addEventListener('click', () => {
  document.getElementById('policy-modal').hidden = true;
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
menuOverlay.addEventListener('click', closeMobileMenu);
viewTabsNav.querySelectorAll('.tab-btn').forEach((btn) => btn.addEventListener('click', closeMobileMenu));

const appHeader = document.querySelector('.app-header');
function updateHeaderHeight() {
  document.documentElement.style.setProperty('--header-height', `${appHeader.offsetHeight}px`);
}
updateHeaderHeight();
new ResizeObserver(updateHeaderHeight).observe(appHeader);

wireIdeaForm();
wireArchiveControls((idea) => openEditModal(idea));
wireRandomIdeaModal({ getIdeas: getCurrentIdeas, onOpenIdea: openEditModal });
wireIdeaChat();
wireFeedbackForm();

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
  unsubscribeIdeas = subscribeToIdeas(onIdeasChanged);
  showView('archive');
});
