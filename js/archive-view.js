import { filterIdeas, categoryColorVar } from './ideas-logic.js';
import { getInstantThumbnail, fetchThumbnail } from './video-preview.js';

let currentIdeas = [];

function formatDate(idea) {
  if (!idea.createdAt || typeof idea.createdAt.toDate !== 'function') return '';
  return idea.createdAt.toDate().toLocaleDateString('he-IL');
}

export function renderArchive(ideas, { onItemClick }) {
  currentIdeas = ideas;
  applyFilters(onItemClick);
}

export function getCurrentIdeas() {
  return currentIdeas;
}

export function wireArchiveControls(onItemClick) {
  const ids = ['search-input', 'filter-category', 'filter-status', 'filter-viral', 'filter-source', 'filter-persuasion', 'filter-rating'];
  for (const id of ids) {
    const el = document.getElementById(id);
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => applyFilters(onItemClick));
  }
}

function applyFilters(onItemClick) {
  const text = document.getElementById('search-input').value;
  const category = document.getElementById('filter-category').value;
  const status = document.getElementById('filter-status').value;
  const viral = document.getElementById('filter-viral').value;
  const source = document.getElementById('filter-source').value;
  const persuasionStage = document.getElementById('filter-persuasion').value;
  const rating = document.getElementById('filter-rating').value;
  const filtered = filterIdeas(currentIdeas, { text, category, status, viral, source, persuasionStage, rating });

  const list = document.getElementById('archive-list');
  list.innerHTML = '';
  for (const idea of filtered) {
    list.appendChild(renderItem(idea, onItemClick));
  }
}

function renderItem(idea, onItemClick) {
  const li = document.createElement('li');
  li.style.setProperty('--card-color', categoryColorVar(idea.category));
  li.className = 'archive-item';

  const header = document.createElement('div');
  header.className = 'archive-item-header';
  const title = document.createElement('strong');
  title.textContent = idea.title;
  const tag = document.createElement('span');
  tag.className = 'card-category-tag';
  tag.textContent = idea.category;
  header.append(title, tag);
  if (idea.rating) {
    const ratingEl = document.createElement('span');
    ratingEl.textContent = idea.rating;
    header.appendChild(ratingEl);
  }
  if (idea.viralPotential) {
    const viralEl = document.createElement('span');
    viralEl.className = 'viral-badge';
    viralEl.textContent = '🔥 ויראלי';
    header.appendChild(viralEl);
  }
  li.appendChild(header);

  const meta = document.createElement('div');
  meta.className = 'archive-item-meta';
  meta.textContent = [idea.status, idea.source, formatDate(idea)].filter(Boolean).join(' · ');
  li.appendChild(meta);

  if (idea.sourceLink) {
    const linkRow = document.createElement('div');
    linkRow.className = 'archive-item-link';

    const thumb = document.createElement('img');
    thumb.className = 'archive-item-thumb';
    thumb.hidden = true;
    const instant = getInstantThumbnail(idea.sourceLink);
    if (instant) {
      thumb.src = instant;
      thumb.hidden = false;
    } else {
      fetchThumbnail(idea.sourceLink).then((url) => {
        if (url) {
          thumb.src = url;
          thumb.hidden = false;
        }
      });
    }
    linkRow.appendChild(thumb);

    const link = document.createElement('a');
    link.href = idea.sourceLink;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = '🔗 לינק לסרטון';
    link.addEventListener('click', (e) => e.stopPropagation());
    linkRow.appendChild(link);

    li.appendChild(linkRow);
  }

  li.addEventListener('click', () => onItemClick(idea));
  return li;
}
