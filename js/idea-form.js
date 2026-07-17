import { validateIdea, CATEGORY_DEFINITIONS, PERSUASION_STAGE_DEFINITIONS } from './ideas-logic.js';
import { addIdea, updateIdea, deleteIdea, restoreIdea } from './ideas-store.js';
import { functions } from './firebase-init.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { showToast } from './toast.js';

const classifyIdea = httpsCallable(functions, 'classifyIdea');
const AI_OPTION = '__ai__';

let editingId = null;

function setCategoryChip(value) {
  document.getElementById('field-category').value = value;
  document.querySelectorAll('.category-chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.value === value);
  });
}

export function openAddModal(prefillTitle = '') {
  editingId = null;
  document.getElementById('modal-title').textContent = 'רעיון חדש';
  document.getElementById('idea-form').reset();
  setCategoryChip('');
  if (prefillTitle) document.getElementById('field-title').value = prefillTitle;
  document.getElementById('delete-idea-btn').hidden = true;
  document.getElementById('form-error').hidden = true;
  document.getElementById('idea-modal').hidden = false;
}

export function openEditModal(idea, overrideTitle = '') {
  editingId = idea.id;
  document.getElementById('modal-title').textContent = 'עריכת רעיון';
  document.getElementById('field-title').value = overrideTitle || idea.title;
  setCategoryChip(idea.category);
  document.getElementById('field-link').value = idea.sourceLink || '';
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
  const infoModal = document.getElementById('info-modal');
  document.getElementById('info-modal-close-btn').addEventListener('click', () => {
    infoModal.hidden = true;
  });
  infoModal.addEventListener('click', (e) => {
    if (e.target === infoModal) infoModal.hidden = true;
  });
}

async function runAiClassification() {
  const titleEl = document.getElementById('field-title');
  const persuasionSelect = document.getElementById('field-persuasion');
  const aiChip = document.querySelector('.category-chip-ai');

  if (!titleEl.value.trim()) {
    alert('קודם תכתבו את "הרעיון", ואז אני אוכל להציע.');
    return;
  }

  const originalChipText = aiChip.textContent;
  aiChip.textContent = '🤖 חושב/ת...';
  aiChip.disabled = true;
  persuasionSelect.disabled = true;

  try {
    const result = await classifyIdea({ title: titleEl.value });
    setCategoryChip(result.data.category);
    persuasionSelect.value = result.data.persuasionStage;
    openInfoModal('ה-AI הציע/ה', {
      [result.data.category]: 'קטגוריה מוצעת לפי מה שכתבת.',
      [result.data.persuasionStage]: 'שלב שכנוע מוצע לפי מה שכתבת. את/ה תמיד יכול/ה לשנות ידנית.',
    });
  } catch (err) {
    console.error('classifyIdea failed:', err);
    alert('משהו השתבש בהצעה האוטומטית, נסו שוב או בחרו ידנית.');
  } finally {
    aiChip.textContent = originalChipText;
    aiChip.disabled = false;
    persuasionSelect.disabled = false;
  }
}

export function wireIdeaForm() {
  wireInfoModal();
  document.getElementById('cancel-idea-btn').addEventListener('click', closeModal);

  const ideaModal = document.getElementById('idea-modal');
  ideaModal.addEventListener('click', (e) => {
    if (e.target === ideaModal) closeModal();
  });

  const titleInput = document.getElementById('field-title');
  const titleHint = document.getElementById('field-title-hint');
  titleInput.addEventListener('input', () => {
    titleHint.hidden = titleInput.value.length <= 280;
  });

  document.getElementById('delete-idea-btn').addEventListener('click', async () => {
    if (!editingId) return;
    const deletedId = editingId;
    await deleteIdea(deletedId);
    closeModal();
    showToast('הרעיון נמחק', {
      actionLabel: 'בטלו',
      onAction: () => restoreIdea(deletedId),
    });
  });

  document.querySelectorAll('.category-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      if (chip.dataset.value === AI_OPTION) {
        runAiClassification();
      } else {
        setCategoryChip(chip.dataset.value);
      }
    });
  });

  document.getElementById('field-persuasion').addEventListener('change', (e) => {
    const stage = e.target.value;
    if (stage === AI_OPTION) {
      runAiClassification();
      return;
    }
    if (stage && PERSUASION_STAGE_DEFINITIONS[stage]) {
      openInfoModal('שלב שכנוע שנבחר', { [stage]: PERSUASION_STAGE_DEFINITIONS[stage] + ' לתשומת ליבך: אם תשנו בהמשך את זווית ההנגשה לרעיון הזה, ייתכן שהשלב המתאים ישתנה בהתאם - כדאי לבדוק שוב.' });
    }
  });

  document.getElementById('idea-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      title: document.getElementById('field-title').value,
      category: document.getElementById('field-category').value,
      sourceLink: document.getElementById('field-link').value,
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
    showToast('✓ הרעיון נשמר בהצלחה');
  });
}
