import { validateIdea } from './ideas-logic.js';
import { addIdea, updateIdea, deleteIdea } from './ideas-store.js';

let editingId = null;

export function openAddModal() {
  editingId = null;
  document.getElementById('modal-title').textContent = 'רעיון חדש';
  document.getElementById('idea-form').reset();
  document.getElementById('delete-idea-btn').hidden = true;
  document.getElementById('form-error').hidden = true;
  document.getElementById('idea-modal').hidden = false;
}

export function openEditModal(idea) {
  editingId = idea.id;
  document.getElementById('modal-title').textContent = 'עריכת רעיון';
  document.getElementById('field-title').value = idea.title;
  document.getElementById('field-category').value = idea.category;
  document.getElementById('field-hook').value = idea.hookText || '';
  document.getElementById('field-link').value = idea.sourceLink || '';
  document.getElementById('field-source').value = idea.source || '';
  document.getElementById('field-persuasion').value = idea.persuasionStage || '';
  document.getElementById('field-rating').value = idea.rating || '';
  document.getElementById('field-viral').value = idea.viralPotential ? 'כן' : 'לא';
  document.getElementById('delete-idea-btn').hidden = false;
  document.getElementById('form-error').hidden = true;
  document.getElementById('idea-modal').hidden = false;
}

export function closeModal() {
  document.getElementById('idea-modal').hidden = true;
  editingId = null;
}

export function wireIdeaForm() {
  document.getElementById('cancel-idea-btn').addEventListener('click', closeModal);

  document.getElementById('delete-idea-btn').addEventListener('click', async () => {
    if (!editingId) return;
    if (confirm('בטוחה שאת רוצה למחוק את הרעיון הזה?')) {
      await deleteIdea(editingId);
      closeModal();
    }
  });

  document.getElementById('idea-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      title: document.getElementById('field-title').value,
      category: document.getElementById('field-category').value,
      hookText: document.getElementById('field-hook').value,
      sourceLink: document.getElementById('field-link').value,
      source: document.getElementById('field-source').value,
      persuasionStage: document.getElementById('field-persuasion').value,
      rating: document.getElementById('field-rating').value,
      viralPotential: document.getElementById('field-viral').value === 'כן',
    };
    const errors = validateIdea(data);
    const errorEl = document.getElementById('form-error');
    if (errors.length) {
      errorEl.textContent = errors.join(', ');
      errorEl.hidden = false;
      return;
    }
    if (editingId) {
      await updateIdea(editingId, data);
    } else {
      await addIdea(data);
    }
    closeModal();
  });
}
