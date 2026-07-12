import { pickRandomIdea, STRONG_RATING } from './ideas-logic.js';

export function wireRandomIdeaModal({ getIdeas, onOpenIdea }) {
  const modal = document.getElementById('random-modal');
  const spinner = document.getElementById('random-spinner');
  const result = document.getElementById('random-result');
  const againBtn = document.getElementById('random-again-btn');
  const closeBtn = document.getElementById('random-close-btn');
  const triggerBtn = document.getElementById('random-idea-btn');

  let spinTimer = null;
  let chosenIdea = null;

  function close() {
    clearInterval(spinTimer);
    modal.hidden = true;
  }

  function spin() {
    const pool = getIdeas().filter((idea) => idea.rating === STRONG_RATING);
    if (!pool.length) {
      alert('עוד אין לך רעיונות מדורגים "חייב לצלם" - סמני כמה רעיונות ככה כדי שהכפתור יוכל להגריל!');
      return;
    }

    modal.hidden = false;
    result.hidden = true;
    againBtn.hidden = true;
    spinner.hidden = false;

    let ticks = 0;
    const totalTicks = 14;
    spinTimer = setInterval(() => {
      spinner.textContent = pickRandomIdea(pool).title;
      ticks++;
      if (ticks >= totalTicks) {
        clearInterval(spinTimer);
        chosenIdea = pickRandomIdea(pool);
        spinner.hidden = true;
        result.hidden = false;
        result.textContent = chosenIdea.title;
        againBtn.hidden = false;
      }
    }, 90);
  }

  triggerBtn.addEventListener('click', spin);
  againBtn.addEventListener('click', spin);
  closeBtn.addEventListener('click', close);
  result.addEventListener('click', () => {
    if (chosenIdea) {
      close();
      onOpenIdea(chosenIdea);
    }
  });
}
