// js/video-assistant.js
// 13/10/2026: "העוזר שלך ליצירת סרטון" - שכבת הכוונה, לא כלי יצירה (ראה
// docs/superpowers/specs/2026-10-13-video-creation-assistant-design.md).
// מרנדר תמיד מחדש innerHTML של #video-assistant-screen לפי ה-state הנוכחי
// של video-assistant-flow.js, בדיוק כמו ש-warming.js מרנדר renderPlan()
// מחדש בכל שינוי - לא DOM דיפ, זה מסך-אחד-בכל-רגע, לא רשימה גדולה.
import { INITIAL_STATE, nextStep } from './video-assistant-flow.js';
import { pickIdea, pickReference } from './video-assistant-picker.js';
import { buildDuplicationPrompt, buildScriptPrompt } from './video-assistant-prompts.js';
import { playReroll, playSuccess, setMuted, getMuted } from './video-assistant-sound.js';
import {
  fetchIdeas, fetchInspirationBank, getSavedDomain, guessDomain, saveDomain, loadSession, saveSession,
} from './video-assistant-store.js';
import { getProfile } from './user-profile.js';
import { showToast } from './toast.js';

let state = INITIAL_STATE;
let ideasCache = null;
let videosCache = null;
let domainInfo = null; // { domain, subCategory }
let currentPickId = null;

function screenEl() {
  return document.getElementById('video-assistant-screen');
}

function dispatch(action) {
  state = nextStep(state, action);
  saveSession(state).catch((err) => console.error('saveSession failed:', err));
  render();
}

function cosmicCard(innerHtml) {
  screenEl().innerHTML = `<div class="cosmic-card">${innerHtml}</div>`;
}

function renderOpening() {
  cosmicCard(`
    <h2>✨ היי מאיה</h2>
    <p>בואי ניצור את הסרטון הבא שלך</p>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn" id="va-no-idea-btn">אין לי רעיון</button>
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-has-idea-btn">יש לי רעיון</button>
    </div>
  `);
  document.getElementById('va-no-idea-btn').addEventListener('click', () => dispatch({ type: 'CHOOSE_NO_IDEA' }));
  document.getElementById('va-has-idea-btn').addEventListener('click', () => dispatch({ type: 'CHOOSE_HAS_IDEA' }));
}

function renderNoIdeaChoice() {
  cosmicCard(`
    <h2>בואי נמצא מאיפה להתחיל</h2>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn" id="va-pull-idea-btn">לשלוף רעיון מהבנק שלי</button>
      <button type="button" class="cosmic-btn" id="va-reference-btn">לשכפל רפרנס מהמאגר</button>
    </div>
  `);
  document.getElementById('va-pull-idea-btn').addEventListener('click', async () => {
    if (!ideasCache) ideasCache = await fetchIdeas();
    const picked = pickIdea(ideasCache, null);
    if (!picked) {
      showToast('אין עדיין רעיונות בבנק שלך - בואי נשכפל רפרנס במקום');
      currentPickId = null;
      dispatch({ type: 'CHOOSE_REFERENCE' });
      return;
    }
    currentPickId = picked.id;
    dispatch({ type: 'CHOOSE_PULL_IDEA' });
  });
  document.getElementById('va-reference-btn').addEventListener('click', () => {
    // currentPickId must not leak in from a previous idea-pull in the same
    // session (e.g. she went back and switched branches) - renderPulledReference
    // only picks a fresh video when currentPickId is null, so a stale idea id
    // here would make it look up a non-existent video and crash on video.url.
    currentPickId = null;
    dispatch({ type: 'CHOOSE_REFERENCE' });
  });
}

function renderHasIdeaChoice() {
  cosmicCard(`
    <h2>שתי דרכים לכתוב את התסריט</h2>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-reverse-btn">שכפול הפוך (מומלץ, קל יותר)</button>
      <button type="button" class="cosmic-btn" id="va-scratch-btn">כתיבה מ-0</button>
    </div>
  `);
  document.getElementById('va-reverse-btn').addEventListener('click', () => dispatch({ type: 'CHOOSE_REVERSE_DUPLICATION' }));
  document.getElementById('va-scratch-btn').addEventListener('click', () => dispatch({ type: 'CHOOSE_FROM_SCRATCH' }));
}

async function resolveDomain() {
  if (domainInfo) return domainInfo;
  const saved = await getSavedDomain();
  if (saved) {
    domainInfo = saved;
    return domainInfo;
  }
  const profile = await getProfile();
  const personaText = profile && profile.primaryAudience ? profile.primaryAudience : '';
  let guessed = null;
  try {
    guessed = personaText ? await guessDomain(personaText) : null;
  } catch (err) {
    console.error('guessDomain failed:', err);
  }
  domainInfo = { domain: guessed, subCategory: null };
  return domainInfo;
}

