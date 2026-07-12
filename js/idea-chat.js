import { functions } from './firebase-init.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { getProfile, saveProfile } from './user-profile.js';

const checkIdea = httpsCallable(functions, 'checkIdea');

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

function addBubble(text, role) {
  const messagesEl = document.getElementById('chat-messages');
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble chat-bubble-${role}`;
  bubble.textContent = text;
  messagesEl.appendChild(bubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return bubble;
}

function addChoiceBubble(text, choices, onPick) {
  const messagesEl = document.getElementById('chat-messages');
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

  messagesEl.appendChild(wrap);
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
  addBubble(`אז ${profile.name}, איך אני יכולה לעזור לך היום לגבי הרעיון? כתבי לי מה הרעיון ואעזור לך.`, 'assistant');
}

function startOnboarding() {
  addBubble('לפני שנתחיל - יהיה עכשיו רצף קצר של כמה שאלות היכרות (חד-פעמי, לא אצטרך לשאול שוב בפעם הבאה).', 'assistant');
  onboardingStep = ONBOARDING_STEPS[0];
  askOnboardingStep(onboardingStep);
}

export async function startIdeaChat() {
  if (started) return;
  started = true;
  profile = await getProfile();
  if (profile) {
    greetAndAskForIdea();
  } else {
    startOnboarding();
  }
}

export function wireIdeaChat() {
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');

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
    history.push({ role: 'user', content: text });
    const thinkingBubble = addBubble('חושבת...', 'assistant');

    try {
      const result = await checkIdea({ messages: history, profile });
      const reply = result.data.reply;
      thinkingBubble.textContent = reply;
      history.push({ role: 'assistant', content: reply });
    } catch (err) {
      console.error('checkIdea failed:', err);
      thinkingBubble.textContent = 'משהו השתבש, נסי שוב בבקשה.';
    } finally {
      input.disabled = false;
      input.focus();
    }
  });
}
