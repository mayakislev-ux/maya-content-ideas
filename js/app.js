import { onAuthChange, signInWithGoogle, signOutUser } from './auth.js';
import { subscribeToIdeas } from './ideas-store.js';
import { renderArchive, wireArchiveControls, getCurrentIdeas } from './archive-view.js';
import { openAddModal, openEditModal, wireIdeaForm } from './idea-form.js';
import { pickRandomIdea } from './ideas-logic.js';

let unsubscribeIdeas = null;

function onIdeasChanged(ideas) {
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
document.getElementById('add-idea-fab').addEventListener('click', openAddModal);

document.getElementById('random-idea-btn').addEventListener('click', () => {
  const idea = pickRandomIdea(getCurrentIdeas());
  if (idea) {
    openEditModal(idea);
  } else {
    alert('עוד אין לך רעיונות שמורים - תוסיפי כמה קודם!');
  }
});

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
  }
});
