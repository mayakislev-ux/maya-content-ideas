import { pickRandomIdea, STRONG_RATING } from './ideas-logic.js';

let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTick() {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = 440 + Math.random() * 220;
  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.08);
}

function playDing() {
  const ctx = getAudioCtx();
  [880, 1108, 1320].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = ctx.currentTime + i * 0.05;
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.7);
  });
}

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
      playTick();
      ticks++;
      if (ticks >= totalTicks) {
        clearInterval(spinTimer);
        chosenIdea = pickRandomIdea(pool);
        spinner.hidden = true;
        result.hidden = false;
        result.textContent = chosenIdea.title;
        againBtn.hidden = false;
        playDing();
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
