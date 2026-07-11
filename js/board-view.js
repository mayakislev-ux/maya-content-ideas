import { STATUSES, nextStatus, prevStatus } from './ideas-logic.js';
import { updateIdea } from './ideas-store.js';

export function renderBoard(ideas, { onCardClick }) {
  const container = document.getElementById('board-columns');
  container.innerHTML = '';

  for (const status of STATUSES) {
    const column = document.createElement('div');
    column.className = 'board-column';
    column.innerHTML = `<h3>${status}</h3>`;

    const columnIdeas = ideas.filter((idea) => idea.status === status);
    for (const idea of columnIdeas) {
      column.appendChild(renderCard(idea, onCardClick));
    }
    container.appendChild(column);
  }
}

function renderCard(idea, onCardClick) {
  const card = document.createElement('div');
  card.className = 'idea-card';
  card.style.setProperty('--card-color', `var(--cat-${idea.category})`);
  card.innerHTML = `
    <span class="card-category-tag">${idea.category}</span>
    <div class="card-title"></div>
    <div class="card-nav">
      <button type="button" class="prev-btn" ${idea.status === STATUSES[0] ? 'disabled' : ''}>◀</button>
      <button type="button" class="next-btn" ${idea.status === STATUSES[STATUSES.length - 1] ? 'disabled' : ''}>▶</button>
    </div>
  `;
  card.querySelector('.card-title').textContent = idea.title;

  card.querySelector('.card-title').addEventListener('click', () => onCardClick(idea));

  card.querySelector('.next-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    updateIdea(idea.id, { status: nextStatus(idea.status) });
  });

  card.querySelector('.prev-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    updateIdea(idea.id, { status: prevStatus(idea.status) });
  });

  return card;
}
