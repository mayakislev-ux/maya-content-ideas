import { functions, auth } from './firebase-init.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { getProfile, saveProfile } from './user-profile.js';
import { showView } from './view-router.js';
import { openAddModal, openEditModal } from './idea-form.js';
import { getCurrentIdeas } from './archive-view.js';
import { findSimilarIdea } from './ideas-logic.js';
import { showWelcomeTour } from './welcome-tour.js';

const ADMIN_EMAIL = 'mayakislev@gmail.com';
const checkIdea = httpsCallable(functions, 'checkIdea');

function isAdmin() {
  return auth.currentUser && auth.currentUser.email === ADMIN_EMAIL;
}

const ONBOARDING_STEPS = ['name', 'pronoun', 'business', 'primaryAudience', 'secondaryAudience'];
const ONBOARDING_QUESTIONS = {
  name: 'קודם כל - עם מי אני מדברת? מה השם שלך?',
  business: 'מה העסק שלך? באיזה תחום את/ה עוסק/ת?',
  primaryAudience: 'מי קהל היעד העיקרי שלך?',
  secondaryAudience: 'ומי קהל היעד המשני שלך (אם יש)?',
};

let history = [];
let profile = null;
let onboardingStep = null;
let draftProfile = {};
let started = false;
let originalIdeaText = null;

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;
const BOLD_PATTERN = /\*\*(.+?)\*\*/g;
const RECOGNIZED_MARKER = '[[RECOGNIZED_EXCELLENT]]';
const ROADMAP_URL = 'https://mayakislev-ux.github.io/lehiyot-brand/מפת-דרכים-ליצירת-תוכן.html';

function playSuccessSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.1;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    });
  } catch (err) {
    console.error('playSuccessSound failed:', err);
  }
}

function appendWithBold(container, text) {
  const parts = text.split(BOLD_PATTERN);
  parts.forEach((part, i) => {
    if (!part) return;
    if (i % 2 === 1) {
      const strong = document.createElement('strong');
      strong.textContent = part;
      container.appendChild(strong);
    } else {
      container.appendChild(document.createTextNode(part));
    }
  });
}

function setBubbleText(bubble, text) {
  bubble.innerHTML = '';
  const parts = text.split(URL_PATTERN);
  for (const part of parts) {
    if (part.match(URL_PATTERN)) {
      if (part === ROADMAP_URL) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chat-cta-btn';
        btn.textContent = '🗺️ למפת הדרכים ליצירת תוכן';
        btn.addEventListener('click', () => showView('roadmap'));
        bubble.appendChild(btn);
      } else {
        const link = document.createElement('a');
        link.href = part;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = part;
        bubble.appendChild(link);
      }
    } else if (part) {
      appendWithBold(bubble, part);
    }
  }
}

function saveFinalIdea(finalizedText) {
  const match = findSimilarIdea(getCurrentIdeas(), originalIdeaText || '');
  showView('archive');
  if (match) {
    const wantsUpdate = confirm(`זיהיתי שזה כנראה עדכון לרעיון הקיים "${match.title}" - לעדכן אותו?\n\n(ביטול ← יצירת רעיון חדש בנפרד)`);
    if (wantsUpdate) {
      openEditModal(match, finalizedText);
      return;
    }
  }
  openAddModal(finalizedText);
}

function addSaveButton(bubble, finalizedText) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chat-cta-btn chat-save-btn';
  btn.textContent = '💾 שמירה כרעיון';
  btn.addEventListener('click', () => saveFinalIdea(finalizedText));
  bubble.appendChild(btn);
}

function resetChat() {
  history = [];
  originalIdeaText = null;
  document.getElementById('chat-messages').innerHTML = '';
  greetAndAskForIdea();
}

