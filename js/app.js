import { onAuthChange, signInWithGoogle, signOutUser } from './auth.js';
import { subscribeToIdeas } from './ideas-store.js';
import { renderArchive, wireArchiveControls, getCurrentIdeas } from './archive-view.js';
import { openAddModal, openEditModal, wireIdeaForm } from './idea-form.js';
import { wireRandomIdeaModal } from './random-idea-modal.js';
import { wireIdeaChat, startIdeaChat } from './idea-chat.js';

let unsubscribeIdeas = null;

function onIdeasChanged(ideas) {
  renderArchive(ideas, { onItemClick: openEditModal });
}

function showView(name) {
  document.getElementById('archive-view').hidden = name !== 'archive';
  document.getElementById('chat-view').hidden = name !== 'chat';
  document.getElementById('tab-archive').classList.toggle('active', name === 'archive');
  document.getElementById('tab-chat').classList.toggle('active', name === 'chat');
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

wireIdeaForm();
wireArchiveControls((idea) => openEditModal(idea));
wireRandomIdeaModal({ getIdeas: getCurrentIdeas, onOpenIdea: openEditModal });
wireIdeaChat();

onAuthChange((user) => {
  document.getElementById('login-screen').hidden = !!user;
  document.getElementById('app-screen').hidden = !user;

  if (unsubscribeIdeas) {
    unsubscribeIdeas();
    unsubscribeIdeas = null;
  }

  if (user) {
    unsubscribeIdeas = subscribeToIdeas(onIdeasChanged);
    showView('archive');
  }
});