const DOMAIN_OPTIONS = [
  'יופי וקוסמטיקה', 'בריאות נפשית, טיפול ורוח', 'עסקים ויזמות',
  'עיצוב, נדל"ן ואדריכלות', 'כושר ותזונה', 'תוכן אישי וחיבור',
];

function renderDomainConfirm(guessedDomain, onConfirmed) {
  const options = DOMAIN_OPTIONS.map(
    (d) => `<option value="${d}" ${d === guessedDomain ? 'selected' : ''}>${d}</option>`
  ).join('');
  cosmicCard(`
    <h2>ניחשתי את התחום שלך</h2>
    <p>${guessedDomain ? `ניחשתי: ${guessedDomain} - נכון?` : 'לא הצלחתי לנחש - בחרי בעצמך:'}</p>
    <select id="va-domain-select" class="cosmic-textarea" style="min-height:auto">${options}</select>
    <div class="cosmic-btn-row" style="margin-top:14px">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-domain-confirm-btn">מאשרת</button>
    </div>
  `);
  document.getElementById('va-domain-confirm-btn').addEventListener('click', async () => {
    const chosen = document.getElementById('va-domain-select').value;
    await saveDomain(chosen, null);
    domainInfo = { domain: chosen, subCategory: null };
    onConfirmed();
  });
}

function renderPulledIdea() {
  const idea = ideasCache.find((i) => i.id === currentPickId);
  cosmicCard(`
    <h2>🎲 הרעיון הזה</h2>
    <p style="font-size:16px;color:#fff;font-weight:600">${idea.title}</p>
    <p>${idea.hookText}</p>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-accept-idea-btn">אהבתי, בואי נמשיך</button>
    </div>
    <button type="button" class="cosmic-reroll-btn" id="va-reroll-idea-btn">לא אהבתי - הגרילי שוב</button>
  `);
  document.getElementById('va-accept-idea-btn').addEventListener('click', () => dispatch({ type: 'ACCEPT_PICK' }));
  document.getElementById('va-reroll-idea-btn').addEventListener('click', () => {
    playReroll();
    const picked = pickIdea(ideasCache, currentPickId);
    if (picked) currentPickId = picked.id;
    dispatch({ type: 'REROLL' });
  });
}

async function renderPulledReference() {
  if (!videosCache) videosCache = await fetchInspirationBank();
  const { domain } = await resolveDomain();
  if (!domain) {
    renderDomainConfirm(null, () => render());
    return;
  }
  if (!currentPickId) {
    const picked = pickReference(videosCache, domain, null);
    if (!picked) {
      cosmicCard(`<h2>אין עדיין רפרנסים בתחום הזה</h2><p>בחרי "יש לי רעיון" במקום, או חזרי מאוחר יותר.</p>`);
      return;
    }
    currentPickId = picked.id;
  }
  const video = videosCache.find((v) => v.id === currentPickId);
  cosmicCard(`
    <h2>🎲 הרפרנס הזה</h2>
    <p><a href="${video.url}" target="_blank" rel="noopener" style="color:#fff">פתחי לצפייה ←</a></p>
    <div class="cosmic-btn-row">
      <button type="button" class="cosmic-btn cosmic-btn--primary" id="va-accept-ref-btn">אהבתי, בואי נמשיך</button>
    </div>
    <button type="button" class="cosmic-reroll-btn" id="va-reroll-ref-btn">לא אהבתי - הגרילי שוב</button>
  `);
  document.getElementById('va-accept-ref-btn').addEventListener('click', () => dispatch({ type: 'ACCEPT_PICK' }));
  document.getElementById('va-reroll-ref-btn').addEventListener('click', () => {
    playReroll();
    const picked = pickReference(videosCache, domain, currentPickId);
    if (picked) currentPickId = picked.id;
    dispatch({ type: 'REROLL' });
    renderPulledReference();
  });
}

function render() {
  if (state.screen === 'opening') return renderOpening();
  if (state.screen === 'no-idea-choice') return renderNoIdeaChoice();
  if (state.screen === 'has-idea-choice') return renderHasIdeaChoice();
  if (state.screen === 'pulled-idea') return renderPulledIdea();
  if (state.screen === 'pulled-reference') return renderPulledReference();
  // שאר המסכים נוספים במשימה הבאה
  cosmicCard(`<p>מסך "${state.screen}" עוד לא בנוי</p>`);
}

export function wireVideoAssistantView() {
  document.getElementById('video-assistant-mute-btn').addEventListener('click', (e) => {
    const muted = !getMuted();
    setMuted(muted);
    e.target.textContent = muted ? '🔇' : '🔊';
  });
  document.getElementById('video-assistant-mute-btn').textContent = getMuted() ? '🔇' : '🔊';

  document.getElementById('hub-link-video-assistant').addEventListener('click', async () => {
    const saved = await loadSession();
    state = saved || INITIAL_STATE;
    render();
  });
}
