import { onAuthChange, signInWithGoogle, signOutUser } from './auth.js';
import { subscribeToIdeas } from './ideas-store.js';
import { renderBoard } from './board-view.js';
import { renderArchive, wireArchiveControls } from './archive-view.js';
import { openAddModal, openEditModal, wireIdeaForm } from './idea-form.js';

let unsubscribeIdeas = null;
let latestIdeas = [];

function showView(name) {
  document.getElementById('board-view').hidden = name !== 'board';
  document.getElementById('archive-view').hidden = name !== 'archive';
  document.getElementById('tab-board').classList.toggle('active', name === 'board');
  document.getElementById('tab-archive').classList.toggle('active', name === 'archive');
}

function onIdeasChanged(ideas) {
  latestIdeas = ideas;
  renderBoard(ideas, { onCardClick: openEditModal });
  renderArchive(ideas, { onItemClick: openEditModal });
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
document.getElementById('tab-board').addEventListener('click', () => showView('board'));
document.getElementById('tab-archive').addEventListener('click', () => showView('archive'));
document.getElementById('add-idea-fab').addEventListener('click', openAddModal);

wireIdeaForm();
wireArchiveControls((idea) => openEditModal(idea));

onAuthChange((user) => {
  document.getElementById('login-screen').hidden = !!user;
  document.getElementById('app-screen').hidden = !user;

  if (unsubscribeIdeas) {
    unsubscribeIdeas();
    unsubscribeIdeas = null;
  }

  if (user) {
    unsubscribeIdeas = subscribeToIdeas(onIdeasChanged);
    showView('board');
  }
});
