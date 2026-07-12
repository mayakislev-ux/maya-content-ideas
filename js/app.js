import { onAuthChange, signInWithGoogle, signOutUser } from './auth.js';
import { auth, db } from './firebase-init.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { subscribeToIdeas } from './ideas-store.js';
import { renderArchive, wireArchiveControls, getCurrentIdeas } from './archive-view.js';
import { openAddModal, openEditModal, wireIdeaForm } from './idea-form.js';
import { wireRandomIdeaModal } from './random-idea-modal.js';
import { wireIdeaChat, startIdeaChat } from './idea-chat.js';
import { wireFeedbackForm } from './feedback.js';

const ADMIN_EMAIL = 'mayakislev@gmail.com';
let unsubscribeIdeas = null;

function onIdeasChanged(ideas) {
  renderArchive(ideas, { onItemClick: openEditModal });
}

function showView(name) {
  document.getElementById('archive-view').hidden = name !== 'archive';
  document.getElementById('chat-view').hidden = name !== 'chat';
  document.getElementById('guide-view').hidden = name !== 'guide';
  document.getElementById('inspiration-view').hidden = name !== 'inspiration';
  document.getElementById('feedback-view').hidden = name !== 'feedback';
  document.getElementById('tab-archive').classList.toggle('active', name === 'archive');
  document.getElementById('tab-chat').classList.toggle('active', name === 'chat');
  document.getElementById('tab-guide').classList.toggle('active', name === 'guide');
  document.getElementById('tab-inspiration').classList.toggle('active', name === 'inspiration');
  document.getElementById('tab-feedback').classList.toggle('active', name === 'feedback');
  document.getElementById('random-idea-btn').hidden = name !== 'archive';
  document.getElementById('add-idea-fab').hidden = name !== 'archive';
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
document.getElementById('add-idea-fab').addEventListener('click', openAddModal);
document.getElementById('tab-archive').addEventListener('click', () => showView('archive'));
document.getElementById('tab-chat').addEventListener('click', () => {
  showView('chat');
  startIdeaChat();
});
document.getElementById('tab-guide').addEventListener('click', () => showView('guide'));
document.getElementById('tab-inspiration').addEventListener('click', () => showView('inspiration'));
document.getElementById('tab-feedback').addEventListener('click', () => showView('feedback'));

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
