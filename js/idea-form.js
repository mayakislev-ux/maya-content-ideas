import { validateIdea, CATEGORY_DEFINITIONS, PERSUASION_STAGE_DEFINITIONS } from './ideas-logic.js';
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
  document.getElementById('field-audience-scope').value = idea.audienceScope || '';
  document.getElementById('delete-idea-btn').hidden = false;
  document.getElementById('form-error').hidden = true;
  document.getElementById('idea-modal').hidden = false;
}

export function closeModal() {
  document.getElementById('idea-modal').hidden = true;
  editingId = null;
}

function openInfoModal(title, definitions) {
  document.getElementById('info-modal-title').textContent = title;
  const body = document.getElementById('info-modal-body');
  body.innerHTML = '';
  for (const [key, def] of Object.entries(definitions)) {
    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = key;
    p.appendChild(strong);
    p.appendChild(document.createElement('br'));
    p.appendChild(document.createTextNode(def));
    body.appendChild(p);
  }
  document.getElementById('info-modal').hidden = false;
}

function wireInfoModal() {
  document.getElementById('category-info-btn').addEventListener('click', () => {
    openInfoModal('מה כל קטגוריה אומרת?', CATEGORY_DEFINITIONS);
  });
  document.getElementById('persuasion-info-btn').addEventListener('click', () => {
    openInfoModal('מה כל שלב שכנוע אומר?', PERSUASION_STAGE_DEFINITIONS);
  });
  document.getElementById('info-modal-close-btn').addEventListener('click', () => {
    document.getElementById('info-modal').hidden = true;
  });
}

export function wireIdeaForm() {
  wireInfoModal();
  document.getElementById('cancel-idea-btn').addEventListener('click', closeModal);

  document.getElementById('delete-idea-btn').addEventListener('click', async () => {
    if (!editingId) return;
    if (confirm('בטוחה שאת רוצה למחוק את הרעיון הזה?')) {
      await deleteIdea(editingId);
      closeModal();
    }
  });

  document.getElementById('field-persuasion').addEventListener('change', (e) => {
    const stage = e.target.value;
    if (stage && PERSUASION_STAGE_DEFINITIONS[stage]) {
      openInfoModal('שלב שכנוע שנבחר', { [stage]: PERSUASION_STAGE_DEFINITIONS[stage] + ' לתשומת ליבך: אם תשני בהמשך את זווית ההנגשה לרעיון הזה, ייתכן שהשלב המתאים ישתנה בהתאם - כדאי לבדוק שוב.' });
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
      audienceScope: document.getElementById('field-audience-scope').value,
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