function addBubble(text, role) {
  const messagesEl = document.getElementById('chat-messages');
  const row = document.createElement('div');
  row.className = `chat-row chat-row-${role}`;

  if (role === 'assistant') {
    const avatar = document.createElement('div');
    avatar.className = 'chat-avatar';
    avatar.textContent = '🤖';
    row.appendChild(avatar);
  }

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble chat-bubble-${role}`;
  setBubbleText(bubble, text);
  row.appendChild(bubble);

  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return bubble;
}

function addChoiceBubble(text, choices, onPick) {
  const messagesEl = document.getElementById('chat-messages');
  const row = document.createElement('div');
  row.className = 'chat-row chat-row-assistant';

  const avatar = document.createElement('div');
  avatar.className = 'chat-avatar';
  avatar.textContent = '🤖';
  row.appendChild(avatar);

  const wrap = document.createElement('div');
  wrap.className = 'chat-bubble chat-bubble-assistant chat-choice-bubble';

  const label = document.createElement('div');
  label.textContent = text;
  wrap.appendChild(label);

  const btnRow = document.createElement('div');
  btnRow.className = 'chat-choice-buttons';
  for (const choice of choices) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-choice-btn';
    btn.textContent = choice;
    btn.addEventListener('click', () => {
      btnRow.querySelectorAll('button').forEach((b) => (b.disabled = true));
      addBubble(choice, 'user');
      onPick(choice);
    });
    btnRow.appendChild(btn);
  }
  wrap.appendChild(btnRow);
  row.appendChild(wrap);

  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function askOnboardingStep(step) {
  const input = document.getElementById('chat-input');
  if (step === 'pronoun') {
    input.hidden = true;
    addChoiceBubble('איך נעים לך שאפנה אלייך?', ['את', 'אתה'], (choice) => {
      draftProfile.pronoun = choice;
      advanceOnboarding();
    });
    return;
  }
  input.hidden = false;
  input.focus();
  addBubble(ONBOARDING_QUESTIONS[step], 'assistant');
}

function advanceOnboarding() {
  const idx = ONBOARDING_STEPS.indexOf(onboardingStep);
  const nextStep = ONBOARDING_STEPS[idx + 1];
  if (nextStep) {
    onboardingStep = nextStep;
    askOnboardingStep(onboardingStep);
  } else {
    finishOnboarding();
  }
}

async function finishOnboarding() {
  profile = { ...draftProfile };
  await saveProfile(profile);
  onboardingStep = null;
  document.getElementById('chat-input').hidden = false;
  greetAndAskForIdea();
}

function greetAndAskForIdea() {
  const registerVerb = profile.pronoun === 'אתה' ? 'רשום' : 'רשמי';
  addBubble(
    `${profile.name}, ${registerVerb} לי מה הרעיון שלך ואדייק אותך.\n\n💡 טיפ: אם קשה לך להמציא רעיון מ-0 (וזה רוב האנשים!) - הכי מומלץ להתחיל משכפול רעיון וזווית הנגשה שראית ברשת ומצאו חן בעיניך. ככה לא צריך לשבור את הראש על רעיון חדש, לא צריך לחשוב לבד איך לצלם כי הפורמט כבר מוכח, וזה גם עוזר לפתח הבנה שיווקית של מה עובד. מדריך מלא לשכפול תוכן: https://docs.google.com/document/d/16E3UA0ukElNLcxHT_5C84XrWUZJ3iN0AVPD4BiNphx8/edit?tab=t.0`,
    'assistant'
  );
}

function startOnboarding() {
  addBubble('לפני שנתחיל - יהיה עכשיו רצף קצר של כמה שאלות היכרות (חד-פעמי, לא אצטרך לשאול שוב בפעם הבאה).', 'assistant');
  onboardingStep = ONBOARDING_STEPS[0];
  askOnboardingStep(onboardingStep);
}

export async function startIdeaChat() {
  document.getElementById('edit-profile-btn').hidden = !isAdmin();
  document.getElementById('replay-tour-btn').hidden = !isAdmin();
  if (started) return;
  started = true;
  try {
    profile = await getProfile();
    if (profile) {
      greetAndAskForIdea();
    } else {
      startOnboarding();
    }
  } catch (err) {
    console.error('startIdeaChat failed:', err);
    started = false;
    addBubble('משהו השתבש בטעינת הצ\'אט - נסו לצאת וללחוץ שוב על "בדיקת רעיון".', 'assistant');
  }
}

export function wireIdeaChat() {
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');

  document.getElementById('edit-profile-btn').addEventListener('click', () => {
    document.getElementById('chat-messages').innerHTML = '';
    draftProfile = {};
    startOnboarding();
  });

  document.getElementById('new-idea-btn').addEventListener('click', resetChat);
  document.getElementById('replay-tour-btn').addEventListener('click', () => showWelcomeTour());

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    if (onboardingStep) {
      addBubble(text, 'user');
      draftProfile[onboardingStep] = text;
      advanceOnboarding();
      return;
    }

    input.disabled = true;
    addBubble(text, 'user');
    if (history.length === 0) originalIdeaText = text;
    history.push({ role: 'user', content: text });
    const thinkingBubble = addBubble('חושבת...', 'assistant');

    try {
      const result = await checkIdea({ messages: history, profile });
      let reply = result.data.reply;
      if (reply.startsWith(RECOGNIZED_MARKER)) {
        reply = reply.slice(RECOGNIZED_MARKER.length).trimStart();
        thinkingBubble.classList.add('chat-bubble-excellent');
        playSuccessSound();
      }
      setBubbleText(thinkingBubble, reply);
      if (reply.includes(ROADMAP_URL)) {
        addSaveButton(thinkingBubble, reply.split(ROADMAP_URL)[0].trim());
      }
      history.push({ role: 'assistant', content: reply });
    } catch (err) {
      console.error('checkIdea failed:', err);
      setBubbleText(thinkingBubble, 'משהו השתבש, נסו שוב בבקשה.');
    } finally {
      input.disabled = false;
      input.focus();
    }
  });
}
