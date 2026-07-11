import { filterIdeas } from './ideas-logic.js';

let currentIdeas = [];

export function renderArchive(ideas, { onItemClick }) {
  currentIdeas = ideas;
  applyFilters(onItemClick);
}

export function wireArchiveControls(onItemClick) {
  document.getElementById('search-input').addEventListener('input', () => applyFilters(onItemClick));
  document.getElementById('filter-category').addEventListener('change', () => applyFilters(onItemClick));
  document.getElementById('filter-status').addEventListener('change', () => applyFilters(onItemClick));
}

function applyFilters(onItemClick) {
  const text = document.getElementById('search-input').value;
  const category = document.getElementById('filter-category').value;
  const status = document.getElementById('filter-status').value;
  const filtered = filterIdeas(currentIdeas, { text, category, status });

  const list = document.getElementById('archive-list');
  list.innerHTML = '';
  for (const idea of filtered) {
    const li = document.createElement('li');
    li.style.setProperty('--card-color', `var(--cat-${idea.category})`);
    li.innerHTML = `<strong></strong> <span class="card-category-tag"></span> — <em></em>`;
    const [titleEl, tagEl, statusEl] = li.children;
    titleEl.textContent = idea.title;
    tagEl.textContent = idea.category;
    statusEl.textContent = idea.status;
    li.addEventListener('click', () => onItemClick(idea));
    list.appendChild(li);
  }
}
